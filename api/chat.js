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
 * Extrae JSON de la respuesta de OpenAI.
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
 * Llama a OpenAI GPT-4o-mini con retry automático si está saturado.
 */
async function callOpenAI(messages, maxRetries = 2) {
  console.log('[CHAT] Llamando a OpenAI con modelo gpt-4o-mini...');
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    console.log(`[CHAT] Intento ${attempt + 1} de ${maxRetries + 1}`);
    
    const aiRes = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages,
        temperature: 0.7,
        max_tokens: 2048,
      }),
    });

    console.log('[CHAT] Status de OpenAI:', aiRes.status);

    if (aiRes.ok) {
      const data = await aiRes.json();
      console.log('[CHAT] Respuesta recibida de OpenAI');
      return data;
    }

    // Si es error de alta demanda o rate limit, reintentar
    const errBody = await aiRes.json().catch(() => ({}));
    const errMsg = errBody?.error?.message || "";
    
    console.log('[CHAT] Error de OpenAI:', errMsg);

    if (
      (aiRes.status === 429 || aiRes.status === 503 || /rate limit|high demand|temporarily unavailable/i.test(errMsg)) &&
      attempt < maxRetries
    ) {
      console.log(`[CHAT] Reintentando en ${2000 * (attempt + 1)}ms...`);
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
    console.log('[CHAT] Iniciando procesamiento de mensaje...');
    
    const user = await authUser(req);
    if (!user) {
      console.log('[CHAT] Error: Sesión inválida');
      return send(res, 401, { error: "Sesión inválida. Inicia sesión de nuevo." });
    }
    
    console.log('[CHAT] Usuario autenticado:', user.userId);

    const { conversationId, message } = await readBody(req);
    const text = String(message || "").trim();
    
    console.log('[CHAT] ConversationId:', conversationId);
    console.log('[CHAT] Mensaje:', text.substring(0, 50) + '...');
    
    if (!text) return send(res, 400, { error: "Escribe un mensaje." });

    const db = await getDb();
    const col = db.collection("conversations");

    let convo = null;
    try {
      convo = await col.findOne({ _id: new ObjectId(String(conversationId)), userId: user.userId });
    } catch (e) {
      console.log('[CHAT] Error al buscar conversación:', e.message);
      convo = null;
    }
    
    if (!convo) {
      console.log('[CHAT] Conversación no encontrada');
      return send(res, 404, { error: "Conversación no encontrada." });
    }
    
    console.log('[CHAT] Conversación encontrada, mensajes anteriores:', convo.messages?.length || 0);

    const history = (convo.messages || [])
      .slice(-16)
      .map((m) => ({ role: m.role, content: m.content }));

    // Convertir historial al formato de OpenAI
    const openaiMessages = [
      { role: "system", content: SYSTEM_PROMPT },
      ...history,
      { role: "user", content: text },
    ];
    
    console.log('[CHAT] Total de mensajes enviados a OpenAI:', openaiMessages.length);

    let ai;
    try {
      ai = await callOpenAI(openaiMessages);
    } catch (e) {
      const detail = e?.message || "Error desconocido";
      console.log('[CHAT] Error de OpenAI:', detail);
      return send(res, 502, { 
        error: `La IA respondió un error: ${detail}`,
        details: detail
      });
    }

    const raw = ai.choices?.[0]?.message?.content || "";
    console.log('[CHAT] Respuesta raw recibida, longitud:', raw.length);

    // Intentar parsear JSON, si falla usar fallback regex
    let parsed = extractJson(raw);
    if (!parsed) {
      console.log('[CHAT] No se pudo parsear JSON, usando fallback regex');
      parsed = extractFieldsFallback(raw);
    }
    if (!parsed) {
      console.log('[CHAT] Fallback también falló, usando respuesta raw');
      parsed = {};
    }

    const replyText = String(parsed.text || raw || "No logré formular una respuesta. ¿Puedes reformular tu pregunta?");
    const sources = Array.isArray(parsed.sources) ? parsed.sources.slice(0, 5) : [];
    const followups = Array.isArray(parsed.followups) ? parsed.followups.slice(0, 3) : [];
    
    console.log('[CHAT] Respuesta procesada, fuentes:', sources.length, 'followups:', followups.length);

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
    
    console.log('[CHAT] Mensajes guardados en MongoDB');

    return send(res, 200, { text: replyText, sources, followups });
  } catch (e) {
    console.error('[CHAT] Error interno:', e);
    return send(res, 500, { 
      error: "Error interno del servidor.",
      details: e.message || 'Error desconocido'
    });
  }
}
