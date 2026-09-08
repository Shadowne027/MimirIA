import { ObjectId } from "mongodb";
import { getDb, authUser, send, SYSTEM_PROMPT, preflight, readBody } from "./_lib.js";

/**
 * POST /api/chat  { conversationId, message }
 * 1. Carga el historial del usuario desde MongoDB.
 * 2. Consulta GPT-5-mini (OpenAI) con contexto de la conversación.
 * 3. Guarda ambos mensajes en MongoDB (historial persistente por usuario).
 *
 * Nota: los modelos GPT-5 NO aceptan el parámetro `response_format`,
 * por eso se pide el JSON en el prompt y se extrae de forma defensiva.
 */

/**
 * Extrae JSON de la respuesta de Gemini.
 * Robusto: maneja bloques de código, texto extra, caracteres de control, etc.
 */
function extractJson(raw) {
  if (!raw || typeof raw !== "string") return null;
  let text = raw.trim();

  // 1. Quitar bloques de código ```json ... ``` si el modelo los incluyó
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) text = fence[1].trim();

  // 2. Encontrar el primer { y el último }
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;

  let candidate = text.slice(start, end + 1);

  // 3. Limpiar caracteres de control que rompen JSON (excepto \n \r \t dentro de strings)
  candidate = candidate.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "");

  // 4. Intentar parsear
  try {
    return JSON.parse(candidate);
  } catch {
    // 5. Si falla, intentar arreglar comillas mal escapadas
    try {
      // Reemplazar saltos de línea literales dentro de strings
      const fixed = candidate
        .replace(/\\n/g, "\\\\n")
        .replace(/\\r/g, "\\\\r")
        .replace(/\\t/g, "\\\\t");
      return JSON.parse(fixed);
    } catch {
      return null;
    }
  }
}

/**
 * Fallback: si el JSON no se pudo parsear, intenta extraer campos con regex.
 */
function extractFieldsFallback(raw) {
  if (!raw || typeof raw !== "string") return null;

  // Intentar extraer el campo "text"
  const textMatch = raw.match(/"text"\s*:\s*"([\s\S]*?)"(?=\s*,\s*"sources"|\s*,\s*"followups"|\s*})/);
  const sourcesMatch = raw.match(/"sources"\s*:\s*(\[[\s\S]*?\])/);
  const followupsMatch = raw.match(/"followups"\s*:\s*(\[[\s\S]*?\])/);

  if (textMatch) {
    let text = textMatch[1]
      .replace(/\\n/g, "\n")
      .replace(/\\r/g, "\r")
      .replace(/\\t/g, "\t")
      .replace(/\\"/g, '"')
      .replace(/\\\\/g, "\\");

    let sources = [];
    if (sourcesMatch) {
      try {
        sources = JSON.parse(sourcesMatch[1]);
      } catch {
        sources = [];
      }
    }

    let followups = [];
    if (followupsMatch) {
      try {
        followups = JSON.parse(followupsMatch[1]);
      } catch {
        followups = [];
      }
    }

    return { text, sources, followups };
  }

  return null;
}

/**
 * Llama a OpenAI GPT-5-mini con retry automático si está saturado.
 */
async function callOpenAI(messages, maxRetries = 2) {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const aiRes = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: "gpt-5-mini",
        messages,
        temperature: 0.7,
        max_tokens: 2048,
      }),
    });

    if (aiRes.ok) {
      return await aiRes.json();
    }

    // Si es error de alta demanda o rate limit, reintentar
    const errBody = await aiRes.json().catch(() => ({}));
    const errMsg = errBody?.error?.message || "";

    if (
      (aiRes.status === 429 || aiRes.status === 503 || /rate limit|high demand|temporarily unavailable/i.test(errMsg)) &&
      attempt < maxRetries
    ) {
      // Esperar 2, 4 segundos entre reintentos
      await new Promise((r) => setTimeout(r, 2000 * (attempt + 1)));
      continue;
    }

    // Otro error, lanzar
    throw new Error(errMsg || `OpenAI respondió ${aiRes.status}`);
  }
}

export default async function handler(req, res) {
  if (preflight(req, res)) return;
  if (req.method !== "POST") return send(res, 405, { error: "Método no permitido" });
  
  try {
    const user = await authUser(req);
    if (!user) return send(res, 401, { error: "Sesión inválida. Inicia sesión de nuevo." });

    const { conversationId, message } = await readBody(req);
    const text = String(message || "").trim();
    if (!text) return send(res, 400, { error: "Escribe un mensaje." });

    const db = await getDb();
    const col = db.collection("conversations");

    let convo = null;
    try {
      convo = await col.findOne({ _id: new ObjectId(String(conversationId)), userId: user.userId });
    } catch {
      convo = null;
    }
    if (!convo) return send(res, 404, { error: "Conversación no encontrada." });

    const history = (convo.messages || [])
      .slice(-16)
      .map((m) => ({ role: m.role, content: m.content }));

    // Convertir historial al formato de OpenAI
    const openaiMessages = [
      { role: "system", content: SYSTEM_PROMPT },
      ...history,
      { role: "user", content: text },
    ];

    let ai;
    try {
      ai = await callOpenAI(openaiMessages);
    } catch (e) {
      const detail = e?.message || "Error desconocido";
      return send(res, 502, { error: `La IA respondió un error: ${detail}` });
    }

    const raw = ai.choices?.[0]?.message?.content || "";

    // Intentar parsear JSON, si falla usar fallback regex
    let parsed = extractJson(raw);
    if (!parsed) {
      parsed = extractFieldsFallback(raw);
    }
    if (!parsed) {
      parsed = {};
    }

    const replyText = String(parsed.text || raw || "No logré formular una respuesta. ¿Puedes reformular tu pregunta?");
    const sources = Array.isArray(parsed.sources) ? parsed.sources.slice(0, 5) : [];
    const followups = Array.isArray(parsed.followups) ? parsed.followups.slice(0, 3) : [];

    const now = Date.now();
    const isFirstExchange = (convo.messages || []).length === 0;
    await col.updateOne(
      { _id: convo._id },
      {
        $push: {
          messages: {
            $each: [
              { role: "user", content: text, at: now },
              { role: "assistant", content: replyText, sources, followUps: followups, at: now },
            ],
          },
        },
        $set: {
          updatedAt: now,
          ...(isFirstExchange
            ? { title: text.slice(0, 48) + (text.length > 48 ? "…" : "") }
            : {}),
        },
      }
    );

    return send(res, 200, { text: replyText, sources, followups });
  } catch (e) {
    return send(res, 500, { error: "Error interno del servidor." });
  }
}
