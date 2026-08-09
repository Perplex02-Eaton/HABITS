import { create } from "zustand";
import type {
  AppData,
  Course,
  MealPlan,
  Idea,
  Task,
  Metric,
  Settings,
  Note,
  FixedGoal,
  DailyCheckIn,
  CalendarEvent
} from "../lib/types";
import { defaultAiConfig } from "../lib/ai";
import { uid } from "../lib/uid";
import {
  isCloudEnabled,
  initSession,
  currentUser,
  signOut as supabaseSignOut,
  pushData,
  pullData
} from "../lib/supabase";
import { fetchAccess } from "../lib/billing";
import { toast } from "./useToasts";

const STORAGE_KEY = "habits:data:v1";
const SAVED_KEY = "habits:savedAt:v1";
const CLOUD_SAVE_DELAY = 800;
let cloudSaveTimer: number | null = null;
let cloudSaveVersion = 0;
let cloudWriteChain: Promise<void> = Promise.resolve();

function withoutLocalSecrets(data: AppData): AppData {
  return {
    ...data,
    settings: {
      ...data.settings,
      newsApiKey: "",
      ai: { ...data.settings.ai, apiKey: "" }
    }
  };
}

function mergeRemoteData(remote: Partial<AppData>, local: AppData): AppData {
  const remoteSettings = remote.settings;
  return {
    ...defaultData(),
    ...remote,
    settings: {
      ...defaultData().settings,
      ...remoteSettings,
      newsApiKey: local.settings.newsApiKey,
      ai: {
        ...defaultData().settings.ai,
        ...remoteSettings?.ai,
        apiKey: local.settings.ai.apiKey
      }
    }
  };
}

export function defaultData(): AppData {
  return {
    courses: [],
    mealPlans: [],
    ideas: [],
    tasks: [],
    calendarEvents: [],
    metrics: [],
    notes: [],
    fixedGoals: [],
    dailyCheckIns: [],
    settings: {
      name: "",
      xHandle: "",
      instagramHandle: "",
      notifyClasses: true,
      notifyMeals: true,
      notifyTasks: true,
      reminderLead: 30,
      darkMode: "auto",
      ai: defaultAiConfig(),
      newsApiKey: "",
      spotifyClientId: ""
    }
  };
}

function loadLocal(): AppData {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultData();
    const parsed = JSON.parse(raw) as Partial<AppData>;
    return { ...defaultData(), ...parsed, settings: { ...defaultData().settings, ...parsed.settings } };
  } catch {
    return defaultData();
  }
}

function loadSavedAt(): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(SAVED_KEY) || "{}");
  } catch {
    return {};
  }
}

interface StoreState {
  data: AppData;
  hydrated: boolean;
  syncing: boolean;
  cloudEnabled: boolean;
  cloudUser: { id: string; email: string | null } | null;
  persist: () => void;
  pullCloud: () => Promise<void>;
  enableCloud: () => Promise<boolean>;
  disableCloud: () => Promise<void>;
  setSettings: (patch: Partial<Settings>) => void;
  addCourse: (c: Omit<Course, "id" | "createdAt">) => string;
  updateCourse: (id: string, patch: Partial<Course>) => void;
  deleteCourse: (id: string) => void;
  upsertMealPlan: (plan: MealPlan) => void;
  addIdea: (i: Omit<Idea, "id" | "createdAt" | "status">) => void;
  updateIdea: (id: string, patch: Partial<Idea>) => void;
  deleteIdea: (id: string) => void;
  addTask: (t: Omit<Task, "id" | "createdAt">) => void;
  updateTask: (id: string, patch: Partial<Task>) => void;
  deleteTask: (id: string) => void;
  addCalendarEvent: (event: Omit<CalendarEvent, "id" | "createdAt">) => void;
  updateCalendarEvent: (id: string, patch: Partial<CalendarEvent>) => void;
  deleteCalendarEvent: (id: string) => void;
  addMetric: (m: Omit<Metric, "id">) => void;
  deleteMetric: (id: string) => void;
  addNote: (n: Omit<Note, "id" | "createdAt" | "updatedAt">) => string;
  updateNote: (id: string, patch: Partial<Note>) => void;
  deleteNote: (id: string) => void;
  addFixedGoal: (goal: Omit<FixedGoal, "id" | "createdAt" | "completions">) => void;
  updateFixedGoal: (id: string, patch: Partial<FixedGoal>) => void;
  deleteFixedGoal: (id: string) => void;
  setGoalCompletion: (id: string, date: string, count: number) => void;
  upsertDailyCheckIn: (entry: DailyCheckIn) => void;
}

export const useStore = create<StoreState>((set, get) => ({
  data: defaultData(),
  hydrated: false,
  syncing: false,
  cloudEnabled: false,
  cloudUser: currentUser(),

  persist() {
    const d = get().data;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(d));
    const now = new Date().toISOString();
    const savedAt = loadSavedAt();
    savedAt.local = now;
    localStorage.setItem(SAVED_KEY, JSON.stringify(savedAt));
    if (get().cloudEnabled && get().cloudUser) {
      if (cloudSaveTimer !== null) window.clearTimeout(cloudSaveTimer);
      const version = ++cloudSaveVersion;
      cloudSaveTimer = window.setTimeout(() => {
        cloudWriteChain = cloudWriteChain.then(async () => {
          const latest = withoutLocalSecrets(get().data);
          const ok = await pushData(latest);
          if (ok && version === cloudSaveVersion) {
            const s = loadSavedAt();
            s.cloud = new Date().toISOString();
            localStorage.setItem(SAVED_KEY, JSON.stringify(s));
          }
        }).catch(() => undefined);
      }, CLOUD_SAVE_DELAY);
    }
  },

  async pullCloud() {
    const { cloudEnabled, cloudUser } = get();
    if (!cloudEnabled || !cloudUser) {
      set({ hydrated: true });
      return;
    }
    set({ syncing: true });
    try {
      const remote = await pullData();
      if (remote) {
        const savedAt = loadSavedAt();
        const remoteTime = new Date(remote.updatedAt).getTime();
        const localTime = new Date(savedAt.cloud || 0).getTime();
        if (remoteTime > localTime) {
          const remoteData = remote.data as Partial<AppData>;
          set({ data: mergeRemoteData(remoteData, get().data) });
        }
      }
    } catch {
      /* sin conexión */
    }
    set({ syncing: false, hydrated: true });
  },

  async enableCloud() {
    if (!isCloudEnabled()) {
      toast("Configura Supabase en el archivo .env", "⚙️");
      return false;
    }
    if (!get().cloudUser) {
      const user = currentUser();
      if (!user) {
        toast("Inicia sesión para activar la nube", "🔐");
        return false;
      }
      set({ cloudUser: user });
    }
    const access = await fetchAccess();
    if (access.plan !== "student" && access.plan !== "owner") {
      set({ cloudEnabled: false, cloudUser: currentUser() });
      toast("La sincronización está incluida en el plan Estudiante", "✦");
      return false;
    }
    set({ cloudEnabled: true, cloudUser: currentUser() });
    await get().pullCloud();
    get().persist();
    toast("Sincronización activada", "☁️");
    return true;
  },

  async disableCloud() {
    await supabaseSignOut();
    set({ cloudEnabled: false, cloudUser: null });
    toast("Sincronización desactivada", "🔒");
  },

  setSettings: (patch) =>
    set((s) => ({ data: { ...s.data, settings: { ...s.data.settings, ...patch } } })),
  addCourse: (c) => {
    const id = uid();
    set((s) => ({ data: { ...s.data, courses: [...s.data.courses, { ...c, id, createdAt: Date.now() }] } }));
    return id;
  },
  updateCourse: (id, patch) =>
    set((s) => ({
      data: {
        ...s.data,
        courses: s.data.courses.map((c) => (c.id === id ? { ...c, ...patch } : c))
      }
    })),
  deleteCourse: (id) =>
    set((s) => ({
      data: {
        ...s.data,
        courses: s.data.courses.filter((c) => c.id !== id),
        tasks: s.data.tasks.map((t) => (t.courseId === id ? { ...t, courseId: undefined } : t))
      }
    })),
  upsertMealPlan: (plan) =>
    set((s) => {
      const existing = s.data.mealPlans.find((p) => p.id === plan.id);
      const mealPlans = existing
        ? s.data.mealPlans.map((p) => (p.id === plan.id ? plan : p))
        : [...s.data.mealPlans, plan];
      return { data: { ...s.data, mealPlans } };
    }),
  addIdea: (i) =>
    set((s) => ({
      data: { ...s.data, ideas: [{ ...i, id: uid(), status: "idea" as const, createdAt: Date.now() }, ...s.data.ideas] }
    })),
  updateIdea: (id, patch) =>
    set((s) => ({
      data: { ...s.data, ideas: s.data.ideas.map((i) => (i.id === id ? { ...i, ...patch } : i)) }
    })),
  deleteIdea: (id) =>
    set((s) => ({ data: { ...s.data, ideas: s.data.ideas.filter((i) => i.id !== id) } })),
  addTask: (t) =>
    set((s) => ({ data: { ...s.data, tasks: [{ ...t, id: uid(), createdAt: Date.now() }, ...s.data.tasks] } })),
  updateTask: (id, patch) =>
    set((s) => ({
      data: { ...s.data, tasks: s.data.tasks.map((t) => (t.id === id ? { ...t, ...patch } : t)) }
    })),
  deleteTask: (id) =>
    set((s) => ({ data: { ...s.data, tasks: s.data.tasks.filter((t) => t.id !== id) } })),
  addCalendarEvent: (event) =>
    set((s) => ({
      data: {
        ...s.data,
        calendarEvents: [...s.data.calendarEvents, { ...event, id: uid(), createdAt: Date.now() }]
      }
    })),
  updateCalendarEvent: (id, patch) =>
    set((s) => ({
      data: {
        ...s.data,
        calendarEvents: s.data.calendarEvents.map((event) => event.id === id ? { ...event, ...patch } : event)
      }
    })),
  deleteCalendarEvent: (id) =>
    set((s) => ({ data: { ...s.data, calendarEvents: s.data.calendarEvents.filter((event) => event.id !== id) } })),
  addMetric: (m) =>
    set((s) => ({ data: { ...s.data, metrics: [...s.data.metrics, { ...m, id: uid() }] } })),
  deleteMetric: (id) =>
    set((s) => ({ data: { ...s.data, metrics: s.data.metrics.filter((m) => m.id !== id) } })),
  addNote: (n) => {
    const id = uid();
    const now = Date.now();
    set((s) => ({
      data: {
        ...s.data,
        notes: [{ ...n, id, createdAt: now, updatedAt: now }, ...s.data.notes]
      }
    }));
    return id;
  },
  updateNote: (id, patch) =>
    set((s) => ({
      data: {
        ...s.data,
        notes: s.data.notes.map((n) =>
          n.id === id ? { ...n, ...patch, updatedAt: Date.now() } : n
        )
      }
    })),
  deleteNote: (id) =>
    set((s) => ({ data: { ...s.data, notes: s.data.notes.filter((n) => n.id !== id) } })),
  addFixedGoal: (goal) =>
    set((s) => ({
      data: {
        ...s.data,
        fixedGoals: [{ ...goal, id: uid(), completions: {}, createdAt: Date.now() }, ...s.data.fixedGoals]
      }
    })),
  updateFixedGoal: (id, patch) =>
    set((s) => ({
      data: {
        ...s.data,
        fixedGoals: s.data.fixedGoals.map((goal) => goal.id === id ? { ...goal, ...patch } : goal)
      }
    })),
  deleteFixedGoal: (id) =>
    set((s) => ({ data: { ...s.data, fixedGoals: s.data.fixedGoals.filter((goal) => goal.id !== id) } })),
  setGoalCompletion: (id, date, count) =>
    set((s) => ({
      data: {
        ...s.data,
        fixedGoals: s.data.fixedGoals.map((goal) => goal.id === id
          ? { ...goal, completions: { ...goal.completions, [date]: Math.max(0, Math.round(count)) } }
          : goal)
      }
    })),
  upsertDailyCheckIn: (entry) =>
    set((s) => {
      const exists = s.data.dailyCheckIns.some((item) => item.date === entry.date);
      return {
        data: {
          ...s.data,
          dailyCheckIns: exists
            ? s.data.dailyCheckIns.map((item) => item.date === entry.date ? entry : item)
            : [...s.data.dailyCheckIns, entry]
        }
      };
    })
}));

export function initStore() {
  useStore.setState({ data: loadLocal(), hydrated: false, cloudUser: currentUser() });
  void initSession().then(async () => {
    const access = await fetchAccess();
    const premium = access.plan === "student" || access.plan === "owner";
    useStore.setState({ cloudUser: currentUser(), cloudEnabled: premium });
    if (premium) await useStore.getState().pullCloud();
    else useStore.setState({ hydrated: true });
  });
}

useStore.subscribe((state, prev) => {
  if (state.data !== prev.data) {
    useStore.getState().persist();
  }
});
