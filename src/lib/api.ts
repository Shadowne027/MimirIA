/**
 * Cliente de API de MIMIR IA.
 * - En producción (Vercel) habla con las funciones serverless de /api,
 *   que usan MongoDB (usuarios + historial) y GPT-5-mini (OpenAI).
 * - Si el backend no está disponible (p. ej. en local sin configurar),
 *   cae automáticamente a modo demo con almacenamiento local, asignando
 *   IDs correlativos (#001, #002…) igual que el servidor.
 */
import { findReply } from "./mimirSim";
import type { MimirSource } from "./mimirSim";

export interface AuthUser {
  userId: number;
  id: string; // "#001"
  username: string;
  token: string;
  demo: boolean;
}

export interface ChatMessage {
  id?: string;
  role: "user" | "assistant";
  content: string;
  sources?: MimirSource[];
  followUps?: string[];
  at: number;
}

export interface Conversation {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  messages: ChatMessage[];
}

const TOKEN_KEY = "mimir_token";
const USERS_KEY = "mimir_users";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const fmtId = (n: number) => `#${String(n).padStart(3, "0")}`;

/* ---------------- Detección del backend ---------------- */
let apiStatus: boolean | null = null;

export async function isApiAvailable(): Promise<boolean> {
  if (apiStatus !== null) return apiStatus;
  try {
    const ctrl = new AbortController();
    const t = window.setTimeout(() => ctrl.abort(), 2500);
    const res = await fetch("/api/health", { signal: ctrl.signal });
    window.clearTimeout(t);
    // El backend real responde JSON con { ok: true }. Un hosting estático
    // puede devolver index.html con 200; eso NO cuenta como API disponible.
    const ct = res.headers.get("content-type") || "";
    if (!res.ok || !ct.includes("application/json")) {
      apiStatus = false;
      return false;
    }
    const data = await res.json().catch(() => null);
    apiStatus = !!(data && data.ok === true);
  } catch {
    apiStatus = false;
  }
  return apiStatus;
}

/** Lee una respuesta de la API; si no es JSON válido, la API no está presente. */
async function parseApiResponse(res: Response): Promise<any | null> {
  const ct = res.headers.get("content-type") || "";
  if (!ct.includes("application/json")) return null;
  return res.json().catch(() => null);
}

/* ---------------- Almacén demo (localStorage) ---------------- */
interface StoredUser {
  userId: number;
  id: string;
  username: string;
  pass: string;
  createdAt: number;
}

function readUsers(): StoredUser[] {
  try {
    return JSON.parse(localStorage.getItem(USERS_KEY) || "[]") as StoredUser[];
  } catch {
    return [];
  }
}
function writeUsers(users: StoredUser[]) {
  try {
    localStorage.setItem(USERS_KEY, JSON.stringify(users));
  } catch {
    throw new Error("Tu navegador bloqueó el almacenamiento local y no se pudo guardar la cuenta.");
  }
}
function toAuthUser(u: StoredUser): AuthUser {
  return { userId: u.userId, id: u.id, username: u.username, token: `demo.${u.userId}`, demo: true };
}

const authHeaders = (token: string): HeadersInit => ({
  "Content-Type": "application/json",
  Authorization: `Bearer ${token}`,
});

export function formatApiError(err: unknown): string {
  if (err instanceof Error && err.message) return err.message;
  return "Ocurrió un error inesperado. Intenta de nuevo.";
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

/* ---------------- Autenticación ---------------- */
export async function register(username: string, password: string): Promise<AuthUser> {
  const uname = username.trim();
  if (uname.length < 2) throw new Error("El nombre de usuario debe tener al menos 2 caracteres.");
  if (password.length < 6) throw new Error("La contraseña debe tener al menos 6 caracteres.");

  if (await isApiAvailable()) {
    const res = await fetch("/api/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: uname, password }),
    });
    const data = await parseApiResponse(res);
    if (data?.user) return { ...data.user, demo: false };
    if (data?.error) throw new Error(data.error);
    // Respuesta no-JSON: el backend no está realmente presente → modo demo
    apiStatus = false;
  }

  // Modo demo
  await sleep(700);
  const users = readUsers();
  if (users.some((u) => u.username.toLowerCase() === uname.toLowerCase()))
    throw new Error("Ese nombre de usuario ya está registrado.");
  const n = users.reduce((m, u) => Math.max(m, u.userId), 0) + 1;
  const stored: StoredUser = { userId: n, id: fmtId(n), username: uname, pass: password, createdAt: Date.now() };
  users.push(stored);
  writeUsers(users);
  return toAuthUser(stored);
}

export async function login(username: string, password: string): Promise<AuthUser> {
  const uname = username.trim();
  if (!uname || !password) throw new Error("Escribe tu usuario y tu contraseña.");

  if (await isApiAvailable()) {
    const res = await fetch("/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: uname, password }),
    });
    const data = await parseApiResponse(res);
    if (data?.user) return { ...data.user, demo: false };
    if (data?.error) throw new Error(data.error);
    // Respuesta no-JSON: el backend no está realmente presente → modo demo
    apiStatus = false;
  }

  // Modo demo
  await sleep(600);
  const users = readUsers();
  const u = users.find((x) => x.username.toLowerCase() === uname.toLowerCase());
  if (!u)
    throw new Error(
      users.length === 0
        ? "No hay cuentas creadas todavía en este navegador. Primero crea una cuenta."
        : "No existe una cuenta con ese nombre de usuario. Verifica el nombre o crea una cuenta."
    );
  if (u.pass !== password) throw new Error("Contraseña incorrecta. Inténtalo de nuevo.");
  return toAuthUser(u);
}

export async function me(token: string): Promise<AuthUser | null> {
  if (token.startsWith("demo.")) {
    const n = Number(token.split(".")[1]);
    const u = readUsers().find((x) => x.userId === n);
    return u ? toAuthUser(u) : null;
  }
  if (await isApiAvailable()) {
    try {
      const res = await fetch("/api/me", { headers: authHeaders(token) });
      if (!res.ok) return null;
      const data = await res.json().catch(() => ({}));
      return data.user ? { ...data.user, token, demo: false } : null;
    } catch {
      return null;
    }
  }
  return null;
}

/* ---------------- Conversaciones (historial) ---------------- */
const convKey = (userId: number) => `mimir_convos_${userId}`;

function readConvos(userId: number): Conversation[] {
  try {
    return JSON.parse(localStorage.getItem(convKey(userId)) || "[]") as Conversation[];
  } catch {
    return [];
  }
}
export function writeConvos(userId: number, list: Conversation[]) {
  localStorage.setItem(convKey(userId), JSON.stringify(list));
}

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
  if (!user.demo) {
    try {
      const res = await fetch("/api/conversations", { headers: authHeaders(user.token) });
      if (res.ok) {
        const data = await res.json().catch(() => ({}));
        if (Array.isArray(data.conversations)) return data.conversations.map(normalizeServerConvo);
      }
    } catch {
      /* cae a demo */
    }
  }
  return readConvos(user.userId);
}

export async function createConversation(user: AuthUser, title = "Nueva conversación"): Promise<Conversation> {
  if (!user.demo) {
    try {
      const res = await fetch("/api/conversations", {
        method: "POST",
        headers: authHeaders(user.token),
        body: JSON.stringify({ title }),
      });
      if (res.ok) {
        const data = await res.json().catch(() => ({}));
        if (data.conversation) return normalizeServerConvo(data.conversation);
      }
    } catch {
      /* cae a demo */
    }
  }
  const list = readConvos(user.userId);
  const c: Conversation = {
    id: `local_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
    title,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    messages: [],
  };
  list.unshift(c);
  writeConvos(user.userId, list);
  return c;
}

export async function deleteConversation(user: AuthUser, id: string): Promise<void> {
  if (!user.demo) {
    try {
      await fetch("/api/conversations", {
        method: "DELETE",
        headers: authHeaders(user.token),
        body: JSON.stringify({ id }),
      });
    } catch {
      /* cae a demo */
    }
  }
  writeConvos(user.userId, readConvos(user.userId).filter((c) => c.id !== id));
}

/* ---------------- Chat ---------------- */
export interface ChatReply {
  text: string;
  sources?: MimirSource[];
  followUps?: string[];
}

export async function sendMessage(
  user: AuthUser,
  conversationId: string,
  message: string
): Promise<ChatReply> {
  if (!user.demo) {
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: authHeaders(user.token),
        body: JSON.stringify({ conversationId, message }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.text) {
        return {
          text: data.text,
          sources: Array.isArray(data.sources) ? data.sources : undefined,
          followUps: Array.isArray(data.followups) ? data.followups : undefined,
        };
      }
    } catch {
      /* cae al motor local */
    }
  }
  await sleep(700 + Math.random() * 800);
  const reply = findReply(message);
  return { text: reply.text, sources: reply.sources, followUps: reply.followUps };
}
