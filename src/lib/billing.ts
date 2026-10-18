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
 * HABITS es gratis y de código abierto: no hay planes, ni muros de pago, ni
 * suscripciones. Todas las funciones están disponibles para todas las personas
 * desde el primer segundo, así que siempre hay acceso total.
 */
export const FREE_ACCESS: AppAccess = {
  plan: "free",
  isOwner: false,
  subscriptionStatus: "open-source",
  periodEnd: null
};

const FULL_ACCESS: AppAccess = {
  plan: "owner",
  isOwner: true,
  subscriptionStatus: "owner",
  periodEnd: null
};

/** Todos tienen acceso a todo, siempre. No hay nada que comprar ni activar. */
export async function fetchAccess(): Promise<AppAccess> {
  return FULL_ACCESS;
}

/** Con HABITS libre, el acceso siempre está completo. */
export function hasFullAccess(_access: AppAccess): boolean {
  return true;
}

/** Texto corto para mostrar el estado del acceso. */
export function accessLabel(access: AppAccess): string {
  return access.isOwner ? "Acceso total · código abierto" : "Gratis · acceso total";
}
