/**
 * Motor local de respuestas de MIMIR.
 * Se usa como respaldo cuando la API (Vercel + MongoDB + GPT-5-mini) no está conectada,
 * de modo que la app siempre funcione en modo demo.
 */

export interface MimirSource {
  label: string;
  url: string;
}

export interface MimirReply {
  text: string;
  sources: MimirSource[];
  followUps: string[];
}

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
      followUps: [
        "Explícame el Ciclo de Calvin con un ejemplo",
        "¿Qué es la clorofila y por qué es verde?",
        "Hazme 3 preguntas de práctica sobre fotosíntesis",
      ],
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
      followUps: [
        "¿Cómo factorizo una ecuación cuadrática?",
        "Explícame el método de completar el cuadrado",
        "Dame 5 ejercicios con solución paso a paso",
      ],
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
      followUps: [
        "¿Qué pasó en la Batalla de Palonegro?",
        "¿Cómo se relaciona con la separación de Panamá?",
        "Hazme una línea de tiempo resumida",
      ],
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
      followUps: [
        "¿Cómo funciona un modelo de lenguaje como GPT?",
        "¿La IA puede reemplazar a los profesores?",
        "¿Qué puedo estudiar para trabajar en IA?",
      ],
    },
  },
];

const GENERIC: MimirReply = {
  text: "Recibí tu pregunta y ya la estoy analizando. Así es como trabajamos juntos:\n\n**1. Primero, entendamos bien qué estás preguntando.**\nReformula en una frase qué es lo que más te confunde del tema: ¿una definición, un procedimiento, una fecha, una fórmula?\n\n**2. Mientras tanto, te doy un punto de partida sólido:**\nTodo tema nuevo se domina en tres capas:\n• **La idea central** (¿qué es y para qué sirve?)\n• **El mecanismo** (¿cómo funciona paso a paso?)\n• **La aplicación** (¿dónde se usa en la vida real?)\n\n**3. Tu ruta de estudio sugerida:**\nDime el tema exacto y tu nivel (primaria, bachillerato o autodidacta) y te armo una explicación completa con fuentes verificadas, ejemplos y preguntas de práctica.\n\nEscríbeme, por ejemplo: \u00abExplícame las mitocondrias como si estuviera en séptimo\u00bb o \u00abNecesito prepararme para el ICFES de matemáticas\u00bb.",
  sources: [
    { label: "Khan Academy", url: "https://es.khanacademy.org/" },
    { label: "Wikipedia", url: "https://es.wikipedia.org/" },
    { label: "Colombia Aprende (.gov)", url: "https://www.colombiaaprende.edu.co/" },
  ],
  followUps: [
    "¿Qué es la fotosíntesis?",
    "Explícame las ecuaciones cuadráticas",
    "¿Qué es una IA?",
    "¿Qué fue la Guerra de los Mil Días?",
  ],
};

export function findReply(prompt: string): MimirReply {
  for (const t of TOPICS) if (t.match.test(prompt)) return t.reply;
  return GENERIC;
}
