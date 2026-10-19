import { useEffect, useState } from "react";

/**
 * Memoria persistente de JARVIS.
 *
 * Todo vive en localStorage del navegador: no hay servidor, no hay costo, no hay
 * API key. JARVIS recuerda lo que le pediste, las instrucciones que le diste y las
 * conversaciones anteriores, y con eso va "aprendiendo" poco a poco.
 */

const KEY = "habits.jarvis.memory.v1";
const MAX_HISTORY = 240;
const MAX_FACTS = 120;
const MAX_RULES = 60;

export type MemorySource = "dicho" | "clase" | "auto";

export interface MemoryFact {
  id: string;
  text: string;
  tags: string[];
  source: MemorySource;
  at: number;
  hits: number;
}

export interface MemoryRule {
  id: string;
  text: string;
  when: string;
  at: number;
  uses: number;
}

export interface ChatTurn {
  id: string;
  role: "user" | "assistant";
  text: string;
  at: number;
}

export interface IntentStat {
  label: string;
  count: number;
  last: number;
}

export interface JarvisMemory {
  v: 1;
  facts: MemoryFact[];
  rules: MemoryRule[];
  history: ChatTurn[];
  intents: Record<string, IntentStat>;
  stats: { turns: number; learned: number; since: number };
}

function blank(): JarvisMemory {
  return { v: 1, facts: [], rules: [], history: [], intents: {}, stats: { turns: 0, learned: 0, since: Date.now() } };
}

function newId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

function norm(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/* ------------------------------- persistencia ------------------------------ */

let cache: JarvisMemory | null = null;
const listeners = new Set<(m: JarvisMemory) => void>();

function sanitize(raw: unknown): JarvisMemory {
  const base = blank();
  if (!raw || typeof raw !== "object") return base;
  const data = raw as Partial<JarvisMemory>;
  return {
    v: 1,
    facts: Array.isArray(data.facts) ? data.facts.filter((f) => f && typeof f.text === "string").slice(-MAX_FACTS) : [],
    rules: Array.isArray(data.rules) ? data.rules.filter((r) => r && typeof r.text === "string").slice(-MAX_RULES) : [],
    history: Array.isArray(data.history)
      ? data.history.filter((h) => h && typeof h.text === "string").slice(-MAX_HISTORY)
      : [],
    intents: data.intents && typeof data.intents === "object" ? data.intents : {},
    stats: {
      turns: Number(data.stats?.turns) || 0,
      learned: Number(data.stats?.learned) || 0,
      since: Number(data.stats?.since) || Date.now()
    }
  };
}

export function loadMemory(): JarvisMemory {
  if (cache) return cache;
  try {
    const raw = localStorage.getItem(KEY);
    cache = raw ? sanitize(JSON.parse(raw)) : blank();
  } catch {
    cache = blank();
  }
  return cache;
}

function save(memory: JarvisMemory) {
  cache = memory;
  try {
    localStorage.setItem(KEY, JSON.stringify(memory));
  } catch {
    /* modo privado o cuota llena: la memoria sigue viva en RAM */
  }
  listeners.forEach((fn) => fn(memory));
}

function update(fn: (m: JarvisMemory) => JarvisMemory) {
  save(fn({ ...loadMemory() }));
}

export function subscribeMemory(fn: (m: JarvisMemory) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Hook reactivo: la UI se refresca sola cuando JARVIS aprende algo. */
export function useJarvisMemory(): JarvisMemory {
  const [memory, setMemory] = useState<JarvisMemory>(() => loadMemory());
  useEffect(() => {
    setMemory(loadMemory());
    return subscribeMemory(setMemory);
  }, []);
  return memory;
}

/* --------------------------------- escritura -------------------------------- */

export function rememberFact(text: string, opts: { tags?: string[]; source?: MemorySource } = {}): MemoryFact | null {
  const clean = text.replace(/\s+/g, " ").trim();
  if (clean.length < 3) return null;
  const key = norm(clean);
  const existing = loadMemory().facts.find((f) => norm(f.text) === key || norm(f.text).includes(key) || key.includes(norm(f.text)));
  if (existing) {
    update((m) => ({
      ...m,
      facts: m.facts.map((f) => (f.id === existing.id ? { ...f, hits: f.hits + 1, at: Date.now() } : f))
    }));
    return existing;
  }
  const fact: MemoryFact = {
    id: newId(),
    text: clean,
    tags: opts.tags ?? [],
    source: opts.source ?? "dicho",
    at: Date.now(),
    hits: 1
  };
  update((m) => ({
    ...m,
    facts: [...m.facts, fact].slice(-MAX_FACTS),
    stats: { ...m.stats, learned: m.stats.learned + 1 }
  }));
  return fact;
}

export function rememberRule(text: string, when = "siempre"): MemoryRule | null {
  const clean = text.replace(/\s+/g, " ").trim();
  if (clean.length < 4) return null;
  const key = norm(clean);
  if (loadMemory().rules.some((r) => norm(r.text) === key)) return null;
  const rule: MemoryRule = { id: newId(), text: clean, when, at: Date.now(), uses: 0 };
  update((m) => ({
    ...m,
    rules: [...m.rules, rule].slice(-MAX_RULES),
    stats: { ...m.stats, learned: m.stats.learned + 1 }
  }));
  return rule;
}

export function forgetFact(id: string) {
  update((m) => ({ ...m, facts: m.facts.filter((f) => f.id !== id) }));
}

export function forgetRule(id: string) {
  update((m) => ({ ...m, rules: m.rules.filter((r) => r.id !== id) }));
}

/** "olvida lo de <texto>" — borra por coincidencia. */
export function forgetByText(fragment: string): number {
  const key = norm(fragment);
  if (!key) return 0;
  const m = loadMemory();
  const facts = m.facts.filter((f) => !norm(f.text).includes(key));
  const rules = m.rules.filter((r) => !norm(r.text).includes(key));
  const removed = m.facts.length - facts.length + (m.rules.length - rules.length);
  if (removed) save({ ...m, facts, rules });
  return removed;
}

export function rememberTurn(role: ChatTurn["role"], text: string) {
  const clean = text.replace(/\s+/g, " ").trim();
  if (!clean) return;
  update((m) => ({
    ...m,
    history: [...m.history, { id: newId(), role, text: clean.slice(0, 600), at: Date.now() }].slice(-MAX_HISTORY),
    stats: { ...m.stats, turns: m.stats.turns + 1 }
  }));
}

export function recordIntent(key: string, label: string) {
  if (!key) return;
  update((m) => {
    const prev = m.intents[key];
    return {
      ...m,
      intents: { ...m.intents, [key]: { label, count: (prev?.count ?? 0) + 1, last: Date.now() } }
    };
  });
}

export function clearMemory(what: "todo" | "historial" | "aprendido" = "todo") {
  const m = loadMemory();
  if (what === "historial") {
    save({ ...m, history: [] });
    return;
  }
  if (what === "aprendido") {
    save({ ...m, facts: [], rules: [] });
    return;
  }
  save(blank());
}

/* -------------------------------- aprendizaje ------------------------------- */

const EXPLICIT = /\b(recuerda(?:te|lo|la)?|memoriza|apunta|anota|ten en cuenta|no olvides|guarda(?:lo|la)? en memoria|guarda esto)\b/i;
const RULE_HINT = /\b(de ahora en adelante|a partir de ahora|desde ahora|de aqui en adelante|siempre que|siempre (?:responde|habla|dime)|nunca me|no me (?:digas|avises|llames|recuerdes)|prefiero que|cuando te diga|si te digo|cuando te pida|no vuelvas a|quedate con)\b/i;

const FACT_HINTS: Array<{ re: RegExp; tag: string }> = [
  { re: /\bme llamo\s+([^.,;]{2,60})/i, tag: "nombre" },
  { re: /\bmi nombre es\s+([^.,;]{2,60})/i, tag: "nombre" },
  { re: /\b(?:estudio|soy de|pertenezco a)\s+([^.,;]{3,80})/i, tag: "estudios" },
  { re: /\bmi profesor(?:a)?(?: de ([^.,;]{2,40}))?\s+es\s+([^.,;]{2,60})/i, tag: "profesor" },
  { re: /\bmi correo(?: es)?\s+([^\s,;]{6,90})/i, tag: "correo" },
  { re: /\btrabajo(?: en| de| como)\s+([^.,;]{3,70})/i, tag: "trabajo" },
  { re: /\bmis cursos? son\s+([^.;]{3,120})/i, tag: "cursos" },
  { re: /\bmi ciclo (?:es|empieza|inicia)\s+([^.,;]{3,60})/i, tag: "ciclo" }
];

/** Frases de relleno que no dicen nada útil y no vale la pena recordar. */
const NOISE = /^(hola|buenas|hey|gracias|ok|listo|si|no|bueno|jaja+)[\s!.]*$/i;

export interface LearnResult {
  learned: string[];
  rule?: string;
}

/**
 * Aprende de un intercambio: instrucciones permanentes, datos personales y
 * pedidos explícitos ("recuerda que…"). Devuelve qué aprendió para avisarlo.
 */
export function learnFrom(userText: string, assistantText: string): LearnResult {
  const learned: string[] = [];
  const text = userText.replace(/\s+/g, " ").trim();
  if (!text || NOISE.test(text)) return { learned };

  // 1) Instrucción permanente → regla (se aplicará en cada respuesta).
  const ruleHit = text.match(RULE_HINT);
  if (ruleHit) {
    const rule = text.replace(/^(j?arvis[,\s]+)/i, "").trim();
    const saved = rememberRule(rule, ruleHit[1].toLowerCase());
    if (saved) learned.push(`instrucción: "${rule.slice(0, 90)}"`);
    return { learned, rule: saved?.text };
  }

  // 2) "recuerda que …" → dato explícito.
  if (EXPLICIT.test(text)) {
    const clean = text
      .replace(/^(j?arvis[,\s]+)/i, "")
      .replace(/^\b(recuerda(?:te|lo|la)?|memoriza|apunta|anota|no olvides|ten en cuenta|guarda(?:lo|la)? en memoria|guarda esto)\b[,\s:]*/i, "")
      .replace(/^(que|de que)\s+/i, "")
      .trim();
    if (clean.length >= 3) {
      const fact = rememberFact(clean, { source: "dicho" });
      if (fact) learned.push(`dato: "${clean.slice(0, 90)}"`);
    }
  }

  // 3) Datos personales sueltos ("mi profesor de X es Y").
  for (const hint of FACT_HINTS) {
    const hit = text.match(hint.re);
    if (hit) {
      const fact = rememberFact(text.replace(/^(j?arvis[,\s]+)/i, "").trim(), { tags: [hint.tag], source: "auto" });
      if (fact && fact.hits === 1) learned.push(`dato (${hint.tag}): "${fact.text.slice(0, 80)}"`);
      break;
    }
  }

  // 4) Si JARVIS respondió con datos de un curso, también queda anotado.
  if (!learned.length && assistantText && /semana|entrega|tarea|curso/i.test(assistantText) && text.length > 12) {
    recordIntent(norm(text).split(" ").slice(0, 3).join("_"), text.slice(0, 60));
  }

  return { learned };
}

/* --------------------------------- lectura --------------------------------- */

export function historyBlock(count = 8): string {
  const hist = loadMemory().history.slice(-count);
  if (!hist.length) return "";
  const when = (at: number) => {
    const mins = Math.round((Date.now() - at) / 60000);
    if (mins < 2) return "recién";
    if (mins < 60) return `hace ${mins} min`;
    const hours = Math.round(mins / 60);
    if (hours < 24) return `hace ${hours} h`;
    return `hace ${Math.round(hours / 24)} d`;
  };
  return hist.map((h) => `${h.role === "user" ? "Jefe" : "JARVIS"} (${when(h.at)}): ${h.text}`).join("\n");
}

export function topIntents(count = 4): IntentStat[] {
  return Object.values(loadMemory().intents)
    .filter((i) => i.count > 1)
    .sort((a, b) => b.count - a.count)
    .slice(0, count);
}

/** Bloques de contexto listos para el modelo (local o nube), en texto plano. */
export function memoryDigest(maxFacts = 14, maxRules = 8): string {
  const m = loadMemory();
  const parts: string[] = [];
  if (m.rules.length) {
    parts.push(
      "INSTRUCCIONES QUE TE DIO EL JEFE (obligatorias):\n" +
        m.rules
          .slice(-maxRules)
          .map((r) => `- ${r.text}`)
          .join("\n")
    );
  }
  if (m.facts.length) {
    parts.push(
      "DATOS QUE JARVIS YA RECUERDA DEL JEFE:\n" +
        m.facts
          .slice(-maxFacts)
          .map((f) => `- ${f.text}${f.tags.length ? ` (${f.tags.join(", ")})` : ""}`)
          .join("\n")
    );
  }
  const tops = topIntents(4);
  if (tops.length) {
    parts.push("LO QUE MÁS TE PIDE:\n" + tops.map((t) => `- "${t.label}" (${t.count} veces)`).join("\n"));
  }
  const recent = historyBlock(6);
  if (recent) parts.push("CONVERSACIÓN RECIENTE:\n" + recent);
  return parts.join("\n\n");
}

/** Slug corto del tema de una frase, para contar rutinas. */
export function intentKeyOf(text: string): { key: string; label: string } {
  const n = norm(text);
  const topics: Array<{ re: RegExp; key: string; label: string }> = [
    { re: /resumen de la semana|c[oó]mo va la semana|mi semana/, key: "resumen_semana", label: "resumen de la semana" },
    { re: /qu[eé] (cursos|clases|materias)/, key: "mis_cursos", label: "qué cursos llevo" },
    { re: /entrega|tarea|pendiente|deber/, key: "entregas", label: "entregas y tareas" },
    { re: /hora|horario|cu[aá]ndo (es|toca)/, key: "horario", label: "horario de clases" },
    { re: /examen|parcial|final|evaluaci[oó]n/, key: "examenes", label: "exámenes" },
    { re: /resumen|res[uú]meme/, key: "resumen", label: "resúmenes" },
    { re: /recuerda|memoriza|apunta|anota/, key: "memoria", label: "guardar algo en memoria" },
    { re: /abre|abrir|lanza|ejecuta/, key: "pc", label: "abrir cosas en la PC" }
  ];
  for (const t of topics) if (t.re.test(n)) return { key: t.key, label: t.label };
  const words = n.split(" ").filter((w) => w.length > 4).slice(0, 2);
  return words.length ? { key: words.join("_"), label: text.slice(0, 50) } : { key: "", label: "" };
}

export function memoryStats() {
  const m = loadMemory();
  return {
    facts: m.facts.length,
    rules: m.rules.length,
    turns: m.stats.turns,
    history: m.history.length,
    learned: m.stats.learned,
    since: m.stats.since
  };
}

/** Resumen hablado de lo que JARVIS recuerda, para responder sin gastar nada. */
export function spokenMemorySummary(): string {
  const m = loadMemory();
  if (!m.facts.length && !m.rules.length) {
    return "Todavía no tengo nada anotado, jefe. Dime por ejemplo: recuerda que el profesor de Importaciones es Luis.";
  }
  const lines: string[] = [];
  if (m.rules.length) {
    lines.push(`Tengo ${m.rules.length} instrucción${m.rules.length === 1 ? "" : "es"} tuya${m.rules.length === 1 ? "" : "s"}: ${m.rules.map((r) => r.text).slice(-3).join("; ")}.`);
  }
  if (m.facts.length) {
    lines.push(`Y ${m.facts.length} dato${m.facts.length === 1 ? "" : "s"} anotado${m.facts.length === 1 ? "" : "s"}: ${m.facts.slice(-3).map((f) => f.text).join("; ")}.`);
  }
  return lines.join(" ");
}

export function exportMemory(): string {
  return JSON.stringify(loadMemory(), null, 2);
}

export function importMemory(json: string): boolean {
  try {
    save(sanitize(JSON.parse(json)));
    return true;
  } catch {
    return false;
  }
}
