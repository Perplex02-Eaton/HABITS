import { supabase } from "./supabase";

export type AccessPlan = "guest" | "free" | "student" | "owner";

export interface AppAccess {
  plan: AccessPlan;
  isOwner: boolean;
  subscriptionStatus: string;
  periodEnd: string | null;
}

export const GUEST_ACCESS: AppAccess = {
  plan: "guest",
  isOwner: false,
  subscriptionStatus: "none",
  periodEnd: null
};

/**
 * Cuenta propietaria local.
 *
 * El propietario real se nombra en la base de datos (`public.app_admins`), pero
 * eso exige Supabase en línea. Este desbloqueo guarda en ESTE dispositivo que
 * su dueño entró como propietario: sirve cuando la nube no está disponible y no
 * sustituye a la cuenta de la nube, solo la respalda.
 */
const LOCAL_OWNER_KEY = "habits.owner.local";

export const LOCAL_OWNER_EMAIL = "habits@eaton.dev";

export interface LocalOwner {
  email: string;
  since: string;
}

export function readLocalOwner(): LocalOwner | null {
  try {
    const raw = localStorage.getItem(LOCAL_OWNER_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<LocalOwner>;
    if (!parsed || typeof parsed.email !== "string" || !parsed.email.trim()) return null;
    return {
      email: parsed.email.trim().toLowerCase(),
      since: typeof parsed.since === "string" ? parsed.since : ""
    };
  } catch {
    return null;
  }
}

export function setLocalOwner(email: string): LocalOwner | null {
  const clean = email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean)) return null;
  const owner: LocalOwner = { email: clean, since: new Date().toISOString() };
  try {
    localStorage.setItem(LOCAL_OWNER_KEY, JSON.stringify(owner));
  } catch {
    return null;
  }
  return owner;
}

export function clearLocalOwner(): void {
  try {
    localStorage.removeItem(LOCAL_OWNER_KEY);
  } catch {
    /* almacenamiento no disponible */
  }
}

const OWNER_ACCESS: AppAccess = {
  plan: "owner",
  isOwner: true,
  subscriptionStatus: "owner",
  periodEnd: null
};

export async function fetchAccess(): Promise<AppAccess> {
  // Cuenta propietaria de este dispositivo (funciona sin nube)
  if (readLocalOwner()) return OWNER_ACCESS;
  // Sin Supabase configurado → acceso gratuito completo (sin paywall)
  if (!supabase) {
    return { plan: "free", isOwner: false, subscriptionStatus: "none", periodEnd: null };
  }
  try {
    const { data: session } = await supabase.auth.getSession();
    if (!session.session) {
      return { plan: "free", isOwner: false, subscriptionStatus: "none", periodEnd: null };
    }
    const { data, error } = await supabase.rpc("get_my_access");
    if (error || !Array.isArray(data) || !data[0]) {
      return { plan: "free", isOwner: false, subscriptionStatus: "none", periodEnd: null };
    }
    const row = data[0] as Record<string, unknown>;
    return {
      plan: (row.plan as AccessPlan) || "free",
      isOwner: Boolean(row.is_owner),
      subscriptionStatus: String(row.subscription_status || "none"),
      periodEnd: typeof row.period_end === "string" ? row.period_end : null
    };
  } catch {
    // Si falla la conexión, acceso gratuito
    return { plan: "free", isOwner: false, subscriptionStatus: "none", periodEnd: null };
  }
}

export async function createSubscription(cycle: "monthly" | "yearly"): Promise<string> {
  if (!supabase) throw new Error("Supabase no está configurado");
  const { data, error } = await supabase.functions.invoke("create-subscription", {
    body: { cycle }
  });
  if (error) throw error;
  if (!data?.initPoint) throw new Error(data?.error || "No se pudo crear el checkout");
  return data.initPoint as string;
}
