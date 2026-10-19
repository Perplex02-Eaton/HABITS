/**
 * Puente con el AGENTE LOCAL de Jarvis (scripts/jarvis_agent.py).
 *
 * El agente es un servidor en 127.0.0.1:8877 que le da "manos" a Jarvis:
 * abrir apps nativas de Windows, controlar multimedia, capturas de pantalla,
 * traer ventanas al frente, escribir texto, bloquear la PC y guardar URLs.
 *
 * Chrome permite que una página pública hable con 127.0.0.1 (origen
 * potencialmente confiable); si el agente no está corriendo, cada función
 * devuelve null y la interfaz avisa en lugar de quedarse colgada.
 */

export const AGENT_ORIGIN = "http://127.0.0.1:8877";

/** Marca que `dispatch()` devuelve cuando la respuesta la tiene que dar el agente. */
export const AGENT_SENTINEL = "__AGENT__";

export type AgentInfo = {
  ok: boolean;
  agent: string;
  version: string;
  capabilities: string[];
  apps: string[];
  folders: string[];
};

export type AgentResult = {
  ok: boolean;
  error?: string | null;
  kind?: string;
  target?: string;
  path?: string;
  [key: string]: unknown;
};

export type MediaAction = "play_pause" | "next" | "prev" | "stop" | "vol_up" | "vol_down" | "mute";

let infoCache: { at: number; info: AgentInfo | null } | null = null;
const INFO_TTL = 20_000;

async function agentFetch(
  path: string,
  params: Record<string, string | number> = {},
  timeoutMs = 6000
): Promise<AgentResult | null> {
  if (typeof window === "undefined") return null;
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => query.set(key, String(value)));
  const url = `${AGENT_ORIGIN}${path}${query.toString() ? `?${query}` : ""}`;
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { signal: controller.signal, cache: "no-store" });
    if (!response.ok && response.status !== 404) {
      // 4xx/5xx también traen información útil (steps, needs_connect): la conservamos.
      try {
        const body = (await response.json()) as AgentResult;
        return { ...body, ok: false };
      } catch {
        return { ok: false, error: `agente respondió ${response.status}` };
      }
    }
    return (await response.json()) as AgentResult;
  } catch {
    if (infoCache) infoCache = { at: Date.now(), info: null };
    return null;
  } finally {
    window.clearTimeout(timer);
  }
}

/** ¿Está vivo el agente? Cachea el resultado para no golpearlo en cada frase. */
export async function agentStatus(force = false): Promise<AgentInfo | null> {
  if (!force && infoCache && Date.now() - infoCache.at < INFO_TTL) return infoCache.info;
  const result = await agentFetch("/health", {}, 2500);
  const info = result && result.ok ? (result as unknown as AgentInfo) : null;
  infoCache = { at: Date.now(), info };
  return info;
}

/** POST al agente local (para el motor de lenguaje que corre en la propia PC). */
async function agentPost(
  path: string,
  body: Record<string, unknown>,
  timeoutMs = 6000
): Promise<AgentResult | null> {
  if (typeof window === "undefined") return null;
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${AGENT_ORIGIN}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
      cache: "no-store"
    });
    try {
      const data = (await response.json()) as AgentResult;
      return response.ok ? data : { ...data, ok: false };
    } catch {
      return { ok: false, error: `agente respondió ${response.status}` };
    }
  } catch {
    return null;
  } finally {
    window.clearTimeout(timer);
  }
}

export type AgentLlmStatus = {
  ok: boolean;
  ollama: string;
  model: string;
  models: string[];
  ready: boolean;
  error?: string;
};

/** ¿Está listo el motor de lenguaje local (Ollama)? No gasta créditos. */
export async function agentLlmStatus(timeoutMs = 3500): Promise<AgentLlmStatus | null> {
  const result = await agentFetch("/llm-status", {}, timeoutMs);
  if (!result || !("ready" in result)) return null;
  return result as unknown as AgentLlmStatus;
}

export type AgentAskResult = {
  ok: boolean;
  text?: string;
  model?: string;
  provider?: string;
  seconds?: number;
  error?: string;
  hint?: string;
};

/**
 * Pregunta al motor de lenguaje LOCAL (Ollama en esta misma PC). Costo cero y
 * funciona aunque no haya internet ni API key.
 */
export function agentAsk(
  text: string,
  opts: { context?: string; history?: Array<{ role: string; text: string }>; model?: string; numCtx?: number } = {}
): Promise<AgentAskResult | null> {
  return agentPost(
    "/ask",
    {
      text,
      context: opts.context ?? "",
      history: opts.history ?? [],
      model: opts.model ?? "",
      num_ctx: opts.numCtx ?? 8192
    },
    300000
  ) as Promise<AgentAskResult | null>;
}

export const agentOpenUrl = (url: string) => agentFetch("/open", { url });
export const agentOpenApp = (name: string) => agentFetch("/app", { name });
export const agentMedia = (action: MediaAction) => agentFetch("/media", { action }, 4000);
export const agentScreenshot = () => agentFetch("/screenshot", {}, 15000);
export const agentFocus = (title: string) => agentFetch("/focus", { title }, 8000);
export const agentType = (text: string) => agentFetch("/type", { text }, 12000);
export const agentClipboard = (text: string) => agentFetch("/clipboard", { text }, 8000);
export const agentLock = (delay = 6) => agentFetch("/lock", { delay }, 20000);

/**
 * Resultado de releer UTP+class. `live` = se pudieron leer las TAREAS reales de
 * la API del aula; `needs_connect` = la sesión venció y hay que re-capturarla
 * con el clic del bookmarklet.
 */
export type UtpRefreshResult = AgentResult & {
  live?: boolean;
  needs_connect?: boolean;
  steps?: string[];
  current_week?: number;
  generated_at?: string;
  courses?: number;
  utp_tasks?: number;
  connect_port?: number;
};

export type UtpConnectResult = AgentResult & {
  port?: number;
  receiver?: string;
  url?: string;
  opened?: string[];
  started?: boolean;
  steps?: string[];
};

/**
 * Relee UTP+class: el agente lee las tareas EN VIVO con la sesión guardada y
 * regenera la memoria de clases (~/.hermes/utp_courses.json +
 * public/utp-courses.json). Timeout amplio: sincroniza y luego reconstruye.
 */
export const agentUtpRefresh = (live = true) =>
  agentFetch("/utp-refresh", live ? {} : { live: 0 }, 150000) as Promise<UtpRefreshResult | null>;

/**
 * Un clic para reconectar UTP+class: levanta el receptor local (127.0.0.1:8899)
 * y abre UTP+class + la página del botón "Sincronizar con HABITS".
 */
export const agentUtpConnect = (withInstallPage = true) =>
  agentFetch("/utp-connect", withInstallPage ? {} : { install: 0 }, 30000) as Promise<UtpConnectResult | null>;

/** Acciones que Jarvis sabe pedirle al agente (para la pantalla de ayuda/estado). */
export const AGENT_ACTIONS: Array<{ say: string; what: string }> = [
  { say: "abre YouTube / Spotify / VS Code / la carpeta de HABITS", what: "abre apps, sitios y carpetas" },
  { say: "entra al aula virtual UTP", what: "abre class.utp.edu.pe" },
  { say: "pausa la música / siguiente / anterior", what: "controla la reproducción" },
  { say: "sube el volumen / silencio", what: "controla el volumen" },
  { say: "toma una captura de pantalla", what: "guarda un PNG en Imágenes\\JarvisCapturas" },
  { say: "trae Spotify al frente", what: "trae una ventana al frente" },
  { say: "escribe Hola mundo en la ventana activa", what: "teclea texto por ti" },
  { say: "copia este texto…", what: "deja texto en el portapapeles" },
  { say: "prepara la tarea de Importaciones", what: "abre el aula UTP y te deja la tarea lista para pegar" },
  { say: "bloquea la PC", what: "bloquea la sesión de Windows" },
];

/** Mensaje único cuando el agente no responde, para no repetir el texto en cada intent. */
export const AGENT_OFFLINE_MSG =
  "El agente local está apagado, jefe. Enciéndelo con scripts\\jarvis-agent.bat (o reinicia la PC: ya quedó en el arranque automático).";

export function agentTargetName(result: AgentResult | null): string {
  if (!result) return "";
  const target = String(result.target ?? result.path ?? "");
  return target.length > 70 ? `${target.slice(0, 67)}…` : target;
}
