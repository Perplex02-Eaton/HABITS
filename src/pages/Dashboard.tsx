import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useStore } from "../stores/useStore";
import { fetchNews, relativeTime } from "../lib/news";
import type { NewsItem } from "../lib/news";
import MusicPanel from "../components/MusicPanel";
import Jarvis from "../components/Jarvis";
import DailyCommandCenter from "../components/DailyCommandCenter";
import AcademicConnections from "../components/AcademicConnections";
import {
  todayKey,
  formatLong,
  greeting,
  timeToMinutes,
  minutesNow,
  DAY_NAMES
} from "../lib/dates";
import { MEAL_TYPES } from "../lib/types";
import {
  IconMeal,
  IconTasks,
  IconChart,
  IconSettings,
  IconChevron,
  IconClock,
  IconTarget,
  IconBolt
} from "../components/ui/Icons";

function useClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(id);
  }, []);
  return now;
}

function two(n: number) {
  return n < 10 ? `0${n}` : `${n}`;
}

export default function Dashboard() {
  const now = useClock();
  const { courses, mealPlans, tasks, calendarEvents, ideas, metrics, notes, settings } = useStore((s) => s.data);
  const name = settings.name;

  const [headlines, setHeadlines] = useState<NewsItem[]>([]);

  useEffect(() => {
    void fetchNews("todo", settings.newsApiKey)
      .then((list) => setHeadlines(list.slice(0, 3)))
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const today = todayKey();
  const dayNow = now.getDay() as 0 | 1 | 2 | 3 | 4 | 5 | 6;
  const minNow = minutesNow();

  const nextClass = useMemo(() => {
    const upcoming: { course: string; start: string; end: string; room?: string; mins: number }[] = [];
    for (const c of courses) {
      for (const sc of c.schedule) {
        if (sc.day !== dayNow) continue;
        const diff = timeToMinutes(sc.start) - minNow;
        if (diff >= 0) upcoming.push({ course: c.name, start: sc.start, end: sc.end, room: sc.room, mins: diff });
      }
    }
    upcoming.sort((a, b) => a.mins - b.mins);
    return upcoming[0];
  }, [courses, dayNow, minNow]);

  const inProgressClass = useMemo(() => {
    for (const c of courses) {
      for (const sc of c.schedule) {
        if (sc.day !== dayNow) continue;
        if (timeToMinutes(sc.start) <= minNow && minNow <= timeToMinutes(sc.end)) {
          return { course: c.name, end: sc.end, room: sc.room };
        }
      }
    }
    return null;
  }, [courses, dayNow, minNow]);

  const plan = mealPlans.find((p) => p.date === today);
  const mealsToday = plan?.meals ?? [];

  const tasksToday = tasks
    .filter((t) => t.dueDate === today && t.status === "pending")
    .sort((a, b) => (a.dueTime || "23:59").localeCompare(b.dueTime || "23:59"));

  const pendingTasks = tasks.filter((t) => t.status === "pending");

  const nextPersonalEvent = useMemo(
    () => calendarEvents
      .filter((event) => event.date === today && timeToMinutes(event.start) >= minNow)
      .sort((a, b) => a.start.localeCompare(b.start))[0],
    [calendarEvents, today, minNow]
  );

  const streak = useMemo(() => {
    let count = 0;
    const doneDates = new Set(
      tasks.filter((t) => t.status === "done").map((t) => t.dueDate)
    );
    let d = new Date();
    while (true) {
      const key = `${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())}`;
      if (doneDates.has(key)) {
        count++;
        d.setDate(d.getDate() - 1);
      } else break;
    }
    return count;
  }, [tasks]);

  const recentMetrics = useMemo(() => {
    const sorted = [...metrics].sort((a, b) => a.date.localeCompare(b.date));
    const last = sorted.filter((m) => m.date === sorted[sorted.length - 1]?.date);
    const latest = sorted[sorted.length - 1];
    return { latest, last, has: sorted.length > 0 };
  }, [metrics]);

  return (
    <div className="page">
      <header className="page-header">
        <div className="hero">
          <div>
            <div className="greeting">
              {greeting()}
              {name ? `, ${name.split(" ")[0]}` : ""} · {DAY_NAMES[dayNow]}
            </div>
            <div className="clock">
              {two(now.getHours())}:{two(now.getMinutes())}
            </div>
            <div className="date-line">{formatLong(today)}</div>
          </div>
          <div className="row" style={{ gap: 8 }}>
            <Link to="/rendimiento" className="btn-icon" aria-label="Rendimiento">
              <IconChart size={20} />
            </Link>
            <Link to="/ajustes" className="btn-icon" aria-label="Ajustes">
              <IconSettings size={20} />
            </Link>
          </div>
        </div>
      </header>

      <div className="stack">
        <MusicPanel compact />
        <Jarvis />
        <DailyCommandCenter />
        <AcademicConnections />

        {nextPersonalEvent && (
          <Link to="/agenda" className="card card-section reveal" style={{ textDecoration: "none" }}>
            <div className="row-between">
              <div className="row">
                <IconClock size={20} style={{ color: "var(--accent)" }} />
                <div>
                  <div className="list-title">{nextPersonalEvent.title}</div>
                  <div className="list-sub">
                    {nextPersonalEvent.start}{nextPersonalEvent.end ? ` – ${nextPersonalEvent.end}` : ""}
                    {nextPersonalEvent.location ? ` · ${nextPersonalEvent.location}` : ""}
                  </div>
                </div>
              </div>
              <span className="badge badge-blue">Agenda</span>
            </div>
          </Link>
        )}

        {inProgressClass && (
          <div className="card card-section reveal">
            <div className="row-between">
              <div className="row">
                <div className="dot" style={{ background: "var(--green)" }} />
                <div>
                  <div className="list-title">Clase en curso: {inProgressClass.course}</div>
                  <div className="list-sub">
                    Termina a las {inProgressClass.end}
                    {inProgressClass.room ? ` · ${inProgressClass.room}` : ""}
                  </div>
                </div>
              </div>
              <span className="badge badge-green">En vivo</span>
            </div>
          </div>
        )}

        {nextClass && !inProgressClass && (
          <div className="card card-section reveal">
            <div className="row-between">
              <div className="row">
                <div className="dot" style={{ background: "var(--accent)" }} />
                <div>
                  <div className="list-title">{nextClass.course}</div>
                  <div className="list-sub">
                    {nextClass.start} – {nextClass.end}
                    {nextClass.room ? ` · ${nextClass.room}` : ""}
                  </div>
                </div>
              </div>
              <span className="badge badge-blue">
                <IconClock size={13} /> en {nextClass.mins} min
              </span>
            </div>
          </div>
        )}

        {streak > 0 && (
          <div className="card card-section reveal">
            <div className="row-between">
              <div className="row">
                <span style={{ fontSize: 24 }}>🔥</span>
                <div>
                  <div className="list-title">{streak} {streak === 1 ? "día" : "días"} de racha</div>
                  <div className="list-sub">Sigue así, vas excelente</div>
                </div>
              </div>
            </div>
          </div>
        )}

        <div className="card reveal" style={{ transitionDelay: "40ms" }}>
          <div className="card-section row-between">
            <div className="row">
              <span style={{ fontSize: 22 }}>🍽️</span>
              <div>
                <div className="list-title">Comida de hoy</div>
                <div className="list-sub">
                  {mealsToday.length === 0
                    ? "Aún no planificas tus comidas de hoy"
                    : `${mealsToday.filter((m) => m.consumed).length}/${mealsToday.length} consumidas`}
                </div>
              </div>
            </div>
            <Link to="/comidas" className="btn-icon" aria-label="Ver comidas">
              <IconMeal size={20} />
            </Link>
          </div>
          {mealsToday.length > 0 && (
            <div style={{ padding: "0 16px 14px", display: "flex", flexWrap: "wrap", gap: 8 }}>
              {mealsToday.map((m) => {
                const t = MEAL_TYPES.find((x) => x.value === m.type);
                return (
                  <span key={m.id} className={`badge ${m.consumed ? "badge-green" : "badge-teal"}`}>
                    {t?.icon} {t?.label} · {m.name}
                  </span>
                );
              })}
            </div>
          )}
        </div>

        <div className="card reveal" style={{ transitionDelay: "80ms" }}>
          <div className="card-section row-between">
            <div className="row">
              <span style={{ fontSize: 22 }}>✅</span>
              <div>
                <div className="list-title">Tareas de hoy</div>
                <div className="list-sub">
                  {tasksToday.length === 0 ? "Sin tareas para hoy" : `${tasksToday.length} pendientes`}
                </div>
              </div>
            </div>
            <Link to="/tareas" className="btn-icon" aria-label="Ver tareas">
              <IconTasks size={20} />
            </Link>
          </div>
          {tasksToday.length > 0 && (
            <div style={{ padding: "0 16px 14px" }}>
              {tasksToday.slice(0, 3).map((t) => (
                <div key={t.id} className="row-between" style={{ padding: "7px 0" }}>
                  <span className="list-sub" style={{ fontSize: 14 }}>
                    {t.title}
                  </span>
                  <span className="badge" style={{ fontSize: 11 }}>
                    {t.dueTime || "todo el día"}
                  </span>
                </div>
              ))}
              {tasksToday.length > 3 && (
                <div className="muted small mt-8" style={{ textAlign: "center" }}>
                  +{tasksToday.length - 3} más
                </div>
              )}
            </div>
          )}
        </div>

        <div className="grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
          <Link to="/ideas" className="card reveal" style={{ textDecoration: "none", transitionDelay: "120ms" }}>
            <div className="card-section">
              <div className="dot" style={{ background: "var(--purple)", marginBottom: 10 }} />
              <div className="list-title">Ideas</div>
              <div className="list-sub">{ideas.filter((i) => i.status !== "posted").length} por publicar</div>
            </div>
          </Link>
          <Link to="/cursos" className="card reveal" style={{ textDecoration: "none", transitionDelay: "160ms" }}>
            <div className="card-section">
              <div className="dot" style={{ background: "var(--teal)", marginBottom: 10 }} />
              <div className="list-title">Cursos</div>
              <div className="list-sub">{courses.length} en tu semestre</div>
            </div>
          </Link>
          <Link to="/notas" className="card reveal" style={{ textDecoration: "none", transitionDelay: "200ms" }}>
            <div className="card-section">
              <div className="dot" style={{ background: "var(--orange)", marginBottom: 10 }} />
              <div className="list-title">Notas</div>
              <div className="list-sub">{notes.length} guardadas · lápiz y fotos</div>
            </div>
          </Link>
          <Link to="/noticias" className="card reveal" style={{ textDecoration: "none", transitionDelay: "240ms" }}>
            <div className="card-section">
              <div className="dot" style={{ background: "var(--red)", marginBottom: 10 }} />
              <div className="list-title">Al día</div>
              <div className="list-sub">Guerra y finanzas</div>
            </div>
          </Link>
        </div>

        {headlines.length > 0 && (
          <div className="card reveal" style={{ transitionDelay: "280ms" }}>
            <div className="card-section">
              <div className="row-between">
                <div className="row">
                  <span style={{ fontSize: 22 }}>📰</span>
                  <div>
                    <div className="list-title">Lo importante hoy</div>
                    <div className="list-sub">Geopolítica y finanzas</div>
                  </div>
                </div>
                <Link to="/noticias" className="btn-icon" aria-label="Ver todas las noticias">
                  <IconChevron size={20} />
                </Link>
              </div>
              <div className="mt-16">
                {headlines.map((h) => (
                  <a
                    key={h.link}
                    href={h.link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="row-between"
                    style={{ textDecoration: "none", padding: "8px 0", borderBottom: "1px solid var(--separator)" }}
                  >
                    <span className="small" style={{ flex: 1, lineHeight: 1.35, color: "var(--label)" }}>
                      {h.title}
                    </span>
                    <span className="badge" style={{ fontSize: 10, flexShrink: 0 }}>{relativeTime(h.date)}</span>
                  </a>
                ))}
              </div>
            </div>
          </div>
        )}

        <div className="card reveal" style={{ transitionDelay: "200ms" }}>
          <div className="card-section">
            <div className="row-between">
              <div className="row">
                <span style={{ fontSize: 22 }}>📈</span>
                <div>
                  <div className="list-title">Tu rendimiento</div>
                  <div className="list-sub">
                    {recentMetrics.has && recentMetrics.latest
                      ? `${recentMetrics.latest.category} · ${recentMetrics.latest.value}%`
                      : "Empieza a registrar métricas"}
                  </div>
                </div>
              </div>
              <Link to="/rendimiento" className="btn-icon" aria-label="Ver rendimiento">
                <IconChevron size={20} />
              </Link>
            </div>
            {recentMetrics.has ? (
              <div className="mt-16" style={{ display: "flex", gap: 8 }}>
                {recentMetrics.last.slice(0, 4).map((m) => (
                  <div
                    key={m.id}
                    className="badge badge-green"
                    style={{ flexDirection: "column", gap: 2, padding: "8px 10px", borderRadius: 12, flex: 1 }}
                  >
                    <span style={{ fontSize: 16, fontWeight: 700 }}>{m.value}</span>
                    <span style={{ fontSize: 10, fontWeight: 500 }}>{m.category}</span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="empty" style={{ padding: "28px 0 8px" }}>
                <IconTarget size={36} />
                <p className="muted mt-8">Registra tu energía, disciplina y estudios</p>
              </div>
            )}
          </div>
        </div>

        {pendingTasks.length === 0 && nextClass && (
          <div className="card card-section reveal">
            <div className="row">
              <IconBolt size={22} style={{ color: "var(--orange)" }} />
              <div className="muted">¡Día despejado! Aprovecha para avanzar en tu próximo objetivo.</div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
