import { ObjectId } from "mongodb";
import { getDb, authUser, send, SYSTEM_PROMPT, preflight, readBody } from "./_lib.js";

/**
 * POST /api/chat  { conversationId, message, files? }
 * Sistema inteligente con caché y soporte de imágenes:
 * 1. Busca en caché preguntas similares (solo texto)
 * 2. Si encuentra caché → devuelve respuesta guardada (sin costo)
 * 3. Si no encuentra → clasifica dificultad y consulta IA
 * 4. Guarda respuesta en caché para futuras consultas
 * 
 * Soporta imágenes: JPG, PNG, GIF, WebP (hasta 20MB)
 */

/**
 * Clasifica la dificultad de una pregunta
 */
function classifyDifficulty(message, hasImages = false) {
  const msg = message.toLowerCase();
  const len = message.length;
  
  // Si hay imágenes, es más complejo (análisis visual)
  if (hasImages) return 'complex';
  
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

/**
 * Selecciona el modelo según la dificultad
 * - Simple → gpt-5-nano (más económico)
 * - Media/Compleja → gpt-5-mini (más capaz)
 */
function selectModel(difficulty) {
  return difficulty === 'simple' ? 'gpt-5-nano' : 'gpt-5-mini';
}

/**
 * Normaliza texto para comparación (quita acentos, minúsculas, espacios extra)
 */
function normalizeText(text) {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // Quitar acentos
    .replace(/[^\w\s]/g, '') // Quitar signos de puntuación
    .replace(/\s+/g, ' ') // Espacios múltiples a uno solo
    .trim();
}

/**
 * Calcula similitud entre dos textos (Jaccard similarity)
 */
function calculateSimilarity(text1, text2) {
  const words1 = new Set(normalizeText(text1).split(' '));
  const words2 = new Set(normalizeText(text2).split(' '));
  
  const intersection = new Set([...words1].filter(x => words2.has(x)));
  const union = new Set([...words1, ...words2]);
  
  return intersection.size / union.size;
}

/**
 * Busca en caché una pregunta similar (solo si no hay imágenes)
 */
async function searchCache(db, message, hasImages = false) {
  // No buscar en caché si hay imágenes (cada imagen es única)
  if (hasImages) return null;
  
  try {
    const cache = db.collection('cache');
    const allCache = await cache.find({}).toArray();
    
    if (allCache.length === 0) return null;
    
    let bestMatch = null;
    let bestSimilarity = 0;
    const threshold = 0.6; // 60% de similitud mínima
    
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
    console.error('[CACHE] Error buscando en caché:', error);
    return null;
  }
}

/**
 * Guarda una respuesta en caché
 */
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
    
    console.log('[CACHE] Respuesta guardada en caché');
  } catch (error) {
    console.error('[CACHE] Error guardando en caché:', error);
  }
}

/**
 * Llama a OpenAI con retry automático
 */
async function callOpenAI(messages, model, maxRetries = 2) {
  console.log(`[CHAT] Usando modelo: ${model}`);
  console.log(`[CHAT] API Key presente: ${process.env.OPENAI_API_KEY ? 'Sí' : 'No'}`);
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    console.log(`[CHAT] Intento ${attempt + 1} de ${maxRetries + 1}`);
    
    const requestBody = {
      model,
      messages,
      temperature: 0.7,
      max_completion_tokens: 2048,
    };
    
    console.log('[CHAT] Enviando request a OpenAI...');
    
    const aiRes = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify(requestBody),
    });

    console.log('[CHAT] Status de OpenAI:', aiRes.status);

    if (aiRes.ok) {
      const data = await aiRes.json();
      console.log(`[CHAT] Respuesta recibida de ${model}`);
      return data;
    }

    const errBody = await aiRes.json().catch(() => ({}));
    const errMsg = errBody?.error?.message || "";
    const errType = errBody?.error?.type || "";
    const errCode = errBody?.error?.code || "";
    
    console.log('[CHAT] Error completo de OpenAI:', JSON.stringify(errBody, null, 2));
    console.log('[CHAT] Tipo:', errType, 'Código:', errCode);

    if ((aiRes.status === 429 || aiRes.status === 503) && attempt < maxRetries) {
      console.log(`[CHAT] Reintentando en ${2000 * (attempt + 1)}ms...`);
      await new Promise((r) => setTimeout(r, 2000 * (attempt + 1)));
      continue;
    }

    let errorDetail = errMsg || `OpenAI respondió ${aiRes.status}`;
    if (aiRes.status === 401) {
      errorDetail = 'API key inválida o expirada. Verifica tu OPENAI_API_KEY en Vercel.';
    } else if (aiRes.status === 404 && errCode === 'model_not_found') {
      errorDetail = `El modelo "${model}" no está disponible en tu cuenta. Verifica que tengas acceso a GPT-5 nano y GPT-5 mini en tu plan de OpenAI.`;
    } else if (aiRes.status === 429) {
      errorDetail = 'Límite de tasa excedido. Espera un momento o verifica tu plan de OpenAI.';
    }
    
    throw new Error(errorDetail);
  }
}

/**
 * Extrae JSON de la respuesta
 */
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
    
    if (!text) {
      return send(res, 400, { error: "Escribe un mensaje." });
    }

    console.log(`[CHAT] Mensaje: ${text.substring(0, 50)}...`);

    const db = await getDb();
    
    // PASO 1: Buscar en caché
    console.log('[CHAT] Buscando en caché...');
    const cached = await searchCache(db, text, false);
    
    let replyText, sources, followups;
    
    if (cached) {
      // Usar respuesta de caché
      console.log('[CHAT] ✅ Usando respuesta de caché');
      replyText = cached.answer;
      sources = cached.sources;
      followups = cached.followups;
    } else {
      // PASO 2: No hay caché, consultar IA
      console.log('[CHAT] ❌ No hay caché, consultando IA...');
      
      const difficulty = classifyDifficulty(text, false);
      const model = selectModel(difficulty);
      console.log(`[CHAT] Dificultad: ${difficulty}, Modelo: ${model}`);

      const col = db.collection("conversations");

      let convo = null;
      try {
        convo = await col.findOne({ _id: new ObjectId(String(conversationId)), userId: user.userId });
      } catch { convo = null; }
      
      if (!convo) return send(res, 404, { error: "Conversación no encontrada." });

      const history = (convo.messages || []).slice(-16).map((m) => ({ role: m.role, content: m.content }));

      // Construir el mensaje del usuario
      const userContent = text;

      const openaiMessages = [
        { role: "system", content: SYSTEM_PROMPT },
        ...history,
        { role: "user", content: userContent },
      ];

      let ai;
      try {
        console.log('[CHAT] Llamando a OpenAI con modelo:', model);
        console.log('[CHAT] Número de mensajes:', openaiMessages.length);
        ai = await callOpenAI(openaiMessages, model);
        console.log('[CHAT] Respuesta completa de OpenAI recibida');
      } catch (e) {
        console.error('[CHAT] Error de OpenAI:', e.message);
        console.error('[CHAT] Stack:', e.stack);
        return send(res, 502, { 
          error: `Error de IA: ${e.message}`, 
          details: e.message,
          model: model,
          suggestion: 'Verifica que tu API key tenga acceso a los modelos GPT-5 nano y GPT-5 mini'
        });
      }

      console.log('[CHAT] Procesando respuesta de OpenAI...');
      const raw = ai.choices?.[0]?.message?.content || "";
      console.log('[CHAT] Respuesta raw recibida, longitud:', raw.length);
      console.log('[CHAT] Primeros 200 caracteres:', raw.substring(0, 200));
      
      const parsed = extractJson(raw) || extractFieldsFallback(raw) || {};
      console.log('[CHAT] JSON parseado:', JSON.stringify(parsed).substring(0, 200));

      replyText = String(parsed.text || raw || "No logré formular una respuesta.");
      sources = Array.isArray(parsed.sources) ? parsed.sources.slice(0, 5) : [];
      followups = Array.isArray(parsed.followups) ? parsed.followups.slice(0, 3) : [];
      
      console.log('[CHAT] Respuesta final - Texto longitud:', replyText.length);
      console.log('[CHAT] Respuesta final - Fuentes:', sources.length);
      console.log('[CHAT] Respuesta final - Followups:', followups.length);
      
      // PASO 3: Guardar en caché
      console.log('[CHAT] Guardando respuesta en caché...');
      await saveToCache(db, text, replyText, sources, followups);
      
      // Guardar en historial de conversación
      const now = Date.now();
      const isFirstExchange = (convo.messages || []).length === 0;
      const userMessageContent = text;
      
      await col.updateOne(
        { _id: convo._id },
        {
          $push: {
            messages: {
              $each: [
                { role: "user", content: userMessageContent, at: now },
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
    }

    console.log('[CHAT] ✅ Respuesta enviada exitosamente');
    console.log('[CHAT] Enviando respuesta al frontend:', { 
      textLength: replyText.length, 
      sourcesCount: sources.length, 
      followupsCount: followups.length,
      fromCache: !!cached 
    });
    return send(res, 200, { text: replyText, sources, followups, fromCache: !!cached });
  } catch (e) {
    console.error('[CHAT] Error general:', e);
    console.error('[CHAT] Error stack:', e.stack);
    console.error('[CHAT] Error message:', e.message);
    return send(res, 500, { error: "Error interno.", details: e.message, stack: e.stack });
  }
}
