/**
 * UI del brief de clase (apartado Cursos):
 *   · ClassBriefCard → resumen compacto (clase que viene: tema + pendiente).
 *   · ClassBriefSheet → ficha completa: tema, de qué trata, clase pasada,
 *     tarea pendiente y cómo empezar, con voz y acciones reales.
 */
import { useState } from "react";
import type { ClassBrief } from "../lib/classBrief";
import { meetingLabel } from "../lib/classBrief";
import Sheet from "./ui/Sheet";
import { toast } from "../stores/useToasts";
import { useStore } from "../stores/useStore";
import { cancelSpanishAudio, speakSpanishAudio } from "../lib/voice";
import { agentClipboard, agentOpenUrl, agentUtpConnect, agentUtpRefresh } from "../lib/desktop";
import { IconChat, IconCopy, IconExternal, IconPlay, IconPlus, IconRefresh, IconStop } from "./ui/Icons";
import { DAY_SHORT } from "../lib/dates";

export const CLASS_URL = "https://class.utp.edu.pe/";

/**
 * Reconecta UTP+class con un clic: el agente levanta el receptor local
 * (127.0.0.1:8899) y abre el aula + la página del botón "Sincronizar con HABITS".
 * Después sólo hay que pulsar ese botón dentro de UTP+class y volver a Leer.
 */
export async function connectUtpClass(): Promise<boolean> {
  toast("Abriendo UTP+class para reconectar…", "🔌");
  const result = await agentUtpConnect();
  if (!result?.ok) {
    toast("El agente local no respondió. Enciéndelo con scripts\\jarvis-agent.bat", "⚠️");
    return false;
  }
  const port = result.port ?? 8899;
  toast(`Listo: pulsa el botón "Sincronizar con HABITS" en UTP+class (receptor ${port})`, "🔌");
  return true;
}

/** Plan de la clase en texto plano (para copiar al portapapeles). */
export function briefPlanText(brief: ClassBrief): string {
  const lines = [
    `📚 ${brief.courseName} — Semana ${brief.week} de ${brief.totalWeeks}`,
    brief.meeting ? `🗓️ ${meetingLabel(brief.meeting)}` : "",
    brief.unitNo ? `🧩 Unidad ${brief.unitNo}: ${brief.unit}` : "",
    `🎯 Tema: ${brief.topic}`,
    "",
    `📖 De qué trata: ${brief.about}`,
    brief.previous
      ? `🔁 Clase pasada (semana ${brief.previous.week}): ${brief.previous.topics.join("; ") || brief.previous.mode}`
      : "",
    "",
    "✅ Cómo empezar:",
    ...brief.checklist.map((step, i) => `  ${i + 1}. ${step}`),
    brief.pending.length ? "" : "",
    ...brief.pending.map((p) => `⚠️ ${p.source === "tarea" ? "Tarea" : "Entrega"} (sem. ${p.week}): ${p.text}`)
  ];
  return lines.filter((line) => line !== "").join("\n");
}

/** Fecha límite razonable: el viernes de la semana de esa clase, o +7 días. */
export function briefDueDate(brief: ClassBrief): string {
  const base = brief.meeting ? new Date(`${brief.meeting.date}T12:00:00`) : new Date();
  const friday = new Date(base.getFullYear(), base.getMonth(), base.getDate());
  const shift = (5 - friday.getDay() + 7) % 7;
  friday.setDate(friday.getDate() + shift);
  const y = friday.getFullYear();
  const m = `${friday.getMonth() + 1}`.padStart(2, "0");
  const d = `${friday.getDate()}`.padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Tarjeta compacta: se usa arriba de Cursos y en cada curso del horario. */
export function ClassBriefCard({
  brief,
  onOpen,
  compact = false,
  needsConnect = false,
  onConnect
}: {
  brief: ClassBrief;
  onOpen: () => void;
  compact?: boolean;
  needsConnect?: boolean;
  onConnect?: () => void;
}) {
  const pending = brief.pending[0];
  return (
    <div className="card card-section" style={{ borderLeft: `3px solid var(--accent, #0A84FF)` }}>
      <div className="row-between">
        <div className="grow">
          <div className="list-title">{brief.courseName}</div>
          <div className="list-sub">
            {meetingLabel(brief.meeting)} · Semana {brief.week}
            {brief.unitNo ? ` · Unidad ${brief.unitNo}` : ""}
          </div>
        </div>
        <span className="badge badge-teal">{brief.modeLabel}</span>
      </div>
      <div className="mt-8" style={{ fontSize: 14, lineHeight: 1.4 }}>
        <strong>Tema:</strong> {brief.topic}
      </div>
      {!compact && (
        <div className="muted mt-8" style={{ fontSize: 13, lineHeight: 1.45 }}>
          {brief.about}
        </div>
      )}
      {brief.previous && !compact && (
        <div className="muted mt-8" style={{ fontSize: 13, lineHeight: 1.45 }}>
          🔁 Semana {brief.previous.week}: {brief.previous.topics.join("; ") || brief.previous.mode}
        </div>
      )}
      {pending && (
        <div className="mt-8" style={{ fontSize: 13, color: "var(--red, #FF3B30)", lineHeight: 1.45 }}>
          ⚠️ {pending.source === "tarea" ? "Tarea" : "Entrega"} (sem. {pending.week}): {pending.text}
        </div>
      )}
      {needsConnect && (
        <div className="mt-8" style={{ fontSize: 12, color: "var(--red, #FF3B30)", lineHeight: 1.4 }}>
          ⚠️ La sesión del aula venció: las tareas en vivo necesitan reconectar.
        </div>
      )}
      <div className="mt-16 row" style={{ gap: 8, flexWrap: "wrap" }}>
        <button className="btn btn-secondary btn-sm" onClick={onOpen}>
          <IconChat size={14} /> Qué tema toca y cómo empezar
        </button>
        {needsConnect && onConnect && (
          <button className="btn btn-primary btn-sm" onClick={onConnect}>
            <IconRefresh size={14} /> Conectar UTP+class (1 clic)
          </button>
        )}
      </div>
    </div>
  );
}

/** Ficha completa con voz y acciones (abrir aula, copiar plan, crear tarea). */
export function ClassBriefSheet({
  brief,
  open,
  onClose
}: {
  brief: ClassBrief | null;
  open: boolean;
  onClose: () => void;
}) {
  const [speaking, setSpeaking] = useState(false);
  const [needsConnect, setNeedsConnect] = useState(false);
  const addTask = useStore((s) => s.addTask);

  if (!brief) return null;

  const speak = async () => {
    cancelSpanishAudio();
    setSpeaking(true);
    const ok = await speakSpanishAudio(brief.speech);
    setSpeaking(false);
    if (!ok) toast("No pude cargar la voz neural. Revisa tu conexión e inténtalo otra vez.", "⚠️");
  };

  const stop = () => {
    cancelSpanishAudio();
    if (typeof window !== "undefined" && "speechSynthesis" in window) window.speechSynthesis.cancel();
    setSpeaking(false);
  };

  const copyPlan = async () => {
    const text = briefPlanText(brief);
    const agent = await agentClipboard(text);
    if (agent?.ok) {
      toast("Plan copiado al portapapeles", "📋");
      return;
    }
    try {
      await navigator.clipboard.writeText(text);
      toast("Plan copiado al portapapeles", "📋");
    } catch {
      toast("No pude copiar: revisa los permisos del navegador.", "⚠️");
    }
  };

  const openClass = async () => {
    const agent = await agentOpenUrl(CLASS_URL);
    if (agent?.ok) {
      toast("Abrí UTP+class en tu navegador", "🌐");
      return;
    }
    window.open(CLASS_URL, "_blank", "noopener");
  };

  const refreshFromUtp = async () => {
    toast("Leyendo UTP+class…", "🔄");
    const result = await agentUtpRefresh();
    if (!result?.ok && !result?.steps) {
      toast("El agente local no respondió. Enciéndelo con scripts\\jarvis-agent.bat", "⚠️");
      return;
    }
    setNeedsConnect(Boolean(result?.needs_connect));
    if (result?.needs_connect) {
      toast("Memoria del sílabo al día, pero la sesión del aula venció: pulsa Conectar UTP+class", "🔌");
      return;
    }
    toast(
      result?.live
        ? `Listo: sílabo + tareas en vivo desde UTP+class (semana ${result.current_week ?? brief.week})`
        : "Memoria de clases actualizada desde UTP+class",
      "✅"
    );
    window.setTimeout(() => window.location.reload(), 900);
  };

  const createTask = () => {
    const first = brief.pending[0];
    addTask({
      title: first?.text || `Avanzar ${brief.courseName}: ${brief.topic}`,
      description: briefPlanText(brief),
      courseId: brief.courseId || undefined,
      dueDate: briefDueDate(brief),
      priority: first?.source === "tarea" ? "alta" : "media",
      status: "pending",
      remind: true
    });
    toast("Tarea creada en Cursos → Mis tareas", "📝");
  };

  return (
    <Sheet open={open} title={`${brief.courseName} · Semana ${brief.week}`} onClose={onClose}>
      <div className="stack">
        <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
          <span className="badge badge-teal">{meetingLabel(brief.meeting)}</span>
          {brief.unitNo ? <span className="badge">Unidad {brief.unitNo}</span> : null}
          <span className="badge badge-purple">{brief.modeLabel}</span>
        </div>

        <div>
          <div className="field-label">🎯 Tema de la clase</div>
          <div style={{ fontSize: 15, lineHeight: 1.45 }}>{brief.topic}</div>
          {brief.weekTopics.length > 1 && (
            <div className="muted mt-8" style={{ fontSize: 13 }}>
              También esta semana: {brief.weekTopics.slice(1).join("; ")}
            </div>
          )}
        </div>

        <div>
          <div className="field-label">📖 De qué trata</div>
          <div style={{ fontSize: 14, lineHeight: 1.5 }}>{brief.about}</div>
        </div>

        <div>
          <div className="field-label">🔁 Clase pasada</div>
          <div style={{ fontSize: 14, lineHeight: 1.5 }}>
            {brief.previous
              ? `Semana ${brief.previous.week}: ${brief.previous.topics.join("; ") || brief.previous.mode}`
              : "Es la primera semana con registro en el sílabo."}
          </div>
        </div>

        <div>
          <div className="field-label">⚠️ Tarea pendiente</div>
          {brief.pending.length === 0 ? (
            <div className="muted" style={{ fontSize: 14 }}>
              Sin entregas pendientes de este curso en el sílabo.
            </div>
          ) : (
            <div className="stack" style={{ gap: 6 }}>
              {brief.pending.map((p) => (
                <div key={`${p.source}-${p.week}-${p.text}`} className="row" style={{ gap: 8, alignItems: "flex-start" }}>
                  <span style={{ fontSize: 13 }}>{p.source === "tarea" ? "📝" : "📦"}</span>
                  <span style={{ fontSize: 14, lineHeight: 1.45 }}>
                    <strong>Semana {p.week}:</strong> {p.text}
                    {p.due ? ` · vence ${p.due}` : ""}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div>
          <div className="field-label">✅ Cómo empezar</div>
          <div className="stack" style={{ gap: 6 }}>
            {brief.checklist.map((step, i) => (
              <div key={step} className="row" style={{ gap: 8, alignItems: "flex-start" }}>
                <span className="badge" style={{ minWidth: 22, justifyContent: "center" }}>{i + 1}</span>
                <span style={{ fontSize: 14, lineHeight: 1.45 }}>{step}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="stack mt-8" style={{ gap: 10 }}>
          {speaking ? (
            <button className="btn btn-secondary btn-block" onClick={stop}>
              <IconStop size={16} /> Detener la voz
            </button>
          ) : (
            <button className="btn btn-primary btn-block" onClick={speak}>
              <IconPlay size={16} /> Escuchar el brief de la clase
            </button>
          )}
          <div className="row" style={{ gap: 8 }}>
            <button className="btn btn-secondary btn-sm grow" onClick={openClass}>
              <IconExternal size={14} /> Abrir UTP+class
            </button>
            <button className="btn btn-secondary btn-sm grow" onClick={copyPlan}>
              <IconCopy size={14} /> Copiar plan
            </button>
          </div>
          <div className="row" style={{ gap: 8 }}>
            <button className="btn btn-secondary btn-sm grow" onClick={createTask}>
              <IconPlus size={14} /> Añadir a mis tareas
            </button>
            <button className="btn btn-secondary btn-sm grow" onClick={refreshFromUtp}>
              <IconRefresh size={14} /> Actualizar desde UTP
            </button>
          </div>
          {needsConnect && (
            <button className="btn btn-primary btn-sm btn-block" onClick={() => void connectUtpClass()}>
              <IconRefresh size={14} /> Conectar UTP+class (1 clic) — la sesión venció
            </button>
          )}
        </div>

        <div className="muted" style={{ fontSize: 12, lineHeight: 1.4 }}>
          Fuente: memoria de clases leída de UTP+class ({brief.syllabusName}) + tus tareas de Habits.
          Última lectura: {new Date().toLocaleDateString("es-PE", { day: "2-digit", month: "short" })} ·{" "}
          {DAY_SHORT[new Date().getDay()]}
        </div>
      </div>
    </Sheet>
  );
}
