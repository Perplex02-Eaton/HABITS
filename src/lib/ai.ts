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
export async function aiAssistant(text: string, cfg: AiConfig): Promise<string> {
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
            "Eres Jarvis, un asistente personal sereno, preciso y útil. Responde siempre en español natural. Sé breve porque tu respuesta será leída en voz alta: máximo tres frases. No afirmes haber modificado tareas, comidas, cursos o datos si no lo hiciste."
        },
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
