/**
 * Utilidades compartidas por las funciones serverless de MIMIR IA (Vercel).
 * Requiere las variables de entorno: MONGODB_URI, OPENAI_API_KEY, TOKEN_SECRET.
 */
import { MongoClient } from "mongodb";
import crypto from "node:crypto";

const MONGODB_URI = process.env.MONGODB_URI;
const TOKEN_SECRET = process.env.TOKEN_SECRET || "mimiria-dev-secret-cambiar-en-produccion";

let clientPromise = null;

export function getDb() {
  if (!MONGODB_URI) throw new Error("MONGODB_URI no está configurada");
  if (!clientPromise) {
    if (!globalThis.__mimirMongo) {
      globalThis.__mimirMongo = MongoClient.connect(MONGODB_URI, {
        maxPoolSize: 5,
        serverSelectionTimeoutMS: 8000,
        appName: "mimiria",
      });
    }
    clientPromise = globalThis.__mimirMongo;
  }
  return clientPromise.then((client) => client.db("mimiria"));
}

/** Traduce errores típicos de MongoDB a mensajes útiles (sin revelar la URI). */
export function mongoHint(err) {
  const msg = String(err?.message || err || "");
  if (/Invalid scheme/i.test(msg)) {
    return 'La variable MONGODB_URI no es una cadena de conexión válida: debe empezar con "mongodb://" o "mongodb+srv://". En MongoDB Atlas ve a Database → Connect → Drivers, copia la cadena y reemplaza <username> y <password> por tus datos reales (sin los símbolos < >). Verifica que en Vercel la variable se llame exactamente MONGODB_URI y haz Redeploy.';
  }
  if (/Server selection timed out|ECONNREFUSED|ENOTFOUND|network/i.test(msg)) {
    return "No se pudo conectar a MongoDB. Verifica la variable MONGODB_URI y en Atlas → Network Access permite la IP 0.0.0.0/0. Después haz Redeploy en Vercel.";
  }
  if (/bad auth|Authentication failed|auth/i.test(msg)) {
    return "MongoDB rechazó la autenticación. Revisa usuario y contraseña dentro de MONGODB_URI (caracteres especiales deben ir codificados, ej. @ como %40).";
  }
  return "Error de base de datos: " + msg.slice(0, 160);
}

/* ---------------- Contraseñas (scrypt, sin dependencias nativas) ---------------- */
export function hashPassword(password, salt) {
  return crypto.scryptSync(String(password), salt, 64).toString("hex");
}

/* ---------------- Tokens de sesión (HMAC) ---------------- */
export function signToken(payload, ttlHours = 24 * 30) {
  const body = Buffer
    .from(JSON.stringify({ ...payload, exp: Date.now() + ttlHours * 3600_000 }))
    .toString("base64url");
  const sig = crypto.createHmac("sha256", TOKEN_SECRET).update(body).digest("base64url");
  return `${body}.${sig}`;
}

export function verifyToken(token) {
  try {
    const [body, sig] = String(token || "").split(".");
    if (!body || !sig) return null;
    const expected = crypto.createHmac("sha256", TOKEN_SECRET).update(body).digest("base64url");
    if (sig.length !== expected.length) return null;
    if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
    if (payload.exp && payload.exp < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

/* ---------------- HTTP helpers ---------------- */
export function send(res, status, body) {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.status(status).json(body);
}

/**
 * Responde el preflight CORS (OPTIONS) con 204.
 * Las cabeceras Access-Control-* las añade vercel.json a todas las respuestas.
 * Devuelve true si ya se respondió (para que el handler haga `return`).
 */
export function preflight(req, res) {
  if (req.method !== "OPTIONS") return false;
  res.status(204).end();
  return true;
}

export function readBody(req) {
  return new Promise((resolve) => {
    let data = "";
    req.on("data", (c) => (data += c));
    req.on("end", () => {
      try {
        resolve(JSON.parse(data || "{}"));
      } catch {
        resolve({});
      }
    });
  });
}

/* ---------------- Autenticación ---------------- */
export async function authUser(req) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  const payload = verifyToken(token);
  if (!payload || typeof payload.userId !== "number") return null;
  const db = await getDb();
  const user = await db.collection("users").findOne({ userId: payload.userId });
  return user || null;
}

/* ---------------- ID correlativo de estudiante ---------------- */
export const displayId = (n) => `#${String(n).padStart(3, "0")}`;

export async function nextUserId(db) {
  const doc = await db
    .collection("counters")
    .findOneAndUpdate(
      { _id: "users" },
      { $inc: { seq: 1 } },
      { upsert: true, returnDocument: "after" }
    );
  const value = doc?.value ?? doc; // el driver devuelve { value } o el documento según versión
  return value?.seq ?? 1;
}

/* ---------------- Prompt del tutor ---------------- */
export const SYSTEM_PROMPT = `Eres MIMIR IA, un tutor personal creado por estudiantes del SENA (ficha 3156695) para la Institución Educativa Gonzalo Rivera Laguado de Cúcuta, Colombia.

## Sobre ti (MIMIR IA):
- **Nombre completo:** MIMIR IA (Mente Inteligente para Mejorar el Rendimiento)
- **Propósito:** Plan de mejoramiento académico a partir de inteligencia artificial
- **Creado por:** Estudiantes del SENA, programa 233108, ficha 3156695
- **Institución:** Institución Educativa Gonzalo Rivera Laguado, Cúcuta, Norte de Santander, Colombia
- **Tecnología:** Usas GPT-4o y GPT-4o-mini de OpenAI con enrutamiento inteligente según la dificultad de la pregunta
- **Funcionalidades:** Explicas conceptos paso a paso, buscas información con fuentes verificadas, diseñas rutas de estudio personalizadas, guardas el historial de conversaciones
- **Acceso:** Gratuito para estudiantes, disponible 24/7 desde cualquier dispositivo
- **Privacidad:** Las contraseñas se guardan encriptadas, no se venden datos, cumple con la Ley 1581 de 2012 de Protección de Datos Personales
- **ID de estudiante:** Cada usuario recibe un ID único correlativo (#001, #002, etc.) que vincula todo su historial

Cuando te pregunten sobre ti mismo, quién te creó, cómo funcionas, o cualquier pregunta sobre MIMIR IA, responde con esta información de forma clara y amigable.

## FORMATO DE RESPUESTA (MUY IMPORTANTE):
Debes responder EXCLUSIVAMENTE con un objeto JSON válido. NO incluyas texto antes ni después del JSON. NO uses bloques de código markdown (```). NO agregues explicaciones fuera del JSON.

El JSON debe tener EXACTAMENTE esta estructura:
{
  "text": "tu explicación completa en formato markdown",
  "sources": [
    {"label": "Nombre de la fuente — Tema", "url": "https://..."},
    {"label": "Otra fuente", "url": "https://..."}
  ],
  "followups": [
    "pregunta de seguimiento 1",
    "pregunta de seguimiento 2",
    "pregunta de seguimiento 3"
  ]
}

## Reglas del contenido:
- Responde SIEMPRE en español, con tono cálido, paciente y motivador.
- En el campo "text": explica paso a paso con estructura clara usando **negritas**, listas numeradas y ejemplos. Fomenta el pensamiento crítico cerrando con una pregunta.
- En el campo "sources": incluye entre 2 y 4 fuentes reales y verificables (Wikipedia, Khan Academy, sitios .edu, .gov, MDN, Britannica, Banrepcultural, Colombia Aprende, etc.).
- En el campo "followups": sugiere 2-3 preguntas de seguimiento relacionadas con el tema.

Recuerda: SOLO el JSON, nada más.`;
