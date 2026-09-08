import { ObjectId } from "mongodb";
import { getDb, authUser, send, SYSTEM_PROMPT, preflight } from "./_lib.js";
import formidable from "formidable";
import fs from "fs";

/**
 * POST /api/chat  { conversationId, message, files? }
 * 1. Carga el historial del usuario desde MongoDB.
 * 2. Consulta Gemini 3.6 Flash (Google) con contexto de la conversación.
 * 3. Guarda ambos mensajes en MongoDB (historial persistente por usuario).
 *
 * Soporta archivos: imágenes (JPG, PNG, GIF, WebP) y PDFs hasta 20MB.
 * Gemini es gratuito con límites generosos (1M tokens/día).
 * Incluye retry automático si el modelo está saturado.
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
 * Llama a Gemini con retry automático si está saturado.
 */
async function callGemini(contents, maxRetries = 2) {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const aiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents,
          systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
          generationConfig: {
            temperature: 0.7,
            maxOutputTokens: 2048,
          },
        }),
      }
    );

    if (aiRes.ok) {
      return await aiRes.json();
    }

    // Si es error de alta demanda, reintentar
    const errBody = await aiRes.json().catch(() => ({}));
    const errMsg = errBody?.error?.message || "";

    if (
      (aiRes.status === 503 || /high demand|temporarily unavailable/i.test(errMsg)) &&
      attempt < maxRetries
    ) {
      // Esperar 2, 4 segundos entre reintentos
      await new Promise((r) => setTimeout(r, 2000 * (attempt + 1)));
      continue;
    }

    // Otro error, lanzar
    throw new Error(errMsg || `Gemini respondió ${aiRes.status}`);
  }
}

/**
 * Parsea multipart/form-data para extraer campos y archivos.
 */
function parseForm(req) {
  return new Promise((resolve, reject) => {
    const form = formidable({
      maxFileSize: 20 * 1024 * 1024, // 20MB
      maxFiles: 5,
      keepExtensions: true,
    });

    form.parse(req, (err, fields, files) => {
      if (err) return reject(err);
      resolve({ fields, files });
    });
  });
}

/**
 * Convierte un archivo a base64 para enviar a Gemini.
 */
function fileToBase64(filePath) {
  return new Promise((resolve, reject) => {
    fs.readFile(filePath, (err, data) => {
      if (err) return reject(err);
      resolve(data.toString("base64"));
    });
  });
}

/**
 * Determina el MIME type de Gemini según la extensión.
 */
function getGeminiMimeType(mimeType, originalFilename) {
  const ext = originalFilename?.toLowerCase().split(".").pop();
  
  // Imágenes
  if (mimeType?.startsWith("image/") || ["jpg", "jpeg", "png", "gif", "webp"].includes(ext)) {
    if (ext === "jpg" || ext === "jpeg") return "image/jpeg";
    if (ext === "png") return "image/png";
    if (ext === "gif") return "image/gif";
    if (ext === "webp") return "image/webp";
    return "image/jpeg"; // fallback
  }
  
  // PDFs
  if (mimeType === "application/pdf" || ext === "pdf") {
    return "application/pdf";
  }
  
  return null;
}

export default async function handler(req, res) {
  if (preflight(req, res)) return;
  if (req.method !== "POST") return send(res, 405, { error: "Método no permitido" });
  
  try {
    const user = await authUser(req);
    if (!user) return send(res, 401, { error: "Sesión inválida. Inicia sesión de nuevo." });

    // Parsear el formulario (puede incluir archivos)
    let conversationId, message, uploadedFiles = [];
    
    const contentType = req.headers["content-type"] || "";
    
    if (contentType.includes("multipart/form-data")) {
      const { fields, files } = await parseForm(req);
      conversationId = fields.conversationId?.[0] || fields.conversationId;
      message = fields.message?.[0] || fields.message || "";
      
      // Procesar archivos subidos
      const fileArray = files.files || [];
      const filesToProcess = Array.isArray(fileArray) ? fileArray : [fileArray];
      
      for (const file of filesToProcess) {
        if (!file || !file.filepath) continue;
        
        const mimeType = getGeminiMimeType(file.mimetype, file.originalFilename);
        if (!mimeType) {
          // Limpiar archivo temporal
          fs.unlink(file.filepath, () => {});
          continue;
        }
        
        try {
          const base64 = await fileToBase64(file.filepath);
          uploadedFiles.push({
            mimeType,
            data: base64,
            name: file.originalFilename,
          });
        } catch (err) {
          console.error("Error procesando archivo:", err);
        } finally {
          // Limpiar archivo temporal
          fs.unlink(file.filepath, () => {});
        }
      }
    } else {
      // JSON tradicional (sin archivos)
      const body = await new Promise((resolve) => {
        let data = "";
        req.on("data", (chunk) => (data += chunk));
        req.on("end", () => {
          try {
            resolve(JSON.parse(data || "{}"));
          } catch {
            resolve({});
          }
        });
      });
      conversationId = body.conversationId;
      message = body.message || "";
    }

    const text = String(message || "").trim();
    if (!text && uploadedFiles.length === 0) {
      return send(res, 400, { error: "Escribe un mensaje o adjunta un archivo." });
    }

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

    // Construir el contenido del mensaje del usuario
    const userParts = [];
    
    // Agregar texto si existe
    if (text) {
      userParts.push({ text });
    }
    
    // Agregar archivos (imágenes/PDFs)
    for (const file of uploadedFiles) {
      userParts.push({
        inline_data: {
          mime_type: file.mimeType,
          data: file.data,
        },
      });
    }

    // Convertir historial al formato de Gemini
    const geminiContents = [
      ...history.map((m) => ({
        role: m.role === "assistant" ? "model" : "user",
        parts: [{ text: m.content }],
      })),
      { role: "user", parts: userParts },
    ];

    let ai;
    try {
      ai = await callGemini(geminiContents);
    } catch (e) {
      const detail = e?.message || "Error desconocido";
      return send(res, 502, { error: `La IA respondió un error: ${detail}` });
    }

    const raw = ai.candidates?.[0]?.content?.parts?.[0]?.text || "";

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
    
    // Guardar mensaje del usuario con información de archivos
    const userMessageContent = text || (uploadedFiles.length > 0 ? `[${uploadedFiles.length} archivo(s) adjunto(s)]` : "");
    
    await col.updateOne(
      { _id: convo._id },
      {
        $push: {
          messages: {
            $each: [
              { 
                role: "user", 
                content: userMessageContent, 
                files: uploadedFiles.map(f => ({ name: f.name, mimeType: f.mimeType })),
                at: now 
              },
              { role: "assistant", content: replyText, sources, followUps: followups, at: now },
            ],
          },
        },
        $set: {
          updatedAt: now,
          ...(isFirstExchange
            ? { title: (text || "Análisis de archivo").slice(0, 48) + ((text || "Análisis de archivo").length > 48 ? "…" : "") }
            : {}),
        },
      }
    );

    return send(res, 200, { text: replyText, sources, followups });
  } catch (e) {
    console.error("Error en /api/chat:", e);
    return send(res, 500, { error: "Error interno del servidor." });
  }
}
