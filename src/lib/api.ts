/**
 * Cliente de API de MIMIR IA — 100% en la nube.
 * Todo (cuentas, historial y respuestas de la IA) vive en el servidor:
 * MongoDB para datos y Gemini 3.6 Flash (Google) para las respuestas.
 * Si el servidor no responde, la app NO simula nada: muestra el error real.
 */

export interface AuthUser {
  userId: number;
  id: string; // "#001"
  username: string;
  token: string;
}

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  sources?: { label: string; url: string }[];
  followUps?: string[];
  at: number;
  id?: string; // marcador temporal para la animación de escritura
}

export interface Conversation {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  messages: ChatMessage[];
}

export interface HealthStatus {
  reachable: boolean; // ¿el servidor responde?
  ok: boolean; // ¿todo está bien configurado?
  mongo: boolean;
  mongoError?: string | null;
  gemini: boolean;
  geminiError?: string | null;
  build?: string;
}

const TOKEN_KEY = "mimir_token";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function parseApiResponse(res: Response): Promise<any | null> {
  const ct = res.headers.get("content-type") || "";
  if (!ct.includes("application/json")) return null;
  return res.json().catch(() => null);
}

export function formatApiError(err: unknown): string {
  if (err instanceof Error && err.message) return err.message;
  return "Ocurrió un error inesperado. Intenta de nuevo.";
}

/* ---------------- Diagnóstico del servidor ---------------- */
let healthCache: HealthStatus | null = null;

/**
 * Consulta /api/health (con reintentos, porque el primer llamado en Vercel
 * incluye el arranque en frío y puede tardar varios segundos).
 */
export async function getHealth(force = false): Promise<HealthStatus> {
  if (healthCache && !force) return healthCache;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const ctrl = new AbortController();
      const t = window.setTimeout(() => ctrl.abort(), 12000);
      const res = await fetch("/api/health", { signal: ctrl.signal });
      window.clearTimeout(t);
      const data = await parseApiResponse(res);
      if (data && typeof data === "object" && "mongo" in data) {
        const status: HealthStatus = {
          reachable: true,
          ok: !!data.ok,
          mongo: !!data.mongo,
          mongoError: data.mongoError ?? null,
          gemini: !!data.gemini,
          geminiError: data.geminiError ?? null,
          build: data.build,
        };
        healthCache = status;
        return status;
      }
      // Respuesta no-JSON: no hay funciones serverless desplegadas
      return {
        reachable: false,
        ok: false,
        mongo: false,
        mongoError: "El servidor no tiene las funciones /api desplegadas. Sube la carpeta api/ a tu repositorio y haz Redeploy en Vercel.",
        gemini: false,
      };
    } catch {
      if (attempt === 0) await sleep(800);
    }
  }
  return {
    reachable: false,
    ok: false,
    mongo: false,
    mongoError: "No se pudo contactar al servidor de MIMIR. Revisa tu conexión a internet e inténtalo de nuevo.",
    gemini: false,
  };
}

async function requireServer(): Promise<void> {
  const h = await getHealth();
  if (!h.ok) {
    throw new Error(
      h.reachable
        ? `MIMIR no está en línea: ${h.mongoError || h.geminiError || "el servidor reporta un problema de configuración."}`
        : h.mongoError || "No se pudo contactar al servidor de MIMIR."
    );
  }
}

/* ---------------- Token de sesión ---------------- */
export function saveToken(token: string | null) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* sin storage */
  }
}
export function loadToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

const authHeaders = (token: string): HeadersInit => ({
  "Content-Type": "application/json",
  Authorization: `Bearer ${token}`,
});

/* ---------------- Autenticación (MongoDB) ---------------- */
export async function register(username: string, password: string): Promise<AuthUser> {
  const uname = username.trim();
  if (uname.length < 2) throw new Error("El nombre de usuario debe tener al menos 2 caracteres.");
  if (password.length < 6) throw new Error("La contraseña debe tener al menos 6 caracteres.");

  await requireServer();
  const res = await fetch("/api/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: uname, password }),
  });
  const data = await parseApiResponse(res);
  if (data?.user) return data.user as AuthUser;
  throw new Error(data?.error || "No se pudo crear la cuenta. Intenta de nuevo.");
}

export async function login(username: string, password: string): Promise<AuthUser> {
  const uname = username.trim();
  if (!uname || !password) throw new Error("Escribe tu usuario y tu contraseña.");

  await requireServer();
  const res = await fetch("/api/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: uname, password }),
  });
  const data = await parseApiResponse(res);
  if (data?.user) return data.user as AuthUser;
  throw new Error(data?.error || "Usuario o contraseña incorrectos.");
}

export async function me(token: string): Promise<AuthUser | null> {
  try {
    const res = await fetch("/api/me", { headers: authHeaders(token) });
    const data = await parseApiResponse(res);
    if (res.ok && data?.user) return { ...(data.user as AuthUser), token };
  } catch {
    /* sin servidor */
  }
  return null;
}

/* ---------------- Conversaciones (historial en MongoDB) ---------------- */
function normalizeServerConvo(doc: any): Conversation {
  return {
    id: String(doc.id ?? doc._id),
    title: doc.title || "Nueva conversación",
    createdAt: doc.createdAt ?? Date.now(),
    updatedAt: doc.updatedAt ?? Date.now(),
    messages: Array.isArray(doc.messages) ? doc.messages : [],
  };
}

export async function getConversations(user: AuthUser): Promise<Conversation[]> {
  await requireServer();
  const res = await fetch("/api/conversations", { headers: authHeaders(user.token) });
  const data = await parseApiResponse(res);
  if (res.ok && Array.isArray(data?.conversations)) {
    return data.conversations.map(normalizeServerConvo);
  }
  throw new Error(data?.error || "No se pudo cargar tu historial.");
}

export async function createConversation(user: AuthUser, title = "Nueva conversación"): Promise<Conversation> {
  await requireServer();
  const res = await fetch("/api/conversations", {
    method: "POST",
    headers: authHeaders(user.token),
    body: JSON.stringify({ title }),
  });
  const data = await parseApiResponse(res);
  if (res.ok && data?.conversation) return normalizeServerConvo(data.conversation);
  throw new Error(data?.error || "No se pudo crear la conversación.");
}

export async function deleteConversation(user: AuthUser, id: string): Promise<void> {
  await requireServer();
  const res = await fetch(`/api/conversations?id=${encodeURIComponent(id)}`, {
    method: "DELETE",
    headers: authHeaders(user.token),
  });
  const data = await parseApiResponse(res);
  if (!res.ok) throw new Error(data?.error || "No se pudo eliminar la conversación.");
}

/* ---------------- Chat (Gemini 3.6 Flash) ---------------- */
export interface ChatReply {
  text: string;
  sources?: { label: string; url: string }[];
  followUps?: string[];
}

export async function sendMessage(
  user: AuthUser,
  conversationId: string,
  message: string
): Promise<ChatReply> {
  await requireServer();
  const res = await fetch("/api/chat", {
    method: "POST",
    headers: authHeaders(user.token),
    body: JSON.stringify({ conversationId, message }),
  });
  const data = await parseApiResponse(res);
  if (res.ok && data?.text) {
    return {
      text: data.text,
      sources: Array.isArray(data.sources) ? data.sources : undefined,
      followUps: Array.isArray(data.followups) ? data.followups : undefined,
    };
  }
  
  // Mensajes más amigables para errores comunes
  const errMsg = data?.error || "";
  if (/high demand|temporarily unavailable/i.test(errMsg)) {
    throw new Error("La IA está muy ocupada en este momento. Por favor intenta de nuevo en unos segundos.");
  }
  if (/quota|rate limit/i.test(errMsg)) {
    throw new Error("Se alcanzó el límite de uso. Espera un momento e intenta de nuevo.");
  }
  
  throw new Error(errMsg || "La IA no respondió. Intenta de nuevo en unos segundos.");
}
