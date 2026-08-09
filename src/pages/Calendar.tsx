import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useStore } from "../stores/useStore";
import { addDays, formatLong, formatShort, fromKey, todayKey, toKey } from "../lib/dates";
import type { CalendarEvent, CalendarEventCategory, Course, ScheduleItem, Task } from "../lib/types";
import Sheet from "../components/ui/Sheet";
import Empty from "../components/ui/Empty";
import { toast } from "../stores/useToasts";
import { IconCalendar, IconChevron, IconPlus, IconTrash } from "../components/ui/Icons";

const CATEGORY_META: Record<CalendarEventCategory, { label: string; color: string }> = {
  personal: { label: "Personal", color: "#0A84FF" },
  estudio: { label: "Estudio", color: "#AF52DE" },
  salud: { label: "Salud", color: "#34C759" },
  otro: { label: "Otro", color: "#FF9500" }
};

type AgendaItem = {
  id: string;
  source: "course" | "task" | "event";
  title: string;
  start: string;
  end?: string;
  subtitle?: string;
  color: string;
  done?: boolean;
};

function mondayOf(key: string): string {
  const date = fromKey(key);
  const offset = date.getDay() === 0 ? -6 : 1 - date.getDay();
  date.setDate(date.getDate() + offset);
  return toKey(date);
}

function dayItems(
  date: string,
  courses: Course[],
  tasks: Task[],
  events: CalendarEvent[]
): AgendaItem[] {
  const weekday = fromKey(date).getDay();
  const items: AgendaItem[] = [];

  courses.forEach((course) => {
    course.schedule.forEach((schedule: ScheduleItem) => {
      if (schedule.day !== weekday) return;
      items.push({
        id: `course-${schedule.id}`,
        source: "course",
        title: course.name,
        start: schedule.start,
        end: schedule.end,
        subtitle: [schedule.room, schedule.online ? "En línea" : ""].filter(Boolean).join(" · "),
        color: course.color
      });
    });
  });

  tasks.filter((task) => task.dueDate === date).forEach((task) => {
    items.push({
      id: `task-${task.id}`,
      source: "task",
      title: task.title,
      start: task.dueTime || "23:59",
      subtitle: task.dueTime ? "Entrega" : "Durante el día",
      color: task.priority === "alta" ? "#FF3B30" : task.priority === "media" ? "#FF9500" : "#8E8E93",
      done: task.status === "done"
    });
  });

  events.filter((event) => event.date === date).forEach((event) => {
    items.push({
      id: event.id,
      source: "event",
      title: event.title,
      start: event.start,
      end: event.end,
      subtitle: event.location || CATEGORY_META[event.category].label,
      color: CATEGORY_META[event.category].color
    });
  });

  return items.sort((a, b) => a.start.localeCompare(b.start));
}

export default function Calendar() {
  const { courses, tasks, calendarEvents } = useStore((state) => state.data);
  const addCalendarEvent = useStore((state) => state.addCalendarEvent);
  const deleteCalendarEvent = useStore((state) => state.deleteCalendarEvent);
  const [selectedDate, setSelectedDate] = useState(todayKey());
  const [weekStart, setWeekStart] = useState(() => mondayOf(todayKey()));
  const [editorOpen, setEditorOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [start, setStart] = useState("09:00");
  const [end, setEnd] = useState("10:00");
  const [category, setCategory] = useState<CalendarEventCategory>("personal");
  const [location, setLocation] = useState("");
  const [notes, setNotes] = useState("");

  const weekDays = useMemo(() => Array.from({ length: 7 }, (_, index) => addDays(weekStart, index)), [weekStart]);
  const itemsByDay = useMemo(
    () => new Map(weekDays.map((date) => [date, dayItems(date, courses, tasks, calendarEvents)])),
    [weekDays, courses, tasks, calendarEvents]
  );
  const selectedItems = itemsByDay.get(selectedDate) || dayItems(selectedDate, courses, tasks, calendarEvents);

  const openEditor = (date = selectedDate) => {
    setSelectedDate(date);
    setTitle("");
    setStart("09:00");
    setEnd("10:00");
    setCategory("personal");
    setLocation("");
    setNotes("");
    setEditorOpen(true);
  };

  const saveEvent = () => {
    if (!title.trim()) {
      toast("Escribe un título para el evento", "⚠️");
      return;
    }
    addCalendarEvent({
      title: title.trim(),
      date: selectedDate,
      start,
      end: end || undefined,
      category,
      location: location.trim() || undefined,
      notes: notes.trim() || undefined
    });
    setEditorOpen(false);
    toast("Evento agregado a tu agenda", "📅");
  };

  const goToday = () => {
    const today = todayKey();
    setSelectedDate(today);
    setWeekStart(mondayOf(today));
  };

  return (
    <div className="page calendar-page">
      <header className="page-header">
        <div className="row-between">
          <div>
            <h1 className="page-title">Agenda</h1>
            <p className="page-subtitle">Universidad y vida diaria en un solo lugar</p>
          </div>
          <button className="btn btn-primary btn-icon" onClick={() => openEditor()} aria-label="Agregar evento">
            <IconPlus size={22} />
          </button>
        </div>
      </header>

      <div className="calendar-toolbar">
        <button className="btn-icon" onClick={() => setWeekStart(addDays(weekStart, -7))} aria-label="Semana anterior">
          <IconChevron size={18} style={{ transform: "rotate(180deg)" }} />
        </button>
        <div>
          <div className="calendar-range">{formatShort(weekDays[0])} – {formatShort(weekDays[6])}</div>
          <button className="calendar-today" onClick={goToday}>Volver a hoy</button>
        </div>
        <button className="btn-icon" onClick={() => setWeekStart(addDays(weekStart, 7))} aria-label="Semana siguiente">
          <IconChevron size={18} />
        </button>
      </div>

      <div className="calendar-day-strip" aria-label="Días de la semana">
        {weekDays.map((date) => {
          const day = fromKey(date);
          const active = date === selectedDate;
          const count = itemsByDay.get(date)?.length || 0;
          return (
            <button key={date} className={active ? "active" : ""} onClick={() => setSelectedDate(date)}>
              <span>{day.toLocaleDateString("es-PE", { weekday: "narrow" })}</span>
              <strong>{day.getDate()}</strong>
              <i className={count ? "has-items" : ""} />
            </button>
          );
        })}
      </div>

      <div className="calendar-week-grid">
        {weekDays.map((date) => {
          const day = fromKey(date);
          const items = itemsByDay.get(date) || [];
          return (
            <button key={date} className={`calendar-week-day ${date === selectedDate ? "active" : ""}`} onClick={() => setSelectedDate(date)}>
              <span>{day.toLocaleDateString("es-PE", { weekday: "short" })}</span>
              <strong>{day.getDate()}</strong>
              <div className="calendar-mini-items">
                {items.slice(0, 3).map((item) => (
                  <i key={item.id} style={{ background: item.color }} title={item.title} />
                ))}
                {items.length > 3 && <small>+{items.length - 3}</small>}
              </div>
            </button>
          );
        })}
      </div>

      <section className="calendar-agenda mt-24">
        <div className="row-between calendar-agenda-heading">
          <div>
            <h2>{formatLong(selectedDate)}</h2>
            <p>{selectedItems.length ? `${selectedItems.length} actividades` : "Día disponible"}</p>
          </div>
          <button className="btn btn-secondary btn-sm" onClick={() => openEditor(selectedDate)}>
            <IconPlus size={15} /> Evento
          </button>
        </div>

        {selectedItems.length === 0 ? (
          <div className="card calendar-empty">
            <Empty icon="📆" title="Tu día está libre" subtitle="Añade una clase, tarea o evento personal" />
          </div>
        ) : (
          <div className="calendar-timeline">
            {selectedItems.map((item) => (
              <div className={`calendar-agenda-item ${item.done ? "done" : ""}`} key={item.id}>
                <div className="calendar-time">
                  <strong>{item.start === "23:59" && !item.end ? "Día" : item.start}</strong>
                  {item.end && <span>{item.end}</span>}
                </div>
                <div className="calendar-line" style={{ background: item.color }} />
                <div className="grow">
                  <div className="list-title">{item.title}</div>
                  <div className="list-sub">
                    {item.source === "course" ? "Clase" : item.source === "task" ? "Tarea" : "Evento"}
                    {item.subtitle ? ` · ${item.subtitle}` : ""}
                  </div>
                </div>
                {item.source === "event" ? (
                  <button
                    className="btn-icon calendar-delete"
                    aria-label={`Eliminar ${item.title}`}
                    onClick={() => {
                      deleteCalendarEvent(item.id);
                      toast("Evento eliminado", "🗑️");
                    }}
                  >
                    <IconTrash size={15} />
                  </button>
                ) : (
                  <Link to={item.source === "course" ? "/cursos" : "/tareas"} className="btn-icon" aria-label={`Abrir ${item.title}`}>
                    <IconChevron size={16} />
                  </Link>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      <Sheet open={editorOpen} title="Nuevo evento" onClose={() => setEditorOpen(false)}>
        <div className="field-group">
          <label className="field-label">Título *</label>
          <input className="field" placeholder="Ej. Estudiar para el parcial" value={title} onChange={(event) => setTitle(event.target.value)} />
        </div>
        <div className="field-group">
          <label className="field-label">Fecha</label>
          <input type="date" className="field" value={selectedDate} onChange={(event) => setSelectedDate(event.target.value)} />
        </div>
        <div className="calendar-time-fields">
          <div className="field-group">
            <label className="field-label">Inicio</label>
            <input type="time" className="field" value={start} onChange={(event) => setStart(event.target.value)} />
          </div>
          <div className="field-group">
            <label className="field-label">Fin</label>
            <input type="time" className="field" value={end} onChange={(event) => setEnd(event.target.value)} />
          </div>
        </div>
        <div className="field-group">
          <label className="field-label">Categoría</label>
          <div className="chips">
            {(Object.entries(CATEGORY_META) as Array<[CalendarEventCategory, (typeof CATEGORY_META)[CalendarEventCategory]]>).map(([value, meta]) => (
              <button key={value} className={`chip ${category === value ? "active" : ""}`} onClick={() => setCategory(value)}>
                <span className="dot" style={{ width: 8, height: 8, background: meta.color }} /> {meta.label}
              </button>
            ))}
          </div>
        </div>
        <div className="field-group">
          <label className="field-label">Lugar</label>
          <input className="field" placeholder="Aula, biblioteca o dirección" value={location} onChange={(event) => setLocation(event.target.value)} />
        </div>
        <div className="field-group">
          <label className="field-label">Notas</label>
          <textarea className="field" placeholder="Detalles opcionales" value={notes} onChange={(event) => setNotes(event.target.value)} />
        </div>
        <button className="btn btn-primary btn-block mt-24" onClick={saveEvent}>
          <IconCalendar size={17} /> Guardar en la agenda
        </button>
      </Sheet>
    </div>
  );
}
