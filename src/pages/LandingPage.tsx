import React, { useState, useEffect, useCallback } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  Sparkles, BookOpen, Compass, Brain, Clock, Globe, ArrowRight,
  Send, GraduationCap, School, Lightbulb,
  Quote, CheckCircle2, Menu, X, ChevronLeft, ChevronRight, Award, LogIn, UserPlus,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import useEmblaCarousel from "embla-carousel-react";
import { Toaster } from "sonner";
import { Button, Input, Badge, Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "../components/ui";
import { useAuth } from "../contexts/AuthContext";
import { AuthModal } from "../components/AuthModal";
import { YGG_LOGO, SCHOOL_IMG, IMG_GRADUACION, IMG_IE_REAL, IMG_AUTODIDACTA, IMG_ESFUERZATE } from "../lib/assets";

const HERO_BG = "https://images.unsplash.com/photo-1732698700188-37f4868653f4?crop=entropy&cs=srgb&fm=jpg&ixid=M3w4NjA2ODl8MHwxfHNlYXJjaHwyfHxhYnN0cmFjdCUyMHRyZWUlMjByb290cyUyMHdhdGVyJTIwbmF0dXJlfGVufDB8fHx8MTc3ODY3ODU1OHww&ixlib=rb-4.1.0&q=85";
const TECH_IMG = "https://images.unsplash.com/photo-1565879897538-d22ffdad1d10?crop=entropy&cs=srgb&fm=jpg&ixid=M3w4NjY2NzN8MHwxfHNlYXJjaHwxfHxnbG93aW5nJTIwdGFibGV0JTIwYm9vayUyMHRlY2h8ZW58MHx8fHwxNzc4Njc4NTU3fDA&ixlib=rb-4.1.0&q=85";

const LogoMark = ({ size = 36 }: { size?: number }) => (
  <span
    className="inline-flex items-center justify-center rounded-full overflow-hidden bg-[#065F46] shrink-0"
    style={{ width: size, height: size }}
  >
    <img src={YGG_LOGO} alt="" className="w-full h-full object-cover" />
  </span>
);

// ====== NAVBAR ======
function Navbar({ onOpenAuth }: { onOpenAuth: (m: "login" | "register") => void }) {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const { user, logout } = useAuth();

  const links = [
    { href: "#caracteristicas", label: "Características" },
    { href: "#como-funciona", label: "Cómo funciona" },
    { href: "#institucion", label: "Institución" },
    { href: "#faq", label: "FAQ" },
  ];

  return (
    <header data-testid="navbar-main" className="sticky top-0 z-50 backdrop-blur-xl bg-[#FDFCF8]/80 border-b border-[#E2E8F0]">
      <div className="max-w-7xl mx-auto px-6 md:px-12 py-4 flex items-center justify-between gap-4">
        <a href="#top" data-testid="logo-link" className="flex items-center gap-2.5 shrink-0">
          <LogoMark size={36} />
          <span className="font-display font-semibold text-xl tracking-tight">
            MIMIR <span className="text-[#065F46]">IA</span>
          </span>
        </a>

        <nav className="hidden lg:flex items-center gap-7">
          {links.map((l) => (
            <a
              key={l.href}
              href={l.href}
              data-testid={`nav-${l.label.toLowerCase().replace(/\s+/g, "-")}`}
              className="text-sm font-medium text-[#334155] hover:text-[#065F46] transition-colors"
            >
              {l.label}
            </a>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          {user ? (
            <>
              <Button
                onClick={() => navigate("/chat")}
                data-testid="nav-go-chat"
                className="hidden sm:flex bg-[#065F46] hover:bg-[#047857] text-white rounded-full px-5 gap-2"
              >
                Abrir MIMIR <ArrowRight size={15} />
              </Button>
              <div className="hidden sm:flex items-center gap-2 text-sm text-[#334155]">
                <div className="w-8 h-8 rounded-full bg-[#065F46] text-white flex items-center justify-center text-xs font-bold uppercase">
                  {user.username?.slice(0, 1)}
                </div>
                <button onClick={logout} className="text-xs text-[#64748B] hover:text-[#065F46]" data-testid="nav-logout">
                  Salir
                </button>
              </div>
            </>
          ) : (
            <>
              <Button
                onClick={() => onOpenAuth("login")}
                data-testid="nav-login-btn"
                variant="ghost"
                className="hidden sm:inline-flex text-sm font-medium text-[#334155] hover:text-[#065F46] hover:bg-transparent gap-1.5"
              >
                <LogIn size={14} /> Iniciar sesión
              </Button>
              <Button
                onClick={() => onOpenAuth("register")}
                data-testid="nav-register-btn"
                className="bg-[#065F46] hover:bg-[#047857] text-white rounded-full px-4 sm:px-5 gap-1.5"
              >
                <UserPlus size={14} /> <span className="hidden sm:inline">Crear cuenta</span><span className="sm:hidden">Crear</span>
              </Button>
            </>
          )}
          <button
            className="lg:hidden p-2"
            onClick={() => setOpen(!open)}
            data-testid="mobile-menu-toggle"
            aria-label="Menú"
          >
            {open ? <X size={22} /> : <Menu size={22} />}
          </button>
        </div>
      </div>

      {open && (
        <div className="lg:hidden border-t border-[#E2E8F0] bg-[#FDFCF8] px-6 py-4 space-y-3">
          {links.map((l) => (
            <a
              key={l.href}
              href={l.href}
              onClick={() => setOpen(false)}
              className="block text-sm font-medium text-[#334155]"
              data-testid={`mobile-nav-${l.label.toLowerCase().replace(/\s+/g, "-")}`}
            >
              {l.label}
            </a>
          ))}
          {!user && (
            <div className="pt-3 border-t border-[#EAE7DF] flex flex-col gap-2">
              <Button
                onClick={() => { onOpenAuth("login"); setOpen(false); }}
                variant="outline"
                className="rounded-full w-full"
              >
                Iniciar sesión
              </Button>
            </div>
          )}
          {user && (
            <Button
              onClick={() => { navigate("/chat"); setOpen(false); }}
              className="w-full bg-[#065F46] hover:bg-[#047857] text-white rounded-full mt-2"
            >
              Abrir MIMIR
            </Button>
          )}
        </div>
      )}
    </header>
  );
}

// ====== HERO ======
function Hero({ onOpenAuth }: { onOpenAuth: (m: "login" | "register") => void }) {
  const navigate = useNavigate();
  const { user } = useAuth();

  const handlePrimary = () => {
    if (user) navigate("/chat");
    else onOpenAuth("register");
  };

  return (
    <section id="top" data-testid="hero-section" className="relative overflow-hidden">
      <div className="absolute inset-0 bg-cover bg-center" style={{ backgroundImage: `url(${HERO_BG})` }} aria-hidden="true" />
      <div className="absolute inset-0 bg-gradient-to-b from-[#FDFCF8]/85 via-[#FDFCF8]/70 to-[#FDFCF8]" aria-hidden="true" />
      <div className="absolute inset-0 grain pointer-events-none" aria-hidden="true" />

      <div className="relative max-w-7xl mx-auto px-6 md:px-12 pt-20 md:pt-28 pb-24 md:pb-32 grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
        <div className="lg:col-span-7 animate-fade-in-up">
          <Badge data-testid="hero-badge" className="bg-[#EAE7DF] text-[#065F46] hover:bg-[#EAE7DF] border-0 rounded-full px-3.5 py-1.5 text-xs font-semibold tracking-[0.18em] uppercase mb-6">
            <Sparkles size={12} className="mr-1.5" /> Proyecto SENA — Ficha 3156695
          </Badge>
          <h1 className="font-display text-4xl sm:text-5xl lg:text-6xl font-semibold tracking-tight leading-[1.05] text-[#0F172A]">
            Sabiduría ancestral,
            <br />
            <span className="text-[#065F46] italic font-light">inteligencia</span> moderna
            <br />
            para tu educación.
          </h1>
          <p className="mt-7 text-lg sm:text-xl text-[#334155] max-w-xl leading-relaxed">
            MIMIR IA es tu tutor personal: explica conceptos paso a paso, busca
            información con <strong className="font-semibold text-[#0F172A]">fuentes verificadas</strong> y diseña
            rutas de estudio adaptadas a tu nivel.
          </p>
          <div className="mt-9 flex flex-col sm:flex-row gap-3">
            <Button
              size="lg"
              onClick={handlePrimary}
              data-testid="hero-cta-primary"
              className="bg-[#065F46] hover:bg-[#047857] text-white rounded-full px-7 h-12 text-base font-medium gap-2 group"
            >
              {user ? "Abrir MIMIR IA" : "Crear cuenta gratis"}
              <ArrowRight size={18} className="transition-transform group-hover:translate-x-0.5" />
            </Button>
            <a href="#como-funciona">
              <Button
                size="lg"
                variant="outline"
                data-testid="hero-cta-secondary"
                className="rounded-full px-7 h-12 text-base font-medium border-[#0F172A]/15 hover:bg-[#F4F2EB] w-full sm:w-auto"
              >
                Cómo funciona
              </Button>
            </a>
          </div>
          <div className="mt-12 flex flex-wrap items-center gap-4 sm:gap-6 text-sm text-[#64748B]">
            <div className="flex items-center gap-2"><CheckCircle2 size={16} className="text-[#065F46]" /> Sin costo</div>
            <div className="flex items-center gap-2"><CheckCircle2 size={16} className="text-[#065F46]" /> En español</div>
            <div className="flex items-center gap-2"><CheckCircle2 size={16} className="text-[#065F46]" /> Con fuentes reales</div>
          </div>
        </div>

        <div className="lg:col-span-5 relative animate-fade-in-up" style={{ animationDelay: "0.2s" }}>
          <div className="relative bg-white/70 backdrop-blur-xl border border-white/40 rounded-3xl shadow-[0_8px_32px_rgba(0,0,0,0.08)] p-6">
            <div className="flex items-center gap-3 mb-5">
              <LogoMark size={40} />
              <div>
                <div className="font-display font-semibold text-[#0F172A]">MIMIR IA</div>
                <div className="text-xs text-[#65a30d] flex items-center gap-1.5"><span className="w-1.5 h-1.5 bg-[#65a30d] rounded-full animate-pulse" /> Conectado</div>
              </div>
            </div>
            <div className="space-y-3">
              <div className="bg-[#065F46] text-white text-sm rounded-2xl rounded-tr-md px-4 py-2.5 ml-auto max-w-[85%]">
                ¿Qué es la fotosíntesis?
              </div>
              <div className="bg-[#F4F2EB] text-[#0F172A] text-sm rounded-2xl rounded-tl-md px-4 py-3 max-w-[90%]">
                <p>Es el proceso por el cual las plantas convierten luz solar, agua y CO₂ en glucosa y oxígeno. Ocurre en los <strong>cloroplastos</strong>...</p>
                <div className="mt-3 pt-3 border-t border-[#EAE7DF] flex items-center gap-2 text-xs text-[#065F46] font-medium">
                  <Globe size={12} /> 3 fuentes citadas
                </div>
              </div>
            </div>
          </div>
          <div className="absolute -bottom-6 -right-4 bg-[#D97706] text-white px-4 py-2 rounded-2xl text-xs font-semibold tracking-wider uppercase shadow-lg rotate-3">
            Con fuentes verificadas
          </div>
        </div>
      </div>
    </section>
  );
}

// ====== CHAT TEASER ======
function ChatTeaser({ onOpenAuth }: { onOpenAuth: (m: "login" | "register") => void }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [demoInput, setDemoInput] = useState("");

  const goChat = (prefillText: string) => {
    if (user) {
      if (prefillText) sessionStorage.setItem("mimir_first_prompt", prefillText);
      navigate("/chat");
    } else {
      onOpenAuth("register");
    }
  };

  return (
    <section id="probar" data-testid="chat-teaser-section" className="relative bg-[#F4F2EB] py-20 md:py-28 border-y border-[#EAE7DF]">
      <div className="max-w-3xl mx-auto px-6 md:px-12 text-center">
        <div className="text-xs font-semibold tracking-[0.2em] uppercase text-[#065F46] mb-3">Empieza ahora</div>
        <h2 className="font-display text-3xl sm:text-4xl lg:text-5xl font-semibold tracking-tight text-[#0F172A]">
          Tu primer chat con MIMIR está a un clic.
        </h2>
        <p className="mt-4 text-base sm:text-lg text-[#334155] max-w-2xl mx-auto">
          {user
            ? "Tu cuenta está lista. Abre MIMIR y comienza a aprender con fuentes verificadas."
            : "Crea tu cuenta gratis, inicia sesión y entra al asistente con historial guardado."}
        </p>

        <form
          onSubmit={(e) => { e.preventDefault(); goChat(demoInput); }}
          className="mt-10 bg-white border border-[#E2E8F0] rounded-full p-1.5 flex items-center gap-2 shadow-sm focus-within:border-[#065F46] transition-colors"
        >
          <Input
            data-testid="teaser-input"
            value={demoInput}
            onChange={(e) => setDemoInput(e.target.value)}
            placeholder="¿Qué quieres aprender hoy?"
            className="flex-1 border-0 focus-visible:ring-0 focus-visible:ring-offset-0 bg-transparent text-base h-11 px-4"
          />
          <Button
            type="submit"
            data-testid="teaser-submit"
            className="bg-[#065F46] hover:bg-[#047857] text-white rounded-full h-11 px-5 gap-1.5 shrink-0"
          >
            <span className="hidden sm:inline">{user ? "Continuar" : "Empezar"}</span>
            <Send size={15} />
          </Button>
        </form>

        <div className="mt-6 flex flex-wrap justify-center gap-2">
          {["Fotosíntesis", "Ecuaciones cuadráticas", "Guerra de los Mil Días", "¿Qué es una IA?"].map((p) => (
            <button
              key={p}
              onClick={() => goChat(p)}
              data-testid={`teaser-chip-${p.toLowerCase().replace(/\s+/g, "-")}`}
              className="text-xs font-medium bg-white border border-[#E2E8F0] hover:border-[#065F46] hover:text-[#065F46] text-[#334155] rounded-full px-3 py-1.5 transition-colors"
            >
              {p}
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}

// ====== FEATURES BENTO ======
function Features({ onOpenAuth }: { onOpenAuth: (m: "login" | "register") => void }) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const handleCta = () => (user ? navigate("/chat") : onOpenAuth("register"));

  return (
    <section id="caracteristicas" data-testid="features-section" className="py-20 md:py-28">
      <div className="max-w-7xl mx-auto px-6 md:px-12">
        <div className="max-w-2xl mb-14">
          <div className="text-xs font-semibold tracking-[0.2em] uppercase text-[#065F46] mb-3">Características</div>
          <h2 className="font-display text-3xl sm:text-4xl lg:text-5xl font-semibold tracking-tight text-[#0F172A]">
            Aprende con la profundidad que mereces.
          </h2>
          <p className="mt-4 text-base sm:text-lg text-[#334155]">
            Cuatro pilares que hacen de MIMIR IA un aliado real para tu rendimiento académico.
          </p>
        </div>

        <div data-testid="features-bento-grid" className="grid grid-cols-1 md:grid-cols-12 gap-5 md:gap-6">
          <div className="md:col-span-8 md:row-span-2 relative rounded-3xl overflow-hidden bg-[#0F172A] text-white p-8 md:p-12 min-h-[380px] flex flex-col justify-between group">
            <div className="absolute inset-0 opacity-25 bg-cover bg-center transition-transform duration-700 group-hover:scale-105" style={{ backgroundImage: `url(${TECH_IMG})` }} />
            <div className="absolute inset-0 bg-gradient-to-tr from-[#0F172A] via-[#0F172A]/80 to-transparent" />
            <div className="relative">
              <Globe size={28} className="text-[#D97706] mb-5" />
              <h3 className="font-display text-2xl sm:text-3xl font-semibold leading-tight tracking-tight">
                Búsqueda con fuentes citadas en cada respuesta.
              </h3>
              <p className="mt-4 text-white/70 text-base max-w-md">
                MIMIR consulta enciclopedias, sitios académicos y fuentes oficiales. Cada explicación viene con enlaces para que <em>verifiques y profundices</em>.
              </p>
            </div>
            <div className="relative flex flex-wrap gap-2 mt-8">
              {["Wikipedia", "MDN", ".edu", "Khan Academy", ".gov"].map((tag) => (
                <span key={tag} className="px-3 py-1 bg-white/10 backdrop-blur rounded-full text-xs font-mono border border-white/20">{tag}</span>
              ))}
            </div>
          </div>

          <div className="md:col-span-4 bg-[#F4F2EB] rounded-3xl p-7 border border-[#EAE7DF] hover:border-[#065F46]/40 hover:-translate-y-1 transition-all duration-300">
            <Compass size={26} className="text-[#065F46] mb-4" />
            <h3 className="font-display text-xl font-semibold text-[#0F172A] tracking-tight">Rutas personalizadas</h3>
            <p className="mt-2 text-sm text-[#334155] leading-relaxed">Planes de estudio adaptados a tu nivel, ritmo y objetivos académicos.</p>
          </div>

          <div className="md:col-span-4 bg-[#FDFCF8] rounded-3xl p-7 border border-[#E2E8F0] hover:border-[#D97706]/50 hover:-translate-y-1 transition-all duration-300">
            <Brain size={26} className="text-[#D97706] mb-4" />
            <h3 className="font-display text-xl font-semibold text-[#0F172A] tracking-tight">Pensamiento crítico</h3>
            <p className="mt-2 text-sm text-[#334155] leading-relaxed">No te da la respuesta directa: te guía paso a paso para que pienses por ti.</p>
          </div>

          <div className="md:col-span-12 bg-[#065F46] text-white rounded-3xl p-8 md:p-10 flex flex-col md:flex-row md:items-center md:justify-between gap-6">
            <div className="flex items-center gap-5">
              <Clock size={36} className="text-[#D97706] shrink-0" />
              <div>
                <h3 className="font-display text-xl sm:text-2xl font-semibold tracking-tight">Disponible 24/7, en cualquier dispositivo.</h3>
                <p className="mt-1.5 text-white/70 text-sm sm:text-base">Estudia a tu hora. MIMIR no descansa, ni en fines de semana ni en vacaciones.</p>
              </div>
            </div>
            <Button
              onClick={handleCta}
              data-testid="features-cta-button"
              className="bg-[#FDFCF8] text-[#065F46] hover:bg-white rounded-full px-6 h-11 font-medium gap-2 whitespace-nowrap"
            >
              Empezar ahora <ArrowRight size={16} />
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}

// ====== HOW IT WORKS ======
function HowItWorks() {
  const steps: { n: string; icon: LucideIcon; title: string; desc: string }[] = [
    { n: "01", icon: Lightbulb, title: "Crea tu cuenta", desc: "Regístrate con tu nombre de usuario y una contraseña. Tu cuenta guarda todo tu historial." },
    { n: "02", icon: Globe, title: "Haz tu pregunta", desc: "Escribe en tus palabras lo que necesites entender. MIMIR la analiza y consulta fuentes." },
    { n: "03", icon: Compass, title: "Recibe tu ruta", desc: "Obtén una explicación clara con citas y preguntas de seguimiento para profundizar." },
    { n: "04", icon: CheckCircle2, title: "Guarda y vuelve", desc: "Tus chats se guardan automáticamente. Vuelve cuando quieras y continúa desde donde estabas." },
  ];
  return (
    <section id="como-funciona" data-testid="how-it-works-section" className="py-20 md:py-28 bg-[#FDFCF8] border-t border-[#EAE7DF]">
      <div className="max-w-7xl mx-auto px-6 md:px-12">
        <div className="max-w-2xl mb-14">
          <div className="text-xs font-semibold tracking-[0.2em] uppercase text-[#065F46] mb-3">Cómo funciona</div>
          <h2 className="font-display text-3xl sm:text-4xl lg:text-5xl font-semibold tracking-tight text-[#0F172A]">
            Cuatro pasos. Cero fricción.
          </h2>
        </div>
        <div data-testid="how-it-works-steps" className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
          {steps.map((s, i) => (
            <div key={s.n} data-testid={`step-${i + 1}`} className="relative bg-white border border-[#E2E8F0] rounded-2xl p-7 hover:border-[#065F46] hover:shadow-[0_8px_24px_rgba(6,95,70,0.08)] hover:-translate-y-1 transition-all duration-300">
              <div className="font-mono text-xs text-[#D97706] tracking-widest mb-5">{s.n}</div>
              <s.icon size={26} className="text-[#065F46] mb-4" />
              <h3 className="font-display text-lg font-semibold text-[#0F172A] tracking-tight">{s.title}</h3>
              <p className="mt-2 text-sm text-[#334155] leading-relaxed">{s.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ====== TARGET AUDIENCE — CAROUSEL ======
function TargetAudienceCarousel({ onOpenAuth }: { onOpenAuth: (m: "login" | "register") => void }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [emblaRef, emblaApi] = useEmblaCarousel({ loop: true, align: "start", containScroll: "trimSnaps" });
  const [selectedIndex, setSelectedIndex] = useState(0);

  const cards: { icon: LucideIcon; title: string; desc: string; img: string; testid: string }[] = [
    {
      icon: School,
      title: "Estudiantes de básica",
      desc: "Explicaciones simples, ejemplos cotidianos y refuerzo de fundamentos. Aprende a tu ritmo, con paciencia.",
      img: IMG_GRADUACION,
      testid: "audience-basica",
    },
    {
      icon: GraduationCap,
      title: "Estudiantes de media",
      desc: "Preparación para ICFES, ensayos, matemáticas avanzadas y ciencias. Tu próximo grado, con respaldo real.",
      img: IMG_IE_REAL,
      testid: "audience-media",
    },
    {
      icon: BookOpen,
      title: "Autodidactas",
      desc: "Curiosos sin maestro. MIMIR te diseña el plan que te falta para avanzar por tu cuenta y no perderte en internet.",
      img: IMG_AUTODIDACTA,
      testid: "audience-autodidactas",
    },
    {
      icon: Award,
      title: "Esfuérzate",
      desc: "El conocimiento no se regala, se conquista. MIMIR está a tu lado: tú pones el esfuerzo, nosotros las herramientas.",
      img: IMG_ESFUERZATE,
      testid: "audience-esfuerzate",
    },
  ];

  const onSelect = useCallback(() => {
    if (!emblaApi) return;
    setSelectedIndex(emblaApi.selectedScrollSnap());
  }, [emblaApi]);

  useEffect(() => {
    if (!emblaApi) return;
    onSelect();
    emblaApi.on("select", onSelect);
    emblaApi.on("reInit", onSelect);
  }, [emblaApi, onSelect]);

  // Autoplay
  useEffect(() => {
    if (!emblaApi) return;
    const id = setInterval(() => emblaApi.scrollNext(), 5000);
    return () => clearInterval(id);
  }, [emblaApi]);

  const handleCardClick = () => {
    if (user) navigate("/chat");
    else onOpenAuth("register");
  };

  const scrollPrev = () => emblaApi && emblaApi.scrollPrev();
  const scrollNext = () => emblaApi && emblaApi.scrollNext();

  return (
    <section data-testid="target-audience-section" className="py-20 md:py-28 bg-[#F4F2EB] overflow-hidden">
      <div className="max-w-7xl mx-auto px-6 md:px-12">
        <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-6 mb-12">
          <div className="max-w-2xl">
            <div className="text-xs font-semibold tracking-[0.2em] uppercase text-[#065F46] mb-3">Para quién es</div>
            <h2 className="font-display text-3xl sm:text-4xl lg:text-5xl font-semibold tracking-tight text-[#0F172A]">
              Pensado para todo quien quiera aprender mejor.
            </h2>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={scrollPrev}
              data-testid="carousel-prev"
              aria-label="Anterior"
              className="w-11 h-11 rounded-full bg-white border border-[#E2E8F0] hover:border-[#065F46] hover:text-[#065F46] flex items-center justify-center transition-colors"
            >
              <ChevronLeft size={18} />
            </button>
            <button
              onClick={scrollNext}
              data-testid="carousel-next"
              aria-label="Siguiente"
              className="w-11 h-11 rounded-full bg-white border border-[#E2E8F0] hover:border-[#065F46] hover:text-[#065F46] flex items-center justify-center transition-colors"
            >
              <ChevronRight size={18} />
            </button>
          </div>
        </div>

        <div className="overflow-hidden -mx-6 px-6" ref={emblaRef} data-testid="audience-carousel">
          <div className="flex gap-5 md:gap-6">
            {cards.map((c) => (
              <article
                key={c.title}
                data-testid={c.testid}
                onClick={handleCardClick}
                className="cursor-pointer group bg-[#FDFCF8] rounded-3xl overflow-hidden border border-[#E2E8F0] hover:border-[#065F46] hover:shadow-[0_8px_28px_rgba(6,95,70,0.10)] transition-all flex-shrink-0 w-[85%] sm:w-[60%] md:w-[45%] lg:w-[31%]"
              >
                <div className="relative h-56 overflow-hidden bg-[#EAE7DF]">
                  <img
                    src={c.img}
                    alt={c.title}
                    className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                    loading="lazy"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-transparent" />
                  <c.icon size={22} className="absolute top-4 left-4 text-white drop-shadow-lg" />
                  <div className="absolute bottom-4 right-4 bg-white/90 backdrop-blur rounded-full px-3 py-1 text-[10px] font-semibold tracking-wider uppercase text-[#065F46] opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1">
                    Abrir MIMIR <ArrowRight size={11} />
                  </div>
                </div>
                <div className="p-6">
                  <h3 className="font-display text-xl font-semibold text-[#0F172A] tracking-tight">{c.title}</h3>
                  <p className="mt-2 text-sm text-[#334155] leading-relaxed">{c.desc}</p>
                </div>
              </article>
            ))}
          </div>
        </div>

        {/* Dots */}
        <div className="flex justify-center gap-2 mt-8">
          {cards.map((_, i) => (
            <button
              key={i}
              onClick={() => emblaApi && emblaApi.scrollTo(i)}
              aria-label={`Ir a slide ${i + 1}`}
              data-testid={`carousel-dot-${i}`}
              className={`h-1.5 rounded-full transition-all ${
                selectedIndex === i ? "w-8 bg-[#065F46]" : "w-1.5 bg-[#0F172A]/20 hover:bg-[#0F172A]/40"
              }`}
            />
          ))}
        </div>
      </div>
    </section>
  );
}

// ====== INSTITUTION SECTION ======
function InstitutionSection() {
  const objectives = [
    "Diseñar una interfaz accesible y fácil de usar que permita a los estudiantes interactuar con la IA de forma intuitiva.",
    "Implementar un sistema de aprendizaje adaptativo que analice el progreso del estudiante y genere recomendaciones personalizadas.",
    "Crear módulos de estudio, cuestionarios y planes de aprendizaje que refuercen los conocimientos en áreas fundamentales.",
    "Mejorar el desarrollo de habilidades cognitivas y el rendimiento académico de los estudiantes.",
    "Promover el uso de tecnologías educativas dentro de la institución como apoyo al proceso de enseñanza-aprendizaje.",
  ];

  return (
    <section id="institucion" data-testid="institution-info" className="py-20 md:py-28 bg-[#0F172A] text-white">
      <div className="max-w-7xl mx-auto px-6 md:px-12 grid grid-cols-1 lg:grid-cols-12 gap-12">
        <div className="lg:col-span-5">
          <div className="text-xs font-semibold tracking-[0.2em] uppercase text-[#D97706] mb-4">La institución</div>
          <h2 className="font-display text-3xl sm:text-4xl lg:text-5xl font-semibold tracking-tight leading-tight">
            Un proyecto del SENA, hecho desde Cúcuta para el mundo.
          </h2>
          <div className="mt-8 relative rounded-3xl overflow-hidden aspect-[4/3] bg-black flex items-center justify-center p-6">
            <img src={SCHOOL_IMG} alt="Institución Educativa Gonzalo Rivera Laguado" className="max-w-full max-h-full object-contain" />
          </div>
          <div className="mt-4">
            <div className="font-display text-xl font-semibold">Institución Educativa Gonzalo Rivera Laguado</div>
            <div className="text-sm text-white/70 mt-1">Cúcuta · Norte de Santander · Colombia</div>
          </div>
          <div className="mt-6 grid grid-cols-2 gap-3 text-sm">
            <div className="bg-white/5 border border-white/10 rounded-2xl p-4 hover:bg-white/10 transition-colors">
              <div className="text-xs uppercase tracking-widest text-white/50 mb-1">Programa</div>
              <div className="font-mono">233108</div>
            </div>
            <div className="bg-white/5 border border-white/10 rounded-2xl p-4 hover:bg-white/10 transition-colors">
              <div className="text-xs uppercase tracking-widest text-white/50 mb-1">Ficha</div>
              <div className="font-mono">3156695</div>
            </div>
            <div className="bg-white/5 border border-white/10 rounded-2xl p-4 hover:bg-white/10 transition-colors">
              <div className="text-xs uppercase tracking-widest text-white/50 mb-1">Vigencia</div>
              <div className="font-mono">2025 — 2026</div>
            </div>
            <div className="bg-white/5 border border-white/10 rounded-2xl p-4 hover:bg-white/10 transition-colors">
              <div className="text-xs uppercase tracking-widest text-white/50 mb-1">Inicio</div>
              <div className="font-mono">04 / 08 / 2025</div>
            </div>
          </div>
        </div>

        <div className="lg:col-span-7 lg:pl-8 lg:border-l lg:border-white/10">
          <div className="text-xs font-semibold tracking-[0.2em] uppercase text-[#D97706] mb-4">Objetivos del proyecto</div>
          <h3 className="font-display text-2xl sm:text-3xl font-semibold tracking-tight leading-tight">
            Cinco metas para transformar la educación.
          </h3>
          <ol className="mt-8 space-y-5">
            {objectives.map((o, i) => (
              <li key={i} data-testid={`objective-${i + 1}`} className="flex gap-5 pb-5 border-b border-white/10 last:border-0 group">
                <span className="font-mono text-2xl text-[#D97706] shrink-0 leading-none mt-1 transition-transform group-hover:-translate-y-0.5">{String(i + 1).padStart(2, "0")}</span>
                <p className="text-white/85 text-base leading-relaxed">{o}</p>
              </li>
            ))}
          </ol>

          <blockquote className="mt-10 bg-white/5 border-l-2 border-[#D97706] pl-5 py-4 italic text-white/80">
            <Quote size={20} className="text-[#D97706] mb-2" />
            "MIMIR IA no busca reemplazar al docente, sino caminar al lado del estudiante: ser ese pie de apoyo que reduce la brecha y reactiva la curiosidad."
          </blockquote>
        </div>
      </div>
    </section>
  );
}

// ====== FAQ ======
function FAQ() {
  const faqs = [
    { q: "¿MIMIR IA es realmente gratuito para los estudiantes?", a: "Sí. El proyecto nació en el SENA con vocación de impacto social. La plataforma es de acceso libre para estudiantes de la institución y, en su fase abierta, para cualquier estudiante hispanohablante." },
    { q: "¿Necesito una cuenta para usar MIMIR?", a: "Sí. Necesitas registrarte con un nombre de usuario para guardar tu historial de chats y volver a ellos cuando quieras." },
    { q: "¿De dónde saca la información MIMIR?", a: "MIMIR utiliza modelos de inteligencia artificial avanzados entrenados con grandes corpus de conocimiento. En cada respuesta, te indica las fuentes (Wikipedia, sitios .edu, .gov, MDN, Khan Academy, entre otros) para que puedas verificar la información." },
    { q: "¿Reemplaza a un profesor?", a: "No. MIMIR es un complemento: explica conceptos, da ejemplos y propone rutas de estudio. El acompañamiento docente sigue siendo irremplazable. Nuestra meta es reducir su carga repetitiva, no eliminar su rol." },
    { q: "¿Qué tan precisa es la información?", a: "MIMIR puede cometer errores como cualquier IA. Por eso siempre citamos fuentes: para que el estudiante desarrolle pensamiento crítico verificándolas. Esa es justamente la habilidad que queremos fomentar." },
    { q: "¿Mis datos están seguros?", a: "Cumplimos con la Ley 1581 de 2012 de Protección de Datos Personales. No vendemos tus datos. Las contraseñas se guardan encriptadas y las conversaciones se usan únicamente para mejorar tu experiencia." },
  ];
  return (
    <section id="faq" className="py-20 md:py-28 bg-[#FDFCF8] border-t border-[#EAE7DF]">
      <div className="max-w-4xl mx-auto px-6 md:px-12">
        <div className="text-center mb-14">
          <div className="text-xs font-semibold tracking-[0.2em] uppercase text-[#065F46] mb-3">Preguntas frecuentes</div>
          <h2 className="font-display text-3xl sm:text-4xl lg:text-5xl font-semibold tracking-tight text-[#0F172A]">
            Resolvamos las dudas.
          </h2>
        </div>
        <Accordion data-testid="faq-accordion" className="space-y-3">
          {faqs.map((f, i) => (
            <AccordionItem key={i} value={`item-${i}`} data-testid={`faq-item-${i}`} className="bg-white border border-[#E2E8F0] rounded-2xl px-6 data-[state=open]:border-[#065F46]">
              <AccordionTrigger className="font-display text-base sm:text-lg font-medium text-[#0F172A] hover:no-underline py-5 text-left">{f.q}</AccordionTrigger>
              <AccordionContent className="text-[#334155] text-sm sm:text-base leading-relaxed pb-5">{f.a}</AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </div>
    </section>
  );
}

// ====== FOOTER ======
function Footer() {
  return (
    <footer data-testid="footer-main" className="bg-[#0F172A] text-white/80 py-14">
      <div className="max-w-7xl mx-auto px-6 md:px-12">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-10">
          <div className="md:col-span-5">
            <div className="flex items-center gap-2.5 mb-4">
              <LogoMark size={36} />
              <span className="font-display font-semibold text-xl tracking-tight text-white">MIMIR IA</span>
            </div>
            <p className="text-sm leading-relaxed max-w-sm">Plan de mejoramiento académico a partir de inteligencia artificial. Proyecto productivo SENA — Programa 233108.</p>
          </div>
          <div className="md:col-span-3">
            <div className="text-xs font-semibold tracking-[0.2em] uppercase text-white/50 mb-4">Institución</div>
            <ul className="space-y-2 text-sm">
              <li>I.E. Gonzalo Rivera Laguado</li>
              <li>Cúcuta, Colombia</li>
              <li>SENA — Ficha 3156695</li>
            </ul>
          </div>
          <div className="md:col-span-4">
            <div className="text-xs font-semibold tracking-[0.2em] uppercase text-white/50 mb-4">Explorar</div>
            <ul className="space-y-2 text-sm">
              <li><a href="#caracteristicas" className="hover:text-white transition-colors">Características</a></li>
              <li><a href="#como-funciona" className="hover:text-white transition-colors">Cómo funciona</a></li>
              <li><Link to="/chat" className="hover:text-white transition-colors">Abrir MIMIR</Link></li>
              <li><a href="#faq" className="hover:text-white transition-colors">Preguntas frecuentes</a></li>
            </ul>
          </div>
        </div>
        <div className="border-t border-white/10 mt-12 pt-6 flex flex-col md:flex-row justify-between gap-3 text-xs text-white/50">
          <div>© {new Date().getFullYear()} MIMIR IA · Todos los derechos reservados.</div>
          <div className="font-mono">v0.2 — Vigencia 2025–2026</div>
        </div>
      </div>
    </footer>
  );
}

// ====== LANDING PAGE ======
export default function LandingPage() {
  const [authOpen, setAuthOpen] = useState(false);
  const [authMode, setAuthMode] = useState<"login" | "register">("login");

  const openAuth = (mode: "login" | "register") => {
    setAuthMode(mode);
    setAuthOpen(true);
  };

  return (
    <div className="App font-body">
      <Navbar onOpenAuth={openAuth} />
      <main>
        <Hero onOpenAuth={openAuth} />
        <ChatTeaser onOpenAuth={openAuth} />
        <Features onOpenAuth={openAuth} />
        <HowItWorks />
        <TargetAudienceCarousel onOpenAuth={openAuth} />
        <InstitutionSection />
        <FAQ />
      </main>
      <Footer />
      <AuthModal open={authOpen} onOpenChange={setAuthOpen} defaultMode={authMode} />
      <Toaster position="top-center" richColors />
    </div>
  );
}
