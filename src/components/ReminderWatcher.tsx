import { useEffect, useRef } from "react";
import { useStore } from "../stores/useStore";
import { requestPermission, notify } from "../lib/notify";
import { todayKey, timeToMinutes, minutesNow } from "../lib/dates";
import { MEAL_TYPES } from "../lib/types";

export default function ReminderWatcher() {
  const fired = useRef<Set<string>>(new Set());

  useEffect(() => {
    void requestPermission();
  }, []);

  const courses = useStore((s) => s.data.courses);
  const tasks = useStore((s) => s.data.tasks);
  const mealPlans = useStore((s) => s.data.mealPlans);
  const settings = useStore((s) => s.data.settings);

  useEffect(() => {
    const check = () => {
      const now = minutesNow();
      const lead = settings.reminderLead;

      if (settings.notifyClasses) {
        for (const c of courses) {
          for (const sc of c.schedule) {
            if (sc.day !== new Date().getDay()) continue;
            const diff = timeToMinutes(sc.start) - now;
            if (diff > 0 && diff <= lead) {
              const key = `class:${c.id}:${sc.id}`;
              if (!fired.current.has(key)) {
                fired.current.add(key);
                notify(`📚 ${c.name}`, `Empieza a las ${sc.start}${sc.room ? ` · ${sc.room}` : ""}`);
              }
            }
          }
        }
      }

      if (settings.notifyTasks) {
        const today = todayKey();
        for (const t of tasks) {
          if (t.status === "done" || t.dueDate !== today || !t.dueTime) continue;
          const diff = timeToMinutes(t.dueTime) - now;
          if (diff > 0 && diff <= lead) {
            const key = `task:${t.id}`;
            if (!fired.current.has(key)) {
              fired.current.add(key);
              notify(`✅ Tarea pendiente`, `«${t.title}» vence hoy a las ${t.dueTime}`);
            }
          }
        }
      }

      if (settings.notifyMeals) {
        const today = todayKey();
        const plan = mealPlans.find((p) => p.date === today);
        if (plan) {
          for (const m of plan.meals) {
            if (m.consumed) continue;
            const type = MEAL_TYPES.find((t) => t.value === m.type);
            if (!type) continue;
            const times: Record<string, string> = {
              desayuno: "07:30",
              almuerzo: "12:30",
              cena: "19:30",
              snack: "16:00"
            };
            const t = times[m.type];
            if (!t) continue;
            const diff = timeToMinutes(t) - now;
            if (diff > 0 && diff <= lead) {
              const key = `meal:${m.id}`;
              if (!fired.current.has(key)) {
                fired.current.add(key);
                notify(`🍽️ ${type.label} · ${m.name}`, `Recuerda que hoy debes consumir esto para tu alimentación`);
              }
            }
          }
        }
      }
    };

    check();
    const id = window.setInterval(check, 30000);
    return () => window.clearInterval(id);
  }, [courses, tasks, mealPlans, settings]);

  return null;
}
