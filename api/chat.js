import { ObjectId } from "mongodb";
import { getDb, authUser, readBody, send, SYSTEM_PROMPT } from "./_lib.js";

/**
 * POST /api/chat  { conversationId, message }
 * 1. Carga el historial del usuario desde MongoDB.
 * 2. Consulta GPT-5-mini (OpenAI) con contexto de la conversación.
 * 3. Guarda ambos mensajes en MongoDB (historial persistente por usuario).
 */
export default async function handler(req, res) {
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

    const aiRes = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: "gpt-5-mini",
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          ...history,
          { role: "user", content: text },
        ],
      }),
    });

    if (!aiRes.ok) {
      return send(res, 502, { error: "El modelo de IA no respondió. Intenta de nuevo en unos segundos." });
    }

    const ai = await aiRes.json();
    const raw = ai.choices?.[0]?.message?.content || "";
    let parsed = {};
    try {
      parsed = JSON.parse(raw);
    } catch {
      parsed = { text: raw };
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
