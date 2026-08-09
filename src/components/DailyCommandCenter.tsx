import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useStore } from "../stores/useStore";
import { todayKey } from "../lib/dates";
import { notify, requestPermission } from "../lib/notify";
import { toast } from "../stores/useToasts";
import Sheet from "./ui/Sheet";
import { IconBolt, IconCheck, IconPlus, IconTarget } from "./ui/Icons";
import type { DailyCheckIn } from "../lib/types";

const FOCUS_END_KEY = "habits:focus:end";
const FOCUS_LENGTH_KEY = "habits:focus:length";

function formatTimer(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  return `${String(minutes).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}

function currentRemaining(): number {
  const end = Number(localStorage.getItem(FOCUS_END_KEY) || 0);
  return end ? Math.max(0, Math.ceil((end - Date.now()) / 1000)) : 0;
}

export default function DailyCommandCenter() {
  const tasks = useStore((state) => state.data.tasks);
  const fixedGoals = useStore((state) => state.data.fixedGoals ?? []);
  const checkIns = useStore((state) => state.data.dailyCheckIns ?? []);
  const updateTask = useStore((state) => state.updateTask);
  const addFixedGoal = useStore((state) => state.addFixedGoal);
  const setGoalCompletion = useStore((state) => state.setGoalCompletion);
  const upsertDailyCheckIn = useStore((state) => state.upsertDailyCheckIn);
  const today = todayKey();

  const priorities = useMemo(() => {
    const weight = { alta: 0, media: 1, baja: 2 } as const;
    return tasks
      .filter((task) => task.dueDate === today || (task.status === "pending" && task.dueDate < today))
      .sort((a, b) => Number(a.status === "done") - Number(b.status === "done") || weight[a.priority] - weight[b.priority] || `${a.dueDate}${a.dueTime || "99:99"}`.localeCompare(`${b.dueDate}${b.dueTime || "99:99"}`))
      .slice(0, 3);
  }, [tasks, today]);

  const activeGoals = fixedGoals.filter((goal) => goal.active).slice(0, 5);
  const completedGoals = activeGoals.filter((goal) => (goal.completions?.[today] ?? 0) >= goal.targetPerDay).length;
  const totalToday = priorities.length + activeGoals.length;
  const completedToday = completedGoals + priorities.filter((task) => task.status === "done").length;
  const progress = totalToday ? Math.round((completedToday / totalToday) * 100) : 0;
  const savedCheckIn = checkIns.find((entry) => entry.date === today);

  const blankCheckIn = (): DailyCheckIn => savedCheckIn || {
    date: today,
    mood: 3,
    energy: 3,
    sleepHours: 7,
    waterGlasses: 0,
    intention: "",
    gratitude: "",
    dailyWin: "",
    updatedAt: Date.now()
  };

  const [checkInOpen, setCheckInOpen] = useState(false);
  const [checkIn, setCheckIn] = useState<DailyCheckIn>(blankCheckIn);
  const [routineOpen, setRoutineOpen] = useState(false);
  const [routineTitle, setRoutineTitle] = useState("");
  const [focusMinutes, setFocusMinutes] = useState(() => Number(localStorage.getItem(FOCUS_LENGTH_KEY) || 25));
  const [remaining, setRemaining] = useState(currentRemaining);
  const [running, setRunning] = useState(() => currentRemaining() > 0);

  useEffect(() => {
    if (!running) return;
    const tick = () => {
      const next = currentRemaining();
      setRemaining(next);
      if (next === 0) {
        setRunning(false);
        localStorage.removeItem(FOCUS_END_KEY);
        notify("Sesión completada", "Buen trabajo. Descansa cinco minutos antes de continuar.");
        toast("Sesión de enfoque completada", "✓");
      }
    };
    const id = window.setInterval(tick, 1000);
    tick();
    return () => window.clearInterval(id);
  }, [running]);

  const startFocus = async () => {
    await requestPermission();
    const seconds = focusMinutes * 60;
    localStorage.setItem(FOCUS_END_KEY, String(Date.now() + seconds * 1000));
    localStorage.setItem(FOCUS_LENGTH_KEY, String(focusMinutes));
    setRemaining(seconds);
    setRunning(true);
  };

  const stopFocus = () => {
    localStorage.removeItem(FOCUS_END_KEY);
    setRemaining(0);
    setRunning(false);
  };

  const saveCheckIn = () => {
    upsertDailyCheckIn({ ...checkIn, updatedAt: Date.now() });
    setCheckInOpen(false);
    toast("Registro de hoy guardado", "✦");
  };

  const createRoutine = () => {
    const title = routineTitle.trim();
    if (!title) return;
    addFixedGoal({ title, targetPerDay: 1, active: true });
    setRoutineTitle("");
    setRoutineOpen(false);
    toast("Rutina diaria creada", "✓");
  };

  return (
    <>
      <section className="card daily-system reveal">
        <div className="card-section daily-system-head">
          <div>
            <div className="list-title">Tu sistema de hoy</div>
            <div className="list-sub">Prioriza, cumple y cierra el día con intención</div>
          </div>
          <span className="daily-score">{progress}%</span>
        </div>
        <div className="daily-progress" aria-label={`${progress}% completado`}><i style={{ transform: `scaleX(${progress / 100})` }} /></div>

        <div className="daily-block">
          <div className="daily-block-title"><IconTarget size={16} /> Tres prioridades</div>
          {priorities.length ? priorities.map((task, index) => (
            <div className={`daily-action ${task.status === "done" ? "done" : ""}`} key={task.id}>
              <span className="daily-index">{index + 1}</span>
              <div className="grow">
                <div className="list-title">{task.title}</div>
                <div className="list-sub">{task.dueDate < today ? "Pendiente atrasado" : task.dueTime || "Para hoy"}</div>
              </div>
              <button className="daily-check" onClick={() => updateTask(task.id, { status: task.status === "done" ? "pending" : "done" })} aria-label={`${task.status === "done" ? "Reabrir" : "Completar"} ${task.title}`}><IconCheck size={16} /></button>
            </div>
          )) : (
            <Link to="/tareas" className="daily-empty">No hay pendientes urgentes. Planifica una prioridad.</Link>
          )}
        </div>

        <div className="daily-block">
          <div className="row-between">
            <div className="daily-block-title"><IconCheck size={16} /> Rutinas</div>
            <button className="daily-add" onClick={() => setRoutineOpen(true)}><IconPlus size={14} /> Nueva</button>
          </div>
          {activeGoals.length ? (
            <div className="routine-grid">
              {activeGoals.map((goal) => {
                const count = goal.completions?.[today] ?? 0;
                const done = count >= goal.targetPerDay;
                return (
                  <button key={goal.id} className={`routine-chip ${done ? "done" : ""}`} onClick={() => setGoalCompletion(goal.id, today, done ? 0 : goal.targetPerDay)}>
                    <span>{done ? "✓" : ""}</span>{goal.title}
                  </button>
                );
              })}
            </div>
          ) : <button className="daily-empty" onClick={() => setRoutineOpen(true)}>Crea una rutina pequeña que puedas repetir cada día.</button>}
        </div>

        <div className="daily-footer">
          <button className="daily-checkin" onClick={() => { setCheckIn(blankCheckIn()); setCheckInOpen(true); }}>
            <span className="checkin-orb">{savedCheckIn ? "✓" : "✦"}</span>
            <span><b>{savedCheckIn ? "Registro completado" : "¿Cómo estás hoy?"}</b><small>{savedCheckIn ? `${savedCheckIn.sleepHours} h de sueño · energía ${savedCheckIn.energy}/5` : "Sueño, energía y enfoque"}</small></span>
          </button>
        </div>
      </section>

      <section className={`card focus-card reveal ${running ? "active" : ""}`}>
        <div className="focus-copy">
          <span className="focus-icon"><IconBolt size={18} /></span>
          <div><div className="list-title">Modo enfoque</div><div className="list-sub">Una tarea. Sin distracciones.</div></div>
        </div>
        <div className="focus-controls">
          {!running && <div className="focus-lengths">{[25, 50].map((minutes) => <button key={minutes} className={focusMinutes === minutes ? "active" : ""} onClick={() => setFocusMinutes(minutes)}>{minutes} min</button>)}</div>}
          <strong className="focus-time">{running ? formatTimer(remaining) : `${focusMinutes}:00`}</strong>
          <button className={`focus-button ${running ? "stop" : ""}`} onClick={running ? stopFocus : startFocus} aria-label={running ? "Detener enfoque" : "Iniciar enfoque"}>
            {running ? "Detener" : "Iniciar"}
          </button>
        </div>
      </section>

      <Sheet open={checkInOpen} title="Registro de hoy" onClose={() => setCheckInOpen(false)}>
        <ScaleField label="Ánimo" value={checkIn.mood} onChange={(mood) => setCheckIn({ ...checkIn, mood })} low="Difícil" high="Excelente" />
        <ScaleField label="Energía" value={checkIn.energy} onChange={(energy) => setCheckIn({ ...checkIn, energy })} low="Agotado" high="Con fuerza" />
        <div className="checkin-numbers">
          <label className="field-group"><span className="field-label">Horas de sueño</span><input className="field" type="number" min="0" max="16" step="0.5" value={checkIn.sleepHours} onChange={(event) => setCheckIn({ ...checkIn, sleepHours: Number(event.target.value) })} /></label>
          <label className="field-group"><span className="field-label">Vasos de agua</span><input className="field" type="number" min="0" max="30" value={checkIn.waterGlasses} onChange={(event) => setCheckIn({ ...checkIn, waterGlasses: Number(event.target.value) })} /></label>
        </div>
        <label className="field-group"><span className="field-label">Mi intención para hoy</span><input className="field" placeholder="Ej. avanzar sin buscar perfección" value={checkIn.intention} onChange={(event) => setCheckIn({ ...checkIn, intention: event.target.value })} /></label>
        <label className="field-group"><span className="field-label">Algo que agradezco</span><textarea className="field" placeholder="Una persona, oportunidad o momento" value={checkIn.gratitude} onChange={(event) => setCheckIn({ ...checkIn, gratitude: event.target.value })} /></label>
        <label className="field-group"><span className="field-label">Victoria del día</span><textarea className="field" placeholder="Complétalo al terminar el día" value={checkIn.dailyWin} onChange={(event) => setCheckIn({ ...checkIn, dailyWin: event.target.value })} /></label>
        <button className="btn btn-primary btn-block mt-24" onClick={saveCheckIn}>Guardar mi día</button>
      </Sheet>

      <Sheet open={routineOpen} title="Nueva rutina diaria" onClose={() => setRoutineOpen(false)}>
        <label className="field-group"><span className="field-label">Rutina</span><input autoFocus className="field" placeholder="Ej. Leer 20 minutos" value={routineTitle} onChange={(event) => setRoutineTitle(event.target.value)} onKeyDown={(event) => event.key === "Enter" && createRoutine()} /></label>
        <p className="muted small mt-8">Empieza con algo tan pequeño que sea difícil no hacerlo.</p>
        <button className="btn btn-primary btn-block mt-24" onClick={createRoutine}>Crear rutina</button>
      </Sheet>
    </>
  );
}

function ScaleField({ label, value, onChange, low, high }: { label: string; value: number; onChange: (value: number) => void; low: string; high: string }) {
  return (
    <div className="field-group checkin-scale">
      <span className="field-label">{label}</span>
      <div className="scale-buttons">{[1, 2, 3, 4, 5].map((item) => <button key={item} className={value === item ? "active" : ""} onClick={() => onChange(item)} aria-label={`${label}: ${item} de 5`}>{item}</button>)}</div>
      <div className="scale-labels"><span>{low}</span><span>{high}</span></div>
    </div>
  );
}
