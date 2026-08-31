import crypto from "node:crypto";
import { getDb, hashPassword, signToken, send, readBody, displayId, nextUserId, mongoHint } from "./_lib.js";

/**
 * POST /api/register  { username, password }
 * Crea el usuario en MongoDB y le asigna un ID correlativo (#001, #002…).
 */
export default async function handler(req, res) {
  if (req.method !== "POST") return send(res, 405, { error: "Método no permitido" });
  try {
    const { username, password } = await readBody(req);
    const uname = String(username || "").trim();
    if (uname.length < 2) return send(res, 400, { error: "El nombre de usuario debe tener al menos 2 caracteres." });
    if (String(password || "").length < 6) return send(res, 400, { error: "La contraseña debe tener al menos 6 caracteres." });

    const db = await getDb();
    const users = db.collection("users");

    const exists = await users.findOne({ usernameLower: uname.toLowerCase() });
    if (exists) return send(res, 409, { error: "Ese nombre de usuario ya está registrado." });

    const n = await nextUserId(db);
    const salt = crypto.randomBytes(16).toString("hex");
    const now = Date.now();

    await users.insertOne({
      userId: n,
      displayId: displayId(n),
      username: uname,
      usernameLower: uname.toLowerCase(),
      salt,
      passwordHash: hashPassword(password, salt),
      createdAt: now,
    });

    const token = signToken({ userId: n, username: uname });
    return send(res, 201, {
      user: { userId: n, id: displayId(n), username: uname, token },
    });
  } catch (e) {
    return send(res, 500, { error: mongoHint(e) });
  }
}
