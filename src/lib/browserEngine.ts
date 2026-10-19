/**
 * Motor de IA que corre DENTRO del navegador del que usa la app.
 *
 * Es la pieza que hace que HABITS/JARVIS sirva para otras personas sin depender
 * de la laptop de Eaton y sin gastar crédito de ninguna API:
 *
 *   · El modelo se descarga una vez desde Hugging Face y queda guardado en el
 *     navegador (Cache Storage). Después funciona sin internet.
 *   · Todo el cálculo ocurre en el equipo del visitante (WebGPU si lo tiene,
 *     si no WebAssembly).
 *   · No necesita claves, ni servidor, ni permiso de nadie.
 *
 * Se carga en diferido (dynamic import): quien no active este motor nunca
 * descarga los ~2 MB de librería ni los cientos de MB del modelo.
 */

const STATE_KEY = "habits.jarvis.web.v1";

export const WEB_MODELS = {
  ligero: {
    repo: "onnx-community/Qwen2.5-0.5B-Instruct",
    label: "Ligero",
    size: "≈ 490 a 750 MB",
    note: "anda en cualquier equipo y en celulares recientes"
  },
  mejor: {
    repo: "onnx-community/Qwen2.5-1.5B-Instruct",
    label: "Mejor",
    size: "≈ 1.2 a 1.7 GB",
    note: "responde mejor; pide una PC con buena memoria"
  }
} as const;

export type WebSize = keyof typeof WEB_MODELS;

interface WebState {
  enabled: boolean;
  size: WebSize;
  loadedAt: number;
  /** Motor que ya se comprobó que funciona en este equipo. */
  device?: "webgpu" | "wasm";
  verifiedAt?: number;
}

export interface WebProgress {
  phase: string;
  pct: number;
}

export interface WebSupport {
  webgpu: boolean;
  wasm: boolean;
  threads: number;
  mobile: boolean;
  device: "webgpu" | "wasm";
}

function readState(): WebState {
  const base: WebState = { enabled: false, size: "ligero", loadedAt: 0 };
  try {
    const raw = localStorage.getItem(STATE_KEY);
    return raw ? { ...base, ...(JSON.parse(raw) as Partial<WebState>) } : base;
  } catch {
    return base;
  }
}

function writeState(next: WebState) {
  try {
    localStorage.setItem(STATE_KEY, JSON.stringify(next));
  } catch {
    /* sin espacio: sigue funcionando sólo en esta sesión */
  }
}

/* ------------------------------- soporte ---------------------------------- */

export function webEngineSupport(): WebSupport {
  const nav = navigator as Navigator & { gpu?: unknown };
  const webgpu = Boolean(nav.gpu);
  const wasm = typeof WebAssembly !== "undefined";
  const threads = Math.max(1, Math.min(4, navigator.hardwareConcurrency || 2));
  const mobile = /android|iphone|ipad|ipod|mobile/i.test(navigator.userAgent);
  return { webgpu, wasm, threads, mobile, device: webgpu ? "webgpu" : "wasm" };
}

/* -------------------------------- estado ---------------------------------- */

let mod: typeof import("@huggingface/transformers") | null = null;

type WebPipe = (input: unknown, opts?: unknown) => Promise<unknown>;

let pipe: WebPipe | null = null;
let loadedSize: WebSize | null = null;
let loading: Promise<void> | null = null;
let progress: WebProgress = { phase: "", pct: 0 };
let queue: Promise<unknown> = Promise.resolve();

type Listener = () => void;
const listeners = new Set<Listener>();

export function subscribeWebEngine(fn: Listener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function emit() {
  listeners.forEach((fn) => {
    try {
      fn();
    } catch {
      /* nada */
    }
  });
}

export function webEngineState() {
  const state = readState();
  return {
    enabled: state.enabled,
    size: state.size,
    loaded: Boolean(pipe) && loadedSize === state.size,
    loading: Boolean(loading),
    device: state.device ?? null,
    progress
  };
}

export function setWebEngineEnabled(enabled: boolean) {
  writeState({ ...readState(), enabled });
  emit();
}

export function webEngineReady(): boolean {
  const state = readState();
  return state.enabled && Boolean(pipe) && loadedSize === state.size;
}

export function unloadWebEngine() {
  pipe = null;
  loadedSize = null;
  progress = { phase: "", pct: 0 };
  emit();
}

async function lib() {
  if (!mod) mod = await import("@huggingface/transformers");
  return mod;
}

/**
 * Descarga (una sola vez) y deja listo el modelo en este navegador.
 * Repetir la llamada no vuelve a descargar: ya queda en la caché del navegador.
 */
export async function loadWebEngine(size?: WebSize, onProgress?: (p: WebProgress) => void): Promise<void> {
  const state = readState();
  const wanted = size ?? state.size;
  if (pipe && loadedSize === wanted) return;
  if (loading) return loading;

  loading = (async () => {
    const { env, pipeline } = await lib();
    env.allowLocalModels = false;
    env.useBrowserCache = true;
    // Los hilos de WebAssembly sólo funcionan en modo aislado; si no, el
    // navegador avisa y usa uno solo.
    if (env.backends?.onnx?.wasm && !globalThis.crossOriginIsolated) {
      env.backends.onnx.wasm.numThreads = 1;
    }

    const support = webEngineSupport();
    const report = (p: WebProgress) => {
      progress = p;
      onProgress?.(p);
      emit();
    };

    const build = async (device: "webgpu" | "wasm"): Promise<WebPipe> => {
      // WebGPU usa q4 (int4, ~790 MB) porque q4f16 devuelve respuestas
      // corruptas en varias GPU/Windows; sin WebGPU se usa q8 (~510 MB), que
      // corre bien en el procesador.
      const dtype = device === "webgpu" ? "q4" : "q8";
      report({
        phase: device === "webgpu" ? "preparando la tarjeta gráfica" : "preparando el navegador",
        pct: 0
      });
      const created = await pipeline("text-generation", WEB_MODELS[wanted].repo, {
        device,
        dtype,
        progress_callback: (data: { status?: string; progress?: number; file?: string }) => {
          const pct = Math.round(Number(data?.progress ?? 0));
          const file = String(data?.file ?? "");
          const phase =
            data?.status === "ready"
              ? "listo"
              : file.includes(".onnx")
                ? "descargando el modelo"
                : data?.status === "download"
                  ? "descargando"
                  : data?.status ?? "preparando";
          report({ phase, pct });
        }
      } as never);
      return created as unknown as WebPipe;
    };

    // Si en una sesión anterior ya se comprobó qué motor sirve en este equipo,
    // se usa ese y no se vuelve a probar.
    const previous = readState();
    const preferred: "webgpu" | "wasm" =
      previous.device === "wasm" ? "wasm" : support.device;

    let used = preferred;
    let created = await build(used);

    if (previous.device !== used || !previous.verifiedAt) {
      report({ phase: "comprobando que la IA responde bien", pct: 100 });
      if (!(await respondsWell(created))) {
        if (used === "webgpu") {
          // La tarjeta gráfica de este equipo devuelve basura: se rehace en el
          // procesador del equipo, que siempre funciona (más lento).
          used = "wasm";
          created = await build(used);
        }
        if (!(await respondsWell(created))) {
          throw new Error("este equipo no pudo ejecutar la IA local");
        }
      }
    }

    pipe = created;
    loadedSize = wanted;
    progress = { phase: "listo", pct: 100 };
    writeState({
      ...readState(),
      enabled: true,
      size: wanted,
      loadedAt: Date.now(),
      device: used,
      verifiedAt: Date.now()
    });
    emit();
  })().finally(() => {
    loading = null;
    emit();
  });

  return loading;
}

/* ------------------------------- preguntas -------------------------------- */

export interface WebAskOptions {
  system?: string;
  context?: string;
  history?: Array<{ role: string; text: string }>;
  maxNewTokens?: number;
  timeoutMs?: number;
}

function shorten(text: string, max: number): string {
  const clean = text.replace(/\s+/g, " ").trim();
  return clean.length > max ? clean.slice(0, max) + "…" : clean;
}

/** Saca el texto generado, venga como lista de mensajes o como cadena. */
function readGenerated(out: unknown): string {
  const first = Array.isArray(out) ? (out[0] as { generated_text?: unknown }) : null;
  const generated = first?.generated_text;
  if (Array.isArray(generated)) {
    const last = generated[generated.length - 1] as { content?: string } | undefined;
    return String(last?.content ?? "").trim();
  }
  return String(generated ?? "").trim();
}

/**
 * ¿La respuesta parece escrita por alguien cuerdo? Sirve para detectar cuando
 * la tarjeta gráfica de un equipo devuelve basura: en ese caso el motor se
 * rehace en el procesador.
 */
function looksCoherent(text: string): boolean {
  const t = text.replace(/\s+/g, " ").trim();
  if (t.length < 2) return false;
  if (t.toLowerCase().includes("funciona")) return true;
  // Carácter roto (�) o escrituras que no tienen por qué aparecer en una
  // respuesta en español: señal de que el modelo está devolviendo basura.
  if (/\uFFFD/.test(t)) return false;
  const rare = t.match(/[\u4E00-\u9FFF\u3040-\u30FF\uAC00-\uD7AF\u0E00-\u0E7F\u0400-\u04FF]/g);
  if (rare && rare.length >= 2) return false;
  // Palabras interminables o la misma palabra repetida sin parar.
  if (/(^|\s)\S{26,}/.test(t)) return false;
  if (/(\b[\wáéíóúñü]+\b)(\s+\1){3,}/i.test(t)) return false;
  return true;
}

const PROBE = "Responde únicamente con la palabra: funciona";

/** Prueba corta: el motor debe contestar algo legible y en español. */
async function respondsWell(engine: WebPipe): Promise<boolean> {
  try {
    const out = await engine([{ role: "user", content: PROBE }], {
      max_new_tokens: 12,
      do_sample: false,
      return_full_text: false
    });
    return looksCoherent(readGenerated(out));
  } catch {
    return false;
  }
}

/**
 * Responde con el modelo que corre en el navegador. Las llamadas se encolan:
 * un solo modelo a la vez, sin pisarse.
 */
export async function askWebEngine(text: string, opts: WebAskOptions = {}): Promise<string> {
  if (!pipe) await loadWebEngine();
  if (!pipe) throw new Error("el motor del navegador no está listo");

  const engine = pipe;
  const messages: Array<{ role: string; content: string }> = [
    {
      role: "system",
      content: shorten(
        opts.system ??
          "Eres JARVIS, el asistente personal de HABITS. Respondes en español peruano, claro y breve.",
        900
      )
    }
  ];
  if (opts.context) messages.push({ role: "user", content: `Contexto: ${shorten(opts.context, 1800)}` });
  for (const turn of (opts.history ?? []).slice(-6)) {
    messages.push({ role: turn.role === "user" ? "user" : "assistant", content: shorten(turn.text, 500) });
  }
  messages.push({
    role: "user",
    content: `${shorten(text, 700)}\n\nResponde en 4 frases como máximo, en español.`
  });

  const run = async () => {
    const out = await engine(messages, {
      max_new_tokens: opts.maxNewTokens ?? 220,
      do_sample: true,
      temperature: 0.6,
      top_p: 0.9,
      repetition_penalty: 1.05,
      return_full_text: false
    });
    return readGenerated(out);
  };

  const task = queue.then(run, run);
  queue = task.catch(() => undefined);

  if (!opts.timeoutMs) return task;
  return Promise.race([
    task,
    new Promise<string>((_, reject) =>
      setTimeout(() => reject(new Error("el motor del navegador tardó demasiado")), opts.timeoutMs)
    )
  ]);
}

export function webEngineLabel(size: WebSize = readState().size): string {
  return `IA en este equipo · ${WEB_MODELS[size].label}`;
}

/**
 * Gancho de depuración: sólo en tu propia máquina (localhost) el motor queda
 * accesible como `window.habitsEngine` para probarlo desde la consola.
 * En la versión publicada no existe.
 */
if (typeof window !== "undefined" && /^(localhost|127\.0\.0\.1|\[::1\]|::1)$/.test(location.hostname)) {
  (window as Window & { habitsEngine?: unknown }).habitsEngine = {
    loadWebEngine,
    askWebEngine,
    webEngineState,
    webEngineSupport,
    webEngineReady,
    unloadWebEngine,
    setWebEngineEnabled
  };
}
