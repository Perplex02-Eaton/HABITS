import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useStore } from "../stores/useStore";
import { toast } from "../stores/useToasts";
import { aiConfigured } from "../lib/ai";
import { extractPdfText, professorBrief, askMaterial } from "../lib/study";
import { supabase } from "../lib/supabase";
import { IconSparklesAI, IconUpload, IconChat } from "../components/ui/Icons";

interface HermesTask {
  title: string;
  course: string;
  due_date: string;
  due_time: string | null;
}

const CICLO_START = "2026-08-10";

export default function CourseNotebook() {
  const { courseId } = useParams();
  const navigate = useNavigate();
  const courses = useStore((s) => s.data.courses);
  const ai = useStore((s) => s.data.settings.ai);
  const updateCourse = useStore((s) => s.updateCourse);

  const course = courses.find((c) => c.id === courseId);

  const [tasks, setTasks] = useState<HermesTask[]>([]);
  const [brief, setBrief] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [chatMsg, setChatMsg] = useState<{ role: string; text: string }[]>([]);
  const [question, setQuestion] = useState("");
  const [syllabusBusy, setSyllabusBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const ready = aiConfigured(ai);

  useEffect(() => {
    if (supabase) {
      supabase
        .from("hermes_tasks")
        .select("title,course,due_date,due_time")
        .order("due_date", { ascending: true })
        .then(({ data }) => setTasks((data as HermesTask[]) || []));
    }
  }, []);

  const courseKeyword = course ? course.name.split(" ")[0].toLowerCase() : "";
  const courseTasks = useMemo(
    () =>
      tasks.filter(
        (t) =>
          t.course.toLowerCase().includes(courseKeyword) ||
          t.course === course?.name
      ),
    [tasks, courseKeyword, course]
  );

  if (!course) {
    return (
      <div className="page">
        <header className="page-header">
          <h1 className="page-title">Cuaderno</h1>
        </header>
        <div className="card"><p className="muted">Curso no encontrado.</p></div>
      </div>
    );
  }

  async function loadBrief() {
    if (!ready) {
      toast("Configura tu IA en Ajustes primero", "⚠️");
      return;
    }
    setBusy(true);
    try {
      const b = await professorBrief(
        course!.name,
        course!.syllabus || "",
        courseTasks.map((t) => ({ title: t.title, due: `${t.due_date} ${t.due_time || ""}`, course: t.course })),
        CICLO_START,
        new Date(),
        ai
      );
      setBrief(b);
    } catch (e) {
      toast("Error: " + (e as Error).message, "⚠️");
    } finally {
      setBusy(false);
    }
  }

  async function uploadSyllabus(file: File) {
    setSyllabusBusy(true);
    try {
      const text = await extractPdfText(file);
      updateCourse(course!.id, { syllabus: text, syllabusName: file.name });
      toast("Sílabo leído: " + file.name, "📄");
    } catch (e) {
      toast("Error leyendo sílabo: " + (e as Error).message, "⚠️");
    } finally {
      setSyllabusBusy(false);
    }
  }

  async function ask() {
    const q = question.trim();
    if (!q || !ready || busy) return;
    const ctx = course!.syllabus || courseTasks.map((t) => t.title).join("\n") || "sin material";
    setBusy(true);
    setChatMsg((c) => [...c, { role: "user", text: q }]);
    setQuestion("");
    try {
      const a = await askMaterial(q, ctx, ai);
      setChatMsg((c) => [...c, { role: "assistant", text: a }]);
    } catch (e) {
      setChatMsg((c) => [...c, { role: "assistant", text: "Error: " + (e as Error).message }]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="page">
      <header className="page-header">
        <button className="btn-icon" onClick={() => navigate(-1)} style={{ marginBottom: 8 }}>←</button>
        <h1 className="page-title" style={{ color: course.color }}>📓 {course.name}</h1>
        <p className="page-subtitle">{course.code ? `Código ${course.code} · ` : ""}Cuaderno de estudio</p>
      </header>

      {!ready && (
        <div className="card card-section" style={{ borderColor: "var(--orange)" }}>
          <div className="row">
            <IconSparklesAI size={20} style={{ color: "var(--orange)" }} />
            <div>
              <div className="list-title">IA no configurada</div>
              <div className="list-sub">Ajustes → Inteligencia Artificial → pon tu clave (DeepSeek/OpenAI).</div>
            </div>
          </div>
        </div>
      )}

      {/* Profesor: qué hacer esta semana */}
      <div className="card card-section mt-8" style={{ background: "var(--accent-soft)" }}>
        <div className="row-between">
          <div className="row">
            <span style={{ fontSize: 24 }}>👨‍🏫</span>
            <div>
              <div className="list-title">Tu profesor de {course.name.split(" ")[0]}</div>
              <div className="list-sub">Te dice qué estudiar y qué hacer esta semana (sin adelantarse).</div>
            </div>
          </div>
        </div>
        <button className="btn btn-primary btn-block mt-16" onClick={loadBrief} disabled={busy || !ready}>
          {busy ? "Consultando al profesor…" : "¿Qué hago esta semana?"}
        </button>
        {brief && (
          <div className="card mt-12" style={{ whiteSpace: "pre-wrap", lineHeight: 1.6 }}>{brief}</div>
        )}
      </div>

      {/* Sílabo */}
      <div className="card card-section mt-16">
        <div className="row-between">
          <div>
            <div className="list-title">📄 Sílabo del curso</div>
            <div className="list-sub">{course.syllabusName || "Aún no cargado"}</div>
          </div>
        </div>
        {!course.syllabus ? (
          <>
            <input
              ref={fileRef}
              type="file"
              accept="application/pdf"
              style={{ display: "none" }}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void uploadSyllabus(f);
                e.target.value = "";
              }}
            />
            <button className="btn btn-secondary btn-block mt-12" onClick={() => fileRef.current?.click()} disabled={syllabusBusy}>
              <IconUpload size={16} /> {syllabusBusy ? "Leyendo sílabo…" : "Subir sílabo (PDF)"}
            </button>
          </>
        ) : (
          <p className="muted small mt-8">✅ Sílabo cargado ({course.syllabus.length} caracteres). El profesor ya lo conoce.</p>
        )}
      </div>

      {/* Tareas del curso */}
      <div className="card card-section mt-16">
        <div className="list-title">📋 Tareas de {course.name.split(" ")[0]}</div>
        {courseTasks.length === 0 ? (
          <p className="muted small mt-8">Sin tareas registradas para este curso.</p>
        ) : (
          courseTasks.map((t, i) => (
            <div key={i} className="list-item">
              <div className="grow">
                <div className="list-title">{t.title}</div>
                <div className="list-sub">Entrega: {t.due_date} {t.due_time?.slice(0, 5) || ""}</div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Chat con el profesor */}
      <div className="card card-section mt-16">
        <div className="list-title">💬 Pregunta a tu profesor</div>
        <div className="stack mt-12">
          {chatMsg.map((m, i) => (
            <div key={i} className="card" style={m.role === "user" ? { background: "var(--accent-soft)" } : undefined}>
              <div className="list-sub" style={{ fontWeight: 600 }}>{m.role === "assistant" ? "👨‍🏫 Profesor" : "🙋 Tú"}</div>
              <div style={{ whiteSpace: "pre-wrap", marginTop: 4, lineHeight: 1.5 }}>{m.text}</div>
            </div>
          ))}
          <div className="row" style={{ gap: 8 }}>
            <input
              className="field grow"
              placeholder="Pregunta sobre tu curso…"
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && void ask()}
              disabled={busy || !ready}
            />
            <button className="btn btn-primary" onClick={ask} disabled={busy || !question.trim() || !ready}>
              <IconChat size={16} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
