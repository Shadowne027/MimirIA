import { getDb, hashPassword, signToken, send, readBody, displayId, mongoHint, preflight } from "./_lib.js";

/** POST /api/login  { username, password } */
export default async function handler(req, res) {
  if (preflight(req, res)) return;
  if (req.method !== "POST") return send(res, 405, { error: "Método no permitido" });
  try {
    const { username, password } = await readBody(req);
    const uname = String(username || "").trim();
    if (!uname || !password) return send(res, 400, { error: "Escribe tu usuario y tu contraseña." });

    const db = await getDb();
    const user = await db.collection("users").findOne({ usernameLower: uname.toLowerCase() });
    if (!user) return send(res, 401, { error: "Usuario o contraseña incorrectos." });

    const hash = hashPassword(password, user.salt);
    if (hash !== user.passwordHash) return send(res, 401, { error: "Usuario o contraseña incorrectos." });

    const token = signToken({ userId: user.userId, username: user.username });
    return send(res, 200, {
      user: { userId: user.userId, id: displayId(user.userId), username: user.username, token },
    });
  } catch (e) {
    return send(res, 500, { error: mongoHint(e) });
  }
}
