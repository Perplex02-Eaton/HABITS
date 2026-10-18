/**
 * Memoria de clases de UTP+class (generada por scripts/utp_courses.py).
 *
 * El sílabo se convierte, fuera de la app, en `public/utp-courses.json`: para cada
 * curso guarda unidades, semanas, sesiones, temas, actividades/entregables y un
 * resumen. Aquí solo se lee, se busca el curso/semana que pide el usuario y se
 * redacta la respuesta en español (sirve igual para el chat y para la voz).
 */
import { useEffect, useState } from "react";

export interface MemoryActivity {
  text: string;
  kind: string;
}

export interface MemorySession {
  n: number;
  topic: string;
  activities: MemoryActivity[];
}

export interface MemoryWeek {
  week: number;
  unit_no: number;
  unit: string;
  sessions: MemorySession[];
  topics: string[];
  activities: MemoryActivity[];
  has_deliverable: boolean;
  deliverables: string[];
  mode: string;
  summary: string;
}

export interface MemoryUnit {
  no: number;
  name: string;
  weeks: number[];
}

export interface MemoryCourse {
  course: string;
  courseId?: string;
  sectionId?: string;
  sessions_per_week?: number;
  sessions_count?: number;
  weeks_count?: number;
  units: MemoryUnit[];
  weeks: MemoryWeek[];
}

export interface CourseMemory {
  generated_at: string;
  cycle_start: string;
  weeks_per_cycle: number;
  current_week: number;
  courses: Record<string, MemoryCourse>;
}

/* ---------------------------------------------------------------- carga ---- */

let cache: CourseMemory | null = null;
let inflight: Promise<CourseMemory | null> | null = null;

function normalize(data: unknown): CourseMemory | null {
  if (!data || typeof data !== "object") return null;
  const d = data as Partial<CourseMemory>;
  if (!d.courses || typeof d.courses !== "object") return null;
  const cycleStart = typeof d.cycle_start === "string" ? d.cycle_start : "";
  const total = Number(d.weeks_per_cycle) || 18;
  // La semana en curso se recalcula con la fecha: el JSON se genera una vez y
  // "current_week" quedaría congelado en la semana de generación.
  return {
    generated_at: typeof d.generated_at === "string" ? d.generated_at : "",
    cycle_start: cycleStart,
    weeks_per_cycle: total,
    current_week: weekOf(cycleStart, new Date(), total) || Number(d.current_week) || 1,
    courses: d.courses as Record<string, MemoryCourse>
  };
}

/** Semana 1..N del ciclo a partir de la fecha de inicio (misma regla que utp_courses.py). */
export function weekOf(cycleStart: string, now: Date = new Date(), total = 18): number {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(cycleStart || "");
  if (!m) return 0;
  const start = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  const days = Math.floor((now.getTime() - start.getTime()) / 86400000);
  if (!Number.isFinite(days)) return 0;
  return Math.min(Math.max(Math.floor(days / 7) + 1, 1), total);
}

/** Lee `public/utp-courses.json` una sola vez y lo deja en caché. */
export async function loadCourseMemory(force = false): Promise<CourseMemory | null> {
  if (cache && !force) return cache;
  if (inflight && !force) return inflight;
  const base = (import.meta.env.BASE_URL || "/").replace(/\/+$/, "");
  inflight = fetch(`${base}/utp-courses.json`, { cache: force ? "reload" : "default" })
    .then((res) => (res.ok ? res.json() : null))
    .then((data) => {
      cache = normalize(data);
      return cache;
    })
    .catch(() => cache)
    .finally(() => {
      inflight = null;
    });
  return inflight;
}

/** Memoria ya cargada, si existe (para usarla desde código síncrono). */
export function cachedCourseMemory(): CourseMemory | null {
  return cache;
}

/** Hook: devuelve la memoria cuando está lista (null mientras carga). */
export function useCourseMemory(): CourseMemory | null {
  const [mem, setMem] = useState<CourseMemory | null>(cache);
  useEffect(() => {
    let alive = true;
    void loadCourseMemory().then((m) => {
      if (alive && m) setMem(m);
    });
    return () => {
      alive = false;
    };
  }, []);
  return mem;
}

/* ------------------------------------------------------------- búsqueda ---- */

export function normalizeText(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

const WORD_NUMBERS: Record<string, number> = {
  una: 1, uno: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7,
  ocho: 8, nueve: 9, diez: 10, once: 11, doce: 12, trece: 13, catorce: 14,
  quince: 15, dieciseis: 16, diecisiete: 17, dieciocho: 18
};

/** Curso mencionado en el texto (o null si no se reconoce ninguno). */
export function findCourse(mem: CourseMemory, query: string): MemoryCourse | null {
  const q = normalizeText(query);
  let best: { course: MemoryCourse; score: number } | null = null;
  for (const course of Object.values(mem.courses)) {
    const name = normalizeText(course.course);
    let score = 0;
    if (q.includes(name)) {
      score = 100 + name.length;
    } else {
      for (const word of name.split(/\s+/)) {
        if (word.length >= 4 && q.includes(word)) score += word.length;
      }
    }
    if (score > 0 && (!best || score > best.score)) best = { course, score };
  }
  return best ? best.course : null;
}

/**
 * Semana pedida. `explicit` indica si el usuario la nombró (y no tomamos la actual).
 * Entiende "semana 12", "la semana pasada", "la próxima", "esta semana".
 */
export function resolveWeek(mem: CourseMemory, query: string): { week: number; explicit: boolean } {
  const q = normalizeText(query);
  const total = mem.weeks_per_cycle || 18;

  const num = q.match(/semana\s*(?:n[°º.]?\s*)?(\d{1,2})/) || q.match(/(\d{1,2})\s*(?:a|de)\s*(?:la\s*)?semana/);
  if (num) {
    const n = parseInt(num[1], 10);
    if (n >= 1 && n <= total) return { week: n, explicit: true };
  }
  const word = q.match(new RegExp(`semana\\s+(${Object.keys(WORD_NUMBERS).join("|")})\\b`));
  if (word) {
    const n = WORD_NUMBERS[word[1]] ?? 0;
    if (n >= 1 && n <= total) return { week: n, explicit: true };
  }
  if (/\b(proxima|siguiente|que viene|entrante)\b/.test(q)) {
    return { week: Math.min(total, mem.current_week + 1), explicit: true };
  }
  if (/\b(pasada|anterior|ultima)\b/.test(q)) {
    return { week: Math.max(1, mem.current_week - 1), explicit: true };
  }
  return { week: mem.current_week, explicit: false };
}

/* ------------------------------------------------------------ redacción ---- */

function deliverableLine(week: MemoryWeek): string {
  if (week.has_deliverable && week.deliverables.length) {
    return `Entrega: ${week.deliverables.join("; ")}.`;
  }
  if (week.mode === "exposicion") return "Sin entrega: exposición en clase.";
  if (week.mode === "repaso") return "Sin entrega: repaso de los temas.";
  return "Sin entrega: solo clase.";
}

/** Una línea por curso para la semana pedida (texto listo para leer en voz alta). */
export function weekOverview(mem: CourseMemory, week: number): string {
  const total = mem.weeks_per_cycle || 18;
  const lines: string[] = [];
  for (const course of Object.values(mem.courses)) {
    const w = course.weeks.find((item) => item.week === week);
    if (!w) continue;
    const topics = (w.topics.length ? w.topics : w.sessions.map((s) => s.topic)).filter(Boolean);
    const head = `${course.course}, unidad ${w.unit_no}, ${w.unit}.`;
    const body = topics.length ? `Temas: ${topics.join("; ")}.` : "Sin tema registrado.";
    lines.push(`${head} ${body} ${deliverableLine(w)}`);
  }
  if (!lines.length) {
    return `No tengo temas cargados para la semana ${week}. Tengo memoria de las semanas 1 a ${total}.`;
  }
  const header = week === mem.current_week
    ? `Semana ${week} de ${total}, la semana en curso:`
    : `Semana ${week} de ${total}:`;
  return `${header}\n${lines.join("\n")}`;
}

/** Detalle de un curso en una semana concreta. */
export function courseWeekText(course: MemoryCourse, week: number): string {
  const w = course.weeks.find((item) => item.week === week);
  if (!w) return "";
  const topics = (w.topics.length ? w.topics : w.sessions.map((s) => s.topic)).filter(Boolean);
  const parts: string[] = [
    `${course.course}, semana ${week}, unidad ${w.unit_no}: ${w.unit}.`
  ];
  for (let i = 0; i < topics.length; i += 1) {
    const session = w.sessions[i];
    parts.push(session ? `Sesión ${session.n}: ${topics[i]}.` : `${topics[i]}.`);
  }
  if (!topics.length) parts.push("Sin tema registrado en el sílabo.");
  parts.push(deliverableLine(w));

  const extra = w.activities.filter((a) => a.kind === "exposicion" || a.kind === "participacion" || a.kind === "repaso");
  if (extra.length) parts.push(`Actividades: ${extra.map((a) => a.text).join("; ")}.`);
  return parts.join(" ");
}

export interface UpcomingDeliverable {
  course: string;
  week: number;
  unit: string;
  items: string[];
}

/** Todas las entregas/evaluaciones del ciclo (de la semana pedida en adelante). */
export function deliverablesFrom(mem: CourseMemory, fromWeek: number, only?: MemoryCourse | null): UpcomingDeliverable[] {
  const out: UpcomingDeliverable[] = [];
  const courses = only ? [only] : Object.values(mem.courses);
  for (const course of courses) {
    for (const w of course.weeks) {
      if (w.week < fromWeek) continue;
      if (!w.has_deliverable || !w.deliverables.length) continue;
      out.push({ course: course.course, week: w.week, unit: w.unit, items: w.deliverables });
    }
  }
  return out.sort((a, b) => a.week - b.week || a.course.localeCompare(b.course));
}

export function deliverablesText(mem: CourseMemory, only?: MemoryCourse | null): string {
  const rows = deliverablesFrom(mem, 1, only);
  if (!rows.length) {
    return only
      ? `No encontré entregas ni evaluaciones para ${only.course} en el sílabo.`
      : "No encontré entregas ni evaluaciones en el sílabo.";
  }
  const scope = only ? `${only.course}` : "tus cursos";
  const body = rows.map((r) => `Semana ${r.week}, ${r.course}: ${r.items.join("; ")}`).join("\n");
  return `Entregas y evaluaciones de ${scope}:\n${body}\nLa semana en curso es la ${mem.current_week}.`;
}

/** Bloque compacto para el prompt de la IA: unidades, semana actual y entregas. */
export function memoryContextBlock(mem: CourseMemory, weeksWindow = 1): string {
  const total = mem.weeks_per_cycle || 18;
  const from = Math.max(1, mem.current_week - weeksWindow);
  const to = Math.min(total, mem.current_week + weeksWindow);
  const blocks: string[] = [
    `Ciclo UTP de 18 semanas (inicio ${mem.cycle_start}). Semana actual: ${mem.current_week}.`
  ];
  for (const course of Object.values(mem.courses)) {
    const units = course.units.map((u) => `U${u.no} ${u.name} (sem. ${u.weeks.join("-")})`).join(" | ");
    blocks.push(`\n${course.course}\n  Unidades: ${units}`);
    for (let w = from; w <= to; w += 1) {
      const week = course.weeks.find((item) => item.week === w);
      if (!week) continue;
      const topics = (week.topics.length ? week.topics : week.sessions.map((s) => s.topic)).join("; ");
      const entrega = week.has_deliverable && week.deliverables.length
        ? ` [ENTREGA: ${week.deliverables.join("; ")}]`
        : week.mode === "repaso" ? " [repaso]" : "";
      blocks.push(`  Semana ${w} (U${week.unit_no}): ${topics}.${entrega}`);
    }
    const entregas = deliverablesFrom(mem, 1, course)
      .map((r) => `sem. ${r.week}: ${r.items.join("; ")}`)
      .join(" / ");
    if (entregas) blocks.push(`  Entregas del ciclo: ${entregas}`);
  }
  return blocks.join("\n");
}
