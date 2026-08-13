/**
 * study.ts — Asistente de Estudio para Jarvis/HABITS
 * -------------------------------------------------
 * - Extrae texto de PDFs (pdf.js)
 * - Responde preguntas sobre el material (LLM vía ai.ts)
 * - Genera documentos Word (.docx), Excel (.xlsx) y PDF (.pdf)
 * - Analiza notas + cursos y da recomendaciones ("qué te falta")
 */
import type { AiConfig } from "./types";

// ── LLM (reutiliza el config de ai.ts) ──────────────────────
async function chat(
  system: string,
  user: string,
  cfg: AiConfig
): Promise<string> {
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
  const sys =
    "Eres un tutor académico experto y claro. Responde en español basándote SOLO en el material proporcionado. Si la respuesta no está en el material, dilo y ofrece una orientación general. Sé directo y útil para un estudiante universitario.";
  const user = `MATERIAL DE ESTUDIO:\n${context.slice(0, 30000)}\n\nPREGUNTA: ${question}`;
  return chat(sys, user, cfg);
}

export async function summarizeMaterial(
  context: string,
  cfg: AiConfig
): Promise<string> {
  const sys =
    "Eres un tutor que resume material académico. Devuelve un resumen claro en español con: 1) Idea principal, 2) Puntos clave (viñetas), 3) Qué debo memorizar, 4) Posibles preguntas de examen. Sé conciso.";
  return chat(sys, `Resume este material:\n\n${context.slice(0, 30000)}`, cfg);
}

export async function studyRecommendations(
  notesText: string,
  courseNames: string[],
  cfg: AiConfig
): Promise<string> {
  const sys =
    "Eres un mentor de estudio. Analiza las notas del estudiante y recomienda qué le falta repasar, qué temas reforzar y próximos pasos. Sé motivador, concreto y en español.";
  const user = `CURSOS: ${courseNames.join(", ") || "sin cursos"}\n\nMIS NOTAS:\n${notesText.slice(0, 20000) || "(vacío)"}\n\n¿Qué me falta estudiar o reforzar? Dame recomendaciones concretas.`;
  return chat(sys, user, cfg);
}

// ── Profesor de curso (respeta la semana actual) ─────────────
export interface ProfessorTask {
  title: string;
  due: string;
  course: string;
}

/**
 * Breve del profesor: qué estudiar y qué tarea hacer ESTA semana,
 * sin adelantarse a los temas futuros del sílabo.
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

  const courseTasks = tasks.filter((t) => t.course.toLowerCase().includes(courseName.split(" ")[0].toLowerCase()) || t.course === courseName);

  const sys = `Eres el PROFESOR de la asignatura "${courseName}". Actúas como un docente cercano y claro. Basándote SOLO en el sílabo y las tareas proporcionadas, le dices al estudiante EXACTAMENTE qué debe hacer esta semana. REGLA DE ORO: no te adelantes a temas de semanas futuras; enfócate solo en la semana actual (semana ${week}) y lo que vence pronto.`;
  const user = `HOY es ${currentDate.toLocaleDateString("es-PE", { weekday: "long", day: "numeric", month: "long" })}. Estamos en la SEMANA ${week} del ciclo (empezó el ${courseStartDate}).

SÍLABO DEL CURSO:
${syllabus.slice(0, 20000) || "(aún no cargado — usa solo las tareas)"}

TAREAS DEL CURSO:
${courseTasks.length ? courseTasks.map((t) => `- ${t.title} → entrega ${t.due}`).join("\n") : "(sin tareas registradas)"}

Responde en español, breve y accionable, con este formato:
1. 📚 TEMA de esta semana (según el sílabo, semana ${week}).
2. ✅ QUÉ DEBO HACER (la tarea concreta y cómo abordarla).
3. ⏰ QUÉ VENCE y cuándo.
4. 💡 Consejo corto del profesor.`;
  return chat(sys, user, cfg);
}

// ── Generación de documentos ────────────────────────────────
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
