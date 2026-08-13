import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useStore } from "../stores/useStore";
import type { Task, Priority, Subtask, Course } from "../lib/types";
import { uid } from "../lib/uid";
import { toast } from "../stores/useToasts";
import { todayKey, relativeDue } from "../lib/dates";
import { useHermesTasks } from "../lib/hermesTasks";
import { aiConfigured } from "../lib/ai";
import { explainTask } from "../lib/study";
import Sheet from "../components/ui/Sheet";
import Empty from "../components/ui/Empty";
import ConfirmSheet from "../components/ui/ConfirmSheet";
import Switch from "../components/ui/Switch";
import {
  IconPlus,
  IconTrash,
  IconCheck,
  IconPencil,
  IconSparklesAI,
  IconChevron
} from "../components/ui/Icons";

const PRIORITIES: { value: Priority; label: string; color: string }[] = [
  { value: "alta", label: "Alta", color: "#FF3B30" },
  { value: "media", label: "Media", color: "#FF9500" },
  { value: "baja", label: "Baja", color: "#30B0C7" }
];

const FILTERS = [
  { value: "pending", label: "Pendientes" },
  { value: "today", label: "De hoy" },
  { value: "done", label: "Hechas" },
  { value: "all", label: "Todas" }
] as const;

type Filter = (typeof FILTERS)[number]["value"];

interface TaskDraft {
  task: Task;
}

export default function Tasks() {
  const tasks = useStore((s) => s.data.tasks);
  const courses = useStore((s) => s.data.courses);
  const ai = useStore((s) => s.data.settings.ai);
  const addTask = useStore((s) => s.addTask);
  const updateTask = useStore((s) => s.updateTask);
  const deleteTask = useStore((s) => s.deleteTask);
  const { hermesTasks } = useHermesTasks();
  const navigate = useNavigate();

  const allTasks = useMemo(() => [...tasks, ...hermesTasks], [tasks, hermesTasks]);

  const [filter, setFilter] = useState<Filter>("pending");
  const [draft, setDraft] = useState<TaskDraft | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [explaining, setExplaining] = useState<string | null>(null);
  const [explanation, setExplanation] = useState<{ id: string; text: string } | null>(null);

  const today = todayKey();
  const ready = aiConfigured(ai);

  const courseOf = (t: Task) => {
    if (t.courseId) return courses.find((c) => c.id === t.courseId);
    return courses.find((c) => t.title.toLowerCase().includes(c.name.split(" ")[0].toLowerCase()));
  };

  const filtered = useMemo(() => {
    const sorted = [...allTasks].sort((a, b) => {
      if (a.status !== b.status) return a.status === "pending" ? -1 : 1;
      const ad = `${a.dueDate}${a.dueTime || "99:99"}`;
      const bd = `${b.dueDate}${b.dueTime || "99:99"}`;
      return ad.localeCompare(bd);
    });
    switch (filter) {
      case "pending":
        return sorted.filter((t) => t.status === "pending");
      case "today":
        return sorted.filter((t) => t.dueDate === today);
      case "done":
        return sorted.filter((t) => t.status === "done");
      default:
        return sorted;
    }
  }, [allTasks, filter, today]);

  const startNew = (): TaskDraft => ({
    task: {
      id: uid(),
      title: "",
      description: "",
      dueDate: today,
      dueTime: "",
      priority: "media",
      status: "pending",
      remind: true,
      subtasks: [],
      createdAt: Date.now()
    }
  });

  const toggleTask = (t: Task) => {
    updateTask(t.id, { status: t.status === "done" ? "pending" : "done" });
  };

  const toggleSubtask = (taskId: string, subId: string) => {
    const t = allTasks.find((x) => x.id === taskId);
    if (!t) return;
    const subs = (t.subtasks || []).map((s) => (s.id === subId ? { ...s, done: !s.done } : s));
    updateTask(taskId, { subtasks: subs });
  };

  const addSubtask = (taskId: string, text: string) => {
    const t = allTasks.find((x) => x.id === taskId);
    if (!t) return;
    const subs = [...(t.subtasks || []), { id: uid(), text, done: false }];
    updateTask(taskId, { subtasks: subs });
  };

  async function askProfessor(t: Task) {
    if (!ready) {
      toast("Configura tu IA en Ajustes", "⚠️");
      return;
    }
    setExplaining(t.id);
    setExplanation({ id: t.id, text: "" });
    try {
      const c = courseOf(t);
      const a = await explainTask(
        t.title,
        t.description || "",
        c?.name || "tu curso",
        c?.syllabus || "",
        ai
      );
      setExplanation({ id: t.id, text: a });
    } catch (e) {
      setExplanation({ id: t.id, text: "Error: " + (e as Error).message });
      toast("No pude consultar al profesor", "⚠️");
    } finally {
      setExplaining(null);
    }
  }

  const progress = (t: Task) => {
    const subs = t.subtasks || [];
    if (subs.length === 0) return null;
    return Math.round((subs.filter((s) => s.done).length / subs.length) * 100);
  };

  return (
    <div className="page">
      <header className="page-header">
        <div className="row-between">
          <div>
            <h1 className="page-title">Tareas</h1>
            <p className="page-subtitle">Tu espacio para hacerlas, no solo anotarlas</p>
          </div>
          <button className="btn btn-primary btn-icon" onClick={() => setDraft(startNew())} aria-label="Nueva tarea">
            <IconPlus size={22} />
          </button>
        </div>
      </header>

      <div className="segmented mt-8" style={{ overflowX: "auto" }}>
        {FILTERS.map((f) => (
          <button key={f.value} className={f.value === filter ? "active" : ""} onClick={() => setFilter(f.value)}>
            {f.label}
          </button>
        ))}
      </div>

      <div className="stack mt-16">
        {filtered.length === 0 ? (
          <div className="card">
            <Empty icon="✅" title="Nada aquí" subtitle="Toca + para crear una tarea, o espera a que Hermes sincronice las de UTP" />
          </div>
        ) : (
          filtered.map((t) => {
            const c = courseOf(t);
            const prog = progress(t);
            const isOpen = expanded === t.id;
            return (
              <div className="card card-section reveal" key={t.id}>
                <div className="row" onClick={() => setExpanded(isOpen ? null : t.id)} style={{ cursor: "pointer" }}>
                  <button
                    className="checkbox"
                    style={{ borderColor: t.status === "done" ? "var(--accent)" : "var(--separator)", background: t.status === "done" ? "var(--accent)" : "transparent" }}
                    onClick={(e) => { e.stopPropagation(); toggleTask(t); }}
                  >
                    {t.status === "done" && <IconCheck size={14} style={{ color: "#fff" }} />}
                  </button>
                  <div className="grow" style={{ minWidth: 0 }}>
                    <div className="list-title" style={{ textDecoration: t.status === "done" ? "line-through" : "none", opacity: t.status === "done" ? 0.55 : 1 }}>
                      {t.title}
                    </div>
                    <div className="list-sub row" style={{ gap: 8, flexWrap: "wrap" }}>
                      {c && <span style={{ color: c.color, fontWeight: 600 }}>{c.name.split(" ")[0]}</span>}
                      <span>{relativeDue(t.dueDate, t.dueTime)}</span>
                      {t.dueDate === today && t.status === "pending" && (
                        <span className="badge badge-red">hoy</span>
                      )}
                    </div>
                  </div>
                  <span className="badge" style={{ background: PRIORITIES.find((p) => p.value === t.priority)?.color + "22", color: PRIORITIES.find((p) => p.value === t.priority)?.color }}>
                    {PRIORITIES.find((p) => p.value === t.priority)?.label}
                  </span>
                  <IconChevron size={16} style={{ color: "var(--label-tertiary)", transform: isOpen ? "rotate(90deg)" : "none", transition: "transform .2s" }} />
                </div>

                {prog !== null && (
                  <div className="mt-8" style={{ height: 4, background: "var(--separator)", borderRadius: 99, overflow: "hidden" }}>
                    <div style={{ width: `${prog}%`, height: "100%", background: c?.color || "var(--accent)", transition: "width .3s" }} />
                  </div>
                )}

                {isOpen && (
                  <div className="mt-12" style={{ borderTop: "1px solid var(--separator)", paddingTop: 12 }}>
                    {t.description && <p className="muted small" style={{ whiteSpace: "pre-wrap" }}>{t.description}</p>}

                    {/* Subtareas */}
                    {(t.subtasks || []).map((s: Subtask) => (
                      <div className="row" key={s.id} style={{ gap: 8, padding: "6px 0" }} onClick={() => toggleSubtask(t.id, s.id)}>
                        <button className="checkbox" style={{ borderColor: s.done ? "var(--accent)" : "var(--separator)", background: s.done ? "var(--accent)" : "transparent" }}>
                          {s.done && <IconCheck size={12} style={{ color: "#fff" }} />}
                        </button>
                        <span className="small" style={{ textDecoration: s.done ? "line-through" : "none", opacity: s.done ? 0.5 : 1 }}>{s.text}</span>
                      </div>
                    ))}
                    <SubtaskInput onAdd={(text) => addSubtask(t.id, text)} />

                    {/* Acciones */}
                    <div className="row mt-12" style={{ gap: 8, flexWrap: "wrap" }}>
                      <button className="btn btn-primary" style={{ flex: 1 }} onClick={() => askProfessor(t)} disabled={explaining === t.id || !ready}>
                        <IconSparklesAI size={15} /> {explaining === t.id ? "Consultando…" : "¿Cómo la hago?"}
                      </button>
                      <button className="btn btn-secondary btn-icon" onClick={() => { const c = courseOf(t); if (c) navigate(`/cuaderno/${c.id}`); }} title="Abrir cuaderno">
                        📓
                      </button>
                      <button className="btn btn-secondary btn-icon" onClick={() => setDraft({ task: t })} title="Editar">
                        <IconPencil size={16} />
                      </button>
                      <button className="btn btn-secondary btn-icon" onClick={() => setConfirmDelete(t.id)} title="Eliminar" style={{ color: "var(--red)" }}>
                        <IconTrash size={16} />
                      </button>
                    </div>

                    {explanation?.id === t.id && explanation.text && (
                      <div className="card mt-12" style={{ background: "var(--accent-soft)", whiteSpace: "pre-wrap", lineHeight: 1.6, fontSize: 13 }}>
                        {explanation.text}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      <Sheet open={draft !== null} title={draft?.task.title ? "Editar tarea" : "Nueva tarea"} onClose={() => setDraft(null)}>
        {draft && <TaskForm draft={draft} courses={courses} onSave={(t) => { draft.task.title ? updateTask(t.id, t) : addTask(t); setDraft(null); toast("Tarea guardada", "✅"); }} />}
      </Sheet>

      <ConfirmSheet
        open={confirmDelete !== null}
        title="¿Eliminar tarea?"
        message="Esta acción no se puede deshacer."
        confirmLabel="Eliminar"
        onCancel={() => setConfirmDelete(null)}
        onConfirm={() => { if (confirmDelete) { deleteTask(confirmDelete); setConfirmDelete(null); toast("Tarea eliminada", "🗑️"); } }}
      />
    </div>
  );
}

function SubtaskInput({ onAdd }: { onAdd: (text: string) => void }) {
  const [text, setText] = useState("");
  return (
    <div className="row mt-4" style={{ gap: 6 }}>
      <input
        className="field grow"
        placeholder="+ Agregar paso…"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter" && text.trim()) { onAdd(text.trim()); setText(""); } }}
      />
    </div>
  );
}

function TaskForm({ draft, courses, onSave }: { draft: TaskDraft; courses: Course[]; onSave: (t: Task) => void }) {
  const [t, setT] = useState<Task>({ ...draft.task, subtasks: draft.task.subtasks || [] });
  return (
    <div className="stack mt-16">
      <div className="field-group">
        <label className="field-label">Título</label>
        <input className="field" value={t.title} onChange={(e) => setT({ ...t, title: e.target.value })} placeholder="Ej: Tarea grupal S01" autoFocus />
      </div>
      <div className="field-group">
        <label className="field-label">Descripción / instrucciones</label>
        <textarea className="field" rows={3} value={t.description || ""} onChange={(e) => setT({ ...t, description: e.target.value })} placeholder="Qué pide la tarea…" />
      </div>
      <div className="field-group">
        <label className="field-label">Curso</label>
        <select className="field" value={t.courseId || ""} onChange={(e) => setT({ ...t, courseId: e.target.value || undefined })}>
          <option value="">Sin curso</option>
          {courses.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </div>
      <div className="row" style={{ gap: 12 }}>
        <div className="field-group grow">
          <label className="field-label">Fecha</label>
          <input className="field" type="date" value={t.dueDate} onChange={(e) => setT({ ...t, dueDate: e.target.value })} />
        </div>
        <div className="field-group" style={{ width: 110 }}>
          <label className="field-label">Hora</label>
          <input className="field" type="time" value={t.dueTime || ""} onChange={(e) => setT({ ...t, dueTime: e.target.value })} />
        </div>
      </div>
      <div className="field-group">
        <label className="field-label">Prioridad</label>
        <div className="segmented">
          {PRIORITIES.map((p) => (
            <button key={p.value} className={t.priority === p.value ? "active" : ""} onClick={() => setT({ ...t, priority: p.value })}>{p.label}</button>
          ))}
        </div>
      </div>
      <div className="row-between mt-8">
        <span className="field-label">Recordarme</span>
        <Switch on={t.remind} onChange={(v) => setT({ ...t, remind: v })} />
      </div>
      <button className="btn btn-primary btn-block mt-16" disabled={!t.title.trim()} onClick={() => onSave(t)}>Guardar tarea</button>
    </div>
  );
}
