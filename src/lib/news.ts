export interface NewsItem {
  title: string;
  link: string;
  source: string;
  date: string;
  category: string;
}

export interface NewsFeed {
  id: string;
  label: string;
  icon: string;
  items: NewsItem[];
}

export const NEWS_FEEDS: Omit<NewsFeed, "items">[] = [
  { id: "mundo", label: "Mundo · Geopolítica", icon: "🌍" },
  { id: "finanzas", label: "Finanzas", icon: "📊" },
  { id: "todo", label: "Todo", icon: "⚡" }
];

const RSS_SOURCES = [
  {
    cat: "mundo",
    label: "Reuters · Mundo",
    url: "https://feeds.reuters.com/reuters/worldNews"
  },
  {
    cat: "mundo",
    label: "The Guardian · Internacional",
    url: "https://www.theguardian.com/world/rss"
  },
  {
    cat: "finanzas",
    label: "Reuters · Negocios",
    url: "https://feeds.reuters.com/reuters/businessNews"
  },
  {
    cat: "finanzas",
    label: "CNBC · Finanzas",
    url: "https://search.cnbc.com/rs/search/combinedcms/view.xml?partnerId=wrss01&id=100003114"
  },
  {
    cat: "finanzas",
    label: "Yahoo · Finanzas",
    url: "https://finance.yahoo.com/news/rssindex"
  }
];

const CACHE_KEY = "habits:newsCache";
const CACHE_TTL = 30 * 60 * 1000;

function proxyUrl(url: string): string {
  const enc = encodeURIComponent(url);
  return `https://api.allorigins.win/raw?url=${enc}`;
}

async function fetchXml(url: string): Promise<string> {
  const res = await fetch(proxyUrl(url), { headers: { Accept: "application/rss+xml, text/xml, */*" } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const text = await res.text();
  if (!text || text.trim().length < 50) throw new Error("vacío");
  return text;
}

function parseRss(xml: string, source: string, cat: string): NewsItem[] {
  const doc = new DOMParser().parseFromString(xml, "text/xml");
  const items = Array.from(doc.querySelectorAll("item")).slice(0, 30);
  return items
    .map((el) => {
      const title = el.querySelector("title")?.textContent?.trim() || "";
      const link = el.querySelector("link")?.textContent?.trim() || "";
      const pub = el.querySelector("pubDate")?.textContent?.trim() || "";
      if (!title || !link) return null;
      return {
        title: title.replace(/^.{0,30}?\s\|\s/, ""),
        link,
        source,
        date: pub ? new Date(pub).toISOString() : new Date().toISOString(),
        category: cat
      };
    })
    .filter((x): x is NewsItem => x !== null && x.title.length > 15);
}

function dedupe(items: NewsItem[]): NewsItem[] {
  const seen = new Set<string>();
  return items.filter((i) => {
    const key = i.title.toLowerCase().slice(0, 60);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export async function fetchNews(cat: string, apiKey?: string): Promise<NewsItem[]> {
  const cache = loadCache();
  const cached = cache[cat];
  if (cached && Date.now() - cached.at < CACHE_TTL) return cached.items;

  if (apiKey?.trim() && cat !== "todo") {
    try {
      const res = await fetch(
        `https://newsapi.org/v2/top-headlines?language=es&category=${cat === "mundo" ? "general" : "business"}&apiKey=${encodeURIComponent(apiKey.trim())}`
      );
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.articles) && data.articles.length > 0) {
          const items = dedupe(
            data.articles
              .map((a: { title?: string; url?: string; source?: { name?: string }; publishedAt?: string }) => ({
                title: a.title || "",
                link: a.url || "",
                source: a.source?.name || "Noticias",
                date: a.publishedAt || new Date().toISOString(),
                category: cat
              }))
              .filter((i: NewsItem) => i.title && i.link)
          );
          saveCache(cat, items);
          return items;
        }
      }
    } catch {
      /* si NewsAPI falla, seguimos con RSS */
    }
  }

  const sources = RSS_SOURCES.filter((s) => cat === "todo" || s.cat === cat);
  const settled = await Promise.allSettled(sources.map((s) => fetchXml(s.url).then((xml) => parseRss(xml, s.label, s.cat))));

  const all: NewsItem[] = [];
  for (const r of settled) {
    if (r.status === "fulfilled") all.push(...r.value);
  }
  const items = dedupe(all).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 40);
  saveCache(cat, items);
  return items;
}

interface CacheEntry {
  at: number;
  items: NewsItem[];
}

function loadCache(): Record<string, CacheEntry> {
  try {
    return JSON.parse(localStorage.getItem(CACHE_KEY) || "{}");
  } catch {
    return {};
  }
}

function saveCache(cat: string, items: NewsItem[]) {
  const cache = loadCache();
  cache[cat] = { at: Date.now(), items };
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
  } catch {
    /* límite de almacenamiento */
  }
}

export function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "ahora";
  if (mins < 60) return `hace ${mins} min`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `hace ${hours} h`;
  const days = Math.floor(hours / 24);
  return `hace ${days} d`;
}
