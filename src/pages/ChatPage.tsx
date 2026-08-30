import React, { useEffect, useMemo, useRef, useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import {
  Compass, ExternalLink, Globe, Loader2, LogOut, Menu,
  Plus, Send, Sparkles, Trash2, X, MessageSquare, Wifi, WifiOff,
} from "lucide-react";
import { Toaster, toast } from "sonner";
import { useAuth } from "../contexts/AuthContext";
import { YGG_LOGO } from "../lib/assets";
import {
  getConversations,
  createConversation,
  deleteConversation,
  sendMessage,
  isApiAvailable,
  writeConvos,
} from "../lib/api";
import type { AuthUser, ChatMessage, Conversation } from "../lib/api";

const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);

/* ================= Mini-render de texto (negritas + saltos + cursivas) ================= */
function RichText({ text }: { text: string }) {
  const lines = text.split("\n");
  return (
    <>
      {lines.map((line, i) => {
        if (!line.trim()) return <div key={i} className="h-2" />;
        const parts = line.split(/(\*\*[^*]+\*\*|\*[^*]+\*)/g).filter(Boolean);
        return (
          <p key={i} className="leading-relaxed">
            {parts.map((p, j) => {
              if (p.startsWith("**") && p.endsWith("**"))
                return <strong key={j} className="font-semibold text-[var(--text)]">{p.slice(2, -2)}</strong>;
              if (p.startsWith("*") && p.endsWith("*")) return <em key={j}>{p.slice(1, -1)}</em>;
              return <React.Fragment key={j}>{p}</React.Fragment>;
            })}
          </p>
        );
      })}
    </>
  );
}

/* ================= CHAT PAGE ================= */
export default function ChatPage() {
  const { user, initializing, logout } = useAuth();
  const navigate = useNavigate();

  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [thinking, setThinking] = useState(false);
  const [streamingId, setStreamingId] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [apiOnline, setApiOnline] = useState<boolean | null>(null);

  const bottomRef = useRef<HTMLDivElement>(null);
  const streamTimer = useRef<number | null>(null);

  // Cargar historial (MongoDB vía API, o almacenamiento local en modo demo)
  useEffect(() => {
    if (!user) return;
    let alive = true;
    (async () => {
      setLoadingHistory(true);
      const [convos, online] = await Promise.all([getConversations(user), isApiAvailable()]);
      if (!alive) return;
      setApiOnline(online);
      setConversations(convos);
      setActiveId(convos[0]?.id ?? null);
      setLoadingHistory(false);

      // Si la landing envió una pregunta ("Empieza ahora"), dejarla lista en el input
      const prefill = sessionStorage.getItem("mimir_first_prompt");
      if (prefill) {
        sessionStorage.removeItem("mimir_first_prompt");
        setInput(prefill);
      }
    })();
    return () => {
      alive = false;
    };
  }, [user]);

  // Persistencia local solo en modo demo (con la API, el historial vive en MongoDB)
  useEffect(() => {
    if (!user || !user.demo) return;
    writeConvos(user.userId, conversations);
  }, [conversations, user]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [conversations, thinking, activeId]);

  useEffect(() => {
    return () => {
      if (streamTimer.current) window.clearInterval(streamTimer.current);
    };
  }, []);

  const active = useMemo(
    () => conversations.find((c) => c.id === activeId) ?? null,
    [conversations, activeId]
  );

  if (!initializing && !user) return <Navigate to="/" replace />;

  const patchConvo = (id: string, fn: (c: Conversation) => Conversation) => {
    setConversations((prev) => prev.map((c) => (c.id === id ? fn(c) : c)));
  };

  const handleNew = async () => {
    if (!user) return;
    const c = await createConversation(user);
    setConversations((prev) => [c, ...prev]);
    setActiveId(c.id);
    setSidebarOpen(false);
    setInput("");
  };

  const handleDelete = async (id: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (!user) return;
    await deleteConversation(user, id);
    setConversations((prev) => {
      const next = prev.filter((c) => c.id !== id);
      if (activeId === id) setActiveId(next[0]?.id ?? null);
      return next;
    });
    toast.success("Conversación eliminada");
  };

  const typewriter = (convoId: string, msgId: string, full: string, meta: Partial<ChatMessage>) => {
    const words = full.split(/(\s+)/);
    let i = 0;
    let acc = "";
    setStreamingId(msgId);
    streamTimer.current = window.setInterval(() => {
      for (let k = 0; k < 4; k++) {
        if (i < words.length) {
          acc += words[i];
          i++;
        }
      }
      patchConvo(convoId, (c) => ({
        ...c,
        messages: c.messages.map((m) => (m.id === msgId ? { ...m, content: acc } : m)),
      }));
      if (i >= words.length) {
        if (streamTimer.current) window.clearInterval(streamTimer.current);
        streamTimer.current = null;
        patchConvo(convoId, (c) => ({
          ...c,
          messages: c.messages.map((m) => (m.id === msgId ? { ...m, content: full, ...meta } : m)),
        }));
        setStreamingId(null);
      }
    }, 26);
  };

  const handleSend = async (raw?: string) => {
    const text = (raw ?? input).trim();
    if (!text || thinking || !user) return;
    setInput("");

    let convoId = activeId;
    if (!convoId) {
      const c = await createConversation(user);
      setConversations((prev) => [c, ...prev]);
      convoId = c.id;
      setActiveId(c.id);
    }
    const targetId = convoId;

    const userMsg: ChatMessage = { role: "user", content: text, at: Date.now() };
    const asstId = uid();
    patchConvo(targetId, (c) => ({
      ...c,
      title: c.messages.length === 0 ? text.slice(0, 48) + (text.length > 48 ? "…" : "") : c.title,
      updatedAt: Date.now(),
      messages: [...c.messages, userMsg, { role: "assistant", content: "", at: Date.now() } as ChatMessage],
    }));
    // Marcador temporal con id para el typewriter
    setConversations((prev) =>
      prev.map((c) => {
        if (c.id !== targetId) return c;
        const msgs = [...c.messages];
        const last = msgs[msgs.length - 1] as ChatMessage & { id?: string };
        msgs[msgs.length - 1] = { ...last, id: asstId };
        return { ...c, messages: msgs };
      })
    );

    setThinking(true);
    try {
      const reply = await sendMessage(user, targetId, text);
      setThinking(false);
      typewriter(targetId, asstId, reply.text, {
        sources: reply.sources,
        followUps: reply.followUps,
      });
    } catch {
      setThinking(false);
      patchConvo(targetId, (c) => ({
        ...c,
        messages: c.messages.map((m) =>
          (m as ChatMessage & { id?: string }).id === asstId
            ? { ...m, content: "Ups, algo salió mal al consultar. Inténtalo de nuevo en unos segundos." }
            : m
        ),
      }));
      setStreamingId(null);
      toast.error("No se pudo obtener la respuesta");
    }
  };

  const handleLogout = () => {
    logout();
    navigate("/");
  };

  const busy = thinking || streamingId !== null;

  return (
    <div className="flex h-dvh flex-col bg-[var(--bg)] font-body text-[var(--text)]">
      {/* ===== Barra superior ===== */}
      <header className="flex items-center justify-between gap-3 border-b border-[var(--border)] bg-[var(--bg)]/90 px-4 py-3 backdrop-blur md:px-6">
        <div className="flex items-center gap-3">
          <button
            className="rounded-lg p-2 text-[var(--text-2)] transition-colors hover:bg-[var(--bg-soft)] lg:hidden"
            onClick={() => setSidebarOpen(true)}
            aria-label="Abrir historial"
          >
            <Menu size={20} />
          </button>
          <Link to="/" className="flex items-center gap-2.5">
            <span className="inline-flex h-9 w-9 items-center justify-center overflow-hidden rounded-full bg-[var(--brand)]">
              <img src={YGG_LOGO} alt="" className="h-full w-full object-cover" />
            </span>
            <span className="font-display text-lg font-semibold tracking-tight">
              MIMIR <span className="text-[var(--brand-text)]">IA</span>
            </span>
          </Link>
          <span className="hidden rounded-full border border-[var(--border-soft)] bg-[var(--bg-soft)] px-2.5 py-1 font-mono text-[10px] uppercase tracking-widest text-[var(--text-3)] sm:inline">
            Tutor con fuentes
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleNew}
            className="hidden items-center gap-1.5 rounded-full border border-[var(--border)] bg-[var(--surface)] px-4 py-2 text-sm font-medium text-[var(--text-2)] transition-colors hover:border-[var(--brand)] hover:text-[var(--brand-text)] md:flex"
          >
            <Plus size={15} /> Nueva conversación
          </button>
          <button
            onClick={handleLogout}
            data-testid="chat-logout"
            className="flex items-center gap-1.5 rounded-full px-3 py-2 text-sm text-[var(--text-3)] transition-colors hover:bg-[var(--bg-soft)] hover:text-[var(--brand-text)]"
          >
            <LogOut size={15} /> <span className="hidden sm:inline">Salir</span>
          </button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        {/* ===== Sidebar (historial) ===== */}
        <aside
          className={`${
            sidebarOpen ? "fixed inset-0 z-50 flex" : "hidden"
          } w-full flex-col border-r border-[var(--border)] bg-[var(--bg-soft)] lg:static lg:flex lg:w-72 lg:shrink-0`}
        >
          {sidebarOpen && (
            <button className="absolute inset-0 bg-black/40 lg:hidden" onClick={() => setSidebarOpen(false)} aria-label="Cerrar" />
          )}
          <div className="relative z-10 flex h-full w-full flex-col bg-[var(--bg-soft)] lg:w-72">
            <div className="flex items-center justify-between border-b border-[var(--border)] p-4">
              <div className="flex items-center gap-2.5">
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--brand)] text-xs font-bold uppercase text-white">
                  {user?.username?.slice(0, 1)}
                </div>
                <div className="leading-tight">
                  <div className="max-w-[120px] truncate text-sm font-semibold">{user?.username}</div>
                  <div className="font-mono text-[10px] text-[var(--amber)]">
                    Estudiante {user?.id}
                    {user?.demo ? " · demo" : ""}
                  </div>
                </div>
              </div>
              <button className="p-1.5 text-[var(--text-3)] hover:text-[var(--text)] lg:hidden" onClick={() => setSidebarOpen(false)} aria-label="Cerrar historial">
                <X size={18} />
              </button>
            </div>

            <div className="p-3">
              <button
                onClick={handleNew}
                data-testid="new-conversation-btn"
                className="flex w-full items-center justify-center gap-2 rounded-full bg-[var(--brand)] px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-[var(--brand-hover)]"
              >
                <Plus size={16} /> Nueva conversación
              </button>
            </div>

            <nav className="chat-scroll min-h-0 flex-1 space-y-1 overflow-y-auto px-3 pb-3">
              {loadingHistory ? (
                <div className="flex items-center justify-center gap-2 py-8 text-sm text-[var(--text-3)]">
                  <Loader2 size={16} className="animate-spin" /> Cargando historial…
                </div>
              ) : conversations.length === 0 ? (
                <div className="px-3 py-8 text-center text-sm text-[var(--text-3)]">
                  Aún no tienes conversaciones.
                  <br />
                  <span className="text-xs">¡Haz tu primera pregunta!</span>
                </div>
              ) : (
                conversations.map((c) => (
                  <div
                    key={c.id}
                    onClick={() => {
                      setActiveId(c.id);
                      setSidebarOpen(false);
                    }}
                    data-testid={`conversation-${c.id}`}
                    className={`group flex cursor-pointer items-center gap-2.5 rounded-xl border px-3 py-2.5 text-sm transition-all ${
                      c.id === activeId
                        ? "border-[var(--brand)]/50 bg-[var(--surface)] text-[var(--text)]"
                        : "border-transparent text-[var(--text-2)] hover:border-[var(--border)] hover:bg-[var(--surface)]"
                    }`}
                  >
                    <MessageSquare size={15} className="shrink-0 text-[var(--brand-text)]" />
                    <span className="min-w-0 flex-1 truncate">{c.title || "Nueva conversación"}</span>
                    <span className="font-mono text-[9px] text-[var(--text-3)]">{c.messages.length}</span>
                    <button
                      onClick={(e) => handleDelete(c.id, e)}
                      aria-label={`Eliminar ${c.title}`}
                      className="rounded-md p-1 text-[var(--text-3)] opacity-0 transition-all hover:bg-red-500/10 hover:text-red-500 group-hover:opacity-100"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                ))
              )}
            </nav>

            <div className="border-t border-[var(--border)] p-3">
              <div
                className={`flex items-center gap-2 rounded-xl border px-3 py-2.5 text-xs ${
                  apiOnline
                    ? "border-[var(--brand)]/30 bg-[var(--brand-tint)] text-[var(--brand-text)]"
                    : "border-[var(--border)] bg-[var(--surface)] text-[var(--text-3)]"
                }`}
              >
                {apiOnline ? <Wifi size={14} className="shrink-0" /> : <WifiOff size={14} className="shrink-0" />}
                <span>
                  {apiOnline === null
                    ? "Verificando conexión…"
                    : apiOnline
                    ? "API conectada · GPT-5-mini + MongoDB"
                    : "Modo demo · historial local"}
                </span>
              </div>
            </div>
          </div>
        </aside>

        {/* ===== Zona de conversación ===== */}
        <main className="relative flex min-w-0 flex-1 flex-col">
          <div className="grain pointer-events-none absolute inset-0" aria-hidden="true" />
          <div className="chat-scroll relative min-h-0 flex-1 overflow-y-auto">
            {loadingHistory ? (
              <div className="flex h-full items-center justify-center gap-2 text-[var(--text-3)]">
                <Loader2 size={18} className="animate-spin" /> Preparando tu espacio de estudio…
              </div>
            ) : !active || active.messages.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center px-6 text-center">
                <span className="inline-flex h-16 w-16 items-center justify-center overflow-hidden rounded-full bg-[var(--brand)] shadow-[0_10px_30px_var(--shadow-brand)]">
                  <img src={YGG_LOGO} alt="" className="h-full w-full object-cover" />
                </span>
                <h1 className="font-display mt-6 text-2xl font-semibold tracking-tight sm:text-3xl">
                  Hola{user ? `, ${user.username}` : ""}. Soy MIMIR.
                </h1>
                <p className="mt-2 max-w-md text-sm text-[var(--text-2)] sm:text-base">
                  Pregúntame lo que estés estudiando. Te explico paso a paso, con fuentes verificadas y preguntas para que pienses.
                </p>
                {user && (
                  <div className="mt-3 rounded-full border border-[var(--border-soft)] bg-[var(--bg-soft)] px-3 py-1 font-mono text-[10px] uppercase tracking-widest text-[var(--amber)]">
                    Sesión vinculada al ID {user.id}
                  </div>
                )}
                <div className="mt-8 grid w-full max-w-lg grid-cols-1 gap-2 sm:grid-cols-2">
                  {["¿Qué es la fotosíntesis?", "Explícame las ecuaciones cuadráticas", "¿Qué fue la Guerra de los Mil Días?", "¿Qué es una IA?"].map((s) => (
                    <button
                      key={s}
                      onClick={() => handleSend(s)}
                      className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3 text-left text-sm text-[var(--text-2)] transition-all hover:-translate-y-0.5 hover:border-[var(--brand)] hover:text-[var(--brand-text)]"
                    >
                      <Sparkles size={13} className="mb-1 text-[var(--amber)]" />
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="mx-auto w-full max-w-3xl space-y-5 px-4 py-6 md:px-8">
                {active.messages.map((m, i) =>
                  m.role === "user" ? (
                    <div key={i} className="flex justify-end">
                      <div className="max-w-[85%] rounded-2xl rounded-tr-md bg-[var(--brand)] px-4 py-2.5 text-sm text-white">
                        {m.content}
                      </div>
                    </div>
                  ) : (
                    <div key={i} className="flex gap-3">
                      <span className="mt-1 inline-flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full bg-[var(--brand)]">
                        <img src={YGG_LOGO} alt="" className="h-full w-full object-cover" />
                      </span>
                      <div className="max-w-[90%] min-w-0">
                        <div className="rounded-2xl rounded-tl-md border border-[var(--border-soft)] bg-[var(--surface)] px-4 py-3 text-sm text-[var(--text-2)]">
                          {m.content ? (
                            <RichText text={m.content} />
                          ) : (
                            <span className="flex items-center gap-1.5 py-1">
                              <span className="thinking-dot h-2 w-2 rounded-full bg-[var(--brand)]" />
                              <span className="thinking-dot h-2 w-2 rounded-full bg-[var(--brand)]" />
                              <span className="thinking-dot h-2 w-2 rounded-full bg-[var(--brand)]" />
                            </span>
                          )}
                          {m.sources && m.sources.length > 0 && m.content && (
                            <div className="mt-3 border-t border-[var(--border-soft)] pt-3">
                              <div className="mb-1.5 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-widest text-[var(--brand-text)]">
                                <Globe size={11} /> Fuentes citadas
                              </div>
                              <div className="flex flex-wrap gap-1.5">
                                {m.sources.map((s, j) => (
                                  <a
                                    key={j}
                                    href={s.url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="flex items-center gap-1 rounded-full border border-[var(--border)] bg-[var(--bg-soft)] px-2.5 py-1 text-[11px] font-medium text-[var(--text-2)] transition-colors hover:border-[var(--brand)] hover:text-[var(--brand-text)]"
                                  >
                                    {s.label} <ExternalLink size={10} />
                                  </a>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                        {m.followUps && m.followUps.length > 0 && streamingId === null && i === active.messages.length - 1 && (
                          <div className="mt-2.5 flex flex-wrap gap-1.5">
                            {m.followUps.map((f, j) => (
                              <button
                                key={j}
                                onClick={() => handleSend(f)}
                                disabled={busy}
                                className="flex items-center gap-1 rounded-full border border-[var(--border)] bg-[var(--surface)] px-3 py-1.5 text-xs text-[var(--text-2)] transition-colors hover:border-[var(--brand)] hover:text-[var(--brand-text)] disabled:opacity-50"
                              >
                                <Compass size={11} className="text-[var(--amber)]" /> {f}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  )
                )}
                {thinking && (
                  <div className="flex items-center gap-3">
                    <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full bg-[var(--brand)]">
                      <img src={YGG_LOGO} alt="" className="h-full w-full object-cover" />
                    </span>
                    <div className="flex items-center gap-2 rounded-2xl rounded-tl-md border border-[var(--border-soft)] bg-[var(--surface)] px-4 py-3 text-xs text-[var(--text-3)]">
                      <Loader2 size={13} className="animate-spin text-[var(--brand-text)]" />
                      MIMIR está consultando fuentes…
                    </div>
                  </div>
                )}
                <div ref={bottomRef} />
              </div>
            )}
          </div>

          {/* ===== Input ===== */}
          <div className="relative border-t border-[var(--border)] bg-[var(--bg)]/90 p-3 backdrop-blur md:p-4">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleSend();
              }}
              className="mx-auto flex max-w-3xl items-center gap-2 rounded-full border border-[var(--border)] bg-[var(--surface)] p-1.5 transition-colors focus-within:border-[var(--brand)]"
            >
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Escribe tu pregunta… (ej. ¿Qué es la fotosíntesis?)"
                data-testid="chat-input"
                className="h-10 min-w-0 flex-1 bg-transparent px-4 text-sm text-[var(--text)] outline-none placeholder:text-[var(--text-3)]"
              />
              <button
                type="submit"
                disabled={busy || !input.trim()}
                data-testid="chat-send"
                aria-label="Enviar"
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--brand)] text-white transition-all hover:bg-[var(--brand-hover)] active:scale-90 disabled:opacity-40"
              >
                {thinking ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
              </button>
            </form>
            <p className="mx-auto mt-2 max-w-3xl text-center text-[10px] text-[var(--text-3)]">
              MIMIR puede cometer errores: verifica siempre las fuentes citadas.
              {user?.demo && " Estás en modo demo (sin backend): conecta MongoDB y OpenAI en Vercel para respuestas reales."}
            </p>
          </div>
        </main>
      </div>

      <Toaster position="top-center" richColors />
    </div>
  );
}
