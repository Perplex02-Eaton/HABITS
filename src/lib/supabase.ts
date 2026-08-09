import { createClient, type SupabaseClient, type Session } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const supabase: SupabaseClient | null =
  url && key ? createClient(url, key) : null;

export interface SyncUser {
  id: string;
  email: string | null;
}

export function isCloudEnabled(): boolean {
  return Boolean(supabase);
}

let cachedSession: Session | null = null;

export function getSession(): Session | null {
  if (!supabase) return null;
  if (cachedSession) return cachedSession;
  const raw = localStorage.getItem("sb-session");
  if (raw) {
    try {
      cachedSession = JSON.parse(raw);
    } catch {
      cachedSession = null;
    }
  }
  return cachedSession;
}

export async function initSession(): Promise<Session | null> {
  if (!supabase) return null;
  const { data, error } = await supabase.auth.getSession();
  if (!error && data.session) {
    cachedSession = data.session;
    localStorage.setItem("sb-session", JSON.stringify(data.session));
  }
  return cachedSession;
}

export function currentUser(): SyncUser | null {
  const s = getSession();
  if (!s) return null;
  return { id: s.user.id, email: s.user.email ?? null };
}

export async function signInAnonymously(): Promise<SyncUser | null> {
  if (!supabase) return null;
  const { data, error } = await supabase.auth.signInAnonymously();
  if (error) return null;
  cachedSession = data.session;
  localStorage.setItem("sb-session", JSON.stringify(data.session));
  return { id: data.user?.id ?? "anon", email: data.user?.email ?? null };
}

export async function signUp(email: string, password: string): Promise<{ ok: boolean; error?: string }> {
  if (!supabase) return { ok: false, error: "Supabase no configurado" };
  const { data, error } = await supabase.auth.signUp({ email, password });
  if (error) return { ok: false, error: error.message };
  if (data.session) {
    cachedSession = data.session;
    localStorage.setItem("sb-session", JSON.stringify(data.session));
  }
  return { ok: true };
}

export async function signIn(email: string, password: string): Promise<{ ok: boolean; error?: string }> {
  if (!supabase) return { ok: false, error: "Supabase no configurado" };
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { ok: false, error: error.message };
  cachedSession = data.session;
  localStorage.setItem("sb-session", JSON.stringify(data.session));
  return { ok: true };
}

export async function signInWithGoogle(): Promise<{ ok: boolean; error?: string }> {
  if (!supabase) return { ok: false, error: "Supabase no configurado" };
  const { error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: `${window.location.origin}${window.location.pathname}` }
  });
  return error ? { ok: false, error: error.message } : { ok: true };
}

export async function signOut(): Promise<void> {
  if (!supabase) return;
  await supabase.auth.signOut();
  cachedSession = null;
  localStorage.removeItem("sb-session");
}

/** Guarda los datos del usuario en la nube. */
export async function pushData(data: unknown): Promise<boolean> {
  if (!supabase) return false;
  const user = currentUser();
  if (!user) return false;
  const row = {
    user_id: user.id,
    data,
    updated_at: new Date().toISOString()
  };
  const { error } = await supabase.from("habits_data").upsert(row, {
    onConflict: "user_id"
  });
  return !error;
}

/** Trae los datos de la nube, si existen. */
export async function pullData(): Promise<{ data: unknown; updatedAt: string } | null> {
  if (!supabase) return null;
  const user = currentUser();
  if (!user) return null;
  const { data, error } = await supabase
    .from("habits_data")
    .select("data, updated_at")
    .eq("user_id", user.id)
    .maybeSingle();
  if (error || !data) return null;
  return { data: data.data as unknown, updatedAt: (data as { updated_at: string }).updated_at };
}
