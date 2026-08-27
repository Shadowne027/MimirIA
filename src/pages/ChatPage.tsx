import React, { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  ArrowLeft, Compass, ExternalLink, Globe, Loader2, LogOut, Menu,
  Plus, Send, Sparkles, Trash2, X, GraduationCap, BookOpen, Lightbulb, Brain,
} from "lucide-react";
import { Toaster, toast } from "sonner";
import { useAuth } from "../contexts/AuthContext";
import { YGG_LOGO } from "../lib/assets";

/* ================= Motor local de respuestas (simula el backend) ================= */

interface MimirSource { label: string; url: string; }
interface MimirReply { text: string; sources: MimirSource[]; followUps: string[]; }

const TOPICS: { match: RegExp; reply: MimirReply }[] = [
  {
    match: /fotos[ií]ntesis/i,
    reply: {
      text: "¡Buena pregunta! Vamos por partes, como hace un buen estudiante.\n\n**1. ¿Qué es?**\nLa fotosíntesis es el proceso por el cual las plantas, las algas y algunas bacterias convierten la **luz solar**, el **agua (H₂O)** y el **dióxido de carbono (CO₂)** en **glucosa** (su alimento) y **oxígeno (O₂)**.\n\n**2. ¿Dónde ocurre?**\nEn los **cloroplastos**, unos orgánulos que contienen **clorofila**, el pigmento verde que capta la luz.\n\n**3. ¿Cuáles son sus fases?**\n• **Fase luminosa:** ocurre en los tilacoides; la luz se convierte en energía química (ATP y NADPH) y se libera oxígeno.\n• **Fase oscura (Ciclo de Calvin):** ocurre en el estroma; con esa energía se fija el CO₂ y se fabrica la glucosa.\n\n**Ecuación general:**\n6CO₂ + 6H₂O + luz → C₆H₁₂O₆ + 6O₂\n\nAhora te toca pensar a ti: ¿qué pasaría con la fase oscura si una planta pasa varios días sin luz?",
      sources: [
        { label: "Wikipedia — Fotosíntesis", url: "https://es.wikipedia.org/wiki/Fotos%C3%ADntesis" },
        { label: "Khan Academy — Fotosíntesis", url: "https://es.khanacademy.org/science/biology/photosynthesis-in-plants" },
        { label: "Britannica — Photosynthesis", url: "https://www.britannica.com/science/photosynthesis" },
      ],
      followUps: ["Explícame el Ciclo de Calvin con un ejemplo", "¿Qué es la clorofila y por qué es verde?", "Hazme 3 preguntas de práctica sobre fotosíntesis"],
    },
  },
  {
    match: /ecuaci[oó]n(es)?\s+cuadr[aá]tic|cuadr[aá]tica|segundo\s+grado/i,
    reply: {
      text: "Vamos paso a paso, que este tema es la base de mucho de lo que verás en media.\n\n**1. ¿Qué es?**\nUna ecuación cuadrática tiene la forma **ax² + bx + c = 0**, con a ≠ 0. Su gráfica es una **parábola**.\n\n**2. ¿Cómo se resuelve?**\nCon la fórmula general:\n**x = (−b ± √(b² − 4ac)) / 2a**\n\n**3. El discriminante (Δ = b² − 4ac) te dice cuántas soluciones hay:**\n• Δ > 0 → dos soluciones reales distintas\n• Δ = 0 → una solución real (doble)\n• Δ < 0 → no hay soluciones reales (complejas)\n\n**Ejemplo guiado:** x² − 5x + 6 = 0\nAquí a=1, b=−5, c=6 → Δ = 25 − 24 = 1 → dos soluciones:\nx₁ = (5 + 1)/2 = **3** y x₂ = (5 − 1)/2 = **2**.\n\nIntenta tú: ¿cuántas soluciones tiene x² + 4x + 4 = 0? Pista: calcula primero el discriminante.",
      sources: [
        { label: "Khan Academy — Ecuaciones cuadráticas", url: "https://es.khanacademy.org/math/algebra/x2f8bb11595b61c86:quadratic-functions-equations" },
        { label: "Wikipedia — Ecuación de segundo grado", url: "https://es.wikipedia.org/wiki/Ecuaci%C3%B3n_de_segundo_grado" },
        { label: "Matemáticas UNAM (.edu)", url: "https://www.matem.unam.mx/" },
      ],
      followUps: ["¿Cómo factorizo una ecuación cuadrática?", "Explícame el método de completar el cuadrado", "Dame 5 ejercicios con solución paso a paso"],
    },
  },
  {
    match: /guerra\s+de\s+los\s+mil\s+d[ií]as|mil\s+d[ií]as/i,
    reply: {
      text: "Un tema clave de la historia de Colombia. Te lo ordeno para que no se te olvide.\n\n**1. ¿Cuándo y entre quiénes?**\nEntre el **17 de octubre de 1899** y el **21 de noviembre de 1902**, enfrentó al gobierno conservador contra fuerzas liberales.\n\n**2. ¿Por qué empezó?**\nPor la crisis económica (caída del café y del papel moneda), la exclusión política de los liberales tras la Constitución de 1886 y el deseo liberal de recuperar el poder.\n\n**3. Momentos clave:**\n• **Peralonso (1899):** victoria liberal de Rafael Uribe Uribe.\n• **Palonegro (1900):** derrota liberal que convirtió la guerra en guerrillas.\n• **Tratados de Neerlandia, Wisconsin y Chinácota (1902):** ponen fin al conflicto.\n\n**4. Consecuencias:**\nEntre 60.000 y 130.000 muertos, economía devastada, y el debilitamiento que facilitó la **separación de Panamá en 1903**.\n\nPara pensar: ¿por qué crees que una guerra civil debilitó tanto al país frente a Estados Unidos?",
      sources: [
        { label: "Banco de la República — Banrepcultural", url: "https://www.banrepcultural.org/" },
        { label: "Wikipedia — Guerra de los Mil Días", url: "https://es.wikipedia.org/wiki/Guerra_de_los_Mil_D%C3%ADas" },
        { label: "Colombia Aprende (.gov)", url: "https://www.colombiaaprende.edu.co/" },
      ],
      followUps: ["¿Qué pasó en la Batalla de Palonegro?", "¿Cómo se relaciona con la separación de Panamá?", "Hazme una línea de tiempo resumida"],
    },
  },
  {
    match: /qu[eé]\s+es\s+(una\s+)?ia\b|inteligencia artificial|\bIA\b/i,
    reply: {
      text: "Pregunta del momento. Vamos a entenderla de verdad, no solo de nombre.\n\n**1. Definición simple:**\nLa **Inteligencia Artificial (IA)** es la rama de la informática que crea sistemas capaces de realizar tareas que normalmente requieren inteligencia humana: entender lenguaje, reconocer imágenes, tomar decisiones y aprender de la experiencia.\n\n**2. ¿Cómo aprende?**\nCon **aprendizaje automático (machine learning)**: en vez de programar reglas una por una, se entrena un modelo con millones de ejemplos hasta que encuentra patrones por sí mismo.\n\n**3. Tipos que debes conocer:**\n• **IA estrecha:** especializada en una tarea (asistentes, traductores, MIMIR).\n• **IA generativa:** crea texto, imagen o audio nuevo (GPT, DALL·E).\n• **IA general:** hipotética, aún no existe.\n\n**4. Lo importante como estudiante:**\nLa IA no piensa como tú: predice. Por eso puede equivocarse con seguridad. **Verificar las fuentes** es la habilidad más valiosa de esta época.\n\n¿Qué parte te dio más curiosidad? Por ahí seguimos.",
      sources: [
        { label: "MIT — What is AI?", url: "https://www.mit.edu/" },
        { label: "Wikipedia — Inteligencia artificial", url: "https://es.wikipedia.org/wiki/Inteligencia_artificial" },
        { label: "UNESCO — IA y educación", url: "https://www.unesco.org/es/artificial-intelligence" },
      ],
      followUps: ["¿Cómo funciona un modelo de lenguaje como GPT?", "¿La IA puede reemplazar a los profesores?", "¿Qué puedo estudiar para trabajar en IA?"],
    },
  },
];

const GENERIC: MimirReply = {
  text: "Recibí tu pregunta y ya la estoy analizando. Así es como trabajamos juntos:\n\n**1. Primero, entendamos bien qué estás preguntando.**\nReformula en una frase qué es lo que más te confunde del tema: ¿una definición, un procedimiento, una fecha, una fórmula?\n\n**2. Mientras tanto, te doy un punto de partida sólido:**\nTodo tema nuevo se domina en tres capas:\n• **La idea central** (¿qué es y para qué sirve?)\n• **El mecanismo** (¿cómo funciona paso a paso?)\n• **La aplicación** (¿dónde se usa en la vida real?)\n\n**3. Tu ruta de estudio sugerida:**\nDime el tema exacto y tu nivel (básica, media o autodidacta) y te armo una explicación completa con fuentes verificadas, ejemplos y preguntas de práctica.\n\nEscríbeme, por ejemplo: \u00abExplícame las mitocondrias como si estuviera en séptimo\u00bb o \u00abNecesito prepararme para el ICFES de matemáticas\u00bb.",
  sources: [
    { label: "Khan Academy", url: "https://es.khanacademy.org/" },
    { label: "Wikipedia", url: "https://es.wikipedia.org/" },
    { label: "Colombia Aprende (.gov)", url: "https://www.colombiaaprende.edu.co/" },
  ],
  followUps: ["¿Qué es la fotosíntesis?", "Explícame las ecuaciones cuadráticas", "¿Qué es una IA?", "¿Qué fue la Guerra de los Mil Días?"],
};

function findReply(prompt: string): MimirReply {
  for (const t of TOPICS) if (t.match.test(prompt)) return t.reply;
  return GENERIC;
}

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
                return <strong key={j} className="font-semibold text-[#0F172A]">{p.slice(2, -2)}</strong>;
              if (p.startsWith("*") && p.endsWith("*"))
                return <em key={j}>{p.slice(1, -1)}</em>;
              return <React.Fragment key={j}>{p}</React.Fragment>;
            })}
          </p>
        );
      })}
    </>
  );
}

/* ================= Tipos de conversación ================= */
interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  sources?: MimirSource[];
  followUps?: string[];
  at: number;
}
interface Conversation {
  id: string;
  title: string;
  createdAt: number;
  messages: ChatMessage[];
}

const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);

/* ================= CHAT PAGE ================= */
export default function ChatPage() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const storageKey = `mimir_chats_${user?.username ?? "anon"}`;

  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [thinking, setThinking] = useState(false);
  const [streamingId, setStreamingId] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const bottomRef = useRef<HTMLDivElement>(null);
  const streamTimer = useRef<number | null>(null);
  const booted = useRef(false);

  // Cargar historial
  useEffect(() => {
    if (!user) return;
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) {
        const parsed = JSON.parse(raw) as Conversation[];
        setConversations(parsed);
        if (parsed.length) setActiveId(parsed[0].id);
      }
    } catch { /* historial corrupto */ }
    booted.current = false;
  }, [storageKey, user]);

  // Persistir historial
  useEffect(() => {
    if (!user) return;
    localStorage.setItem(storageKey, JSON.stringify(conversations));
  }, [conversations, storageKey, user]);

  const active = useMemo(
    () => conversations.find((c) => c.id === activeId) ?? null,
    [conversations, activeId]
  );

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [active?.messages.length, thinking, streamingId]);

  const sendMessage = (raw: string) => {
    const text = raw.trim();
    if (!text || thinking || streamingId) return;
    setInput("");

    const userMsg: ChatMessage = { id: uid(), role: "user", content: text, at: Date.now() };
    const reply = findReply(text);

    let convId = activeId;
    if (!convId || !active) {
      convId = uid();
      const conv: Conversation = {
        id: convId,
        title: text.length > 42 ? text.slice(0, 42) + "…" : text,
        createdAt: Date.now(),
        messages: [userMsg],
      };
      setActiveId(convId);
      setConversations((prev) => [conv, ...prev]);
    } else {
      setConversations((prev) =>
        prev.map((c) => (c.id === convId ? { ...c, messages: [...c.messages, userMsg] } : c))
      );
    }

    // Simulación: pensamiento → respuesta en streaming
    setThinking(true);
    const targetId = convId;
    const assistantId = uid();
    const words = reply.text.split(" ");

    window.setTimeout(() => {
      setThinking(false);
      setStreamingId(assistantId);
      const emptyMsg: ChatMessage = {
        id: assistantId,
        role: "assistant",
        content: "",
        sources: reply.sources,
        followUps: reply.followUps,
        at: Date.now(),
      };
      setConversations((prev) =>
        prev.map((c) => (c.id === targetId ? { ...c, messages: [...c.messages, emptyMsg] } : c))
      );

      let i = 0;
      streamTimer.current = window.setInterval(() => {
        i += 2;
        const chunk = words.slice(0, i).join(" ");
        const done = i >= words.length;
        setConversations((prev) =>
          prev.map((c) =>
            c.id === targetId
              ? {
                  ...c,
                  messages: c.messages.map((m) =>
                    m.id === assistantId ? { ...m, content: done ? reply.text : chunk } : m
                  ),
                }
              : c
          )
        );
        if (done) {
          if (streamTimer.current) window.clearInterval(streamTimer.current);
          setStreamingId(null);
        }
      }, 45);
    }, 1100);
  };

  // Prefill desde la landing (sessionStorage)
  useEffect(() => {
    const prefill = sessionStorage.getItem("mimir_first_prompt");
    if (prefill) {
      sessionStorage.removeItem("mimir_first_prompt");
      setInput(prefill);
      window.setTimeout(() => sendMessage(prefill), 350);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => () => { if (streamTimer.current) window.clearInterval(streamTimer.current); }, []);

  const newChat = () => {
    setActiveId(null);
    setInput("");
    setSidebarOpen(false);
  };

  const deleteChat = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setConversations((prev) => prev.filter((c) => c.id !== id));
    if (activeId === id) setActiveId(null);
    toast.success("Conversación eliminada");
  };

  const handleLogout = () => {
    logout();
    navigate("/");
  };

  if (!user) {
    return (
      <div className="min-h-screen bg-[#FDFCF8] flex items-center justify-center px-6">
        <div className="text-center max-w-md animate-fade-in-up">
          <span className="inline-flex items-center justify-center rounded-full overflow-hidden bg-[#065F46] w-16 h-16 mb-5">
            <img src={YGG_LOGO} alt="" className="w-full h-full object-cover" />
          </span>
          <h1 className="font-display text-2xl font-semibold text-[#0F172A]">Inicia sesión para hablar con MIMIR</h1>
          <p className="mt-2 text-sm text-[#64748B]">Tu historial de chats se guarda en tu cuenta. Crea una gratis o inicia sesión.</p>
          <Link
            to="/"
            className="mt-6 inline-flex items-center gap-2 bg-[#065F46] hover:bg-[#047857] text-white rounded-full px-6 h-11 text-sm font-medium transition-colors"
          >
            <ArrowLeft size={15} /> Volver al inicio
          </Link>
        </div>
        <Toaster position="top-center" richColors />
      </div>
    );
  }

  const suggestions = [
    { icon: Lightbulb, label: "¿Qué es la fotosíntesis?" },
    { icon: Compass, label: "Explícame las ecuaciones cuadráticas" },
    { icon: BookOpen, label: "¿Qué fue la Guerra de los Mil Días?" },
    { icon: Brain, label: "¿Qué es una IA?" },
  ];

  return (
    <div className="h-screen flex bg-[#FDFCF8] font-body overflow-hidden">
      {/* Overlay móvil */}
      {sidebarOpen && (
        <div className="fixed inset-0 bg-[#0F172A]/40 z-30 lg:hidden animate-overlay-in" onClick={() => setSidebarOpen(false)} />
      )}

      {/* ===== SIDEBAR ===== */}
      <aside
        className={`fixed lg:static inset-y-0 left-0 z-40 w-72 bg-[#F4F2EB] border-r border-[#EAE7DF] flex flex-col transition-transform duration-300 ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
        }`}
      >
        <div className="p-5 border-b border-[#EAE7DF]">
          <Link to="/" className="flex items-center gap-2.5 group w-fit">
            <span className="inline-flex items-center justify-center rounded-full overflow-hidden bg-[#065F46] w-9 h-9 shrink-0">
              <img src={YGG_LOGO} alt="" className="w-full h-full object-cover" />
            </span>
            <span className="font-display font-semibold text-lg tracking-tight text-[#0F172A]">
              MIMIR <span className="text-[#065F46]">IA</span>
            </span>
            <ArrowLeft size={14} className="text-[#94A3B8] opacity-0 group-hover:opacity-100 transition-opacity" />
          </Link>
        </div>

        <div className="p-4">
          <button
            onClick={newChat}
            className="w-full flex items-center justify-center gap-2 bg-[#065F46] hover:bg-[#047857] text-white rounded-full h-10 text-sm font-medium transition-colors"
          >
            <Plus size={16} /> Nueva conversación
          </button>
        </div>

        <div className="flex-1 overflow-y-auto chat-scroll px-3 pb-3 space-y-1">
          <div className="px-2 pb-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-[#94A3B8]">
            Historial
          </div>
          {conversations.length === 0 && (
            <p className="px-2 text-xs text-[#94A3B8] leading-relaxed">
              Aún no tienes conversaciones. Pregúntale algo a MIMIR y aparecerá aquí.
            </p>
          )}
          {conversations.map((c) => (
            <div
              key={c.id}
              onClick={() => { setActiveId(c.id); setSidebarOpen(false); }}
              className={`group flex items-center gap-2 px-3 py-2.5 rounded-xl cursor-pointer text-sm transition-colors ${
                activeId === c.id
                  ? "bg-white text-[#0F172A] border border-[#E2E8F0] shadow-sm"
                  : "text-[#334155] hover:bg-[#EAE7DF]"
              }`}
            >
              <GraduationCap size={14} className="shrink-0 text-[#065F46]" />
              <span className="flex-1 truncate">{c.title}</span>
              <button
                onClick={(e) => deleteChat(c.id, e)}
                aria-label="Eliminar conversación"
                className="opacity-0 group-hover:opacity-100 text-[#94A3B8] hover:text-red-600 transition-all p-1"
              >
                <Trash2 size={13} />
              </button>
            </div>
          ))}
        </div>

        <div className="p-4 border-t border-[#EAE7DF] flex items-center gap-3">
          <div className="w-9 h-9 rounded-full bg-[#065F46] text-white flex items-center justify-center text-sm font-bold uppercase shrink-0">
            {user.username?.slice(0, 1)}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium text-[#0F172A] truncate">{user.username}</div>
            <div className="text-[11px] text-[#64748B]">Estudiante</div>
          </div>
          <button
            onClick={handleLogout}
            data-testid="chat-logout"
            aria-label="Cerrar sesión"
            className="p-2 rounded-full text-[#64748B] hover:text-[#0F172A] hover:bg-[#EAE7DF] transition-colors"
          >
            <LogOut size={16} />
          </button>
        </div>
      </aside>

      {/* ===== MAIN ===== */}
      <main className="flex-1 flex flex-col min-w-0">
        {/* Topbar */}
        <div className="flex items-center gap-3 px-5 md:px-8 py-3.5 border-b border-[#EAE7DF] bg-[#FDFCF8]/80 backdrop-blur-xl">
          <button
            className="lg:hidden p-2 -ml-2 rounded-full hover:bg-[#F4F2EB]"
            onClick={() => setSidebarOpen(true)}
            aria-label="Abrir menú"
          >
            <Menu size={20} />
          </button>
          <div className="flex items-center gap-2.5">
            <span className="inline-flex items-center justify-center rounded-full overflow-hidden bg-[#065F46] w-8 h-8">
              <img src={YGG_LOGO} alt="" className="w-full h-full object-cover" />
            </span>
            <div>
              <div className="font-display font-semibold text-sm text-[#0F172A] leading-none">MIMIR IA</div>
              <div className="text-[11px] text-[#65a30d] flex items-center gap-1.5 mt-0.5">
                <span className="w-1.5 h-1.5 bg-[#65a30d] rounded-full animate-pulse" /> Conectado
              </div>
            </div>
          </div>
          <div className="ml-auto hidden sm:flex items-center gap-2 text-[11px] font-mono text-[#94A3B8] bg-[#F4F2EB] border border-[#EAE7DF] rounded-full px-3 py-1.5">
            <Sparkles size={12} className="text-[#D97706]" /> Tutor con fuentes verificadas
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto chat-scroll">
          <div className="max-w-3xl mx-auto px-5 md:px-8 py-8">
            {!active || active.messages.length === 0 ? (
              <div className="pt-10 md:pt-16 text-center animate-fade-in-up">
                <span className="inline-flex items-center justify-center rounded-full overflow-hidden bg-[#065F46] w-16 h-16 mb-6">
                  <img src={YGG_LOGO} alt="" className="w-full h-full object-cover" />
                </span>
                <h1 className="font-display text-2xl sm:text-3xl font-semibold tracking-tight text-[#0F172A]">
                  Hola, <span className="text-[#065F46]">{user.username}</span>. ¿Qué aprendemos hoy?
                </h1>
                <p className="mt-3 text-sm sm:text-base text-[#64748B] max-w-md mx-auto">
                  Pregúntame lo que necesites entender. Te explico paso a paso y siempre con fuentes para que verifiques.
                </p>
                <div className="mt-8 grid grid-cols-1 sm:grid-cols-2 gap-2.5 max-w-xl mx-auto">
                  {suggestions.map((s) => (
                    <button
                      key={s.label}
                      onClick={() => sendMessage(s.label)}
                      className="flex items-center gap-2.5 bg-white border border-[#E2E8F0] hover:border-[#065F46] hover:shadow-[0_6px_20px_rgba(6,95,70,0.08)] text-left text-sm text-[#334155] rounded-2xl px-4 py-3.5 transition-all duration-200 hover:-translate-y-0.5"
                    >
                      <s.icon size={17} className="text-[#065F46] shrink-0" />
                      {s.label}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="space-y-5">
                {active.messages.map((m) =>
                  m.role === "user" ? (
                    <div key={m.id} className="flex justify-end animate-msg-in">
                      <div className="bg-[#065F46] text-white text-sm rounded-2xl rounded-tr-md px-4 py-2.5 max-w-[85%] leading-relaxed">
                        {m.content}
                      </div>
                    </div>
                  ) : (
                    <div key={m.id} className="flex gap-3 animate-msg-in">
                      <span className="inline-flex items-center justify-center rounded-full overflow-hidden bg-[#065F46] w-8 h-8 shrink-0 mt-1">
                        <img src={YGG_LOGO} alt="" className="w-full h-full object-cover" />
                      </span>
                      <div className="bg-white border border-[#E2E8F0] text-[#0F172A] text-sm rounded-2xl rounded-tl-md px-5 py-4 max-w-[90%] shadow-sm">
                        {m.content ? (
                          <>
                            <RichText text={m.content} />
                            {m.sources && m.sources.length > 0 && !streamingId && (
                              <div className="mt-4 pt-3 border-t border-[#EAE7DF]">
                                <div className="flex items-center gap-2 text-xs text-[#065F46] font-semibold uppercase tracking-wider mb-2">
                                  <Globe size={12} /> {m.sources.length} fuentes citadas
                                </div>
                                <div className="flex flex-wrap gap-1.5">
                                  {m.sources.map((s) => (
                                    <a
                                      key={s.label}
                                      href={s.url}
                                      target="_blank"
                                      rel="noreferrer"
                                      className="inline-flex items-center gap-1.5 text-xs bg-[#F4F2EB] hover:bg-[#EAE7DF] border border-[#EAE7DF] text-[#334155] hover:text-[#065F46] rounded-full px-3 py-1.5 transition-colors"
                                    >
                                      <ExternalLink size={11} /> {s.label}
                                    </a>
                                  ))}
                                </div>
                              </div>
                            )}
                            {m.followUps && m.followUps.length > 0 && !streamingId && (
                              <div className="mt-4 flex flex-wrap gap-2">
                                {m.followUps.map((f) => (
                                  <button
                                    key={f}
                                    onClick={() => sendMessage(f)}
                                    className="text-xs font-medium text-[#065F46] bg-[#065F46]/5 hover:bg-[#065F46]/10 border border-[#065F46]/20 rounded-full px-3 py-1.5 transition-colors"
                                  >
                                    {f}
                                  </button>
                                ))}
                              </div>
                            )}
                          </>
                        ) : (
                          <span className="inline-flex gap-1.5 py-1">
                            <span className="thinking-dot w-1.5 h-1.5 bg-[#065F46] rounded-full" />
                            <span className="thinking-dot w-1.5 h-1.5 bg-[#065F46] rounded-full" />
                            <span className="thinking-dot w-1.5 h-1.5 bg-[#065F46] rounded-full" />
                          </span>
                        )}
                      </div>
                    </div>
                  )
                )}
                {thinking && (
                  <div className="flex gap-3 animate-msg-in">
                    <span className="inline-flex items-center justify-center rounded-full overflow-hidden bg-[#065F46] w-8 h-8 shrink-0 mt-1">
                      <img src={YGG_LOGO} alt="" className="w-full h-full object-cover" />
                    </span>
                    <div className="bg-white border border-[#E2E8F0] rounded-2xl rounded-tl-md px-5 py-4 shadow-sm flex items-center gap-3">
                      <span className="inline-flex gap-1.5">
                        <span className="thinking-dot w-1.5 h-1.5 bg-[#065F46] rounded-full" />
                        <span className="thinking-dot w-1.5 h-1.5 bg-[#065F46] rounded-full" />
                        <span className="thinking-dot w-1.5 h-1.5 bg-[#065F46] rounded-full" />
                      </span>
                      <span className="text-xs text-[#94A3B8] font-mono">consultando fuentes…</span>
                    </div>
                  </div>
                )}
                <div ref={bottomRef} />
              </div>
            )}
          </div>
        </div>

        {/* Input */}
        <div className="border-t border-[#EAE7DF] bg-[#FDFCF8] px-5 md:px-8 py-4">
          <form
            onSubmit={(e) => { e.preventDefault(); sendMessage(input); }}
            className="max-w-3xl mx-auto bg-white border border-[#E2E8F0] rounded-full p-1.5 flex items-center gap-2 shadow-sm focus-within:border-[#065F46] transition-colors"
          >
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Escribe tu pregunta en tus palabras…"
              className="flex-1 bg-transparent border-0 outline-none text-sm sm:text-base h-11 px-4 placeholder:text-[#94A3B8]"
            />
            <button
              type="submit"
              disabled={!input.trim() || thinking || !!streamingId}
              aria-label="Enviar"
              className="bg-[#065F46] hover:bg-[#047857] disabled:opacity-40 disabled:pointer-events-none text-white rounded-full h-11 px-5 gap-1.5 shrink-0 inline-flex items-center transition-colors"
            >
              {thinking || streamingId ? <Loader2 size={16} className="animate-spin" /> : <><span className="hidden sm:inline text-sm font-medium">Enviar</span><Send size={15} /></>}
            </button>
          </form>
          <p className="max-w-3xl mx-auto text-center text-[11px] text-[#94A3B8] mt-2.5">
            MIMIR puede cometer errores: verifica siempre las fuentes citadas.
          </p>
        </div>
      </main>
      <Toaster position="top-center" richColors />
    </div>
  );
}
