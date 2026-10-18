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
      // 404 = "no conozco ese nombre": lo devolvemos para poder explicarlo.
      return { ok: false, error: `agente respondió ${response.status}` };
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

export const agentOpenUrl = (url: string) => agentFetch("/open", { url });
export const agentOpenApp = (name: string) => agentFetch("/app", { name });
export const agentMedia = (action: MediaAction) => agentFetch("/media", { action }, 4000);
export const agentScreenshot = () => agentFetch("/screenshot", {}, 15000);
export const agentFocus = (title: string) => agentFetch("/focus", { title }, 8000);
export const agentType = (text: string) => agentFetch("/type", { text }, 12000);
export const agentClipboard = (text: string) => agentFetch("/clipboard", { text }, 8000);
export const agentLock = (delay = 6) => agentFetch("/lock", { delay }, 20000);

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
