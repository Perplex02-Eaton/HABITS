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

export async function fetchAccess(): Promise<AppAccess> {
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
