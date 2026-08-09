import { useEffect, useMemo, useRef, useState } from "react";
import { createChart, ColorType, type IChartApi, type ISeriesApi, type UTCTimestamp } from "lightweight-charts";
import { useStore } from "../stores/useStore";
import { todayKey, formatShort } from "../lib/dates";
import { toast } from "../stores/useToasts";
import Sheet from "../components/ui/Sheet";
import Empty from "../components/ui/Empty";
import ConfirmSheet from "../components/ui/ConfirmSheet";
import { IconPlus, IconTrash, IconTrendingUp } from "../components/ui/Icons";

const CATEGORIES = ["Académico", "Salud", "Disciplina", "Energía", "Foco", "Metas diarias"];

export default function Performance() {
  const metrics = useStore((s) => s.data.metrics);
  const fixedGoals = useStore((s) => s.data.fixedGoals ?? []);
  const addMetric = useStore((s) => s.addMetric);
  const deleteMetric = useStore((s) => s.deleteMetric);

  const [category, setCategory] = useState("Académico");
  const [sheetOpen, setSheetOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [value, setValue] = useState(70);

  const chartRef = useRef<HTMLDivElement>(null);
  const chartApi = useRef<IChartApi | null>(null);

  const goalMetrics = useMemo(() => {
    if (fixedGoals.length === 0) return [];
    const dates = new Set<string>([todayKey()]);
    fixedGoals.forEach((goal) => Object.keys(goal.completions ?? {}).forEach((date) => dates.add(date)));
    return Array.from(dates).sort().map((date) => {
      const availableGoals = fixedGoals.filter((goal) => {
        const created = new Date(goal.createdAt);
        const createdKey = `${created.getFullYear()}-${String(created.getMonth() + 1).padStart(2, "0")}-${String(created.getDate()).padStart(2, "0")}`;
        return createdKey <= date;
      });
      const target = availableGoals.reduce((sum, goal) => sum + goal.targetPerDay, 0);
      const completed = availableGoals.reduce((sum, goal) => sum + Math.min(goal.completions?.[date] ?? 0, goal.targetPerDay), 0);
      return {
        id: `goals-${date}`,
        date,
        category: "Metas diarias",
        value: target > 0 ? Math.round((completed / target) * 100) : 0
      };
    });
  }, [fixedGoals]);

  const catMetrics = useMemo(
    () => (category === "Metas diarias" ? goalMetrics : metrics.filter((metric) => metric.category === category))
      .sort((a, b) => a.date.localeCompare(b.date)),
    [metrics, goalMetrics, category]
  );

  useEffect(() => {
    if (!chartRef.current) return;
    const isDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    const labelColor = isDark ? "#98989f" : "#6e6e73";
    const gridColor = isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)";

    const chart = createChart(chartRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: "transparent" },
        textColor: labelColor,
        fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Segoe UI', sans-serif",
        fontSize: 11
      },
      grid: {
        vertLines: { color: gridColor },
        horzLines: { color: gridColor }
      },
      crosshair: {
        mode: 0,
        vertLine: { color: "rgba(10,132,255,0.5)", width: 1, style: 3, labelBackgroundColor: "#0a84ff" },
        horzLine: { color: "rgba(10,132,255,0.5)", width: 1, style: 3, labelBackgroundColor: "#0a84ff" }
      },
      rightPriceScale: {
        borderColor: gridColor,
        scaleMargins: { top: 0.15, bottom: 0.1 }
      },
      timeScale: {
        borderColor: gridColor,
        timeVisible: false,
        tickMarkFormatter: (t: number) => {
          const d = new Date(t * 1000);
          return `${d.getDate()}/${d.getMonth() + 1}`;
        }
      },
      localization: { locale: "es-ES" },
      autoSize: true
    });

    const series: ISeriesApi<"Area"> = chart.addAreaSeries({
      lineColor: "#0a84ff",
      lineWidth: 2,
      crosshairMarkerVisible: true,
      crosshairMarkerRadius: 4,
      lineType: 1,
      topColor: "rgba(10,132,255,0.25)",
      bottomColor: "rgba(10,132,255,0.02)"
    });

    series.setData(
      catMetrics.map((m) => {
        const [y, mo, d] = m.date.split("-").map(Number);
        return { time: (Date.UTC(y, mo - 1, d) / 1000) as UTCTimestamp, value: m.value };
      })
    );
    chart.timeScale().fitContent();

    const onResize = () => chart.applyOptions({ width: chartRef.current?.clientWidth ?? 0 });
    const ro = new ResizeObserver(onResize);
    if (chartRef.current) ro.observe(chartRef.current);

    chartApi.current = chart;
    return () => {
      ro.disconnect();
      chart.remove();
      chartApi.current = null;
    };
  }, [category, catMetrics]);

  const stats = useMemo(() => {
    if (catMetrics.length === 0) return null;
    const values = catMetrics.map((m) => m.value);
    const avg = values.reduce((a, b) => a + b, 0) / values.length;
    const last = catMetrics[catMetrics.length - 1];
    const prev = catMetrics[catMetrics.length - 2];
    const trend = prev ? last.value - prev.value : 0;
    const best = catMetrics.reduce((a, b) => (a.value >= b.value ? a : b));
    return { avg, last, trend, best, count: catMetrics.length };
  }, [catMetrics]);

  const save = () => {
    if (category === "Metas diarias") {
      toast("Esta categoría se calcula desde tus metas diarias", "🎯");
      setSheetOpen(false);
      return;
    }
    addMetric({ date: todayKey(), category, value });
    toast(`${category} registrado: ${value}%`, "📈");
    setSheetOpen(false);
    setValue(70);
  };

  return (
    <div className="page">
      <header className="page-header">
        <div className="row-between">
          <div>
            <h1 className="page-title">Rendimiento</h1>
            <p className="page-subtitle">Tu avance, en gráfica de trading</p>
          </div>
          {category !== "Metas diarias" && (
            <button className="btn btn-primary btn-icon" onClick={() => setSheetOpen(true)} aria-label="Registrar métrica">
              <IconPlus size={22} />
            </button>
          )}
        </div>
      </header>

      <div className="chips mt-8">
        {CATEGORIES.map((c) => (
          <button key={c} className={`chip ${category === c ? "active" : ""}`} onClick={() => setCategory(c)}>
            {c}
          </button>
        ))}
      </div>

      <div className="card card-section mt-24 reveal" style={{ padding: "16px 8px 8px" }}>
        <div className="row-between" style={{ padding: "0 12px" }}>
          <div>
            <div className="list-title">{category}</div>
            <div className="list-sub">
              {stats
                ? `${stats.count} registros · media ${Math.round(stats.avg)}%`
                : "Sin datos todavía"}
            </div>
          </div>
          {stats && (
            <span className={`badge ${stats.trend >= 0 ? "badge-green" : "badge-red"}`}>
              <IconTrendingUp size={13} style={{ transform: stats.trend < 0 ? "rotate(180deg)" : "none" }} />
              {stats.trend >= 0 ? "+" : ""}
              {stats.trend}%
            </span>
          )}
        </div>
        <div ref={chartRef} style={{ height: 260, marginTop: 8 }} />
        {catMetrics.length === 0 && (
          <div style={{ padding: "0 12px 8px" }}>
            <Empty icon="📈" title="Registra tu primer dato" subtitle="Toca + y mide cómo vas avanzando día a día" />
          </div>
        )}
      </div>

      {stats && (
        <div className="grid mt-24" style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
          <div className="card card-section reveal">
            <div className="muted small">Último</div>
            <div style={{ fontSize: 26, fontWeight: 800 }}>{stats.last.value}%</div>
            <div className="muted small">{formatShort(stats.last.date)}</div>
          </div>
          <div className="card card-section reveal" style={{ transitionDelay: "50ms" }}>
            <div className="muted small">Mejor</div>
            <div style={{ fontSize: 26, fontWeight: 800, color: "var(--green)" }}>{stats.best.value}%</div>
            <div className="muted small">{stats.best.category}</div>
          </div>
          <div className="card card-section reveal" style={{ transitionDelay: "100ms" }}>
            <div className="muted small">Media</div>
            <div style={{ fontSize: 26, fontWeight: 800 }}>{Math.round(stats.avg)}%</div>
            <div className="muted small">de {stats.count} días</div>
          </div>
        </div>
      )}

      <div className="stack mt-24">
        {catMetrics.length > 0 && (
          <h2 className="muted" style={{ fontSize: 13, fontWeight: 600, textTransform: "uppercase", padding: "0 4px" }}>
            Historial de {category}
          </h2>
        )}
        {catMetrics
          .slice()
          .reverse()
          .map((m, i) => (
            <div className="card card-section reveal" key={m.id} style={{ transitionDelay: `${Math.min(i, 6) * 30}ms`, padding: "12px 16px" }}>
              <div className="row">
                <div className="grow">
                  <div className="list-title">{m.value}%</div>
                  <div className="list-sub">{formatShort(m.date)}</div>
                </div>
                <span className="badge badge-blue">{m.category}</span>
                {category !== "Metas diarias" && (
                  <button className="btn-icon" style={{ color: "var(--red)" }} onClick={() => setConfirmDelete(m.id)}>
                    <IconTrash size={16} />
                  </button>
                )}
              </div>
            </div>
          ))}
      </div>

      <Sheet open={sheetOpen} title="Registrar rendimiento" onClose={() => setSheetOpen(false)}>
        <div className="field-group">
          <label className="field-label">Categoría</label>
          <div className="chips">
            {CATEGORIES.map((c) => (
              <button key={c} className={`chip ${category === c ? "active" : ""}`} onClick={() => setCategory(c)}>
                {c}
              </button>
            ))}
          </div>
        </div>
        <div className="field-group mt-24">
          <label className="field-label">Tu nivel de hoy</label>
          <div className="row-between">
            <span className="muted">Bajo</span>
            <span style={{ fontSize: 44, fontWeight: 800, fontVariantNumeric: "tabular-nums" }}>{value}%</span>
            <span className="muted">Alto</span>
          </div>
          <input
            type="range"
            min={0}
            max={100}
            step={5}
            value={value}
            onChange={(e) => setValue(Number(e.target.value))}
            style={{ width: "100%", accentColor: "var(--accent)", height: 40 }}
          />
        </div>
        <div className="row mt-8">
          <div className="card grow" style={{ boxShadow: "none", background: "var(--fill)", borderRadius: 12, textAlign: "center", padding: 10 }}>
            <div className="muted small">Categoría</div>
            <div style={{ fontWeight: 600 }}>{category}</div>
          </div>
          <div className="card grow" style={{ boxShadow: "none", background: "var(--fill)", borderRadius: 12, textAlign: "center", padding: 10 }}>
            <div className="muted small">Fecha</div>
            <div style={{ fontWeight: 600 }}>Hoy · {formatShort(todayKey())}</div>
          </div>
        </div>
        <button className="btn btn-primary btn-block mt-24" onClick={save}>
          Guardar registro
        </button>
      </Sheet>

      <ConfirmSheet
        open={confirmDelete !== null}
        title="Eliminar registro"
        message="Este dato desaparecerá de tu gráfica."
        onCancel={() => setConfirmDelete(null)}
        onConfirm={() => {
          if (confirmDelete) {
            deleteMetric(confirmDelete);
            toast("Registro eliminado", "🗑️");
          }
          setConfirmDelete(null);
        }}
      />
    </div>
  );
}
