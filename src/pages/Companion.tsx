import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  COMPANION_RULES,
  F1_ACTIONS,
  SESSION_MINUTES,
  closeCompanionSession,
  currentSession,
  decideCompanionAction,
  deviceAgentAlive,
  forgetCompanionSession,
  formatClock,
  hubBase,
  hubHealth,
  joinHelpSession,
  logCompanionAction,
  remainingMs,
  setHubBase,
  startHelpSession,
  subscribeCompanion,
  syncFromHub,
  type CompanionAction,
  type CompanionSession,
  type HubInfo
} from "../lib/companion";
import { agentOpenUrl } from "../lib/desktop";
import { useStore } from "../stores/useStore";

function isMobile() {
  if (typeof navigator === "undefined") return false;
  return /android|iphone|ipad|ipod/i.test(navigator.userAgent);
}

const stateText: Record<CompanionAction["status"], string> = {
  hecho: "hecho",
  esperando: "espera tu permiso",
  aprobado: "aprobado",
  rechazado: "rechazado",
  fallo: "falló"
};

const stateTone: Record<CompanionAction["status"], string> = {
  hecho: "badge-green",
  esperando: "badge-orange",
  aprobado: "badge-blue",
  rechazado: "badge-red",
  fallo: "badge-red"
};

export default function Companion() {
  const settingsName = useStore((s) => s.data.settings.name);
  const [session, setSession] = useState<CompanionSession | null>(() => currentSession());
  const [hub, setHub] = useState<HubInfo | null>(null);
  const [hubChecked, setHubChecked] = useState(false);
  const [hubInput, setHubInput] = useState(() => hubBase());
  const [agentAlive, setAgentAlive] = useState(false);
  const [code, setCode] = useState("");
  const [helper, setHelper] = useState("");
  const [detail, setDetail] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [tick, setTick] = useState(0);

  const device = useMemo(() => {
    const who = settingsName?.split(" ")[0] || "este equipo";
    return `${who} · ${isMobile() ? "celular" : "PC"}`;
  }, [settingsName]);

  useEffect(() => subscribeCompanion(setSession), []);

  useEffect(() => {
    let alive = true;
    void hubHealth().then((info) => {
      if (alive) {
        setHub(info);
        setHubChecked(true);
      }
    });
    void deviceAgentAlive().then((ok) => alive && setAgentAlive(ok));
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (!session || session.status === "cerrada") return;
    const id = window.setInterval(() => setTick((t) => t + 1), 1000);
    return () => window.clearInterval(id);
  }, [session]);

  // El hub no empuja nada: se pregunta cada 4 s para ver lo que propone la otra
  // persona y para enterarse del cierre desde el otro lado.
  useEffect(() => {
    if (!session || session.status === "cerrada" || session.soloAqui) return;
    void syncFromHub();
    const id = window.setInterval(() => void syncFromHub(), 4000);
    return () => window.clearInterval(id);
  }, [session?.id, session?.status, session?.soloAqui]);

  const remaining = useMemo(() => remainingMs(session), [session, tick]);
  const live = Boolean(session && session.status !== "cerrada");

  const askHelp = async () => {
    setBusy(true);
    setMsg("");
    const created = await startHelpSession(device, settingsName || "");
    setSession(created);
    setBusy(false);
    setMsg(
      created.soloAqui
        ? "Listo, pero sin hub: el código sirve para probar el flujo en este mismo equipo. Levanta el hub (abajo) para que otra persona entre desde su celular o laptop."
        : "Sesión abierta. Pásale el código y el enlace a la persona que te ayuda."
    );
    void hubHealth().then((info) => {
      setHub(info);
      setHubChecked(true);
    });
  };

  const doJoin = async () => {
    if (code.replace(/\D/g, "").length !== 6) {
      setMsg("El código tiene 6 dígitos.");
      return;
    }
    setBusy(true);
    const res = await joinHelpSession(code, helper.trim() || "ayudante");
    setBusy(false);
    setMsg(res.ok ? "Conectado. Lo que hagas queda en el historial del dueño." : res.error ?? "No pude conectar.");
  };

  const runAction = async (action: (typeof F1_ACTIONS)[number]) => {
    const who = session?.role === "ayuda" ? "ayudante" : "dueño";
    const logged = await logCompanionAction(action, detail.trim(), who);
    if (!logged) {
      setMsg("Abre una sesión primero.");
      return;
    }
    setDetail("");
    if (action.id === "abrir" && !action.sensible) {
      const url = /^https?:\/\//i.test(detail.trim()) ? detail.trim() : `https://www.google.com/search?q=${encodeURIComponent(detail.trim() || "UTP")}`;
      const opened = await agentOpenUrl(url);
      setMsg(
        opened?.ok
          ? "Abrí la página en este equipo. El resumen lo da Jarvis cuando termines de leer."
          : "Registré la acción, pero el agente de este equipo no está encendido: enciéndelo con scripts\\jarvis-agent.bat."
      );
    } else if (action.sensible) {
      setMsg("Acción sensible: queda esperando la aprobación del dueño del equipo, en su propia pantalla.");
    } else {
      setMsg("Registrado en el historial de la sesión.");
    }
  };

  const decide = async (id: string, ok: boolean) => {
    await decideCompanionAction(id, ok);
    setMsg(ok ? "Aprobado. El historial ya lo registra." : "Rechazado.");
  };

  const saveHub = () => {
    setHubBase(hubInput);
    setMsg("Enlace del hub guardado. Vuelvo a comprobarlo…");
    void hubHealth().then((info) => {
      setHub(info);
      setHubChecked(true);
    });
  };

  return (
    <main className="page companion-page">
      <header className="page-header companion-header">
        <Link className="back-link" to="/">‹ Hoy</Link>
        <span className="section-kicker">ACOMPAÑANTE</span>
        <h1 className="page-title">Pide ayuda, o ayuda a alguien</h1>
        <p className="page-subtitle">
          El agente corre en el equipo de la persona que lo pide. Tú autorizas, ves todo y cuelgas cuando quieras.
        </p>
      </header>

      {live && (
        <div className="session-banner" role="status">
          <span className="session-dot" aria-hidden="true" />
          <div className="session-banner-copy">
            <strong>Sesión de acompañante activa</strong>
            <span className="small">
              código {session?.code} · quedan {formatClock(remaining)} de {SESSION_MINUTES} min
              {session?.peer ? ` · ${session.peer} conectado` : " · esperando a la otra persona"}
            </span>
          </div>
          <button type="button" className="btn btn-danger" onClick={() => void closeCompanionSession()}>
            Colgar
          </button>
        </div>
      )}

      <section className="card card-section reveal">
        <div className="row-between">
          <div className="row">
            <span style={{ fontSize: 22 }}>🤝</span>
            <div>
              <div className="list-title">Pedir ayuda en este equipo</div>
              <div className="list-sub">
                {session && session.status !== "cerrada"
                  ? `Sesión ${session.code} · ${session.status === "activa" ? "conectada" : "esperando"}`
                  : "Abre una sesión y comparte el código de 6 dígitos"}
              </div>
            </div>
          </div>
          <button type="button" className="btn" onClick={() => void askHelp()} disabled={busy || live}>
            {live ? "Sesión abierta" : "Pedir ayuda"}
          </button>
        </div>

        {session && (
          <div className="companion-code-block">
            <div className="companion-code" aria-label="código de emparejamiento">
              {session.code.split("").map((d, i) => (
                <span key={`${d}-${i}`} className="companion-digit">{d}</span>
              ))}
            </div>
            <div className="companion-code-meta">
              <span className="badge badge-blue">
                {session.lanUrl ? `hub: ${session.lanUrl}` : "modo local (sin hub)"}
              </span>
              <span className={`badge ${agentAlive ? "badge-green" : "badge-orange"}`}>
                {agentAlive ? "agente del equipo encendido" : "agente del equipo apagado"}
              </span>
              {session.status !== "cerrada" && (
                <span className="badge">quedan {formatClock(remaining)}</span>
              )}
            </div>
            <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
              {session.lanUrl && (
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={() => {
                    void navigator.clipboard?.writeText(session.lanUrl ?? "");
                    setMsg("Enlace copiado. La otra persona tiene que estar en tu misma red Wi-Fi.");
                  }}
                >
                  Copiar enlace
                </button>
              )}
              <button type="button" className="btn btn-ghost" onClick={() => void closeCompanionSession()}>
                Colgar
              </button>
              <button type="button" className="btn btn-ghost" onClick={() => forgetCompanionSession()}>
                Borrar historial
              </button>
            </div>
          </div>
        )}
      </section>

      <section className="card card-section reveal">
        <div className="list-title">Ayudar a alguien</div>
        <div className="list-sub">Escribe el código que te dieron. Desde aquí sólo se proponen acciones: el dueño aprueba.</div>
        <div className="companion-join">
          <input
            className="field companion-code-input"
            inputMode="numeric"
            maxLength={6}
            placeholder="000000"
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
            aria-label="Código de 6 dígitos"
          />
          <input
            className="field"
            placeholder="Tu nombre"
            value={helper}
            onChange={(e) => setHelper(e.target.value)}
            aria-label="Tu nombre"
          />
          <button type="button" className="btn" onClick={() => void doJoin()} disabled={busy}>
            Conectar
          </button>
        </div>
        {session?.role === "ayuda" && session.status !== "cerrada" && (
          <p className="muted small mt-8">
            Conectado al equipo «{session.device}» · quedan {formatClock(remaining)}
          </p>
        )}
      </section>

      <section className="card card-section reveal">
        <div className="list-title">Las tres acciones de este primer corte</div>
        <div className="list-sub">Lo demás llega después. Lo sensible nunca se ejecuta solo.</div>

        <label className="companion-detail">
          <span className="muted small">Dirección, tema o mensaje</span>
          <input
            className="field"
            placeholder="https://class.utp.edu.pe  ·  o el texto del mensaje"
            value={detail}
            onChange={(e) => setDetail(e.target.value)}
          />
        </label>

        <div className="companion-actions">
          {F1_ACTIONS.map((action) => (
            <div className="companion-action" key={action.id}>
              <div>
                <div className="list-title" style={{ fontSize: 14 }}>{action.label}</div>
                <div className="list-sub">{action.hint}</div>
              </div>
              <div className="row" style={{ gap: 6 }}>
                {action.sensible && <span className="badge badge-orange">pide permiso</span>}
                <button type="button" className="btn btn-ghost" onClick={() => void runAction(action)}>
                  Probar
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="card card-section reveal">
        <div className="list-title">Historial de la sesión</div>
        <div className="list-sub">
          {session?.actions.length
            ? "Todo lo que se hizo, quién lo pidió y si quedó aprobado."
            : "Todavía no hay nada. Cada acción aparece aquí, sin excepciones."}
        </div>

        {session?.actions.map((action) => (
          <div className="companion-log" key={action.id}>
            <div className="companion-log-copy">
              <div className="list-title" style={{ fontSize: 14 }}>{action.label}</div>
              <div className="list-sub">
                {new Date(action.at).toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit" })}
                {action.detail ? ` · ${action.detail}` : ""} · pidió {action.by}
              </div>
            </div>
            <div className="row" style={{ gap: 6 }}>
              <span className={`badge ${stateTone[action.status]}`}>{stateText[action.status]}</span>
              {action.status === "esperando" && session?.role === "pide" && (
                <>
                  <button type="button" className="btn btn-ghost" onClick={() => void decide(action.id, true)}>
                    Aprobar
                  </button>
                  <button type="button" className="btn btn-ghost btn-danger" onClick={() => void decide(action.id, false)}>
                    Rechazar
                  </button>
                </>
              )}
            </div>
          </div>
        ))}
      </section>

      <section className="card card-section reveal">
        <div className="list-title">Reglas de la sesión</div>
        <div className="list-sub">No son promesas: están en el código.</div>
        <ul className="companion-rules">
          {COMPANION_RULES.map((rule) => (
            <li key={rule}>{rule}</li>
          ))}
        </ul>
      </section>

      <section className="card card-section reveal">
        <div className="list-title">Hub de emparejamiento</div>
        <div className="list-sub">
          {hubChecked
            ? hub
              ? `Vivo en ${hub.lan_url} (versión ${hub.version}). Sesiones de ${hub.session_minutes} min.`
              : "No encuentro el hub: la sesión funciona en modo local, sólo en este equipo."
            : "Comprobando…"}
        </div>
        <div className="companion-join">
          <input
            className="field"
            value={hubInput}
            onChange={(e) => setHubInput(e.target.value)}
            aria-label="Dirección del hub"
            placeholder="http://192.168.1.20:8898"
          />
          <button type="button" className="btn btn-ghost" onClick={saveHub}>
            Guardar y comprobar
          </button>
        </div>
        <p className="muted small mt-8">
          Se levanta con una línea en el equipo que pide ayuda: <code>python scripts/companion_hub.py</code>. Nada se
          guarda: al cerrar el hub, las sesiones y su historial se borran.
        </p>
      </section>

      {msg && <p className="companion-msg" role="status">{msg}</p>}
    </main>
  );
}
