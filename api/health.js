import { getDb, send, preflight, mongoHint } from "./_lib.js";

/**
 * GET /api/health
 * Diagnóstico completo. El frontend lo usa para verificar que todo esté conectado,
 * y tú puedes abrirlo en el navegador para ver qué está fallando:
 *   https://tu-sitio.vercel.app/api/health
 */
export default async function handler(req, res) {
  if (preflight(req, res)) return;
  if (req.method !== "GET") return send(res, 405, { error: "Método no permitido" });

  const hasMongoUri = Boolean(process.env.MONGODB_URI);
  const hasGeminiKey = Boolean(process.env.GEMINI_API_KEY);

  let mongo = false;
  let mongoError = null;
  if (hasMongoUri) {
    try {
      const db = await getDb();
      await db.command({ ping: 1 });
      mongo = true;
    } catch (e) {
      mongoError = String(e?.message || e).slice(0, 200);
    }
  } else {
    mongoError = "Falta la variable de entorno MONGODB_URI en Vercel.";
  }

  let gemini = false;
  let geminiError = null;
  if (hasGeminiKey) {
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 8000);
      const r = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash?key=${process.env.GEMINI_API_KEY}`,
        { signal: ctrl.signal }
      );
      clearTimeout(t);
      if (r.ok) {
        gemini = true;
      } else {
        geminiError = `Gemini respondió ${r.status}. Revisa que la clave GEMINI_API_KEY sea válida.`;
      }
    } catch (e) {
      geminiError = "No se pudo contactar a Gemini: " + String(e?.message || e).slice(0, 140);
    }
  } else {
    geminiError = "Falta la variable de entorno GEMINI_API_KEY en Vercel.";
  }

  // El sitio funciona con la API real solo si MongoDB responde.
  const ok = mongo;
  return send(res, ok ? 200 : 503, {
    ok,
    // Si este campo no aparece en tu navegador, tu Vercel tiene código VIEJO:
    // sube los archivos actualizados del proyecto a tu repositorio y haz Redeploy.
    build: "mimir-v5-gemini",
    mongo,
    mongoError,
    gemini,
    geminiError,
    model: "gemini-3.6-flash",
    hint: !ok
      ? "Mientras `ok` sea false, la página no puede funcionar. Corrige lo indicado arriba y haz Redeploy."
      : undefined,
  });
}
