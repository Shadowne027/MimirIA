import { ObjectId } from "mongodb";
import { getDb, authUser, send, SYSTEM_PROMPT, preflight, readBody } from "./_lib.js";

/**
 * POST /api/chat
 * Sistema inteligente con caché y enrutamiento de modelos
 */

function classifyDifficulty(message) {
  const msg = message.toLowerCase();
  const len = message.length;
  
  if (/código|program|función|algoritmo|ecuaci|derivad|integral|cálculo|físic|quím|analiz|compar|ensay|tesis/i.test(msg) || len > 200) {
    return 'complex';
  }
  
  if (/^(hola|hey|buenos|buenas|gracias|ok|vale)/i.test(msg) || /^(qué es|quién es|cuándo|dónde)/i.test(msg) && len < 50) {
    return 'simple';
  }
  
  return 'medium';
}

function selectModel(difficulty) {
  return difficulty === 'simple' ? 'gpt-5-nano' : 'gpt-5-mini';
}

function normalizeText(text) {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\w\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function calculateSimilarity(text1, text2) {
  const words1 = new Set(normalizeText(text1).split(' '));
  const words2 = new Set(normalizeText(text2).split(' '));
  const intersection = new Set([...words1].filter(x => words2.has(x)));
  const union = new Set([...words1, ...words2]);
  return intersection.size / union.size;
}

async function searchCache(db, message) {
  try {
    const cache = db.collection('cache');
    const allCache = await cache.find({}).toArray();
    
    if (allCache.length === 0) return null;
    
    let bestMatch = null;
    let bestSimilarity = 0;
    const threshold = 0.6;
    
    for (const entry of allCache) {
      const similarity = calculateSimilarity(message, entry.question);
      if (similarity > bestSimilarity && similarity >= threshold) {
        bestSimilarity = similarity;
        bestMatch = entry;
      }
    }
    
    if (bestMatch) {
      console.log(`[CACHE] Encontrada con similitud: ${(bestSimilarity * 100).toFixed(1)}%`);
      await cache.updateOne(
        { _id: bestMatch._id },
        { $inc: { useCount: 1 }, $set: { lastUsed: Date.now() } }
      );
      return bestMatch;
    }
    
    return null;
  } catch (error) {
    console.error('[CACHE] Error:', error);
    return null;
  }
}

async function saveToCache(db, question, answer, sources, followups) {
  try {
    const cache = db.collection('cache');
    await cache.insertOne({
      question: normalizeText(question),
      originalQuestion: question,
      answer,
      sources: sources || [],
      followups: followups || [],
      createdAt: Date.now(),
      lastUsed: Date.now(),
      useCount: 1
    });
    console.log('[CACHE] Respuesta guardada');
  } catch (error) {
    console.error('[CACHE] Error guardando:', error);
  }
}

async function callOpenAI(messages, model, maxRetries = 2) {
  console.log(`[CHAT] Usando modelo: ${model}`);
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    console.log(`[CHAT] Intento ${attempt + 1} de ${maxRetries + 1}`);
    
    const requestBody = {
      model,
      messages,
      temperature: 0.7,
      max_completion_tokens: 2048
    };
    
    const aiRes = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`
      },
      body: JSON.stringify(requestBody)
    });

    console.log('[CHAT] Status:', aiRes.status);

    if (aiRes.ok) {
      return await aiRes.json();
    }

    const errBody = await aiRes.json().catch(() => ({}));
    const errMsg = errBody?.error?.message || "";

    if ((aiRes.status === 429 || aiRes.status === 503) && attempt < maxRetries) {
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
    return null;
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
    
    if (!text) {
      return send(res, 400, { error: "Escribe un mensaje." });
    }

    console.log(`[CHAT] Mensaje: ${text.substring(0, 50)}...`);

    const db = await getDb();
    
    console.log('[CHAT] Buscando en caché...');
    const cached = await searchCache(db, text);
    
    let replyText, sources, followups;
    
    if (cached) {
      console.log('[CHAT] Usando caché');
      replyText = cached.answer;
      sources = cached.sources;
      followups = cached.followups;
    } else {
      console.log('[CHAT] Consultando IA...');
      
      const difficulty = classifyDifficulty(text);
      const model = selectModel(difficulty);
      console.log(`[CHAT] Dificultad: ${difficulty}, Modelo: ${model}`);

      const col = db.collection("conversations");

      let convo = null;
      try {
        convo = await col.findOne({ _id: new ObjectId(String(conversationId)), userId: user.userId });
      } catch {
        convo = null;
      }
      
      if (!convo) return send(res, 404, { error: "Conversación no encontrada." });

      const history = (convo.messages || []).slice(-16).map((m) => ({ role: m.role, content: m.content }));

      const openaiMessages = [
        { role: "system", content: SYSTEM_PROMPT },
        ...history,
        { role: "user", content: text }
      ];

      let ai;
      try {
        console.log('[CHAT] Llamando a OpenAI...');
        ai = await callOpenAI(openaiMessages, model);
        console.log('[CHAT] Respuesta recibida');
      } catch (e) {
        console.error('[CHAT] Error:', e.message);
        return send(res, 502, { 
          error: `Error de IA: ${e.message}`, 
          details: e.message,
          model: model
        });
      }

      const raw = ai.choices?.[0]?.message?.content || "";
      console.log('[CHAT] Respuesta raw, longitud:', raw.length);
      
      const parsed = extractJson(raw) || extractFieldsFallback(raw) || {};

      replyText = String(parsed.text || raw || "No logré formular una respuesta.");
      sources = Array.isArray(parsed.sources) ? parsed.sources.slice(0, 5) : [];
      followups = Array.isArray(parsed.followups) ? parsed.followups.slice(0, 3) : [];
      
      console.log('[CHAT] Guardando en caché...');
      await saveToCache(db, text, replyText, sources, followups);
      
      const now = Date.now();
      const isFirstExchange = (convo.messages || []).length === 0;
      
      await col.updateOne(
        { _id: convo._id },
        {
          $push: {
            messages: {
              $each: [
                { role: "user", content: text, at: now },
                { role: "assistant", content: replyText, sources, followUps: followups, at: now }
              ]
            }
          },
          $set: {
            updatedAt: now,
            ...(isFirstExchange ? { title: text.slice(0, 48) + (text.length > 48 ? "…" : "") } : {})
          }
        }
      );
    }

    console.log('[CHAT] Respuesta enviada');
    return send(res, 200, { text: replyText, sources, followups, fromCache: !!cached });
  } catch (e) {
    console.error('[CHAT] Error general:', e);
    return send(res, 500, { error: "Error interno.", details: e.message });
  }
}
