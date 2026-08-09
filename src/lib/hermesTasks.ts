/**
 * Hook to fetch tasks created by Hermes from the hermes_tasks table in Supabase.
 * These are merged into the Tasks page alongside local tasks.
 */
import { useEffect, useState } from "react";
import { supabase } from "./supabase";
import type { Task } from "./types";

export interface HermesTask {
  id: string;
  title: string;
  description: string | null;
  course: string | null;
  due_date: string;
  due_time: string | null;
  priority: "alta" | "media" | "baja";
  status: "pending" | "done";
  source: string;
  created_at: string;
}

/** Convert a HermesTask row into the app's Task shape. */
function toAppTask(ht: HermesTask): Task {
  return {
    id: `hermes:${ht.id}`,
    title: `🤖 ${ht.title}`,
    description: ht.description ?? undefined,
    courseId: undefined, // Hermes tasks use course name, not ID
    dueDate: ht.due_date,
    dueTime: ht.due_time?.slice(0, 5) ?? "",
    priority: ht.priority,
    status: ht.status,
    remind: true,
    createdAt: new Date(ht.created_at).getTime(),
  };
}

export function useHermesTasks() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!supabase) return;

    let cancelled = false;

    async function fetch() {
      setLoading(true);
      try {
        const { data, error } = await supabase!
          .from("hermes_tasks")
          .select("*")
          .order("due_date", { ascending: true });

        if (!error && data && !cancelled) {
          setTasks((data as HermesTask[]).map(toAppTask));
        }
      } catch {
        // offline — skip
      }
      if (!cancelled) setLoading(false);
    }

    fetch();

    // Poll every 30s for new tasks from Hermes
    const interval = setInterval(fetch, 30_000);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  return { hermesTasks: tasks, hermesLoading: loading };
}
