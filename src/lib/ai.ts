import type { AiConfig } from "./types";

const DEFAULT_BASE = "https://api.openai.com/v1";
const DEFAULT_MODEL = "gpt-4o-mini";

export function defaultAiConfig(): AiConfig {
  return { baseUrl: DEFAULT_BASE, model: DEFAULT_MODEL, apiKey: "" };
}

export function aiConfigured(cfg: AiConfig): boolean {
  return Boolean(cfg.apiKey.trim() && cfg.baseUrl.trim());
}

/** Llama a cualquier API compatible con OpenAI (chat completions). */
export async function aiImprove(
  text: string,
  instruction: string,
  cfg: AiConfig
): Promise<string> {
  const base = cfg.baseUrl.trim().replace(/\/+$/, "");
  const res = await fetch(`${base}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${cfg.apiKey.trim()}`
    },
    body: JSON.stringify({
      model: cfg.model.trim() || DEFAULT_MODEL,
      messages: [
        {
          role: "system",
          content:
            "Eres un asistente de redacción experto en español. Corrige errores ortográficos y gramaticales, mejora la claridad y el estilo. Devuelve SOLO el texto corregido, sin explicaciones, sin comillas ni introducciones."
        },
        { role: "user", content: `${instruction}\n\nTexto:\n${text}` }
      ],
      temperature: 0.35
    })
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`IA ${res.status}: ${body.slice(0, 120)}`);
  }
  const data = await res.json();
  const out = data?.choices?.[0]?.message?.content;
  return typeof out === "string" && out.trim() ? out.trim() : text;
}

/** Respuesta breve para el asistente de voz usando un proveedor compatible con OpenAI. */
export async function aiAssistant(text: string, cfg: AiConfig, context?: string): Promise<string> {
  const base = cfg.baseUrl.trim().replace(/\/+$/, "");
  const system =
    "Eres JARVIS, un mayordomo tecnológico personal: sereno, leal, elegante, observador y preciso. Habla siempre en español latinoamericano natural y trata al usuario como 'jefe' de manera ocasional, especialmente al confirmar una orden; no lo repitas en todas las frases. Responde con seguridad y cortesía, ofrece el siguiente paso útil cuando corresponda y evita sonar como un chatbot. Sé breve porque tu respuesta será leída en voz alta: máximo tres frases; si te piden el resumen de la semana o de un curso, hasta seis. Nunca afirmes que ejecutaste una acción si la aplicación no confirmó que se realizó." +
    (context
      ? "\n\nMEMORIA DE CLASES del jefe (sílabo UTP+class). Úsala como única fuente para hablar de sus cursos, temas, semanas y entregas; si algo no está aquí, di que no lo tienes cargado. No inventes temas ni fechas.\n" +
        context
      : "");
  const res = await fetch(`${base}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${cfg.apiKey.trim()}`
    },
    body: JSON.stringify({
      model: cfg.model.trim() || DEFAULT_MODEL,
      messages: [
        { role: "system", content: system },
        { role: "user", content: text }
      ],
      temperature: 0.45
    })
  });
  if (!res.ok) throw new Error(`IA ${res.status}`);
  const data = await res.json();
  const out = data?.choices?.[0]?.message?.content;
  if (typeof out !== "string" || !out.trim()) throw new Error("Respuesta vacía");
  return out.trim();
}

const TYPO_MAP: Record<string, string> = {
  q: "que",
  xq: "porque",
  pq: "porque",
  tb: "también",
  tmb: "también",
  dsp: "después",
  dpues: "después",
  tbn: "también",
  tmbn: "también",
  nd: "nada",
  toy: "estoy",
  tamos: "estamos",
  vamo: "vamos",
  asig: "asignatura",
  profe: "profesor",
  mañana: "mañana",
  ok: "bien",
  x: "por",
  p: "para",
  k: "que",
  komo: "cómo",
  cdo: "cuando",
  kdo: "cuando",
  xfa: "por favor",
  muxo: "mucho",
  muxa: "mucha",
  gracias: "gracias",
  grasias: "gracias",
  xD: "xD",
  bss: "besos"
};

/** Corrector local: corrige espacios, mayúsculas, typos comunes y puntuación. */
export function localCorrect(input: string): string {
  let t = input.replace(/\s+/g, " ").trim();

  t = t.replace(/([.!?¿¡])\s*([a-záéíóúñ])/g, (_, p, c) => `${p} ${c.toUpperCase()}`);
  t = t.replace(/[ \t]+([.,;:!?])/g, "$1");
  t = t.replace(/([.,!?])\1+/g, "$1");
  t = t.replace(/\s*\.\.\.\s*/g, "… ");
  t = t.replace(/ ([.,;:])/g, "$1");

  if (t.length > 0) {
    t = t[0].toUpperCase() + t.slice(1);
  }

  t = t.replace(/\b([a-záéíóúñ]+)\s+\1\b/g, "$1");

  t = t
    .split(" ")
    .map((w) => {
      const clean = w.replace(/[.,;:!?…]+$/, "");
      const punct = w.slice(clean.length);
      const lower = clean.toLowerCase();
      if (TYPO_MAP[lower] && !/[A-ZÁÉÍÓÚ]/.test(clean[0] || "")) {
        return TYPO_MAP[lower] + punct;
      }
      return w;
    })
    .join(" ");

  t = t.replace(/ [.,;:]/g, (m) => m.trim());
  if (t && !/[.!?…]$/.test(t) && t.length > 3) {
    t += ".";
  }
  return t.trim();
}

export interface ImproveResult {
  text: string;
  usedAi: boolean;
}

/** Mejora un texto: con IA si está configurada, si no con el corrector local. */
export async function improveText(
  text: string,
  cfg: AiConfig,
  instruction = "Corrige el texto y mejora su redacción."
): Promise<ImproveResult> {
  const trimmed = text.trim();
  if (!trimmed) return { text, usedAi: false };
  if (aiConfigured(cfg)) {
    try {
      const out = await aiImprove(trimmed, instruction, cfg);
      return { text: out, usedAi: true };
    } catch {
      return { text: localCorrect(trimmed), usedAi: false };
    }
  }
  return { text: localCorrect(trimmed), usedAi: false };
}

/* ---------------------------------------------------------------------------
 * Proveedores con capa GRATIS (compatibles con OpenAI).
 *
 * Para que la app sirva a otras personas sin depender de la laptop de nadie ni
 * gastar crédito: cada quien pega su propia clave gratuita y el consumo va a su
 * cuenta. Si algún día se acaba la clave, el motor del navegador sigue andando.
 * ------------------------------------------------------------------------- */

export interface FreeProvider {
  id: string;
  name: string;
  baseUrl: string;
  model: string;
  keyUrl: string;
  note: string;
}

export const FREE_PROVIDERS: FreeProvider[] = [
  {
    id: "groq",
    name: "Groq (gratis)",
    baseUrl: "https://api.groq.com/openai/v1",
    model: "openai/gpt-oss-120b",
    keyUrl: "https://console.groq.com/keys",
    note: "Muy rápido. Capa gratis con límite por minuto."
  },
  {
    id: "gemini",
    name: "Google Gemini (gratis)",
    baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai/",
    model: "gemini-3.8-flash",
    keyUrl: "https://aistudio.google.com/apikey",
    note: "Capa gratis diaria amplia. Buena para el celular."
  },
  {
    id: "openrouter",
    name: "OpenRouter (modelos gratis)",
    baseUrl: "https://openrouter.ai/api/v1",
    model: "openrouter/free",
    keyUrl: "https://openrouter.ai/keys",
    note: "Elige solo entre modelos gratuitos."
  }
];

export function freeProvider(id: string): FreeProvider | undefined {
  return FREE_PROVIDERS.find((p) => p.id === id);
}

/** Devuelve una configuración lista para usar con el proveedor gratuito elegido. */
export function applyFreeProvider(cfg: AiConfig, id: string): AiConfig {
  const p = freeProvider(id);
  if (!p) return cfg;
  return { ...cfg, baseUrl: p.baseUrl, model: p.model };
}

/** Detecta a qué proveedor gratuito corresponde una configuración guardada. */
export function detectFreeProvider(cfg: AiConfig): string | null {
  const base = cfg.baseUrl.trim().replace(/\/+$/, "");
  const hit = FREE_PROVIDERS.find((p) => p.baseUrl.replace(/\/+$/, "") === base);
  return hit ? hit.id : null;
}

function authHeaders(cfg: AiConfig, json: boolean): Record<string, string> {
  const key = cfg.apiKey.trim();
  const headers: Record<string, string> = {};
  if (json) headers["Content-Type"] = "application/json";
  if (key) headers.Authorization = `Bearer ${key}`;
  return headers;
}

/** Lista los modelos que la clave del usuario realmente puede usar. */
export async function listModels(cfg: AiConfig): Promise<string[]> {
  const base = cfg.baseUrl.trim().replace(/\/+$/, "");
  const res = await fetch(`${base}/models`, { headers: authHeaders(cfg, false) });
  if (!res.ok) throw new Error(`No pude leer la lista de modelos (${res.status})`);
  const data = await res.json();
  const raw = Array.isArray(data?.data) ? data.data : Array.isArray(data) ? data : [];
  const ids = raw
    .map((m: { id?: string }) => String(m?.id ?? ""))
    .filter((id: string) => Boolean(id));
  if (!ids.length) throw new Error("El proveedor no devolvió modelos");
  return ids;
}

export interface AiTest {
  ok: boolean;
  ms: number;
  model: string;
  text: string;
  error?: string;
}

/** Prueba la clave con un mensaje mínimo: confirma que responde antes de confiar en ella. */
export async function testAiConfig(cfg: AiConfig, timeoutMs = 20000): Promise<AiTest> {
  const started = Date.now();
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), timeoutMs);
  try {
    const base = cfg.baseUrl.trim().replace(/\/+$/, "");
    const model = cfg.model.trim() || DEFAULT_MODEL;
    const res = await fetch(`${base}/chat/completions`, {
      method: "POST",
      headers: authHeaders(cfg, true),
      signal: abort.signal,
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: "Responde sólo con la palabra: listo." },
          { role: "user", content: "¿Estás disponible?" }
        ],
        max_tokens: 16,
        temperature: 0
      })
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      return { ok: false, ms: Date.now() - started, model, text: "", error: `${res.status} ${body.slice(0, 160)}` };
    }
    const data = await res.json();
    const text = String(data?.choices?.[0]?.message?.content ?? "").trim();
    return { ok: true, ms: Date.now() - started, model, text };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, ms: Date.now() - started, model: cfg.model, text: "", error: msg };
  } finally {
    clearTimeout(timer);
  }
}
