import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useStore } from "../stores/useStore";
import type { Course, ScheduleItem, Day } from "../lib/types";
import { DAY_SHORT } from "../lib/dates";
import { uid } from "../lib/uid";
import { toast } from "../stores/useToasts";
import Sheet from "../components/ui/Sheet";
import Empty from "../components/ui/Empty";
import ConfirmSheet from "../components/ui/ConfirmSheet";
import Switch from "../components/ui/Switch";
import {
  IconPlus,
  IconTrash,
  IconChevron,
  IconPencil,
  IconClock,
  IconCheck,
  IconBook
} from "../components/ui/Icons";

export const COURSE_COLORS = [
  "#0A84FF",
  "#34C759",
  "#FF9500",
  "#AF52DE",
  "#FF3B30",
  "#30B0C7",
  "#FF2D55",
  "#5856D6"
];

interface DraftSchedule extends Omit<ScheduleItem, "id" | "courseId"> {
  id: string;
}

interface DraftCourse {
  id: string | null;
  name: string;
  code: string;
  professor: string;
  color: string;
  schedule: DraftSchedule[];
}

const emptyDraft = (): DraftCourse => ({
  id: null,
  name: "",
  code: "",
  professor: "",
  color: COURSE_COLORS[0],
  schedule: [{ id: uid(), day: 1, start: "08:00", end: "09:30", room: "", online: false }]
});

export default function Courses() {
  const courses = useStore((s) => s.data.courses);
  const addCourse = useStore((s) => s.addCourse);
  const updateCourse = useStore((s) => s.updateCourse);
  const deleteCourse = useStore((s) => s.deleteCourse);
  const navigate = useNavigate();

  const [draft, setDraft] = useState<DraftCourse | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [dayTab, setDayTab] = useState<number>(new Date().getDay());
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const addScheduleRow = () =>
    setDraft((d) =>
      d ? { ...d, schedule: [...d.schedule, { id: uid(), day: 1, start: "08:00", end: "09:30", room: "", online: false }] } : d
    );

  const updateRow = (id: string, patch: Partial<DraftSchedule>) =>
    setDraft((d) =>
      d
        ? { ...d, schedule: d.schedule.map((r) => (r.id === id ? { ...r, ...patch } : r)) }
        : d
    );

  const removeRow = (id: string) =>
    setDraft((d) => (d ? { ...d, schedule: d.schedule.filter((r) => r.id !== id) } : d));

  const save = () => {
    if (!draft) return;
    if (!draft.name.trim()) {
      toast("Escribe el nombre del curso", "⚠️");
      return;
    }
    const schedule: ScheduleItem[] = draft.schedule
      .filter((r) => r.start && r.end)
      .map(({ id, day, start, end, room, online }) => ({
        id,
        courseId: draft.id || "tmp",
        day,
        start,
        end,
        room: room?.trim() || undefined,
        online
      }));
    if (draft.id) {
      updateCourse(draft.id, {
        name: draft.name.trim(),
        code: draft.code.trim() || undefined,
        professor: draft.professor.trim() || undefined,
        color: draft.color,
        schedule
      });
      toast("Curso actualizado", "✏️");
    } else {
      addCourse({
        name: draft.name.trim(),
        code: draft.code.trim() || undefined,
        professor: draft.professor.trim() || undefined,
        color: draft.color,
        schedule
      });
      toast("Curso agregado", "📚");
    }
    setDraft(null);
  };

  const openEdit = (c: Course) => {
    setDraft({
      id: c.id,
      name: c.name,
      code: c.code || "",
      professor: c.professor || "",
      color: c.color,
      schedule: c.schedule.map((s) => ({ ...s, room: s.room || "" }))
    });
  };

  const daySchedule = useMemo(() => {
    const list: { course: Course; s: ScheduleItem }[] = [];
    for (const c of courses) {
      for (const s of c.schedule) {
        if (s.day === (dayTab as Day)) list.push({ course: c, s });
      }
    }
    list.sort((a, b) => a.s.start.localeCompare(b.s.start));
    return list;
  }, [courses, dayTab]);

  return (
    <div className="page">
      <header className="page-header">
        <div className="row-between">
          <div>
            <h1 className="page-title">Cursos</h1>
            <p className="page-subtitle">Tu horario semanal y tus materias</p>
          </div>
          <button className="btn btn-primary btn-icon" onClick={() => setDraft(emptyDraft())} aria-label="Agregar curso">
            <IconPlus size={22} />
          </button>
        </div>
      </header>

      <div className="segmented mt-8" style={{ overflowX: "auto" }}>
        {DAY_SHORT.map((d, i) => (
          <button
            key={i}
            className={i === dayTab ? "active" : ""}
            onClick={() => setDayTab(i)}
            style={{ minWidth: 44 }}
          >
            {d}
          </button>
        ))}
      </div>

      <div className="stack mt-24">
        {daySchedule.length === 0 ? (
          <div className="card">
            <Empty
              icon="🗓️"
              title={`Sin clases ${DAY_SHORT[dayTab]}`}
              subtitle="Agrega cursos para ver tu horario aquí"
            />
          </div>
        ) : (
          daySchedule.map(({ course, s }, i) => (
            <div className="card card-section reveal" key={s.id} style={{ transitionDelay: `${i * 40}ms` }}>
              <div className="row">
                <div className="dot" style={{ background: course.color }} />
                <div className="grow">
                  <div className="list-title">{course.name}</div>
                  <div className="list-sub">
                    {s.start} – {s.end}
                    {s.room ? ` · ${s.room}` : ""}
                    {s.online ? " · En línea" : ""}
                  </div>
                </div>
                <button className="btn-icon" onClick={() => setExpanded(expanded === course.id ? null : course.id)}>
                  <IconChevron size={18} style={{ transform: expanded === course.id ? "rotate(90deg)" : "none", transition: "transform 0.2s" }} />
                </button>
              </div>
              {expanded === course.id && (
                <div className="mt-16" style={{ borderTop: "1px solid var(--separator)", paddingTop: 12 }}>
                  <CourseDetails course={course} onEdit={() => openEdit(course)} onDelete={() => setConfirmDelete(course.id)} />
                </div>
              )}
            </div>
          ))
        )}
      </div>

      <div className="stack mt-24">
        <h2 className="muted" style={{ fontSize: 13, fontWeight: 600, textTransform: "uppercase", padding: "0 4px" }}>
          Todas tus materias
        </h2>
        {courses.length === 0 ? (
          <div className="card">
            <Empty icon="📚" title="Aún no tienes cursos" subtitle="Toca + para agregar tu primer curso de la universidad" />
          </div>
        ) : (
          <div className="list-group">
            {courses.map((c) => (
              <div className="list-item" key={c.id} onClick={() => openEdit(c)}>
                <div className="dot" style={{ background: c.color }} />
                <div className="grow">
                  <div className="list-title">{c.name}</div>
                  <div className="list-sub">
                    {c.code ? `${c.code} · ` : ""}
                    {c.schedule.length} {c.schedule.length === 1 ? "sesión" : "sesiones"}
                    {c.professor ? ` · ${c.professor}` : ""}
                  </div>
                </div>
                <button
                  className="btn-icon"
                  style={{ color: c.color }}
                  title="Abrir cuaderno"
                  onClick={(e) => { e.stopPropagation(); navigate(`/cuaderno/${c.id}`); }}
                >
                  <IconBook size={18} />
                </button>
                <IconChevron size={16} style={{ color: "var(--label-tertiary)" }} />
              </div>
            ))}
          </div>
        )}
      </div>

      <Sheet open={draft !== null} title={draft?.id ? "Editar curso" : "Nuevo curso"} onClose={() => setDraft(null)}>
        {draft && (
          <div>
            <div className="field-group">
              <label className="field-label">Nombre *</label>
              <input
                className="field"
                placeholder="Ej. Macroeconomía"
                value={draft.name}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              />
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 14 }}>
              <div className="field-group">
                <label className="field-label">Código</label>
                <input
                  className="field"
                  placeholder="ECO-201"
                  value={draft.code}
                  onChange={(e) => setDraft({ ...draft, code: e.target.value })}
                />
              </div>
              <div className="field-group">
                <label className="field-label">Profesor</label>
                <input
                  className="field"
                  placeholder="Opcional"
                  value={draft.professor}
                  onChange={(e) => setDraft({ ...draft, professor: e.target.value })}
                />
              </div>
            </div>

            <div className="field-group">
              <label className="field-label">Color</label>
              <div className="chips">
                {COURSE_COLORS.map((c) => (
                  <button
                    key={c}
                    className={`chip ${draft.color === c ? "active" : ""}`}
                    style={{ width: 34, height: 34, borderRadius: "50%", background: c, padding: 0 }}
                    onClick={() => setDraft({ ...draft, color: c })}
                    aria-label={`Color ${c}`}
                  >
                    {draft.color === c && <IconCheck size={16} style={{ color: "#fff" }} />}
                  </button>
                ))}
              </div>
            </div>

            <div className="field-group">
              <div className="row-between">
                <label className="field-label" style={{ marginBottom: 0 }}>Horario</label>
                <button className="btn btn-sm btn-secondary" onClick={addScheduleRow}>
                  <IconPlus size={14} /> Sesión
                </button>
              </div>
            </div>

            <div className="stack mt-16">
              {draft.schedule.map((r) => (
                <div key={r.id} className="card" style={{ background: "var(--fill)", boxShadow: "none", borderRadius: 14 }}>
                  <div style={{ padding: 12 }}>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
                      <div className="select-wrap">
                        <select
                          className="field"
                          style={{ padding: "10px 30px 10px 12px", fontSize: 14 }}
                          value={r.day}
                          onChange={(e) => updateRow(r.id, { day: Number(e.target.value) as Day })}
                        >
                          {DAY_SHORT.map((d, i) => (
                            <option key={i} value={i}>{d}</option>
                          ))}
                        </select>
                      </div>
                      <input
                        type="time"
                        className="field"
                        style={{ padding: "10px 12px", fontSize: 14 }}
                        value={r.start}
                        onChange={(e) => updateRow(r.id, { start: e.target.value })}
                      />
                      <input
                        type="time"
                        className="field"
                        style={{ padding: "10px 12px", fontSize: 14 }}
                        value={r.end}
                        onChange={(e) => updateRow(r.id, { end: e.target.value })}
                      />
                    </div>
                    <div className="row mt-8" style={{ gap: 10 }}>
                      <div className="grow">
                        <input
                          className="field"
                          style={{ padding: "10px 12px", fontSize: 14 }}
                          placeholder="Aula / lugar"
                          value={r.room}
                          onChange={(e) => updateRow(r.id, { room: e.target.value })}
                        />
                      </div>
                      <label className="row" style={{ gap: 8, fontSize: 13, color: "var(--label-secondary)", whiteSpace: "nowrap" }}>
                        En línea
                        <Switch on={!!r.online} onChange={(v) => updateRow(r.id, { online: v })} />
                      </label>
                      <button className="btn-icon" style={{ color: "var(--red)" }} onClick={() => removeRow(r.id)}>
                        <IconTrash size={16} />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="stack mt-24">
              <button className="btn btn-primary btn-block" onClick={save}>
                {draft.id ? "Guardar cambios" : "Agregar curso"}
              </button>
            </div>
          </div>
        )}
      </Sheet>

      <ConfirmSheet
        open={confirmDelete !== null}
        title="Eliminar curso"
        message="Se quitará del horario y sus tareas quedarán sin curso asignado. Esta acción no se puede deshacer."
        onCancel={() => setConfirmDelete(null)}
        onConfirm={() => {
          if (confirmDelete) {
            deleteCourse(confirmDelete);
            toast("Curso eliminado", "🗑️");
          }
          setConfirmDelete(null);
        }}
      />
    </div>
  );
}

function CourseDetails({
  course,
  onEdit,
  onDelete
}: {
  course: Course;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="stack">
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        {course.code && (
          <div className="badge badge-teal" style={{ justifyContent: "flex-start", background: "var(--teal-soft)", color: "var(--teal)" }}>
            {course.code}
          </div>
        )}
        {course.professor && (
          <div className="badge badge-purple" style={{ justifyContent: "flex-start", background: "var(--purple-soft)", color: "var(--purple)" }}>
            {course.professor}
          </div>
        )}
      </div>
      <div className="stack">
        {course.schedule.map((s) => (
          <div key={s.id} className="row">
            <IconClock size={16} style={{ color: "var(--label-tertiary)" }} />
            <span className="muted">{DAY_SHORT[s.day]} · {s.start} – {s.end}</span>
            {s.room && <span className="badge">{s.room}</span>}
            {s.online && <span className="badge badge-teal">En línea</span>}
          </div>
        ))}
      </div>
      <div className="row" style={{ gap: 8 }}>
        <button className="btn btn-secondary btn-sm" onClick={onEdit}>
          <IconPencil size={14} /> Editar
        </button>
        <button className="btn btn-danger btn-sm" onClick={onDelete}>
          <IconTrash size={14} /> Eliminar
        </button>
      </div>
    </div>
  );
}
