/**
 * ACOMPAÑANTE — sesión con permiso sobre un equipo, en 2º plano.
 *
 * Idea, en una frase: la IA no controla un celular o laptop "desde fuera"; corre
 * en el equipo de la persona, que autoriza con un código de 6 dígitos, ve un
 * banner con temporizador y puede colgar en cualquier momento. Todo lo que se
 * hace queda en un historial que es del dueño del equipo.
 *
 * Este archivo habla con el hub local (`scripts/companion_hub.py`, puerto 8898).
 * Si el hub no está levantado, la app sigue funcionando en MODO LOCAL: la sesión
 * vive en este navegador (útil para probar el flujo y para que la interfaz nunca
 * se quede colgada), y se avisa claramente de que no hay otra persona conectada.
 *
 * Lo que NUNCA pasa por aquí: contraseñas, códigos de verificación, datos de
 * tarjeta y claves. No se guardan pantallas ni se retransmite audio.
 */

export type CompanionRole = "pide" | "ayuda";
export type CompanionStatus = "esperando" | "activa" | "cerrada";
export type ActionStatus = "hecho" | "esperando" | "aprobado" | "rechazado" | "fallo";

export interface CompanionAction {
  id: string;
  at: number;
  kind: string;
  label: string;
  detail?: string;
  by: string;
  sensible: boolean;
  status: ActionStatus;
  result?: string;
}

export interface CompanionSession {
  id: string;
  code: string;
  role: CompanionRole;
  status: CompanionStatus;
  device: string;
  peer?: string | null;
  startedAt: number;
  expiresAt: number;
  actions: CompanionAction[];
  token?: string;
  lanUrl?: string;
  /** true = no hay hub: la sesión es sólo de este navegador. */
  soloAqui?: boolean;
  closedReason?: string;
}

/** Minutos que dura una sesión antes de cerrarse sola. */
export const SESSION_MINUTES = 30;
const STORE_KEY = "habits.companion.v1";
const HUB_KEY = "habits.companion.hub";
export const DEFAULT_PORT = 8898;

/* ─────────────────────────── acciones del corte 1 ─────────────────────────── */

export interface F1Action {
  id: string;
  label: string;
  hint: string;
  sensible: boolean;
}

/** Las tres acciones del primer corte: todo lo demás llega después. */
export const F1_ACTIONS: F1Action[] = [
  {
    id: "abrir",
    label: "Abrir una página y resumirla",
    hint: "Dime la dirección o el tema; se abre en tu equipo y te digo lo importante.",
    sensible: false
  },
  {
    id: "buscar",
    label: "Buscar un trámite y reportar los pasos",
    hint: "Busca en el navegador y te devuelve los pasos, en orden y sin vueltas.",
    sensible: false
  },
  {
    id: "whatsapp",
    label: "Escribir y enviar un mensaje en WhatsApp Web",
    hint: "Redacta el mensaje; el último clic de envío lo apruebas tú.",
    sensible: true
  }
];

/** Reglas visibles en la interfaz: son el contrato de la sesión. */
export const COMPANION_RULES: string[] = [
  "El agente corre en tu equipo: no hay control desde fuera.",
  "La sesión dura 30 minutos y se puede colgar en un clic.",
  "Nunca se piden contraseñas, códigos de verificación ni tarjetas.",
  "Lo sensible (enviar, escribir, pagar) espera tu aprobación en pantalla.",
  "El historial es tuyo: vive en memoria y se borra al cerrar la sesión.",
  "Nada oculto: sin modo silencioso ni arranque automático."
];

/* ──────────────────────────────── almacén ──────────────────────────────── */

type Listener = (session: CompanionSession | null) => void;

const listeners = new Set<Listener>();
let current: CompanionSession | null = null;

function read(): CompanionSession | null {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CompanionSession;
    if (!parsed?.id) return null;
    if (parsed.status !== "cerrada" && Date.now() > parsed.expiresAt) {
      return { ...parsed, status: "cerrada", closedReason: "caducó" };
    }
    return parsed;
  } catch {
    return null;
  }
}

function write(session: CompanionSession | null) {
  current = session;
  try {
    if (session) localStorage.setItem(STORE_KEY, JSON.stringify(session));
    else localStorage.removeItem(STORE_KEY);
  } catch {
    /* sin espacio: la sesión sigue viva en memoria */
  }
  listeners.forEach((fn) => fn(session));
}

export function subscribeCompanion(fn: Listener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function currentSession(): CompanionSession | null {
  if (current === null) current = read();
  return current;
}

export function remainingMs(session: CompanionSession | null): number {
  if (!session) return 0;
  return Math.max(0, session.expiresAt - Date.now());
}

export function formatClock(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  const mm = Math.floor(total / 60);
  const ss = total % 60;
  return `${mm}:${String(ss).padStart(2, "0")}`;
}

/* ───────────────────────────────── hub ────────────────────────────────── */

function readHub(): string | null {
  try {
    return localStorage.getItem(HUB_KEY);
  } catch {
    return null;
  }
}

export function hubBase(): string {
  const saved = readHub();
  if (saved) return saved.replace(/\/$/, "");
  if (typeof window === "undefined") return "";
  const host = window.location.hostname || "127.0.0.1";
  // En local el hub vive en esta misma máquina; desde el celular, en la IP de la laptop.
  const target = host === "localhost" || host === "127.0.0.1" ? "127.0.0.1" : host;
  return `http://${target}:${DEFAULT_PORT}`;
}

export function setHubBase(base: string) {
  try {
    const clean = base.trim().replace(/\/$/, "");
    if (clean) localStorage.setItem(HUB_KEY, clean);
    else localStorage.removeItem(HUB_KEY);
  } catch {
    /* nada */
  }
}

async function hubCall<T>(path: string, body?: Record<string, unknown>, timeoutMs = 6000): Promise<T | null> {
  if (typeof window === "undefined") return null;
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${hubBase()}${path}`, {
      method: body ? "POST" : "GET",
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
      cache: "no-store"
    });
    const data = (await response.json()) as T & { ok?: boolean };
    return data;
  } catch {
    return null;
  } finally {
    window.clearTimeout(timer);
  }
}

export interface HubInfo {
  ok: boolean;
  service: string;
  version: string;
  port: number;
  lan_url: string;
  session_minutes: number;
}

export async function hubHealth(): Promise<HubInfo | null> {
  const res = await hubCall<HubInfo>("/health", undefined, 2500);
  return res?.ok ? res : null;
}

function localCode(): string {
  return String(Math.floor(Math.random() * 1_000_000)).padStart(6, "0");
}

/* ─────────────────────────────── acciones ─────────────────────────────── */

/** Pedir ayuda: abre la sesión y devuelve el código para la otra persona. */
export async function startHelpSession(device: string, owner = ""): Promise<CompanionSession> {
  const health = await hubHealth();
  const base: CompanionSession = {
    id: `s${Date.now().toString(36)}`,
    code: localCode(),
    role: "pide",
    status: "esperando",
    device,
    peer: null,
    startedAt: Date.now(),
    expiresAt: Date.now() + SESSION_MINUTES * 60_000,
    actions: [],
    soloAqui: !health,
    lanUrl: health?.lan_url
  };
  if (health) {
    const created = await hubCall<{ ok: boolean; id: string; code: string; token: string; expires_at: number; lan_url: string }>(
      "/session",
      { device, owner }
    );
    if (created?.ok) {
      Object.assign(base, {
        id: created.id,
        code: created.code,
        token: created.token,
        expiresAt: created.expires_at,
        lanUrl: created.lan_url,
        soloAqui: false
      });
    }
  }
  write(base);
  return base;
}

/** Unirse con el código: convierte este navegador en el que ayuda. */
export async function joinHelpSession(code: string, name: string): Promise<{ ok: boolean; error?: string }> {
  const clean = code.replace(/\D/g, "").slice(0, 6);
  const health = await hubHealth();
  if (!health) {
    // Modo local: sirve para probar el flujo en un solo equipo.
    const local = currentSession();
    if (!local || local.role !== "pide") {
      return { ok: false, error: "No hay ninguna sesión abierta en este equipo. Pide ayuda primero." };
    }
    if (local.code !== clean) return { ok: false, error: "El código no coincide." };
    write({ ...local, status: "activa", peer: name, soloAqui: true });
    return { ok: true };
  }
  const res = await hubCall<{
    ok: boolean;
    token?: string;
    error?: string;
    session?: {
      id: string;
      code: string;
      status: CompanionStatus;
      device?: string;
      started_at?: number;
      expires_at?: number;
      actions?: CompanionAction[];
    };
  }>("/pair", { code: clean, name });
  if (!res?.ok || !res.session) return { ok: false, error: res?.error ?? "No pude emparejar. Revisa el código." };
  const s = res.session;
  write({
    id: s.id,
    code: s.code,
    role: "ayuda",
    status: s.status,
    device: s.device ?? "",
    peer: name,
    startedAt: s.started_at ?? Date.now(),
    expiresAt: s.expires_at ?? Date.now() + SESSION_MINUTES * 60_000,
    actions: s.actions ?? [],
    token: res.token,
    lanUrl: hubBase()
  });
  return { ok: true };
}

/** Registra una acción en el historial (y pide aprobación si es sensible). */
export async function logCompanionAction(
  kind: F1Action | { id: string; label: string; sensible: boolean },
  detail = "",
  by: string
): Promise<CompanionAction | null> {
  const session = currentSession();
  if (!session || session.status === "cerrada") return null;

  if (!session.soloAqui) {
    const res = await hubCall<{ ok: boolean; action?: CompanionAction; session?: CompanionSession }>("/action", {
      id: session.id,
      token: session.token,
      kind: kind.id,
      label: kind.label,
      detail,
      sensible: kind.sensible
    });
    if (res?.ok && res.action) {
      write({ ...session, status: "activa", actions: res.session?.actions ?? [res.action, ...session.actions] });
      return res.action;
    }
  }

  const action: CompanionAction = {
    id: `a${Date.now().toString(36)}`,
    at: Date.now(),
    kind: kind.id,
    label: kind.label,
    detail,
    by,
    sensible: kind.sensible,
    status: kind.sensible ? "esperando" : "hecho"
  };
  write({ ...session, status: "activa", actions: [action, ...session.actions] });
  return action;
}

/** El dueño decide sobre una acción sensible. Nadie más puede hacerlo. */
export async function decideCompanionAction(actionId: string, ok: boolean): Promise<void> {
  const session = currentSession();
  if (!session) return;
  if (!session.soloAqui) {
    const res = await hubCall<{ ok: boolean; session?: CompanionSession }>("/approve", {
      id: session.id,
      token: session.token,
      action_id: actionId,
      ok
    });
    if (res?.ok && res.session) {
      write({ ...session, actions: res.session.actions });
      return;
    }
  }
  write({
    ...session,
    actions: session.actions.map((a) => (a.id === actionId ? { ...a, status: ok ? "aprobado" : "rechazado" } : a))
  });
}

/** Colgar: cierra la sesión y deja el historial visible hasta recargar. */
export async function closeCompanionSession(reason = "colgó el usuario"): Promise<void> {
  const session = currentSession();
  if (!session) return;
  if (session.token && !session.soloAqui) {
    await hubCall("/close", { id: session.id, token: session.token }, 3000);
  }
  write({ ...session, status: "cerrada", closedReason: reason });
}

/**
 * Trae el estado real de la sesión desde el hub.
 *
 * Sin esto el dueño no vería lo que propone la otra persona: el hub no empuja
 * nada, así que la app pregunta cada pocos segundos. Es el mismo token del dueño
 * el que viaja, así que nadie más puede ver la sesión.
 */
export async function syncFromHub(): Promise<void> {
  const session = currentSession();
  if (!session || session.soloAqui || !session.token || session.status === "cerrada") return;
  const res = await hubCall<{
    ok: boolean;
    session?: {
      id: string;
      status?: CompanionStatus;
      peer?: string | null;
      expires_at?: number;
      closed_reason?: string | null;
      actions?: CompanionAction[];
    };
  }>("/state", { id: session.id, token: session.token }, 4000);
  const remote = res?.session;
  if (!res?.ok || !remote) return;
  const next: CompanionSession = {
    ...session,
    status: remote.status ?? session.status,
    peer: remote.peer ?? session.peer,
    expiresAt: remote.expires_at ?? session.expiresAt,
    actions: remote.actions ?? session.actions,
    closedReason: remote.closed_reason ?? session.closedReason
  };
  // Sólo se avisa a la interfaz si algo cambió de verdad (evita repintar en bucle).
  const changed =
    next.status !== session.status ||
    next.peer !== session.peer ||
    next.expiresAt !== session.expiresAt ||
    (next.actions?.length ?? 0) !== (session.actions?.length ?? 0) ||
    JSON.stringify(next.actions?.[0] ?? null) !== JSON.stringify(session.actions?.[0] ?? null);
  if (!changed) return;
  write(next);
}

/** Olvida la sesión por completo (botón «borrar historial»). */
export function forgetCompanionSession() {
  write(null);
}

/** ¿El equipo destino tiene manos? Contrasta con el agente local de HABITS. */
export async function deviceAgentAlive(): Promise<boolean> {
  try {
    const response = await fetch("http://127.0.0.1:8877/health", { cache: "no-store" });
    const data = (await response.json()) as { ok?: boolean };
    return Boolean(data?.ok);
  } catch {
    return false;
  }
}
