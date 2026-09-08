import { ObjectId } from "mongodb";
import { getDb, authUser, readBody, send, SYSTEM_PROMPT, preflight } from "./_lib.js";

/**
 * POST /api/chat  { conversationId, message }
 * 1. Carga el historial del usuario desde MongoDB.
 * 2. Consulta Gemini 2.0 Flash (Google) con contexto de la conversación.
 * 3. Guarda ambos mensajes en MongoDB (historial persistente por usuario).
 *
 * Gemini es gratuito con límites generosos (1M tokens/día).
 */

function extractJson(raw) {
  const text = String(raw || "").trim();
  // Quitar bloques de código ```json ... ``` si el modelo los incluyó
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fence ? fence[1] : text;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;
  try {
    return JSON.parse(candidate.slice(start, end + 1));
  } catch {
    return null;
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

    // Convertir historial al formato de Gemini
    const geminiContents = [
      ...history.map((m) => ({
        role: m.role === "assistant" ? "model" : "user",
        parts: [{ text: m.content }],
      })),
      { role: "user", parts: [{ text }] },
    ];

    let aiRes;
    try {
      aiRes = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: geminiContents,
            systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
            generationConfig: {
              temperature: 0.7,
              maxOutputTokens: 2048,
            },
          }),
        }
      );
    } catch {
      return send(res, 502, { error: "No se pudo contactar a Gemini. Revisa tu conexión o intenta de nuevo." });
    }

    if (!aiRes.ok) {
      let detail = `Gemini respondió ${aiRes.status}`;
      try {
        const errBody = await aiRes.json();
        if (errBody?.error?.message) detail = errBody.error.message;
      } catch {
        /* sin detalle */
      }
      return send(res, 502, { error: `La IA respondió un error: ${detail}` });
    }

    const ai = await aiRes.json();
    const raw = ai.candidates?.[0]?.content?.parts?.[0]?.text || "";
    const parsed = extractJson(raw) || {};

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
