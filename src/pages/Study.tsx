import { useMemo, useRef, useState } from "react";
import { useStore } from "../stores/useStore";
import { toast } from "../stores/useToasts";
import { aiConfigured } from "../lib/ai";
import {
  extractPdfText,
  askMaterial,
  summarizeMaterial,
  studyRecommendations,
  generatePdf,
  generateWord,
  generateExcel,
} from "../lib/study";
import { IconSparklesAI, IconUpload, IconChat, IconDoc } from "../components/ui/Icons";

interface ChatMsg {
  role: "user" | "assistant";
  text: string;
}

export default function Study() {
  const notes = useStore((s) => s.data.notes);
  const courses = useStore((s) => s.data.courses);
  const ai = useStore((s) => s.data.settings.ai);

  const [material, setMaterial] = useState<string>("");
  const [materialName, setMaterialName] = useState<string>("");
  const [chat, setChat] = useState<ChatMsg[]>([]);
  const [question, setQuestion] = useState("");
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState<"pdf" | "chat" | "docs" | "tips">("pdf");
  const fileRef = useRef<HTMLInputElement>(null);

  const ready = aiConfigured(ai);

  const notesText = useMemo(
    () =>
      notes
        .map((n) => `# ${n.title}\n${n.content}`)
        .join("\n\n"),
    [notes]
  );

  const courseNames = courses.map((c) => c.name);

  async function onPdf(file: File) {
    if (!ready) {
      toast("Configura tu IA en Ajustes primero", "⚠️");
      return;
    }
    setBusy(true);
    try {
      const text = await extractPdfText(file);
      setMaterial(text);
      setMaterialName(file.name);
      toast(`PDF leído: ${file.name}`, "📄");
      const summary = await summarizeMaterial(text, ai);
      setChat([{ role: "assistant", text: `📚 Resumen de ${file.name}:\n\n${summary}` }]);
      setTab("chat");
    } catch (e) {
      toast(`Error leyendo PDF: ${(e as Error).message}`, "⚠️");
    } finally {
      setBusy(false);
    }
  }

  async function ask() {
    const q = question.trim();
    if (!q || !material || busy) return;
    setBusy(true);
    setChat((c) => [...c, { role: "user", text: q }]);
    setQuestion("");
    try {
      const a = await askMaterial(q, material, ai);
      setChat((c) => [...c, { role: "assistant", text: a }]);
    } catch (e) {
      setChat((c) => [...c, { role: "assistant", text: "Error: " + (e as Error).message }]);
    } finally {
      setBusy(false);
    }
  }

  async function tips() {
    if (!ready) {
      toast("Configura tu IA en Ajustes primero", "⚠️");
      return;
    }
    setBusy(true);
    try {
      const r = await studyRecommendations(notesText, courseNames, ai);
      setChat((c) => [...c, { role: "assistant", text: r }]);
      setTab("chat");
    } catch (e) {
      toast("Error: " + (e as Error).message, "⚠️");
    } finally {
      setBusy(false);
    }
  }

  async function exportDoc(kind: "pdf" | "word" | "excel") {
    if (!notesText.trim()) {
      toast("No hay notas para exportar", "⚠️");
      return;
    }
    const title = "Mis Notas HABITS";
    try {
      if (kind === "pdf") await generatePdf(title, notesText);
      else if (kind === "word") await generateWord(title, notesText);
      else
        await generateExcel(
          "Notas por curso",
          notes.map((n) => ({
            Curso: courses.find((c) => c.id === n.courseId)?.name ?? "General",
            Título: n.title,
            Contenido: n.content,
          }))
        );
      toast("Documento generado", "📄");
    } catch (e) {
      toast("Error generando: " + (e as Error).message, "⚠️");
    }
  }

  return (
    <div className="page">
      <header className="page-header">
        <h1 className="page-title">Estudio</h1>
        <p className="page-subtitle">Lee PDFs, responde dudas y genera documentos</p>
      </header>

      {!ready && (
        <div className="card card-section" style={{ borderColor: "var(--orange)" }}>
          <div className="row">
            <IconSparklesAI size={20} style={{ color: "var(--orange)" }} />
            <div>
              <div className="list-title">IA no configurada</div>
              <div className="list-sub">Ve a Ajustes → Inteligencia Artificial y pon tu clave (DeepSeek/OpenAI).</div>
            </div>
          </div>
        </div>
      )}

      <div className="segmented mt-8">
        {[
          { id: "pdf", label: "📄 PDF" },
          { id: "chat", label: "💬 Preguntar" },
          { id: "docs", label: "📑 Exportar" },
          { id: "tips", label: "💡 Consejos" },
        ].map((t) => (
          <button key={t.id} className={tab === t.id ? "active" : ""} onClick={() => setTab(t.id as typeof tab)}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === "pdf" && (
        <div className="card card-section mt-16" style={{ textAlign: "center", padding: "32px 16px" }}>
          <div style={{ fontSize: 48 }}>📄</div>
          <div className="list-title mt-16">Sube un PDF para estudiarlo</div>
          <div className="list-sub">Jarvis leerá el contenido, te lo resumirá y podrás hacerle preguntas.</div>
          <input
            ref={fileRef}
            type="file"
            accept="application/pdf"
            style={{ display: "none" }}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void onPdf(f);
              e.target.value = "";
            }}
          />
          <button className="btn btn-primary btn-block mt-24" onClick={() => fileRef.current?.click()} disabled={busy}>
            <IconUpload size={16} /> {busy ? "Leyendo PDF…" : "Elegir PDF"}
          </button>
          {materialName && <p className="muted small mt-8">📎 {materialName} ({material.length} caracteres)</p>}
        </div>
      )}

      {tab === "chat" && (
        <div className="stack mt-16">
          {chat.length === 0 && (
            <div className="card">
              <p className="muted" style={{ textAlign: "center" }}>
                Sube un PDF o pide consejos, y conversa aquí con tu material.
              </p>
            </div>
          )}
          {chat.map((m, i) => (
            <div key={i} className={`card ${m.role === "assistant" ? "" : "card-solid"}`} style={m.role === "user" ? { background: "var(--accent-soft)" } : undefined}>
              <div className="list-sub" style={{ fontWeight: 600 }}>{m.role === "assistant" ? "🎓 Tutor" : "🙋 Tú"}</div>
              <div style={{ whiteSpace: "pre-wrap", marginTop: 6, lineHeight: 1.6 }}>{m.text}</div>
            </div>
          ))}
          <div className="row mt-8" style={{ gap: 8 }}>
            <input
              className="field grow"
              placeholder="Pregunta sobre tu material…"
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && void ask()}
              disabled={busy || !material}
            />
            <button className="btn btn-primary" onClick={() => void ask()} disabled={busy || !question.trim() || !material}>
              <IconChat size={16} />
            </button>
          </div>
          {!material && <p className="muted small mt-8">Primero sube un PDF en la pestaña 📄 PDF.</p>}
        </div>
      )}

      {tab === "docs" && (
        <div className="stack mt-16">
          <div className="card card-section">
            <div className="list-title">Exportar mis notas</div>
            <div className="list-sub">Genera documentos desde tus notas de HABITS.</div>
            <div className="row mt-16" style={{ gap: 8 }}>
              <button className="btn btn-secondary grow" onClick={() => void exportDoc("pdf")}>
                <IconDoc size={15} /> PDF
              </button>
              <button className="btn btn-secondary grow" onClick={() => void exportDoc("word")}>
                <IconDoc size={15} /> Word
              </button>
              <button className="btn btn-secondary grow" onClick={() => void exportDoc("excel")}>
                <IconDoc size={15} /> Excel
              </button>
            </div>
            <p className="muted small mt-8">Usa tus {notes.length} notas actuales.</p>
          </div>
        </div>
      )}

      {tab === "tips" && (
        <div className="card card-section mt-16" style={{ textAlign: "center", padding: "32px 16px" }}>
          <div style={{ fontSize: 48 }}>💡</div>
          <div className="list-title mt-16">¿Qué me falta estudiar?</div>
          <div className="list-sub">Analizo tus notas y cursos para recomendarte qué reforzar.</div>
          <button className="btn btn-primary btn-block mt-24" onClick={() => void tips()} disabled={busy}>
            {busy ? "Analizando…" : "Analizar mi progreso"}
          </button>
        </div>
      )}
    </div>
  );
}
