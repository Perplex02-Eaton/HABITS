import { useEffect, useState } from "react";
import Sheet from "./ui/Sheet";
import { IconRefresh, IconSparkle, IconTrash } from "./ui/Icons";
import {
  aiBudget,
  cacheSize,
  clearAnswerCache,
  jarvisPlan,
  localEngineReady,
  prewarmLocalEngine,
  resumeCloud,
  setDailyCap,
  startBrowserEngine,
  type JarvisMode
} from "../lib/aiProviders";
import {
  WEB_MODELS,
  askWebEngine,
  setWebEngineEnabled,
  subscribeWebEngine,
  unloadWebEngine,
  webEngineState,
  webEngineSupport,
  type WebSize
} from "../lib/browserEngine";
import {
  clearMemory,
  exportMemory,
  forgetFact,
  forgetRule,
  useJarvisMemory
} from "../lib/jarvisMemory";
import { agentAsk } from "../lib/desktop";
import type { AiConfig } from "../lib/types";

/* ------------------------------- estado del motor ------------------------------ */

/** Pastilla pequeña que dice de dónde salió la última respuesta. */
export function JarvisEngineBadge({
  mode,
  provider = "",
  onOpen
}: {
  mode: JarvisMode | "listo";
  provider?: string;
  onOpen?: () => void;
}) {
  const text =
    mode === "memoria"
      ? "memoria"
      : mode === "cache"
        ? "recordado"
        : mode === "local"
          ? "motor local · gratis"
          : mode === "equipo"
            ? "tu equipo · gratis"
            : mode === "nube"
              ? "nube · gasta crédito"
              : "listo";
  const tone = mode === "nube" ? "cloud" : mode === "local" || mode === "equipo" ? "local" : "free";
  return (
    <button type="button" className={`jm-badge ${tone}`} onClick={onOpen} title={provider || text}>
      <i className="jm-badge-dot" aria-hidden="true" />
      {text}
    </button>
  );
}

/* --------------------------------- el panel --------------------------------- */

interface PanelProps {
  open: boolean;
  onClose: () => void;
  cfg: AiConfig;
}

export default function JarvisMemoryPanel({ open, onClose, cfg }: PanelProps) {
  const memory = useJarvisMemory();
  const [tab, setTab] = useState<"aprendido" | "motor" | "historial">("aprendido");
  const [engine, setEngine] = useState<{ ready: boolean; checking: boolean; note: string }>({
    ready: false,
    checking: true,
    note: ""
  });
  const [budget, setBudget] = useState(() => aiBudget());
  const [saved, setSaved] = useState(0);
  const [web, setWeb] = useState(() => webEngineState());
  const [webSize, setWebSize] = useState<WebSize>(() => webEngineState().size);
  const [webNote, setWebNote] = useState("");

  useEffect(() => subscribeWebEngine(() => setWeb(webEngineState())), []);

  useEffect(() => {
    if (!open) return;
    setBudget(aiBudget());
    setSaved(cacheSize());
    setWeb(webEngineState());
    setWebSize(webEngineState().size);
    setEngine((e) => ({ ...e, checking: true }));
    let alive = true;
    localEngineReady(true).then((ready) => {
      if (!alive) return;
      setEngine({ ready, checking: false, note: ready ? "respuestas sin costo ni internet" : "no está corriendo" });
      if (ready) void prewarmLocalEngine();
    });
    return () => {
      alive = false;
    };
  }, [open]);

  const plan = jarvisPlan(cfg);
  const recent = memory.history.slice(-14).reverse();

  async function testEngine() {
    setEngine((e) => ({ ...e, checking: true, note: "probando…" }));
    const res = await agentAsk("Di en una frase corta que el motor local funciona. Español.", { numCtx: 1024 });
    setEngine({
      ready: Boolean(res?.ok),
      checking: false,
      note: res?.ok ? `listo: ${String(res.text ?? "").slice(0, 120)}` : "sin respuesta del motor local"
    });
  }

  async function activateBrowser() {
    setWebNote("preparando…");
    setWebEngineEnabled(true);
    try {
      await startBrowserEngine((pct, phase) => setWebNote(`${phase} ${pct}%`));
      setWebEngineState();
      setWebNote("listo: la IA ya corre en tu navegador, gratis y sin claves.");
    } catch (error) {
      setWebNote(`no se pudo: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async function testBrowser() {
    setWebNote("probando…");
    try {
      const reply = await askWebEngine("En una frase corta, en español, di que estás funcionando.");
      setWebNote(reply ? `listo: ${reply.slice(0, 140)}` : "no respondió");
    } catch (error) {
      setWebNote(`no respondió: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  function setWebEngineState() {
    setWeb(webEngineState());
  }

  return (
    <Sheet open={open} title="Memoria de JARVIS" onClose={onClose}>
      <div className="jm-wrap">
        <div className="jm-stats">
          <div className="jm-stat">
            <b>{memory.facts.length}</b>
            <span>datos</span>
          </div>
          <div className="jm-stat">
            <b>{memory.rules.length}</b>
            <span>instrucciones</span>
          </div>
          <div className="jm-stat">
            <b>{memory.stats.turns}</b>
            <span>intercambios</span>
          </div>
          <div className="jm-stat">
            <b>{budget.saved}</b>
            <span>respuestas gratis</span>
          </div>
        </div>

        <p className="jm-lead">{plan.hint}</p>

        <div className="jm-tabs">
          {(["aprendido", "motor", "historial"] as const).map((t) => (
            <button key={t} type="button" className={tab === t ? "active" : ""} onClick={() => setTab(t)}>
              {t === "aprendido" ? "Lo que recuerda" : t === "motor" ? "Motor y gasto" : "Conversación"}
            </button>
          ))}
        </div>

        {tab === "aprendido" && (
          <div className="jm-list">
            <div className="jm-group">
              <h3>
                Instrucciones <span>{memory.rules.length}</span>
              </h3>
              {memory.rules.length === 0 && <p className="jm-empty">Dile por ejemplo: "de ahora en adelante respóndeme más corto".</p>}
              {memory.rules.map((r) => (
                <div key={r.id} className="jm-item">
                  <div>
                    <b>{r.text}</b>
                    <small>cuando: {r.when}</small>
                  </div>
                  <button type="button" className="jm-del" onClick={() => forgetRule(r.id)} aria-label="Olvidar">
                    <IconTrash />
                  </button>
                </div>
              ))}
            </div>

            <div className="jm-group">
              <h3>
                Datos que le conté <span>{memory.facts.length}</span>
              </h3>
              {memory.facts.length === 0 && (
                <p className="jm-empty">Nada todavía. Prueba: "recuerda que mi profesor de Importaciones es Luis".</p>
              )}
              {memory.facts.slice().reverse().map((f) => (
                <div key={f.id} className="jm-item">
                  <div>
                    <b>{f.text}</b>
                    <small>
                      {f.tags.length ? f.tags.join(" · ") + " · " : ""}
                      {new Date(f.at).toLocaleDateString("es-PE")}
                      {f.hits > 1 ? ` · repetido ${f.hits}×` : ""}
                    </small>
                  </div>
                  <button type="button" className="jm-del" onClick={() => forgetFact(f.id)} aria-label="Olvidar">
                    <IconTrash />
                  </button>
                </div>
              ))}
            </div>

            <div className="jm-actions">
              <button
                type="button"
                onClick={() => {
                  const json = exportMemory();
                  const blob = new Blob([json], { type: "application/json" });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement("a");
                  a.href = url;
                  a.download = `jarvis-memoria-${new Date().toISOString().slice(0, 10)}.json`;
                  a.click();
                  URL.revokeObjectURL(url);
                }}
              >
                <IconSparkle /> Exportar
              </button>
              <button type="button" className="danger" onClick={() => clearMemory("aprendido")}>
                Borrar lo aprendido
              </button>
            </div>
          </div>
        )}

        {tab === "motor" && (
          <div className="jm-list">
            <div className={`jm-engine ${engine.ready ? "ok" : "off"}`}>
              <div className="jm-engine-head">
                <b>Motor local (Ollama en tu PC)</b>
                <span>{engine.checking ? "verificando…" : engine.ready ? "activo" : "apagado"}</span>
              </div>
              <p>
                Es el que responde <b>sin gastar crédito de API</b>. Si está activo, JARVIS contesta aunque la clave de la nube
                falle o no haya internet.
              </p>
              {engine.note && <small>{engine.note}</small>}
              <button type="button" onClick={testEngine} disabled={engine.checking}>
                <IconRefresh /> Probar motor local
              </button>
            </div>

            <div className={`jm-engine ${web.loaded ? "ok" : web.enabled ? "" : "off"}`}>
              <div className="jm-engine-head">
                <b>IA en este equipo (para compartir la app)</b>
                <span>
                  {web.loading
                    ? `descargando ${web.progress.pct}%`
                    : web.loaded
                      ? "activa"
                      : web.enabled
                        ? "activada"
                        : "apagada"}
                </span>
              </div>
              <p>
                El modelo se descarga <b>una vez</b> y queda guardado en este navegador: después responde <b>sin claves, sin
                internet y sin gastar crédito de nadie</b>. Es lo que permite dar la app a otras personas y que la IA corra en la
                máquina de cada una, no en la tuya.
              </p>
              <small>
                {webEngineSupport().webgpu
                  ? "Usa tu tarjeta gráfica (WebGPU) y va rápido."
                  : "Sin WebGPU: usará WebAssembly. Más lento, pero igual gratis y sin claves."}
              </small>
              <div className="jm-cap">
                <span>Modelo</span>
                {(Object.keys(WEB_MODELS) as WebSize[]).map((k) => (
                  <button
                    key={k}
                    type="button"
                    className={webSize === k ? "active" : ""}
                    title={`${WEB_MODELS[k].size} · ${WEB_MODELS[k].note}`}
                    onClick={() => {
                      setWebSize(k);
                      setWebEngineEnabled(true);
                    }}
                  >
                    {WEB_MODELS[k].label}
                  </button>
                ))}
              </div>
              {webNote && <small>{webNote}</small>}
              <button type="button" onClick={activateBrowser} disabled={web.loading}>
                <IconSparkle /> {web.loaded ? "Recargar" : "Descargar y activar"}
              </button>
              {web.enabled && (
                <button type="button" onClick={testBrowser} disabled={web.loading}>
                  <IconRefresh /> Probar
                </button>
              )}
              {web.enabled && (
                <button
                  type="button"
                  onClick={() => {
                    setWebEngineEnabled(false);
                    unloadWebEngine();
                    setWebNote("apagada: el modelo queda guardado para la próxima vez.");
                  }}
                >
                  <IconTrash /> Apagar
                </button>
              )}
            </div>

            <div className="jm-engine">
              <div className="jm-engine-head">
                <b>Nube (API key)</b>
                <span className={budget.paused ? "warn" : ""}>
                  {budget.paused ? "en pausa" : `${budget.left}/${budget.cap} hoy`}
                </span>
              </div>
              <p>
                Sólo se usa cuando el motor local no está disponible y queda cupo. Sobre el cupo, JARVIS sigue trabajando gratis.
              </p>
              {budget.paused && (
                <small>
                  {budget.reason}. <button type="button" className="link" onClick={() => { resumeCloud(); setBudget(aiBudget()); }}>Reintentar</button>
                </small>
              )}
              <div className="jm-cap">
                <span>Cupo diario</span>
                {[10, 25, 100].map((n) => (
                  <button
                    key={n}
                    type="button"
                    className={budget.cap === n ? "active" : ""}
                    onClick={() => {
                      setDailyCap(n);
                      setBudget(aiBudget());
                    }}
                  >
                    {n}
                  </button>
                ))}
              </div>
            </div>

            <div className="jm-engine">
              <div className="jm-engine-head">
                <b>Respuestas recordadas</b>
                <span>{saved}</span>
              </div>
              <p>Si repites una pregunta, JARVIS contesta al instante desde su caché, sin usar ningún motor.</p>
              <button type="button" onClick={() => { clearAnswerCache(); setSaved(0); }}>
                <IconTrash /> Vaciar caché
              </button>
            </div>
          </div>
        )}

        {tab === "historial" && (
          <div className="jm-list">
            {recent.length === 0 && <p className="jm-empty">Todavía no hay conversación guardada.</p>}
            {recent.map((h) => (
              <div key={h.id} className={`jm-turn ${h.role}`}>
                <small>{h.role === "user" ? "Tú" : "JARVIS"} · {new Date(h.at).toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit" })}</small>
                <p>{h.text}</p>
              </div>
            ))}
            <div className="jm-actions">
              <button type="button" className="danger" onClick={() => clearMemory("historial")}>
                Borrar historial
              </button>
              <button type="button" className="danger" onClick={() => clearMemory("todo")}>
                Borrar todo
              </button>
            </div>
          </div>
        )}
      </div>
    </Sheet>
  );
}
