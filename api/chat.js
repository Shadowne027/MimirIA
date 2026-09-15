import { ObjectId } from "mongodb";
import { getDb, authUser, send, SYSTEM_PROMPT, preflight } from "./_lib.js";
import formidable from "formidable";
import fs from "fs";
import pdfParse from "pdf-parse";
import mammoth from "mammoth";
import * as XLSX from "xlsx";

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

// Configuración de formidable para Vercel serverless
const form = formidable({
  maxFileSize: 50 * 1024 * 1024, // 50MB para documentos grandes
  maxFiles: 10, // Más archivos permitidos
  keepExtensions: true, // Necesario para detectar tipo de archivo
});

/**
 * Parsea multipart/form-data
 */
function parseForm(req) {
  return new Promise((resolve, reject) => {
    form.parse(req, (err, fields, files) => {
      if (err) reject(err);
      else resolve({ fields, files });
    });
  });
}

/**
 * Lee el body como JSON o multipart
 */
async function readBody(req) {
  const contentType = req.headers["content-type"] || "";
  
  if (contentType.includes("multipart/form-data")) {
    const { fields, files } = await parseForm(req);
    
    // Extraer valores de fields (pueden ser arrays)
    const conversationId = Array.isArray(fields.conversationId) 
      ? fields.conversationId[0] 
      : fields.conversationId;
    const message = Array.isArray(fields.message) 
      ? fields.message[0] 
      : fields.message;
    
    // Procesar archivos
    const imageFiles = [];
    const documentTexts = [];
    const filesArray = files.files || [];
    const filesToProcess = Array.isArray(filesArray) ? filesArray : [filesArray];
    
    for (const file of filesToProcess) {
      if (!file || !file.filepath) continue;
      
      const mimetype = file.mimetype || "";
      const originalName = file.originalFilename || "";
      const ext = originalName.split('.').pop()?.toLowerCase();
      
      try {
        // Imágenes
        if (mimetype.startsWith("image/")) {
          const buffer = fs.readFileSync(file.filepath);
          const base64 = buffer.toString("base64");
          imageFiles.push({
            base64,
            mimeType: mimetype,
            name: originalName || "image.jpg"
          });
        }
        // PDFs
        else if (mimetype === "application/pdf" || ext === "pdf") {
          const buffer = fs.readFileSync(file.filepath);
          const pdfData = await pdfParse(buffer);
          documentTexts.push({
            text: pdfData.text,
            name: originalName || "document.pdf",
            type: "pdf"
          });
        }
        // Word (.docx)
        else if (mimetype === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" || ext === "docx") {
          const buffer = fs.readFileSync(file.filepath);
          const result = await mammoth.extractRawText({ buffer });
          documentTexts.push({
            text: result.value,
            name: originalName || "document.docx",
            type: "word"
          });
        }
        // Excel (.xlsx, .xls)
        else if (mimetype === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" || 
                 mimetype === "application/vnd.ms-excel" || 
                 ext === "xlsx" || ext === "xls") {
          const buffer = fs.readFileSync(file.filepath);
          const workbook = XLSX.read(buffer, { type: "buffer" });
          let text = "";
          workbook.SheetNames.forEach(sheetName => {
            const sheet = workbook.Sheets[sheetName];
            text += `\n[Hoja: ${sheetName}]\n`;
            text += XLSX.utils.sheet_to_csv(sheet);
          });
          documentTexts.push({
            text,
            name: originalName || "spreadsheet.xlsx",
            type: "excel"
          });
        }
        // Texto plano
        else if (mimetype.startsWith("text/") || ["txt", "md", "csv"].includes(ext)) {
          const text = fs.readFileSync(file.filepath, "utf-8");
          documentTexts.push({
            text,
            name: originalName || "document.txt",
            type: "text"
          });
        }
        else {
          console.log(`[FILES] Tipo de archivo no soportado: ${mimetype}`);
        }
      } catch (e) {
        console.error(`[FILES] Error procesando ${originalName}:`, e);
      } finally {
        fs.unlink(file.filepath, () => {});
      }
    }
    
    return { conversationId, message, images: imageFiles, documents: documentTexts };
  } else {
    // JSON tradicional
    return new Promise((resolve) => {
      let data = "";
      req.on("data", (chunk) => (data += chunk));
      req.on("end", () => {
        try {
          const parsed = JSON.parse(data || "{}");
          resolve({ ...parsed, images: [], documents: [] });
        } catch {
          resolve({ conversationId: null, message: "", images: [], documents: [] });
        }
      });
    });
  }
}

/**
 * Clasifica la dificultad de una pregunta
 */
function classifyDifficulty(message, hasImages = false, hasDocuments = false) {
  const msg = message.toLowerCase();
  const len = message.length;
  
  // Si hay imágenes o documentos, es más complejo (análisis)
  if (hasImages || hasDocuments) return 'complex';
  
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
 * Busca en caché una pregunta similar (solo si no hay imágenes ni documentos)
 */
async function searchCache(db, message, hasImages = false, hasDocuments = false) {
  // No buscar en caché si hay imágenes o documentos (cada uno es único)
  if (hasImages || hasDocuments) return null;
  
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
      max_tokens: 2048,
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

    const { conversationId, message, images, documents } = await readBody(req);
    const text = String(message || "").trim();
    
    if (!text && images.length === 0 && documents.length === 0) {
      return send(res, 400, { error: "Escribe un mensaje o adjunta un archivo." });
    }

    console.log(`[CHAT] Mensaje: ${text.substring(0, 50)}...`);
    console.log(`[CHAT] Imágenes: ${images.length}`);
    console.log(`[CHAT] Documentos: ${documents.length}`);

    const db = await getDb();
    
    // PASO 1: Buscar en caché (solo si no hay imágenes ni documentos)
    console.log('[CHAT] Buscando en caché...');
    const cached = await searchCache(db, text, images.length > 0, documents.length > 0);
    
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
      
      const difficulty = classifyDifficulty(text, images.length > 0, documents.length > 0);
      const model = selectModel(difficulty);
      console.log(`[CHAT] Dificultad: ${difficulty}, Modelo: ${model}`);

      const col = db.collection("conversations");

      let convo = null;
      try {
        convo = await col.findOne({ _id: new ObjectId(String(conversationId)), userId: user.userId });
      } catch { convo = null; }
      
      if (!convo) return send(res, 404, { error: "Conversación no encontrada." });

      const history = (convo.messages || []).slice(-16).map((m) => ({ role: m.role, content: m.content }));

      // Construir el mensaje del usuario con texto, imágenes y documentos
      let userContent;
      let fullText = text;
      
      // Agregar contenido de documentos al texto
      if (documents.length > 0) {
        const docContents = documents.map(doc => {
          const typeLabel = doc.type === "pdf" ? "PDF" : 
                           doc.type === "word" ? "Word" : 
                           doc.type === "excel" ? "Excel" : "Texto";
          return `\n\n[Contenido del archivo ${typeLabel}: ${doc.name}]\n${doc.text}`;
        }).join("");
        
        fullText = text + docContents;
      }
      
      if (images.length > 0) {
        // Formato multimodal para OpenAI
        userContent = [
          { type: "text", text: fullText || "¿Qué ves en esta imagen?" }
        ];
        
        for (const img of images) {
          userContent.push({
            type: "image_url",
            image_url: {
              url: `data:${img.mimeType};base64,${img.base64}`,
              detail: "auto"
            }
          });
        }
      } else {
        userContent = fullText;
      }

      const openaiMessages = [
        { role: "system", content: SYSTEM_PROMPT },
        ...history,
        { role: "user", content: userContent },
      ];

      let ai;
      try {
        ai = await callOpenAI(openaiMessages, model);
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

      const raw = ai.choices?.[0]?.message?.content || "";
      console.log('[CHAT] Respuesta raw recibida, longitud:', raw.length);
      
      const parsed = extractJson(raw) || extractFieldsFallback(raw) || {};

      replyText = String(parsed.text || raw || "No logré formular una respuesta.");
      sources = Array.isArray(parsed.sources) ? parsed.sources.slice(0, 5) : [];
      followups = Array.isArray(parsed.followups) ? parsed.followups.slice(0, 3) : [];
      
      // PASO 3: Guardar en caché (solo si no hay imágenes ni documentos)
      if (images.length === 0 && documents.length === 0) {
        console.log('[CHAT] Guardando respuesta en caché...');
        await saveToCache(db, text, replyText, sources, followups);
      }
      
      // Guardar en historial de conversación
      const now = Date.now();
      const isFirstExchange = (convo.messages || []).length === 0;
      
      // Construir resumen del mensaje del usuario
      let userMessageContent = text;
      const attachments = [];
      if (images.length > 0) attachments.push(`${images.length} imagen${images.length > 1 ? 'es' : ''}`);
      if (documents.length > 0) {
        const docNames = documents.map(d => d.name).join(', ');
        attachments.push(`${documents.length} archivo${documents.length > 1 ? 's' : ''}: ${docNames}`);
      }
      if (attachments.length > 0) {
        userMessageContent = text ? `${text}\n\n[Adjuntos: ${attachments.join(', ')}]` : `[Adjuntos: ${attachments.join(', ')}]`;
      }
      
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
            ...(isFirstExchange ? { title: (text || (documents.length > 0 ? `Análisis: ${documents[0].name}` : "Análisis de imagen")).slice(0, 48) + ((text || (documents.length > 0 ? `Análisis: ${documents[0].name}` : "Análisis de imagen")).length > 48 ? "…" : "") } : {}),
          },
        }
      );
    }

    console.log('[CHAT] ✅ Respuesta enviada exitosamente');
    return send(res, 200, { text: replyText, sources, followups, fromCache: !!cached });
  } catch (e) {
    console.error('[CHAT] Error:', e);
    return send(res, 500, { error: "Error interno.", details: e.message });
  }
}
