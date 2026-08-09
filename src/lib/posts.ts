import type { Idea } from "./types";

const TOPIC_TAGS: Record<string, string[]> = {
  geopolitica: ["Geopolítica", "OrdenMundial", "GlobalEconomy"],
  trading: ["Trading", "Mercados", "TradingIdeas"],
  oro: ["Oro", "Gold", "Hedge"],
  petroleo: ["Petróleo", "Oil", "Energía"],
  fed: ["Fed", "PolíticaMonetaria", "Rates"],
  cripto: ["Bitcoin", "Crypto", "DigitalAssets"],
  guerra: ["Geopolítica", "Conflictos", "Mercados"],
  economia: ["Economía", "Macro", "Riesgo"],
  default: ["Geopolítica", "Trading", "MercadosGlobales"]
};

function pickTags(text: string): string[] {
  const lower = text.toLowerCase();
  const set = new Set<string>();
  for (const [key, tags] of Object.entries(TOPIC_TAGS)) {
    if (lower.includes(key)) tags.forEach((t) => set.add(t));
  }
  if (set.size < 3) TOPIC_TAGS.default.forEach((t) => set.add(t));
  return Array.from(set).slice(0, 4);
}

/** Convierte una idea en un post listo para X (máx 280). */
export function buildXPost(idea: Idea): string {
  const body = idea.content.trim();
  const tags = pickTags(`${idea.topic} ${idea.title} ${idea.content}`);
  const tagStr = tags.map((t) => `#${t.replace(/\s+/g, "")}`).join(" ");
  const core = `${body} ${tagStr}`;
  if (core.length <= 280) return core;
  const budget = 280 - tagStr.length - 2;
  const cut = body.slice(0, budget);
  const trimmed = cut.slice(0, cut.lastIndexOf(" ")) + "…";
  return `${trimmed} ${tagStr}`;
}

/** Convierte una idea en caption de Instagram para Canva. */
export function buildIgCaption(idea: Idea): string {
  const tags = pickTags(`${idea.topic} ${idea.title} ${idea.content}`);
  const tagStr = tags.map((t) => `#${t.replace(/\s+/g, "")}`).join(" ");
  const hook = `📌 ${idea.title.trim()}`;
  const body = idea.content.trim();
  const cta = "\n\n¿Qué opinas? Déjame tu análisis en los comentarios 👇";
  return `${hook}\n\n${body}${cta}\n\n${tagStr}`;
}

/** Texto sugerido para el diseño de Canva (título corto + sub). */
export function buildCanvaText(idea: Idea): { title: string; subtitle: string } {
  const title = idea.title.trim().slice(0, 60);
  const subtitle = idea.content.trim().split(/[.!?\n]/)[0]?.slice(0, 120) || "Análisis en profundidad";
  return { title, subtitle };
}

export function openInX(text: string) {
  window.open(
    `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}`,
    "_blank",
    "noopener,noreferrer"
  );
}

export function openCanva(template: string) {
  const base = "https://www.canva.com/design/create";
  const url = template
    ? `https://www.canva.com/templates/?query=${encodeURIComponent(template)}`
    : base;
  window.open(url, "_blank", "noopener,noreferrer");
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const ta = document.createElement("textarea");
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
      return true;
    } catch {
      return false;
    }
  }
}
