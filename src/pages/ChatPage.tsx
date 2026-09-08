import React, { useEffect, useMemo, useRef, useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import {
  Compass, ExternalLink, Globe, Loader2, LogOut, Menu,
  Plus, Send, Sparkles, Trash2, X, MessageSquare, Wifi, WifiOff, RefreshCw, AlertTriangle,
  Paperclip, Image as ImageIcon, FileText,
} from "lucide-react";
import { Toaster, toast } from "sonner";
import { useAuth } from "../contexts/AuthContext";
import { LOGO } from "../lib/assets";
import {
  getConversations,
  createConversation,
  deleteConversation,
  sendMessage,
  getHealth,
  formatApiError,
} from "../lib/api";
import type { AuthUser, ChatMessage, Conversation, HealthStatus } from "../lib/api";

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
  const [health, setHealth] = useState<HealthStatus | null>(null);
  const [attachedFiles, setAttachedFiles] = useState<File[]>([]);
  const [filePreviews, setFilePreviews] = useState<{ name: string; url: string; type: string }[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const bottomRef = useRef<HTMLDivElement>(null);
  const streamTimer = useRef<number | null>(null);

  // Cargar diagnóstico del servidor + historial desde MongoDB
  const loadAll = async (forceHealth = false) => {
    if (!user) return;
    setLoadingHistory(true);
    const h = await getHealth(forceHealth);
    setHealth(h);
    if (h.ok) {
      try {
        const convos = await getConversations(user);
        setConversations(convos);
        setActiveId((cur) => cur ?? convos[0]?.id ?? null);
        if (forceHealth) toast.success("Conectado con MIMIR en la nube");
      } catch (e) {
        toast.error(formatApiError(e));
      }
    }
    setLoadingHistory(false);
  };

  useEffect(() => {
    if (!user) return;
    let alive = true;
    (async () => {
      await loadAll();
      if (!alive) return;
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

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
    try {
      const c = await createConversation(user);
      setConversations((prev) => [c, ...prev]);
      setActiveId(c.id);
      setSidebarOpen(false);
      setInput("");
    } catch (err) {
      toast.error(formatApiError(err));
    }
  };

  const handleDelete = async (id: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (!user) return;
    try {
      await deleteConversation(user, id);
      setConversations((prev) => {
        const next = prev.filter((c) => c.id !== id);
        if (activeId === id) setActiveId(next[0]?.id ?? null);
        return next;
      });
      toast.success("Conversación eliminada");
    } catch (err) {
      toast.error(formatApiError(err));
    }
  };

  const retryConnection = () => loadAll(true);

  // ================= Manejo de archivos =================
  const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/gif", "image/webp", "application/pdf"];
  const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20MB
  const MAX_FILES = 5;

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    // Validar cantidad
    if (attachedFiles.length + files.length > MAX_FILES) {
      toast.error(`Máximo ${MAX_FILES} archivos por mensaje`);
      return;
    }

    const validFiles: File[] = [];
    const previews: typeof filePreviews = [];

    for (const file of files) {
      // Validar tipo
      if (!ALLOWED_TYPES.includes(file.type)) {
        toast.error(`Tipo no permitido: ${file.name}. Solo imágenes y PDFs.`);
        continue;
      }
      // Validar tamaño
      if (file.size > MAX_FILE_SIZE) {
        toast.error(`Archivo muy grande: ${file.name} (máx. 20MB)`);
        continue;
      }
      validFiles.push(file);
      
      // Crear preview para imágenes
      if (file.type.startsWith("image/")) {
        const url = URL.createObjectURL(file);
        previews.push({ name: file.name, url, type: file.type });
      } else {
        previews.push({ name: file.name, url: "", type: file.type });
      }
    }

    setAttachedFiles((prev) => [...prev, ...validFiles]);
    setFilePreviews((prev) => [...prev, ...previews]);
    
    // Limpiar el input para poder seleccionar el mismo archivo de nuevo
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const removeFile = (index: number) => {
    setAttachedFiles((prev) => prev.filter((_, i) => i !== index));
    setFilePreviews((prev) => {
      const file = prev[index];
      if (file?.url) URL.revokeObjectURL(file.url);
      return prev.filter((_, i) => i !== index);
    });
  };

  const clearAllFiles = () => {
    filePreviews.forEach((f) => {
      if (f.url) URL.revokeObjectURL(f.url);
    });
    setAttachedFiles([]);
    setFilePreviews([]);
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
    const files = attachedFiles;
    
    // Permitir enviar solo con archivos (sin texto)
    if ((!text && files.length === 0) || thinking || !user) return;
    
    setInput("");
    clearAllFiles();

    let convoId = activeId;
    if (!convoId) {
      const c = await createConversation(user);
      setConversations((prev) => [c, ...prev]);
      convoId = c.id;
      setActiveId(c.id);
    }
    const targetId = convoId;

    // Construir contenido del mensaje del usuario
    let userContent = text;
    if (!text && files.length > 0) {
      userContent = files.length === 1 
        ? `📎 ${files[0].name}` 
        : `📎 ${files.length} archivos adjuntos`;
    }

    const userMsg: ChatMessage = { 
      role: "user", 
      content: userContent, 
      at: Date.now(),
      files: files.map(f => ({ name: f.name, type: f.type })),
    };
    
    const asstId = uid();
    patchConvo(targetId, (c) => ({
      ...c,
      title: c.messages.length === 0 
        ? (text || "Análisis de archivo").slice(0, 48) + ((text || "Análisis de archivo").length > 48 ? "…" : "") 
        : c.title,
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
      const reply = await sendMessage(user, targetId, text, files.length > 0 ? files : undefined);
      setThinking(false);
      typewriter(targetId, asstId, reply.text, {
        sources: reply.sources,
        followUps: reply.followUps,
      });
    } catch (err) {
      setThinking(false);
      const detalle =
        err instanceof Error && err.message
          ? err.message
          : "Ups, algo salió mal al consultar. Inténtalo de nuevo en unos segundos.";
      patchConvo(targetId, (c) => ({
        ...c,
        messages: c.messages.map((m) =>
          (m as ChatMessage & { id?: string }).id === asstId ? { ...m, content: `⚠️ ${detalle}` } : m
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
              <img src={LOGO} alt="" className="h-full w-full object-cover" />
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
                  health?.ok
                    ? "border-[var(--brand)]/30 bg-[var(--brand-tint)] text-[var(--brand-text)]"
                    : "border-red-500/30 bg-red-500/5 text-red-600 dark:text-red-400"
                }`}
              >
                {health?.ok ? <Wifi size={14} className="shrink-0" /> : <WifiOff size={14} className="shrink-0" />}
                <span className="flex-1">
                  {health === null
                    ? "Verificando conexión…"
                    : health.ok
                    ? "Conectado · Gemini + MongoDB"
                    : "Sin conexión con el servidor"}
                </span>
                {!health?.ok && health !== null && (
                  <button
                    onClick={retryConnection}
                    aria-label="Reintentar conexión"
                    className="rounded-md p-1 transition-colors hover:bg-red-500/10"
                  >
                    <RefreshCw size={13} className={loadingHistory ? "animate-spin" : ""} />
                  </button>
                )}
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
            ) : health && !health.ok ? (
              <div className="flex h-full flex-col items-center justify-center px-6 text-center">
                <span className="inline-flex h-14 w-14 items-center justify-center rounded-full border border-red-500/30 bg-red-500/10 text-red-500">
                  <AlertTriangle size={26} />
                </span>
                <h1 className="font-display mt-5 text-xl font-semibold tracking-tight sm:text-2xl">
                  MIMIR no está en línea ahora mismo
                </h1>
                <p className="mt-2 max-w-md text-sm text-[var(--text-2)]">
                  No se pudo conectar con el servidor, donde viven tu cuenta, tu historial y la IA.
                  {health.mongoError ? ` Detalle: ${health.mongoError}` : ""}
                </p>
                <button
                  onClick={retryConnection}
                  className="mt-6 inline-flex items-center gap-2 rounded-full bg-[var(--brand)] px-5 py-2.5 text-sm font-medium text-white transition-all hover:bg-[var(--brand-hover)] active:scale-95"
                >
                  <RefreshCw size={15} className={loadingHistory ? "animate-spin" : ""} /> Reintentar conexión
                </button>
              </div>
            ) : !active || active.messages.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center px-6 text-center">
                <span className="inline-flex h-16 w-16 items-center justify-center overflow-hidden rounded-full bg-[var(--brand)] shadow-[0_10px_30px_var(--shadow-brand)]">
                  <img src={LOGO} alt="" className="h-full w-full object-cover" />
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
                      <div className="max-w-[85%] space-y-2">
                        {/* Mostrar archivos adjuntos */}
                        {m.files && m.files.length > 0 && (
                          <div className="flex flex-wrap justify-end gap-2">
                            {m.files.map((file, j) => (
                              <div key={j} className="overflow-hidden rounded-lg border border-[var(--brand)]/30 bg-[var(--brand)]/10">
                                {file.type.startsWith("image/") ? (
                                  <div className="flex items-center gap-1.5 px-2 py-1 text-[10px] text-white/80">
                                    <ImageIcon size={12} />
                                    <span className="max-w-[120px] truncate">{file.name}</span>
                                  </div>
                                ) : (
                                  <div className="flex items-center gap-1.5 px-2 py-1 text-[10px] text-white/80">
                                    <FileText size={12} />
                                    <span className="max-w-[120px] truncate">{file.name}</span>
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                        {/* Mostrar texto del mensaje */}
                        {m.content && !m.content.startsWith("📎") && (
                          <div className="rounded-2xl rounded-tr-md bg-[var(--brand)] px-4 py-2.5 text-sm text-white">
                            {m.content}
                          </div>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div key={i} className="flex gap-3">
                      <span className="mt-1 inline-flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full bg-[var(--brand)]">
                        <img src={LOGO} alt="" className="h-full w-full object-cover" />
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
                      <img src={LOGO} alt="" className="h-full w-full object-cover" />
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
            {/* Input file oculto */}
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept="image/jpeg,image/png,image/gif,image/webp,application/pdf"
              onChange={handleFileSelect}
              className="hidden"
            />
            
            {/* Preview de archivos adjuntos */}
            {filePreviews.length > 0 && (
              <div className="mx-auto mb-2 max-w-3xl">
                <div className="flex flex-wrap gap-2 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-3">
                  {filePreviews.map((file, i) => (
                    <div key={i} className="group relative">
                      {file.url ? (
                        // Preview de imagen
                        <div className="relative h-16 w-16 overflow-hidden rounded-lg border border-[var(--border-soft)]">
                          <img src={file.url} alt={file.name} className="h-full w-full object-cover" />
                          <button
                            type="button"
                            onClick={() => removeFile(i)}
                            className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-white shadow-md transition-transform hover:scale-110"
                          >
                            <X size={12} />
                          </button>
                        </div>
                      ) : (
                        // Preview de PDF
                        <div className="relative flex h-16 w-16 flex-col items-center justify-center rounded-lg border border-[var(--border-soft)] bg-[var(--bg-soft)]">
                          <FileText size={20} className="text-[var(--brand-text)]" />
                          <span className="mt-0.5 text-[8px] font-medium text-[var(--text-3)]">PDF</span>
                          <button
                            type="button"
                            onClick={() => removeFile(i)}
                            className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-white shadow-md transition-transform hover:scale-110"
                          >
                            <X size={12} />
                          </button>
                        </div>
                      )}
                      <p className="mt-1 max-w-[64px] truncate text-[9px] text-[var(--text-3)]" title={file.name}>
                        {file.name}
                      </p>
                    </div>
                  ))}
                  {filePreviews.length > 1 && (
                    <button
                      type="button"
                      onClick={clearAllFiles}
                      className="flex h-16 w-16 flex-col items-center justify-center rounded-lg border border-dashed border-[var(--border)] text-[10px] text-[var(--text-3)] transition-colors hover:border-red-400 hover:text-red-400"
                    >
                      <X size={14} />
                      Quitar todo
                    </button>
                  )}
                </div>
              </div>
            )}
            
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleSend();
              }}
              className="mx-auto flex max-w-3xl items-center gap-2 rounded-full border border-[var(--border)] bg-[var(--surface)] p-1.5 transition-colors focus-within:border-[var(--brand)]"
            >
              {/* Botón adjuntar archivo */}
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={busy || filePreviews.length >= 5}
                aria-label="Adjuntar archivo"
                title="Adjuntar imagen o PDF (máx. 20MB)"
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-[var(--text-3)] transition-colors hover:bg-[var(--bg-soft)] hover:text-[var(--brand-text)] disabled:opacity-40"
              >
                <Paperclip size={18} />
              </button>
              
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Escribe tu pregunta… o adjunta una imagen"
                data-testid="chat-input"
                className="h-10 min-w-0 flex-1 bg-transparent px-2 text-sm text-[var(--text)] outline-none placeholder:text-[var(--text-3)]"
              />
              <button
                type="submit"
                disabled={busy || (!input.trim() && attachedFiles.length === 0)}
                data-testid="chat-send"
                aria-label="Enviar"
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--brand)] text-white transition-all hover:bg-[var(--brand-hover)] active:scale-90 disabled:opacity-40"
              >
                {thinking ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
              </button>
            </form>
            <p className="mx-auto mt-2 max-w-3xl text-center text-[10px] text-[var(--text-3)]">
              MIMIR puede analizar imágenes y PDFs • Máx. 20MB por archivo • Hasta 5 archivos
            </p>
          </div>
        </main>
      </div>

      <Toaster position="top-center" richColors />
    </div>
  );
}
