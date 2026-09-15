import { ObjectId } from "mongodb";
import { getDb, authUser, send, SYSTEM_PROMPT, preflight, readBody } from "./_lib.js";

/**
 * POST /api/chat  { conversationId, message }
 * Sistema inteligente de enrutamiento:
 * - Preguntas simples → gpt-4o-mini (más económico)
 * - Preguntas complejas → gpt-4o (más capaz)
 */

function classifyDifficulty(message) {
  const msg = message.toLowerCase();
  const len = message.length;
  
  // Compleja: código, matemáticas avanzadas, análisis profundo
  if (/código|program|función|algoritmo|ecuaci|derivad|integral|cálculo|físic|quím|analiz|compar|ensay|tesis/i.test(msg) || len > 200) {
    return 'complex';
  }
  
  // Simple: saludos, preguntas cortas, definiciones básicas
  if (/^(hola|hey|buenos|buenas|gracias|ok|vale)/i.test(msg) || /^(qué es|quién es|cuándo|dónde)/i.test(msg) && len < 50) {
    return 'simple';
  }
  
  return 'medium';
}

function selectModel(difficulty) {
  // gpt-4o-mini para simples (económico), gpt-4o para complejas (capaz)
  return difficulty === 'simple' ? 'gpt-4o-mini' : 'gpt-4o';
}

async function callOpenAI(messages, model, maxRetries = 2) {
  console.log(`[CHAT] Usando modelo: ${model}`);
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    console.log(`[CHAT] Intento ${attempt + 1} de ${maxRetries + 1}`);
    
    const aiRes = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model,
        messages,
        temperature: 0.7,
        max_tokens: 2048,
      }),
    });

    console.log('[CHAT] Status de OpenAI:', aiRes.status);

    if (aiRes.ok) {
      const data = await aiRes.json();
      console.log(`[CHAT] Respuesta recibida de ${model}`);
      return data;
    }

    const errBody = await aiRes.json().catch(() => ({}));
    const errMsg = errBody?.error?.message || "";
    
    console.log('[CHAT] Error de OpenAI:', errMsg);

    if ((aiRes.status === 429 || aiRes.status === 503) && attempt < maxRetries) {
      console.log(`[CHAT] Reintentando en ${2000 * (attempt + 1)}ms...`);
      await new Promise((r) => setTimeout(r, 2000 * (attempt + 1)));
      continue;
    }

    throw new Error(errMsg || `OpenAI respondió ${aiRes.status}`);
  }
}

function extractJson(raw) {
  if (!raw || typeof raw !== "string") return null;
  let text = raw.trim();

  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) text = fence[1].trim();

  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;

  let candidate = text.slice(start, end + 1);
  candidate = candidate.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "");

  try {
    return JSON.parse(candidate);
  } catch {
    try {
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

function extractFieldsFallback(raw) {
  if (!raw || typeof raw !== "string") return null;

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
      try { sources = JSON.parse(sourcesMatch[1]); } catch { sources = []; }
    }

    let followups = [];
    if (followupsMatch) {
      try { followups = JSON.parse(followupsMatch[1]); } catch { followups = []; }
    }

    return { text, sources, followups };
  }

  return null;
}

export default async function handler(req, res) {
  if (preflight(req, res)) return;
  if (req.method !== "POST") return send(res, 405, { error: "Método no permitido" });
  
  try {
    console.log('[CHAT] Iniciando...');
    
    const user = await authUser(req);
    if (!user) return send(res, 401, { error: "Sesión inválida." });

    const { conversationId, message } = await readBody(req);
    const text = String(message || "").trim();
    if (!text) return send(res, 400, { error: "Escribe un mensaje." });

    // Clasificar dificultad y seleccionar modelo
    const difficulty = classifyDifficulty(text);
    const model = selectModel(difficulty);
    console.log(`[CHAT] Dificultad: ${difficulty}, Modelo: ${model}`);

    const db = await getDb();
    const col = db.collection("conversations");

    let convo = null;
    try {
      convo = await col.findOne({ _id: new ObjectId(String(conversationId)), userId: user.userId });
    } catch { convo = null; }
    
    if (!convo) return send(res, 404, { error: "Conversación no encontrada." });

    const history = (convo.messages || []).slice(-16).map((m) => ({ role: m.role, content: m.content }));

    const openaiMessages = [
      { role: "system", content: SYSTEM_PROMPT },
      ...history,
      { role: "user", content: text },
    ];

    let ai;
    try {
      ai = await callOpenAI(openaiMessages, model);
    } catch (e) {
      console.error('[CHAT] Error de OpenAI:', e.message);
      return send(res, 502, { error: `Error de IA: ${e.message}`, details: e.message });
    }

    const raw = ai.choices?.[0]?.message?.content || "";
    console.log('[CHAT] Respuesta raw recibida, longitud:', raw.length);
    
    let parsed = extractJson(raw) || extractFieldsFallback(raw) || {};

    const replyText = String(parsed.text || raw || "No logré formular una respuesta.");
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
          ...(isFirstExchange ? { title: text.slice(0, 48) + (text.length > 48 ? "…" : "") } : {}),
        },
      }
    );

    console.log('[CHAT] Respuesta enviada exitosamente');
    return send(res, 200, { text: replyText, sources, followups });
  } catch (e) {
    console.error('[CHAT] Error:', e);
    return send(res, 500, { error: "Error interno.", details: e.message });
  }
}
