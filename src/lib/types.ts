export type Day = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export interface ScheduleItem {
  id: string;
  courseId: string;
  day: Day;
  start: string;
  end: string;
  room?: string;
  online?: boolean;
}

export interface Course {
  id: string;
  name: string;
  code?: string;
  professor?: string;
  color: string;
  schedule: ScheduleItem[];
  createdAt: number;
}

export type MealType = "desayuno" | "almuerzo" | "cena" | "snack";

export const MEAL_TYPES: { value: MealType; label: string; icon: string }[] = [
  { value: "desayuno", label: "Desayuno", icon: "🍳" },
  { value: "almuerzo", label: "Almuerzo", icon: "🍽️" },
  { value: "cena", label: "Cena", icon: "🌙" },
  { value: "snack", label: "Snack", icon: "🍎" }
];

export interface Meal {
  id: string;
  type: MealType;
  name: string;
  notes?: string;
  consumed: boolean;
}

export interface MealPlan {
  id: string;
  date: string;
  meals: Meal[];
}

export type Platform = "x" | "instagram" | "ambos";

export interface Idea {
  id: string;
  title: string;
  topic: string;
  content: string;
  platform: Platform;
  status: "idea" | "draft" | "canva" | "posted";
  createdAt: number;
}

export type Priority = "alta" | "media" | "baja";

export interface Task {
  id: string;
  title: string;
  description?: string;
  courseId?: string;
  dueDate: string;
  dueTime?: string;
  priority: Priority;
  status: "pending" | "done";
  remind: boolean;
  createdAt: number;
}

export type CalendarEventCategory = "personal" | "estudio" | "salud" | "otro";

export interface CalendarEvent {
  id: string;
  title: string;
  date: string;
  start: string;
  end?: string;
  category: CalendarEventCategory;
  location?: string;
  notes?: string;
  createdAt: number;
}

export interface Metric {
  id: string;
  date: string;
  category: string;
  value: number;
}

export type FrequencyPreset = {
  name: string;
  freq: number;
  desc: string;
};

export interface Settings {
  name: string;
  xHandle?: string;
  instagramHandle?: string;
  notifyClasses: boolean;
  notifyMeals: boolean;
  notifyTasks: boolean;
  reminderLead: number;
  darkMode: "auto" | "light" | "dark";
  accentColor?: string;
  ai: AiConfig;
  newsApiKey: string;
  spotifyClientId: string;
}

export interface AiConfig {
  baseUrl: string;
  model: string;
  apiKey: string;
}

export interface NoteImage {
  id: string;
  name: string;
  kind: "upload" | "drawing" | "pdf";
  createdAt: number;
}

export interface NoteChecklistItem {
  id: string;
  text: string;
  done: boolean;
}

export interface Note {
  id: string;
  title: string;
  content: string;
  images: string[];
  drawingId: string | null;
  checklist: NoteChecklistItem[];
  pinned: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface FixedGoal {
  id: string;
  title: string;
  targetPerDay: number;
  active: boolean;
  completions: Record<string, number>;
  createdAt: number;
}

export interface AppData {
  courses: Course[];
  mealPlans: MealPlan[];
  ideas: Idea[];
  tasks: Task[];
  calendarEvents: CalendarEvent[];
  metrics: Metric[];
  notes: Note[];
  fixedGoals: FixedGoal[];
  settings: Settings;
}
