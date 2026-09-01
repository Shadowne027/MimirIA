import { ObjectId } from "mongodb";
import { getDb, authUser, send, readBody, mongoHint, preflight } from "./_lib.js";

/**
 * /api/conversations
 *  GET          → lista las conversaciones del usuario (con mensajes)
 *  POST         → crea una conversación nueva { title? }
 *  DELETE ?id=  → elimina una conversación (el id va por query para máxima compatibilidad)
 */
export default async function handler(req, res) {
  if (preflight(req, res)) return;
  try {
    const user = await authUser(req);
    if (!user) return send(res, 401, { error: "Sesión inválida. Inicia sesión de nuevo." });

    const db = await getDb();
    const col = db.collection("conversations");

    if (req.method === "GET") {
      const docs = await col
        .find({ userId: user.userId })
        .sort({ updatedAt: -1 })
        .limit(100)
        .toArray();
      return send(res, 200, { conversations: docs.map((d) => ({ ...d, id: String(d._id) })) });
    }

    if (req.method === "POST") {
      const { title } = await readBody(req);
      const now = Date.now();
      const doc = {
        userId: user.userId,
        title: String(title || "Nueva conversación").slice(0, 80),
        createdAt: now,
        updatedAt: now,
        messages: [],
      };
      const r = await col.insertOne(doc);
      return send(res, 201, { conversation: { ...doc, id: String(r.insertedId) } });
    }

    if (req.method === "DELETE") {
      const raw = req.query?.id || (await readBody(req)).id;
      const id = String(raw || "");
      if (!id) return send(res, 400, { error: "Falta el id de la conversación." });
      let deleted = 0;
      try {
        const r = await col.deleteOne({ _id: new ObjectId(id), userId: user.userId });
        deleted = r.deletedCount;
      } catch {
        deleted = 0;
      }
      if (!deleted) return send(res, 404, { error: "Conversación no encontrada." });
      return send(res, 200, { ok: true });
    }

    return send(res, 405, { error: "Método no permitido" });
  } catch (e) {
    return send(res, 500, { error: mongoHint(e) });
  }
}
