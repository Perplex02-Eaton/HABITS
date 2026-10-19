import { aiAssistant, aiConfigured } from "./ai";
import { webEngineReady, askWebEngine, webEngineState, loadWebEngine } from "./browserEngine";
import { agentAsk, agentLlmStatus } from "./desktop";
import type { AiConfig } from "./types";

/**
 * Cadena de proveedores de JARVIS, ordenada de lo más barato a lo más caro.
 *
 *  1. MEMORIA  — respuestas que JARVIS ya sabe (reglas, datos, rutinas). Costo 0.
 *  2. CACHÉ    — la misma pregunta ya se respondió: se repite la respuesta. Costo 0.
 *  3. LOCAL    — Ollama en esta PC, vía el agente 127.0.0.1:8877. Costo 0 y sin internet.
 *  4. EQUIPO   — el modelo corre dentro del navegador del usuario (WebGPU/WASM).
 *                Costo 0, sin claves, sin servidor, sin depender de ninguna laptop.
 *  5. NUBE     — DeepSeek/OpenAI compatible, sólo si hay API key, cupo diario y no
 *                está en pausa por errores. Es el único que gasta crédito.
 *
 * Si la nube falla (401/402/429, cuota, clave caída), el cortacircuitos la deja
 * en pausa y la app sigue funcionando con los cuatro caminos gratis.
 */

export type JarvisMode = "memoria" | "cache" | "local" | "equipo" | "nube";

export interface JarvisAnswer {
  text: string;
  mode: JarvisMode;
  provider: string;
  ms: number;
}

export interface JarvisPlan {
  local: boolean;
  /** IA corriendo dentro del navegador del usuario (gratis, sin claves). */
  equipo: boolean;
  cloud: boolean;
  cached: boolean;
  hint: string;
}

export class NoEngineError extends Error {
  hint: string;
  constructor(hint: string) {
    super("Sin motor de lenguaje disponible");
    this.name = "NoEngineError";
    this.hint = hint;
  }
}

/* --------------------------------- caché ---------------------------------- */

const CACHE_KEY = "habits.jarvis.cache.v1";
const CACHE_MAX = 200;
const CACHE_TTL = 21 * 24 * 60 * 60 * 1000;

interface CacheEntry {
  t: string;
  at: number;
  mode: JarvisMode;
  by: string;
}

function normKey(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function readCache(): Record<string, CacheEntry> {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    return raw ? (JSON.parse(raw) as Record<string, CacheEntry>) : {};
  } catch {
    return {};
  }
}

function writeCache(map: Record<string, CacheEntry>) {
  try {
    const entries = Object.entries(map)
      .filter(([, v]) => Date.now() - v.at < CACHE_TTL)
      .sort((a, b) => a[1].at - b[1].at)
      .slice(-CACHE_MAX);
    localStorage.setItem(CACHE_KEY, JSON.stringify(Object.fromEntries(entries)));
  } catch {
    /* sin espacio: se sigue sin caché */
  }
}

export function cachedAnswer(text: string): JarvisAnswer | null {
  const key = normKey(text);
  if (key.length < 6) return null;
  const hit = readCache()[key];
  if (!hit || Date.now() - hit.at > CACHE_TTL) return null;
  return { text: hit.t, mode: "cache", provider: hit.by, ms: 0 };
}

export function rememberAnswer(text: string, answer: JarvisAnswer) {
  const key = normKey(text);
  if (key.length < 6 || answer.text.length < 4) return;
  const map = readCache();
  map[key] = { t: answer.text, at: Date.now(), mode: answer.mode, by: answer.provider };
  writeCache(map);
}

export function cacheSize(): number {
  return Object.keys(readCache()).length;
}

export function clearAnswerCache() {
  writeCache({});
}

/* ------------------------------ presupuesto ------------------------------- */

const BUDGET_KEY = "habits.jarvis.budget.v1";
/** Llamadas de nube permitidas por día antes de pasar 100% a local/memoria. */
export const DEFAULT_DAILY_CAP = 25;
const BREAKER_MS = 30 * 60 * 1000;

interface BudgetState {
  day: string;
  used: number;
  cap: number;
  pausedUntil: number;
  reason: string;
  saved: number;
}

function today(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function readBudget(): BudgetState {
  const base: BudgetState = { day: today(), used: 0, cap: DEFAULT_DAILY_CAP, pausedUntil: 0, reason: "", saved: 0 };
  try {
    const raw = localStorage.getItem(BUDGET_KEY);
    if (!raw) return base;
    const parsed = { ...base, ...(JSON.parse(raw) as Partial<BudgetState>) };
    if (parsed.day !== today()) return { ...parsed, day: today(), used: 0, pausedUntil: 0, reason: "" };
    return parsed;
  } catch {
    return base;
  }
}

function writeBudget(state: BudgetState) {
  try {
    localStorage.setItem(BUDGET_KEY, JSON.stringify(state));
  } catch {
    /* nada */
  }
}

export interface AiBudget extends BudgetState {
  left: number;
  paused: boolean;
}

export function aiBudget(): AiBudget {
  const b = readBudget();
  const paused = b.pausedUntil > Date.now();
  return { ...b, left: Math.max(0, b.cap - b.used), paused };
}

export function setDailyCap(cap: number) {
  const b = readBudget();
  writeBudget({ ...b, cap: Math.max(1, Math.min(500, Math.round(cap))) });
}

/** Cuenta una respuesta gratuita (memoria/caché/local) para mostrar el ahorro. */
export function noteFreeAnswer() {
  const b = readBudget();
  writeBudget({ ...b, saved: b.saved + 1 });
}

export function noteCloudCall(ok: boolean, status?: number, detail?: string) {
  const b = readBudget();
  const next: BudgetState = { ...b, used: b.used + (ok ? 1 : 0) };
  if (!ok) {
    const fatal = status === 401 || status === 402 || status === 403 || status === 429;
    const quota = /quota|insufficient|balance|credit|exceeded|billing/i.test(detail ?? "");
    if (fatal || quota) {
      next.pausedUntil = Date.now() + BREAKER_MS;
      next.reason =
        status === 429 || quota
          ? "la nube rechazó por cupo o crédito: sigo gratis con el motor local"
          : `la clave de API falló (${status ?? "error"}): sigo gratis con el motor local`;
    }
  }
  writeBudget(next);
}

export function resumeCloud() {
  const b = readBudget();
  writeBudget({ ...b, pausedUntil: 0, reason: "" });
}

/* --------------------------------- motores -------------------------------- */

let llmStatusCache: { at: number; ready: boolean } | null = null;
const LLM_TTL = 45_000;

export async function localEngineReady(force = false): Promise<boolean> {
  if (!force && llmStatusCache && Date.now() - llmStatusCache.at < LLM_TTL) return llmStatusCache.ready;
  const status = await agentLlmStatus();
  const ready = Boolean(status?.ready);
  llmStatusCache = { at: Date.now(), ready };
  return ready;
}

/** Carga el modelo en la memoria de la tarjeta gráfica antes de que lo pidas. */
export async function prewarmLocalEngine(): Promise<void> {
  try {
    if (sessionStorage.getItem("habits.jarvis.prewarmed") === "1") return;
    sessionStorage.setItem("habits.jarvis.prewarmed", "1");
    if (!(await localEngineReady(true))) return;
    await agentAsk("Responde solamente: listo.", { numCtx: 1024 });
    llmStatusCache = { at: Date.now(), ready: true };
  } catch {
    /* si no se puede, la primera pregunta paga el arranque */
  }
}

export function jarvisPlan(cfg: AiConfig): JarvisPlan {
  const budget = aiBudget();
  const cloud = aiConfigured(cfg) && !budget.paused && budget.left > 0;
  const web = webEngineState();
  const bits: string[] = [];
  bits.push("memoria y motor local activos (gratis)");
  if (webEngineReady()) {
    bits.push("IA en este equipo lista (gratis, sin claves)");
  } else if (web.enabled) {
    bits.push("IA en este equipo activada (se enciende en la primera pregunta)");
  } else {
    bits.push("IA en este equipo disponible para activar (gratis, sin claves)");
  }
  if (aiConfigured(cfg)) {
    bits.push(
      budget.paused
        ? `nube en pausa (${budget.reason})`
        : cloud
          ? `nube disponible (${budget.left} de ${budget.cap} hoy)`
          : `cupo de hoy agotado (${budget.cap}); sigue gratis sin la nube`
    );
  } else {
    bits.push("sin clave de API: no hace falta, responden los motores gratis");
  }
  return { local: true, equipo: webEngineReady() || web.enabled, cloud, cached: cacheSize() > 0, hint: bits.join("; ") };
}

export interface AskOptions {
  cfg: AiConfig;
  context?: string;
  history?: Array<{ role: string; text: string }>;
  /** Forzar respuesta fresca ignorando la caché (p. ej. datos de la semana). */
  fresh?: boolean;
  /** Permitir el motor local (por defecto sí). */
  allowLocal?: boolean;
  /** Permitir la IA que corre en el navegador del usuario (por defecto sí). */
  allowBrowser?: boolean;
  /** Permitir la nube (por defecto sí, sujeto a cupo y pausa). */
  allowCloud?: boolean;
}

export async function askJarvis(text: string, opts: AskOptions): Promise<JarvisAnswer> {
  const started = Date.now();

  // 1) caché: misma pregunta, costo cero.
  if (!opts.fresh) {
    const hit = cachedAnswer(text);
    if (hit) {
      noteFreeAnswer();
      return { ...hit, ms: Date.now() - started };
    }
  }

  // 2) motor local (Ollama en esta PC): gratis, sin internet, sin claves.
  if (opts.allowLocal !== false) {
    const ready = await localEngineReady();
    if (ready) {
      const res = await agentAsk(text, { context: opts.context, history: opts.history });
      if (res?.ok && res.text?.trim()) {
        const answer: JarvisAnswer = {
          text: res.text.trim(),
          mode: "local",
          provider: res.model ? `ollama:${res.model}` : "ollama",
          ms: Date.now() - started
        };
        rememberAnswer(text, answer);
        noteFreeAnswer();
        return answer;
      }
    }
  }

  // 3) IA en el navegador del usuario: gratis, sin claves, sin servidor propio.
  //    Es lo que permite que HABITS corra en la máquina de cualquier persona.
  if (opts.allowBrowser !== false) {
    const web = webEngineState();
    if (webEngineReady() || web.enabled) {
      try {
        const reply = await askWebEngine(text, {
          context: opts.context,
          history: opts.history,
          timeoutMs: 180000
        });
        if (reply) {
          const answer: JarvisAnswer = {
            text: reply,
            mode: "equipo",
            provider: `web:${web.size}`,
            ms: Date.now() - started
          };
          rememberAnswer(text, answer);
          noteFreeAnswer();
          return answer;
        }
      } catch {
        /* si el navegador no puede, seguimos: memoria y caché siguen vivas */
      }
    }
  }

  // 4) nube: sólo si hay clave, cupo y no está en pausa.
  const budget = aiBudget();
  const cloudAllowed = opts.allowCloud !== false && aiConfigured(opts.cfg) && !budget.paused && budget.left > 0;
  if (cloudAllowed) {
    try {
      const answer = await aiAssistant(text, opts.cfg, opts.context);
      const result: JarvisAnswer = { text: answer, mode: "nube", provider: "api", ms: Date.now() - started };
      noteCloudCall(true);
      rememberAnswer(text, result);
      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const status = Number(message.match(/\b(4\d\d|5\d\d)\b/)?.[1]) || undefined;
      noteCloudCall(false, status, message);
    }
  }

  // 5) nada disponible: JARVIS lo dice claro y sigue funcionando con su memoria.
  const hint = aiConfigured(opts.cfg)
    ? "La nube no respondió. Revisa la clave en Ajustes, activa «IA en este equipo» o levanta Ollama para seguir gratis."
    : "Puedo seguir sin internet ni claves: activa «IA en este equipo» y el modelo corre en tu propio navegador. Mientras tanto uso mi memoria.";
  throw new NoEngineError(hint);
}

/** Arranca la IA del navegador a pedido (descarga el modelo la primera vez). */
export async function startBrowserEngine(onProgress?: (pct: number, phase: string) => void): Promise<void> {
  await loadWebEngine(undefined, (p) => onProgress?.(p.pct, p.phase));
}


export function modeLabel(mode: JarvisMode, provider = ""): string {
  switch (mode) {
    case "memoria":
      return "memoria";
    case "cache":
      return "respuesta recordada";
    case "local":
      return provider.startsWith("ollama") ? "motor local (gratis)" : "motor local";
    case "equipo":
      return "IA en este equipo (gratis)";
    case "nube":
      return "nube (gasta crédito)";
  }
}
