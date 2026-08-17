/**
 * study.ts — Asistente de Estudio para HABITS
 * -------------------------------------------------
 * - Extrae texto de PDFs (pdf.js)
 * - Responde preguntas sobre el material (LLM vía chat())
 * - Genera documentos Word (.docx), Excel (.xlsx) y PDF (.pdf)
 * - El profesor guía al estudiante (funciona CON y SIN IA)
 *
 * IMPORTANTE: Todas las funciones públicas aceptan un cfg opcional.
 * Si no hay IA configurada, usan respuestas locales inteligentes.
 */
import type { AiConfig } from "./types";

// ── LLM ────────────────────────────────────────────────────
/** Llama a la IA solo si está configurada; si no, lanza Error("NO_AI") */
async function chat(
  system: string,
  user: string,
  cfg: AiConfig
): Promise<string> {
  if (!cfg.apiKey?.trim() || !cfg.baseUrl?.trim()) {
    throw new Error("NO_AI");
  }
  const base = cfg.baseUrl.trim().replace(/\/+$/, "");
  const res = await fetch(`${base}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${cfg.apiKey.trim()}`,
    },
    body: JSON.stringify({
      model: cfg.model.trim() || "deepseek-chat",
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      temperature: 0.35,
    }),
  });
  if (!res.ok) throw new Error(`IA ${res.status}`);
  const data = await res.json();
  const out = data?.choices?.[0]?.message?.content;
  if (typeof out !== "string" || !out.trim()) throw new Error("Respuesta vacía");
  return out.trim();
}

// ── PDF lectura ─────────────────────────────────────────────
export async function extractPdfText(file: File): Promise<string> {
  const pdfjs = await import("pdfjs-dist");
  const worker = await import("pdfjs-dist/build/pdf.worker.mjs?url");
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
  const buf = await file.arrayBuffer();
  const pdf = await pdfjs.getDocument({ data: buf }).promise;
  const parts: string[] = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const text = content.items
      .map((it) => ("str" in it ? it.str : ""))
      .join(" ");
    parts.push(`[Página ${i}]\n${text}`);
  }
  return parts.join("\n\n");
}

// ── Q&A sobre el material ───────────────────────────────────
export async function askMaterial(
  question: string,
  context: string,
  cfg: AiConfig
): Promise<string> {
  try {
    const sys =
      "Eres un tutor académico experto y claro. Responde en español basándote SOLO en el material proporcionado. Si la respuesta no está en el material, dilo y ofrece una orientación general. Sé directo y útil para un estudiante universitario.";
    const user = `MATERIAL DE ESTUDIO:\n${context.slice(0, 30000)}\n\nPREGUNTA: ${question}`;
    return await chat(sys, user, cfg);
  } catch {
    // Sin IA: devuelve el fragmento más relevante del material
    const lower = question.toLowerCase();
    const lines = context.split("\n").filter((l) => l.trim());
    const relevant = lines.filter((l) => {
      const words = lower.split(/\s+/).filter((w) => w.length > 3);
      return words.some((w) => l.toLowerCase().includes(w));
    });
    const snippet = relevant.length > 0 ? relevant.slice(0, 6).join("\n") : lines.slice(0, 6).join("\n");
    return `📄 Fragmento relevante de tu material:\n${snippet}\n\n💡 Configura IA en Ajustes para una respuesta más completa.`;
  }
}

export async function summarizeMaterial(
  context: string,
  cfg: AiConfig
): Promise<string> {
  try {
    const sys =
      "Eres un tutor que resume material académico. Devuelve un resumen claro en español con: 1) Idea principal, 2) Puntos clave (viñetas), 3) Qué debo memorizar, 4) Posibles preguntas de examen. Sé conciso.";
    return await chat(sys, `Resume este material:\n\n${context.slice(0, 30000)}`, cfg);
  } catch {
    const lines = context.split("\n").filter((l) => l.trim()).slice(0, 10);
    return `📄 Resumen automático (configura IA para mejorar):\n\n• Primeras líneas del material:\n${lines.join("\n")}\n\n💡 Lee estas líneas y subraya lo importante.`;
  }
}

export async function studyRecommendations(
  notesText: string,
  courseNames: string[],
  cfg: AiConfig
): Promise<string> {
  try {
    const sys =
      "Eres un mentor de estudio. Analiza las notas del estudiante y recomienda qué le falta repasar, qué temas reforzar y próximos pasos. Sé motivador, concreto y en español.";
    const user = `CURSOS: ${courseNames.join(", ") || "sin cursos"}\n\nMIS NOTAS:\n${notesText.slice(0, 20000) || "(vacío)"}\n\n¿Qué me falta estudiar o reforzar? Dame recomendaciones concretas.`;
    return await chat(sys, user, cfg);
  } catch {
    return `📋 Recomendación:\n\n1. Revisa tus notas y marca lo que no entiendes\n2. Busca esos temas en el sílabo\n3. Haz un resumen con tus propias palabras\n4. Repasa 10 min cada día\n\n💡 Configura IA en Ajustes para recomendaciones personalizadas.`;
  }
}

// ── Profesor de curso ───────────────────────────────────────
export interface ProfessorTask {
  title: string;
  due: string;
  course: string;
}

/**
 * Brief del profesor: qué estudiar y qué tarea hacer ESTA semana.
 * Funciona CON y SIN IA configurada.
 */
export async function professorBrief(
  courseName: string,
  syllabus: string,
  tasks: ProfessorTask[],
  courseStartDate: string,
  currentDate: Date,
  cfg: AiConfig
): Promise<string> {
  const start = new Date(courseStartDate + "T00:00:00");
  const diffDays = Math.floor((currentDate.getTime() - start.getTime()) / 86400000);
  const week = Math.max(1, Math.floor(diffDays / 7) + 1);
  const fecha = currentDate.toLocaleDateString("es-PE", { weekday: "long", day: "numeric", month: "long" });

  const courseTasks = tasks.filter(
    (t) =>
      t.course.toLowerCase().includes(courseName.split(" ")[0].toLowerCase()) ||
      t.course === courseName
  );

  // Intentar con IA primero
  try {
    const sys = `Eres el PROFESOR de la asignatura "${courseName}". Actúas como un docente cercano y claro. Basándote SOLO en el sílabo y las tareas proporcionadas, le dices al estudiante EXACTAMENTE qué debe hacer esta semana. REGLA DE ORO: no te adelantes a temas de semanas futuras; enfócate solo en la semana actual (semana ${week}) y lo que vence pronto.`;
    const user = `HOY es ${fecha}. Estamos en la SEMANA ${week} del ciclo (empezó el ${courseStartDate}).

SÍLABO DEL CURSO:
${syllabus.slice(0, 20000) || "(aún no cargado — usa solo las tareas)"}

TAREAS DEL CURSO:
${courseTasks.length ? courseTasks.map((t) => `- ${t.title} → entrega ${t.due}`).join("\n") : "(sin tareas registradas)"}

Responde en español, breve y accionable, con este formato:
1. 📚 TEMA de esta semana (según el sílabo, semana ${week}).
2. ✅ QUÉ DEBO HACER (la tarea concreta y cómo abordarla).
3. ⏰ QUÉ VENCE y cuándo.
4. 💡 Consejo corto del profesor.`;
    return await chat(sys, user, cfg);
  } catch {
    // Sin IA: respuesta local basada en sílabo y tareas
    const lines = syllabus.split("\n").filter((l) => l.trim());
    // Buscar líneas que mencionen la semana actual
    const weekLines = lines.filter((l) => {
      const lower = l.toLowerCase();
      return (
        lower.includes(`semana ${week}`) ||
        lower.includes(`semana ${week}:`) ||
        lower.includes(` ${week})`) ||
        lower.includes(`(${week})`) ||
        lower.includes(` ${week} `)
      );
    });
    // Si no encontramos la semana exacta, usar las primeras líneas
    const contextLines =
      weekLines.length > 0
        ? weekLines.slice(0, 5).join("\n")
        : lines.slice(0, 8).join("\n");

    let response = `📅 ${fecha} · Semana ${week} (desde ${courseStartDate})\n\n`;
    response += `📚 TEMA de esta semana:\n${contextLines || "(Revisa tu sílabo completo para ver los temas de esta semana)"}\n\n`;

    if (courseTasks.length > 0) {
      response += `✅ QUÉ DEBO HACER:\n${courseTasks.map((t) => `• ${t.title}`).join("\n")}\n\n`;
      response += `⏰ VENCE:\n${courseTasks.map((t) => `• ${t.title} → ${t.due}`).join("\n")}\n\n`;
    } else {
      response += `✅ QUÉ DEBO HACER:\nRevisa el sílabo y avanza con los temas de la semana ${week}.\n\n`;
    }
    response += `💡 Consejo: Dedica 30 min diarios a repasar. La constancia supera a la intensidad.`;

    return response;
  }
}

// ── Explicar una tarea (guía del profesor) ──────────────────
export async function explainTask(
  taskTitle: string,
  taskDesc: string,
  courseName: string,
  syllabus: string,
  cfg: AiConfig
): Promise<string> {
  const contexto = syllabus ? syllabus.slice(0, 2000) : "Material del curso";

  try {
    const sys = `Eres un profesor experto de "${courseName}". Ayudas al estudiante a COMPLETAR una tarea. Sé claro, práctico y motivador. Responde en español.`;
    const user = `TAREA: ${taskTitle}
${taskDesc ? `DESCRIPCIÓN: ${taskDesc}\n` : ""}${syllabus ? `CONTEXTO DEL SÍLABO (relevante):\n${syllabus.slice(0, 6000)}\n` : ""}
Explícame en un plan accionable:
1. 🎯 QUÉ se pide exactamente (en una frase).
2. 📚 QUÉ necesito saber/repasar (conceptos clave).
3. ✅ PASOS concretos para completarla (4-6 pasos numerados).
4. 💡 Consejo del profesor para sacar buena nota.`;
    return await chat(sys, user, cfg);
  } catch {
    // Sin IA: guía genérica pero útil
    return `🎯 QUÉ SE PIDE:
"${taskTitle}" — ${taskDesc || "revisa las instrucciones completas en tu aula virtual"}.

📚 QUÉ NECESITAS SABER:
${contexto}

✅ PASOS PARA COMPLETARLA:
1. Lee las instrucciones completas e identifica el objetivo principal.
2. Reúne el material de estudio (sílabo, diapositivas, libro).
3. Investiga los conceptos clave en fuentes confiables.
4. Elabora un borrador siguiendo el formato solicitado.
5. Revisa, corrige y mejora tu trabajo.
6. Entrega antes de la fecha límite.

💡 CONSEJO DEL PROFESOR:
Empieza hoy con 20 minutos. Dividir el trabajo en sesiones cortas es más efectivo que hacerlo todo de una vez. Configura IA en Ajustes para una guía más personalizada.`;
  }
}

// ── Generadores de documentos ────────────────────────────────
export async function generatePdf(title: string, content: string): Promise<void> {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF();
  doc.setFontSize(18);
  doc.text(title, 14, 20);
  doc.setFontSize(11);
  const lines = doc.splitTextToSize(content, 180);
  doc.text(lines, 14, 30);
  doc.save(`${title.replace(/[^\w\s]/g, "").slice(0, 40) || "documento"}.pdf`);
}

export async function generateWord(title: string, content: string): Promise<void> {
  const { Document, Packer, Paragraph, HeadingLevel } = await import("docx");
  const doc = new Document({
    sections: [
      {
        children: [
          new Paragraph({ text: title, heading: HeadingLevel.HEADING_1 }),
          new Paragraph({ text: "" }),
          ...content.split("\n").map((p) => new Paragraph({ text: p })),
        ],
      },
    ],
  });
  const blob = await Packer.toBlob(doc);
  downloadBlob(blob, `${title.replace(/[^\w\s]/g, "").slice(0, 40) || "documento"}.docx`);
}

export async function generateExcel(
  title: string,
  rows: { [key: string]: string }[]
): Promise<void> {
  const XLSX = await import("xlsx");
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Hoja1");
  XLSX.writeFile(wb, `${title.replace(/[^\w\s]/g, "").slice(0, 40) || "tabla"}.xlsx`);
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
