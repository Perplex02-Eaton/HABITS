import { useMemo, useState } from "react";
import { useStore } from "../stores/useStore";
import type { Task, Priority } from "../lib/types";
import { uid } from "../lib/uid";
import { toast } from "../stores/useToasts";
import { todayKey, relativeDue } from "../lib/dates";
import { useHermesTasks } from "../lib/hermesTasks";
import Sheet from "../components/ui/Sheet";
import Empty from "../components/ui/Empty";
import ConfirmSheet from "../components/ui/ConfirmSheet";
import Switch from "../components/ui/Switch";
import { IconPlus, IconTrash, IconCheck, IconPencil, IconBell } from "../components/ui/Icons";

const PRIORITIES: { value: Priority; label: string; badge: string }[] = [
  { value: "alta", label: "Alta", badge: "badge-red" },
  { value: "media", label: "Media", badge: "badge-orange" },
  { value: "baja", label: "Baja", badge: "badge-teal" }
];

const FILTERS = [
  { value: "pending", label: "Pendientes" },
  { value: "today", label: "De hoy" },
  { value: "done", label: "Completadas" },
  { value: "all", label: "Todas" }
] as const;

type Filter = (typeof FILTERS)[number]["value"];

interface TaskDraft {
  task: Task;
}

export default function Tasks() {
  const tasks = useStore((s) => s.data.tasks);
  const courses = useStore((s) => s.data.courses);
  const addTask = useStore((s) => s.addTask);
  const updateTask = useStore((s) => s.updateTask);
  const deleteTask = useStore((s) => s.deleteTask);
  const { hermesTasks } = useHermesTasks();

  // Merge local tasks with Hermes tasks
  const allTasks = useMemo(() => [...tasks, ...hermesTasks], [tasks, hermesTasks]);

  const [filter, setFilter] = useState<Filter>("pending");
  const [draft, setDraft] = useState<TaskDraft | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const today = todayKey();

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
      createdAt: Date.now()
    }
  });

  const save = () => {
    if (!draft) return;
    if (!draft.task.title.trim()) {
      toast("Escribe el título de la tarea", "📝");
      return;
    }
    const patch = {
      title: draft.task.title.trim(),
      description: draft.task.description?.trim() || undefined,
      courseId: draft.task.courseId || undefined,
      dueDate: draft.task.dueDate,
      dueTime: draft.task.dueTime || undefined,
      priority: draft.task.priority,
      remind: draft.task.remind,
      status: draft.task.status
    };
    const existing = tasks.find((t) => t.id === draft.task.id);
    if (existing) {
      updateTask(draft.task.id, patch);
      toast("Tarea actualizada", "✏️");
    } else {
      addTask(patch);
      toast("Tarea agregada" + (draft.task.remind ? " · te avisaré" : ""), "✅");
    }
    setDraft(null);
  };

  const toggleDone = (t: Task) => {
    updateTask(t.id, { status: t.status === "done" ? "pending" : "done" });
  };

  const overdue = (t: Task) => t.status === "pending" && t.dueDate < today;

  return (
    <div className="page">
      <header className="page-header">
        <div className="row-between">
          <div>
            <h1 className="page-title">Tareas</h1>
            <p className="page-subtitle">Trabajos de la universidad y pendientes</p>
          </div>
          <button className="btn btn-primary btn-icon" onClick={() => setDraft(startNew())} aria-label="Nueva tarea">
            <IconPlus size={22} />
          </button>
        </div>
      </header>

      <div className="segmented mt-8">
        {FILTERS.map((f) => (
          <button key={f.value} className={filter === f.value ? "active" : ""} onClick={() => setFilter(f.value)}>
            {f.label}
          </button>
        ))}
      </div>

      <div className="stack mt-24">
        {filtered.length === 0 ? (
          <div className="card">
            <Empty icon="📝" title="Sin tareas aquí" subtitle="Agrega tus trabajos y la app te recordará entregarlos" />
          </div>
        ) : (
          filtered.map((t, idx) => {
            const course = courses.find((c) => c.id === t.courseId);
            const done = t.status === "done";
            return (
              <div
                className="card card-section reveal"
                key={t.id}
                style={{
                  transitionDelay: `${Math.min(idx, 8) * 40}ms`,
                  opacity: done ? 0.7 : 1
                }}
              >
                <div className="row">
                  <button
                    className="btn-icon"
                    style={
                      done
                        ? { background: "var(--green-soft)", color: "var(--green)" }
                        : { background: "var(--fill)", color: "var(--label-tertiary)" }
                    }
                    onClick={() => toggleDone(t)}
                    aria-label="Completar"
                  >
                    <IconCheck size={18} />
                  </button>
                  <div className="grow">
                    <div className="list-title" style={done ? { textDecoration: "line-through" } : undefined}>
                      {t.title}
                    </div>
                    <div className="list-sub">
                      {relativeDue(t.dueDate, t.dueTime)}
                      {overdue(t) && " · vencida"}
                    </div>
                    {t.description && <div className="muted small mt-8">{t.description}</div>}
                  </div>
                  <button className="btn-icon" style={{ color: "var(--label-tertiary)" }} onClick={() => setDraft({ task: { ...t } })}>
                    <IconPencil size={16} />
                  </button>
                </div>
                <div className="row mt-16" style={{ gap: 8, flexWrap: "wrap" }}>
                  <span className={`badge ${PRIORITIES.find((p) => p.value === t.priority)?.badge}`}>
                    {PRIORITIES.find((p) => p.value === t.priority)?.label}
                  </span>
                  {course && <span className="badge badge-blue">{course.name}</span>}
                  {t.remind && !done && (
                    <span className="badge">
                      <IconBell size={12} /> Recordatorio
                    </span>
                  )}
                  <button
                    className="btn btn-danger btn-sm"
                    style={{ marginLeft: "auto" }}
                    onClick={() => setConfirmDelete(t.id)}
                  >
                    <IconTrash size={13} />
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>

      <Sheet open={draft !== null} title={tasks.some((t) => t.id === draft?.task.id) ? "Editar tarea" : "Nueva tarea"} onClose={() => setDraft(null)}>
        {draft && (
          <div>
            <div className="field-group">
              <label className="field-label">Título *</label>
              <input
                className="field"
                placeholder="Ej. Ensayo de macroeconomía"
                value={draft.task.title}
                onChange={(e) => setDraft({ ...draft, task: { ...draft.task, title: e.target.value } })}
              />
            </div>
            <div className="field-group">
              <label className="field-label">Descripción</label>
              <textarea
                className="field"
                placeholder="Instrucciones o detalles"
                value={draft.task.description}
                onChange={(e) => setDraft({ ...draft, task: { ...draft.task, description: e.target.value } })}
              />
            </div>
            {courses.length > 0 && (
              <div className="field-group">
                <label className="field-label">Curso</label>
                <div className="select-wrap">
                  <select
                    className="field"
                    value={draft.task.courseId ?? ""}
                    onChange={(e) => setDraft({ ...draft, task: { ...draft.task, courseId: e.target.value || undefined } })}
                  >
                    <option value="">Sin curso</option>
                    {courses.map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>
              </div>
            )}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 14 }}>
              <div className="field-group">
                <label className="field-label">Fecha de entrega</label>
                <input
                  type="date"
                  className="field"
                  value={draft.task.dueDate}
                  onChange={(e) => setDraft({ ...draft, task: { ...draft.task, dueDate: e.target.value } })}
                />
              </div>
              <div className="field-group">
                <label className="field-label">Hora (opcional)</label>
                <input
                  type="time"
                  className="field"
                  value={draft.task.dueTime}
                  onChange={(e) => setDraft({ ...draft, task: { ...draft.task, dueTime: e.target.value } })}
                />
              </div>
            </div>
            <div className="field-group">
              <label className="field-label">Prioridad</label>
              <div className="chips">
                {PRIORITIES.map((p) => (
                  <button
                    key={p.value}
                    className={`chip ${draft.task.priority === p.value ? "active" : ""}`}
                    onClick={() => setDraft({ ...draft, task: { ...draft.task, priority: p.value } })}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="row-between mt-16">
              <div className="row">
                <IconBell size={18} style={{ color: "var(--label-secondary)" }} />
                <div>
                  <div style={{ fontWeight: 500, fontSize: 15 }}>Recordarme</div>
                  <div className="list-sub">Notificación cuando se acerque la fecha</div>
                </div>
              </div>
              <Switch on={draft.task.remind} onChange={(v) => setDraft({ ...draft, task: { ...draft.task, remind: v } })} />
            </div>
            <button className="btn btn-primary btn-block mt-24" onClick={save}>
              {tasks.some((t) => t.id === draft.task.id) ? "Guardar cambios" : "Agregar tarea"}
            </button>
          </div>
        )}
      </Sheet>

      <ConfirmSheet
        open={confirmDelete !== null}
        title="Eliminar tarea"
        message="Esta tarea se eliminará para siempre."
        onCancel={() => setConfirmDelete(null)}
        onConfirm={() => {
          if (confirmDelete) {
            deleteTask(confirmDelete);
            toast("Tarea eliminada", "🗑️");
          }
          setConfirmDelete(null);
        }}
      />
    </div>
  );
}
