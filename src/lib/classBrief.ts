/**
 * Brief de la CLASE (apartado Cursos).
 *
 * Toma la memoria de UTP+class (`public/utp-courses.json`) y el horario real del
 * usuario en Habits y arma, para la próxima clase de un curso:
 *
 *   · el TEMA que se va a tratar (semana + sesión del sílabo),
 *   · un resumen rápido de QUÉ TRATA (unidad, modalidad y actividades),
 *   · QUÉ SE TRATÓ la semana pasada,
 *   · la ENTREGA/TAREA pendiente (sílabo + tareas del usuario) y
 *   · CÓMO EMPEZAR (pasos concretos).
 *
 * Todo determinista para que funcione sin internet ni clave de IA; `speech` es la
 * misma info redactada para que Jarvis la lea en voz alta.
 */
import type { Course, Task } from "./types";
import { DAY_NAMES, DAY_SHORT } from "./dates";
import {
  deliverablesFrom,
  normalizeText,
  weekOf,
  type CourseMemory,
  type MemoryCourse,
  type MemoryWeek
} from "./courseMemory";

export const MODE_LABEL: Record<string, string> = {
  clase: "clase normal",
  exposicion: "exposición",
  evaluacion: "evaluación",
  repaso: "repaso de materiales"
};

export interface BriefMeeting {
  /** 0 = domingo … 6 = sábado (igual que Date.getDay()). */
  day: number;
  start: string;
  end: string;
  dayLabel: string;
  isToday: boolean;
  /** Fecha del encuentro en formato YYYY-MM-DD. */
  date: string;
}

export interface BriefPending {
  text: string;
  week: number;
  source: "silabo" | "tarea";
  /** "tarea" | "examen" | "exposicion" | … */
  kind: string;
  due?: string;
}

export interface ClassBrief {
  courseId: string;
  courseName: string;
  syllabusName: string;
  week: number;
  totalWeeks: number;
  unitNo: number;
  unit: string;
  mode: string;
  modeLabel: string;
  /** Tema de la clase que viene. */
  topic: string;
  /** Todos los temas de la semana (por si hay dos sesiones). */
  weekTopics: string[];
  sessionN: number | null;
  sessionsThisWeek: number;
  /** Qué trata, en una o dos frases. */
  about: string;
  previous: { week: number; topics: string[]; mode: string; hasDeliverable: boolean } | null;
  pending: BriefPending[];
  /** Pasos para empezar hoy. */
  checklist: string[];
  meeting: BriefMeeting | null;
  /** Versión hablada (Jarvis). */
  speech: string;
}

/* --------------------------------------------------------------- fechas ---- */

function ymd(d: Date): string {
  const m = `${d.getMonth() + 1}`.padStart(2, "0");
  const day = `${d.getDate()}`.padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

function mondayOf(d: Date): Date {
  const copy = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  copy.setDate(copy.getDate() - ((copy.getDay() + 6) % 7));
  return copy;
}

/**
 * Próximo encuentro del curso a partir de `now` (hoy incluido mientras no haya
 * terminado). Si el horario está vacío, devuelve null.
 */
export function nextMeeting(course: Course, now: Date = new Date()): BriefMeeting | null {
  if (!course.schedule.length) return null;
  const todayIdx = now.getDay();
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const toMin = (t: string) => {
    const m = /^(\d{1,2}):(\d{2})/.exec(t || "");
    return m ? Number(m[1]) * 60 + Number(m[2]) : 0;
  };
  // 0 = hoy, 1 = mañana, … 6
  for (let offset = 0; offset <= 6; offset += 1) {
    const dayIdx = (todayIdx + offset) % 7;
    const rows = course.schedule
      .filter((s) => s.day === dayIdx)
      .sort((a, b) => a.start.localeCompare(b.start));
    for (const s of rows) {
      const ends = toMin(s.end || s.start);
      if (offset === 0 && ends + 30 <= nowMin) continue; // ya terminó
      const date = new Date(now.getFullYear(), now.getMonth(), now.getDate() + offset);
      return {
        day: dayIdx,
        start: s.start,
        end: s.end,
        dayLabel: DAY_NAMES[dayIdx],
        isToday: offset === 0,
        date: ymd(date)
      };
    }
  }
  return null;
}

/** Nº de sesión (1-based) de ese día dentro de la semana Mon–Sun del curso. */
function sessionIndexFor(course: Course, meetingDate: string): { index: number; total: number } {
  const [y, m, d] = meetingDate.split("-").map(Number);
  const day = new Date(y, m - 1, d);
  const monday = mondayOf(day);
  const days = [0, 1, 2, 3, 4, 5, 6].map((i) => {
    const cur = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + i);
    const rows = course.schedule.filter((s) => s.day === cur.getDay());
    return { key: ymd(cur), rows };
  });
  const total = days.reduce((acc, cur) => acc + cur.rows.length, 0);
  let count = 0;
  for (const cur of days) {
    for (const _row of cur.rows) {
      count += 1;
      void _row;
    }
    if (cur.key === meetingDate) return { index: count, total };
  }
  return { index: 1, total: total || 1 };
}

/* -------------------------------------------------------------- búsqueda ---- */

/** Curso de Habits que corresponde al curso del sílabo (coincidencia por palabras). */
export function appCourseFor(memCourse: MemoryCourse, courses: Course[]): Course | null {
  const tokens = (text: string) =>
    normalizeText(text)
      .split(/[^a-z0-9]+/)
      .filter((w) => w.length > 3);
  const target = new Set(tokens(memCourse.course));
  let best: { course: Course; score: number } | null = null;
  for (const course of courses) {
    const hits = tokens(course.name).filter((w) => target.has(w)).length;
    if (!hits) continue;
    if (!best || hits > best.score) best = { course, score: hits };
  }
  return best?.course ?? null;
}

/** Curso del sílabo a partir de un curso de Habits (o del nombre que dijo el usuario). */
export function syllabusCourseFor(
  mem: CourseMemory,
  course: Course | null,
  spokenName: string
): MemoryCourse | null {
  const list = Object.values(mem.courses);
  const tokens = (text: string) =>
    normalizeText(text)
      .split(/[^a-z0-9]+/)
      .filter((w) => w.length > 3);
  const haystacks: Array<{ label: string; value: MemoryCourse }> = list.map((c) => ({ label: c.course, value: c }));
  const needles = [course?.name, spokenName, course?.code].filter(Boolean) as string[];
  let best: { value: MemoryCourse; score: number } | null = null;
  for (const needle of needles) {
    const want = tokens(needle);
    if (!want.length) continue;
    for (const entry of haystacks) {
      const have = new Set(tokens(entry.label));
      const hits = want.filter((w) => have.has(w)).length;
      if (!hits) continue;
      if (!best || hits > best.score) best = { value: entry.value, score: hits };
    }
    if (best && best.score >= want.length) break;
  }
  return best?.value ?? null;
}

/* ----------------------------------------------------------------- brief ---- */

function weekOfCourse(course: MemoryCourse, week: number): MemoryWeek | null {
  return course.weeks.find((w) => w.week === week) ?? null;
}

function topicsOf(week: MemoryWeek | null): string[] {
  if (!week) return [];
  const topics = week.topics.length ? week.topics : week.sessions.map((s) => s.topic);
  return topics.map((t) => t.trim()).filter(Boolean);
}

function trimPeriod(text: string): string {
  return text.trim().replace(/\s+/g, " ").replace(/[.;\s]+$/, "");
}

export interface BuildBriefOptions {
  memory: CourseMemory;
  course: Course | null;
  spokenName?: string;
  tasks?: Task[];
  now?: Date;
}

/** Arma el brief de la próxima clase del curso pedido (null si no hay sílabo). */
export function buildClassBrief(options: BuildBriefOptions): ClassBrief | null {
  const { memory, course, spokenName = "", now = new Date() } = options;
  const tasks = options.tasks ?? [];
  const syl = syllabusCourseFor(memory, course, spokenName);
  if (!syl) return null;

  const meeting = course ? nextMeeting(course, now) : null;
  const meetingDay = meeting ? new Date(`${meeting.date}T12:00:00`) : now;
  const week = weekOf(memory.cycle_start, meetingDay, memory.weeks_per_cycle || 18) || memory.current_week;
  const weekData = weekOfCourse(syl, week);
  // La última semana del sílabo manda: si el ciclo ya avanzó más allá del sílabo,
  // usamos la última semana conocida en vez de quedarnos sin tema.
  const lastWeek = syl.weeks.reduce((acc, w) => (w.week > acc ? w.week : acc), 0);
  const effectiveWeek = weekData ? week : Math.min(week, lastWeek || week);
  const data = weekData ?? weekOfCourse(syl, effectiveWeek);

  const { index: sessionN, total: sessionsThisWeek } = course
    ? sessionIndexFor(course, meeting?.date ?? ymd(now))
    : { index: 1, total: data?.sessions.length || 1 };

  const weekTopics = topicsOf(data);
  const session = data?.sessions?.[Math.min(sessionN, Math.max(1, data.sessions.length)) - 1] ?? null;
  const topic =
    (session?.topic || "").trim() ||
    weekTopics[0] ||
    (data?.deliverables?.[0] ?? "") ||
    (data?.summary ?? "").trim() ||
    "revisión de materiales";

  const unitNo = data?.unit_no ?? 0;
  const mode = data?.mode ?? "clase";
  const modeLabel = MODE_LABEL[mode] ?? mode;

  const prevWeek = data ? weekOfCourse(syl, data.week - 1) : null;
  const previous = prevWeek
    ? {
        week: prevWeek.week,
        topics: topicsOf(prevWeek),
        mode: prevWeek.mode,
        hasDeliverable: prevWeek.has_deliverable
      }
    : null;

  /* --- pendientes: entregas del sílabo + tareas del usuario en este curso --- */
  const pending: BriefPending[] = [];
  const syllabusPending = deliverablesFrom(memory, effectiveWeek, syl).slice(0, 3);
  for (const row of syllabusPending) {
    for (const item of row.items) {
      pending.push({ text: trimPeriod(item), week: row.week, source: "silabo", kind: "entrega" });
    }
  }
  const appTasks = course
    ? tasks
        .filter((t) => t.status === "pending" && t.courseId === course.id)
        .sort((a, b) => (a.dueDate + (a.dueTime ?? "")).localeCompare(b.dueDate + (b.dueTime ?? "")))
        .slice(0, 3)
    : [];
  for (const t of appTasks) {
    pending.push({
      text: trimPeriod(t.title),
      week: effectiveWeek,
      source: "tarea",
      kind: t.priority === "alta" ? "tarea urgente" : "tarea",
      due: `${t.dueDate}${t.dueTime ? ` ${t.dueTime}` : ""}`
    });
  }

  /* --- qué trata (determinista) --- */
  const activities = (data?.activities ?? []).filter((a) => a.kind !== "repaso").slice(0, 3);
  const aboutParts: string[] = [];
  aboutParts.push(
    unitNo
      ? `Vas por la Unidad ${unitNo}${data?.unit ? ` (${data.unit})` : ""} y la clase es de ${modeLabel}.`
      : `La clase es de ${modeLabel}.`
  );
  if (topic && topic.toLowerCase() !== (data?.summary ?? "").toLowerCase()) {
    aboutParts.push(`El tema es «${trimPeriod(topic)}».`);
  }
  if (activities.length) {
    aboutParts.push(`En el sílabo está marcado como: ${activities.map((a) => trimPeriod(a.text)).join("; ")}.`);
  }
  if (weekTopics.length > 1) {
    aboutParts.push(`La semana cubre además: ${weekTopics.slice(1).join("; ")}.`);
  }
  const about = aboutParts.join(" ");

  /* --- cómo empezar --- */
  const checklist: string[] = [];
  checklist.push(
    `Entra a UTP+class (class.utp.edu.pe) y abre ${syl.course}${course?.code ? ` — ${course.code}` : ""}.`
  );
  checklist.push(`Ve a la Semana ${effectiveWeek}${unitNo ? ` (Unidad ${unitNo})` : ""} y busca «${trimPeriod(topic)}».`);
  const mainPending = pending[0];
  if (mainPending) {
    checklist.push(
      mainPending.source === "tarea"
        ? `Tienes pendiente en Habits: ${mainPending.text}${mainPending.due ? ` (vence ${mainPending.due})` : ""}. Ábrela y empieza por el primer punto.`
        : `Entrega pendiente (semana ${mainPending.week}): ${mainPending.text}. Abre la actividad, lee la rúbrica y anota la fecha límite.`
    );
  }
  if (previous?.topics.length) {
    checklist.push(`Repasa 5 minutos lo de la semana ${previous.week}: ${previous.topics.join("; ")}.`);
  }
  checklist.push("Anota tus dudas del tema y llévalas a clase.");

  /* --- versión hablada --- */
  const whenText = meeting
    ? meeting.isToday
      ? `Hoy a las ${meeting.start}`
      : `El ${meeting.dayLabel} a las ${meeting.start}`
    : "Esta semana";
  const speechParts: string[] = [];
  speechParts.push(
    `${whenText} tienes ${syl.course}. Vamos por la semana ${effectiveWeek}${unitNo ? `, unidad ${unitNo}: ${data?.unit ?? ""}` : ""}.`
  );
  speechParts.push(`El tema de la clase es: ${trimPeriod(topic)}.`);
  speechParts.push(about);
  if (previous) {
    const prevTopics = previous.topics.length ? previous.topics.slice(0, 2).join("; ") : previous.mode === "exposicion" ? "las exposiciones" : "la revisión de materiales";
    speechParts.push(`La clase pasada (semana ${previous.week}) se trató: ${prevTopics}.`);
  }
  if (pending.length) {
    const first = pending[0];
    speechParts.push(
      first.source === "tarea"
        ? `Tienes pendiente: ${first.text}${first.due ? `, vence ${first.due}` : ""}.`
        : `Ojo: hay entrega en la semana ${first.week}: ${first.text}.`
    );
  } else {
    speechParts.push("No veo entregas pendientes de este curso en el sílabo.");
  }
  speechParts.push(`Para empezar: ${checklist[0]} ${checklist[1]} ${checklist[2] ?? ""}`.trim());

  return {
    courseId: course?.id ?? "",
    courseName: course?.name ?? syl.course,
    syllabusName: syl.course,
    week: effectiveWeek,
    totalWeeks: memory.weeks_per_cycle || 18,
    unitNo,
    unit: data?.unit ?? "",
    mode,
    modeLabel,
    topic: trimPeriod(topic),
    weekTopics,
    sessionN: data ? Math.min(sessionN, Math.max(1, data.sessions.length)) : null,
    sessionsThisWeek: sessionsThisWeek || data?.sessions.length || 1,
    about,
    previous,
    pending,
    checklist,
    meeting,
    speech: speechParts.filter(Boolean).join(" ")
  };
}

/** Brief de la clase más próxima entre todos los cursos con horario. */
export function nextClassBrief(
  memory: CourseMemory,
  courses: Course[],
  tasks: Task[] = [],
  now: Date = new Date()
): ClassBrief | null {
  const candidates: Array<{ brief: ClassBrief; when: number }> = [];
  for (const course of courses) {
    const brief = buildClassBrief({ memory, course, tasks, now });
    if (!brief) continue;
    const meet = brief.meeting;
    const when = meet
      ? new Date(`${meet.date}T${meet.start || "00:00"}`).getTime()
      : Number.MAX_SAFE_INTEGER;
    candidates.push({ brief, when });
  }
  if (!candidates.length) return null;
  candidates.sort((a, b) => a.when - b.when);
  return candidates[0].brief;
}

/** Etiqueta corta del encuentro: "Hoy · 18:30–22:30" / "Mar · 18:30–22:30". */
export function meetingLabel(meeting: BriefMeeting | null): string {
  if (!meeting) return "sin horario";
  const day = meeting.isToday ? "Hoy" : DAY_SHORT[meeting.day];
  return `${day} · ${meeting.start}–${meeting.end}`;
}
