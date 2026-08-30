import { getDb, send } from "./_lib.js";

/** GET /api/health — el frontend lo usa para decidir entre API real o modo demo. */
export default async function handler(req, res) {
  if (req.method !== "GET") return send(res, 405, { error: "Método no permitido" });
  if (!process.env.MONGODB_URI || !process.env.OPENAI_API_KEY) {
    return send(res, 503, { ok: false, reason: "missing-env" });
  }
  try {
    const db = await getDb();
    await db.command({ ping: 1 });
    return send(res, 200, { ok: true, db: true, model: "gpt-5-mini" });
  } catch (e) {
    return send(res, 503, { ok: false, db: false });
  }
}
