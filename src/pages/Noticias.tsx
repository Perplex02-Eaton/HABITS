import { useEffect, useMemo, useState } from "react";
import { useStore } from "../stores/useStore";
import { fetchNews, relativeTime, NEWS_FEEDS } from "../lib/news";
import type { NewsItem } from "../lib/news";
import { IconRefresh, IconExternal } from "../components/ui/Icons";

export default function Noticias() {
  const newsApiKey = useStore((s) => s.data.settings.newsApiKey);
  const [cat, setCat] = useState("mundo");
  const [items, setItems] = useState<NewsItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<string>("");

  const load = (force = false) => {
    setLoading(true);
    setError(false);
    void fetchNews(cat, newsApiKey)
      .then((list) => {
        setItems(list);
        setLastUpdate(new Date().toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" }));
      })
      .catch(() => setError(true))
      .finally(() => setLoading(false));
    void force;
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cat]);

  const grouped = useMemo(() => {
    const map = new Map<string, NewsItem[]>();
    for (const i of items) {
      const list = map.get(i.category) ?? [];
      list.push(i);
      map.set(i.category, list);
    }
    return Array.from(map.entries());
  }, [items]);

  return (
    <div className="page">
      <header className="page-header">
        <div className="row-between">
          <div>
            <h1 className="page-title">Al día</h1>
            <p className="page-subtitle">Lo que está pasando: guerra, geopolítica y finanzas</p>
          </div>
          <button className="btn btn-secondary btn-icon" onClick={() => load(true)} aria-label="Actualizar noticias">
            <IconRefresh size={19} />
          </button>
        </div>
      </header>

      <div className="segmented mt-8">
        {NEWS_FEEDS.map((f) => (
          <button key={f.id} className={cat === f.id ? "active" : ""} onClick={() => setCat(f.id)}>
            {f.icon} {f.label}
          </button>
        ))}
      </div>

      {lastUpdate && (
        <p className="muted small mt-8" style={{ textAlign: "center" }}>
          Actualizado a las {lastUpdate}
        </p>
      )}

      <div className="stack mt-16">
        {loading && (
          <div className="card card-section" style={{ textAlign: "center", padding: "28px 16px" }}>
            <div className="empty-icon" style={{ marginBottom: 10 }}>📰</div>
            <p className="muted">Buscando las últimas noticias…</p>
          </div>
        )}

        {error && !loading && (
          <div className="card card-section" style={{ textAlign: "center", padding: "24px 16px" }}>
            <div style={{ fontSize: 32 }}>📡</div>
            <h3 style={{ fontWeight: 600, marginTop: 10 }}>Sin conexión</h3>
            <p className="muted mt-8">No pudimos cargar las noticias. Revisa tu internet o intenta de nuevo.</p>
            <button className="btn btn-primary btn-block mt-16" onClick={() => load(true)}>
              Reintentar
            </button>
          </div>
        )}

        {!loading && !error && items.length === 0 && (
          <div className="card">
            <div className="empty" style={{ padding: "32px 16px" }}>
              <p className="muted">No hay noticias que mostrar. Actualiza más tarde.</p>
            </div>
          </div>
        )}

        {!loading &&
          grouped.map(([group, list]) => (
            <div key={group}>
              <h2 className="muted" style={{ fontSize: 13, fontWeight: 600, textTransform: "uppercase", padding: "0 4px", marginBottom: 8 }}>
                {group === "mundo" ? "🌍 Geopolítica" : "📊 Finanzas"}
              </h2>
              <div className="list-group">
                {list.slice(0, 15).map((n) => (
                  <a
                    key={n.link}
                    href={n.link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="list-item"
                    style={{ textDecoration: "none" }}
                  >
                    <div className="grow">
                      <div className="list-title" style={{ fontSize: 15, lineHeight: 1.35 }}>{n.title}</div>
                      <div className="row mt-8" style={{ gap: 6 }}>
                        <span className="badge badge-blue" style={{ fontSize: 10, padding: "2px 8px" }}>{n.source}</span>
                        <span className="muted small" style={{ fontSize: 11 }}>{relativeTime(n.date)}</span>
                      </div>
                    </div>
                    <IconExternal size={15} style={{ color: "var(--label-tertiary)" }} />
                  </a>
                ))}
              </div>
            </div>
          ))}
      </div>

      <div className="card card-section mt-24">
        <p className="muted small" style={{ lineHeight: 1.6 }}>
          📡 Fuentes: Reuters, The Guardian, CNBC y Yahoo Finanzas. Consejo de Habi: la geopolítica
          mueve el oro, el petróleo y los índices. ¡Lee pensando en tu trading!
        </p>
      </div>
    </div>
  );
}
