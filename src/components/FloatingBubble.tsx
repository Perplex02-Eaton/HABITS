import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, PointerEvent as ReactPointerEvent } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import {
  closeCompanionSession,
  currentSession,
  formatClock,
  remainingMs,
  subscribeCompanion,
  type CompanionSession
} from "../lib/companion";

/**
 * Ventana flotante tipo iPhone, siempre disponible, en segundo plano.
 *
 * Tres formas, de la mejor a la más básica:
 *  1. VENTANA FLOTANTE real (Chrome/Edge de escritorio, API
 *     documentPictureInPicture): un panel que flota sobre TODO lo demás —encima
 *     de Word, del navegador, de lo que sea— y sigue trabajando mientras haces
 *     otra cosa. Es el «2º plano» de verdad en PC.
 *  2. Globo flotante dentro de la app: se arrastra a cualquier esquina y
 *     sobrevive al cambio de pantalla, porque vive fuera de las rutas.
 *  3. Hoja inferior en el celular, con el mismo panel.
 *
 * El globo no decide nada por su cuenta: manda la frase a Jarvis con el mismo
 * camino que si la hubieras escrito, y muestra el estado de la sesión del
 * Acompañante (código, tiempo restante, colgar).
 */

type PiPApi = {
  requestWindow(options?: { width?: number; height?: number }): Promise<Window>;
  window: Window | null;
};

type Point = { x: number; y: number };

const POS_KEY = "habits.bubble.pos.v1";

function pipApi(): PiPApi | null {
  const w = window as unknown as { documentPictureInPicture?: PiPApi };
  return w.documentPictureInPicture ?? null;
}

function readPos(): Point | null {
  try {
    const raw = localStorage.getItem(POS_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw) as Point;
    if (typeof p.x !== "number" || typeof p.y !== "number") return null;
    return p;
  } catch {
    return null;
  }
}

function getRecognition(): SpeechRecognition | null {
  if (typeof window === "undefined") return null;
  const W = window as unknown as {
    SpeechRecognition?: { new (): SpeechRecognition };
    webkitSpeechRecognition?: { new (): SpeechRecognition };
  };
  const Ctor = W.SpeechRecognition || W.webkitSpeechRecognition;
  return Ctor ? new Ctor() : null;
}

export default function FloatingBubble() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<Point | null>(() => readPos());
  const [session, setSession] = useState<CompanionSession | null>(() => currentSession());
  const [listening, setListening] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [lastReply, setLastReply] = useState("");
  const [tick, setTick] = useState(0);
  const [pipWin, setPipWin] = useState<Window | null>(null);
  const [pipHost, setPipHost] = useState<HTMLElement | null>(null);
  const dragRef = useRef<{ dx: number; dy: number; moved: boolean } | null>(null);
  const recRef = useRef<SpeechRecognition | null>(null);

  /* sesión del acompañante: se refleja en el globo al instante */
  useEffect(() => subscribeCompanion(setSession), []);

  /* cuenta atrás viva mientras haya sesión */
  useEffect(() => {
    if (!session || session.status === "cerrada") return;
    const id = window.setInterval(() => setTick((t) => t + 1), 1000);
    return () => window.clearInterval(id);
  }, [session]);

  /* lo que Jarvis responde se ve aquí, aunque el panel esté flotando */
  useEffect(() => {
    const onReply = (event: Event) => {
      const text = String((event as CustomEvent<{ text?: string }>).detail?.text ?? "");
      if (text) {
        setLastReply(text.length > 150 ? `${text.slice(0, 147)}…` : text);
        setBusy(false);
      }
    };
    window.addEventListener("habits:jarvis-reply", onReply as EventListener);
    return () => window.removeEventListener("habits:jarvis-reply", onReply as EventListener);
  }, []);

  useEffect(() => {
    return () => {
      recRef.current?.abort();
      pipWin?.close();
    };
  }, [pipWin]);

  const remaining = useMemo(() => remainingMs(session), [session, tick]);

  /* ─────────────────────────── arrastrar el globo ─────────────────────────── */

  const onPointerDown = (event: ReactPointerEvent) => {
    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
    dragRef.current = { dx: event.clientX - rect.left, dy: event.clientY - rect.top, moved: false };
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
  };

  const onPointerMove = (event: ReactPointerEvent) => {
    const drag = dragRef.current;
    if (!drag) return;
    const size = open ? 0 : 58;
    const x = Math.min(Math.max(6, event.clientX - drag.dx), window.innerWidth - (size || 340) - 6);
    const y = Math.min(Math.max(6, event.clientY - drag.dy), window.innerHeight - (size || 520) - 6);
    drag.moved = true;
    setPos({ x, y });
  };

  const onPointerUp = () => {
    const drag = dragRef.current;
    dragRef.current = null;
    if (!drag?.moved) {
      setOpen((v) => !v);
      return;
    }
    try {
      setPos((p) => {
        if (p) localStorage.setItem(POS_KEY, JSON.stringify(p));
        return p;
      });
    } catch {
      /* nada */
    }
  };

  const style: CSSProperties = pos
    ? { left: pos.x, top: pos.y, right: "auto", bottom: "auto" }
    : { right: 14, bottom: 84 };

  /* ────────────────────────── ventana flotante (2º plano) ─────────────────── */

  const openFloating = useCallback(async () => {
    const api = pipApi();
    if (!api) {
      setNotice(
        "Este navegador no ofrece ventana flotante. En Chrome o Edge de escritorio sí; en el celular el panel queda sobre la app."
      );
      return;
    }
    try {
      const win = await api.requestWindow({ width: 356, height: 580 });
      document.querySelectorAll('link[rel="stylesheet"], style').forEach((node) => {
        win.document.head.appendChild(node.cloneNode(true));
      });
      const root = document.documentElement;
      win.document.documentElement.setAttribute("data-theme", root.getAttribute("data-theme") ?? "");
      win.document.documentElement.setAttribute("data-accent", root.getAttribute("data-accent") ?? "");
      win.document.body.className = "bubble-pip-body";
      win.document.title = "Jarvis · ventana flotante";
      win.addEventListener("pagehide", () => {
        setPipWin(null);
        setPipHost(null);
      });
      setPipHost(win.document.body);
      setPipWin(win);
      setOpen(true);
      setNotice("Ventana flotante lista: sigue encima mientras usas otro programa.");
    } catch {
      setNotice("No pude abrir la ventana flotante. Permite las ventanas emergentes e inténtalo otra vez.");
    }
  }, []);

  /* ───────────────────────────── hablar a Jarvis ─────────────────────────── */

  const listen = () => {
    if (listening) {
      recRef.current?.stop();
      return;
    }
    const rec = getRecognition();
    if (!rec) {
      setNotice("Este navegador no entiende voz. Escribe tu pedido en Jarvis, en la pantalla principal.");
      return;
    }
    rec.lang = "es-PE";
    rec.interimResults = true;
    rec.continuous = false;
    rec.onstart = () => {
      setListening(true);
      setNotice("Te escucho…");
    };
    rec.onresult = (event) => {
      let final = "";
      for (let i = 0; i < event.results.length; i += 1) {
        if (event.results[i].isFinal) final += event.results[i][0].transcript;
      }
      if (final.trim()) {
        const text = final.trim();
        const away = typeof window !== "undefined" && !/#\/?$/.test(window.location.hash || "#/");
        setBusy(true);
        setNotice(away ? "Te llevo a Jarvis y le paso tu pedido…" : `Enviado a Jarvis: «${text}»`);
        if (away) {
          navigate("/");
          window.setTimeout(() => {
            window.dispatchEvent(new CustomEvent("habits:jarvis-ask", { detail: { text } }));
          }, 700);
        } else {
          window.dispatchEvent(new CustomEvent("habits:jarvis-ask", { detail: { text } }));
        }
        window.setTimeout(() => setBusy(false), 90000);
      }
    };
    rec.onerror = () => {
      setListening(false);
      setNotice("No pude escuchar. Revisa el micrófono e inténtalo otra vez.");
    };
    rec.onend = () => setListening(false);
    recRef.current = rec;
    try {
      rec.start();
    } catch {
      setListening(false);
    }
  };

  const hangUp = async () => {
    await closeCompanionSession();
    setNotice("Sesión colgada. El historial queda visible hasta que lo borres.");
  };

  /* ──────────────────────────────── panel ───────────────────────────────── */

  const statusLabel = busy
    ? "Pensando…"
    : listening
      ? "Escuchando…"
      : session && session.status !== "cerrada"
        ? "Sesión activa"
        : "En espera";

  const panel = (
    <div className={`iphone-float ${pipHost ? "in-pip" : ""}`}>
      <div className="iphone-notch" aria-hidden="true" />
      <div className="iphone-float-head">
        <span className={`bubble-status ${listening ? "on" : busy ? "busy" : ""}`} aria-hidden="true" />
        <strong>Jarvis</strong>
        <span className="iphone-float-state">{statusLabel}</span>
        <button
          type="button"
          className="iphone-float-close"
          aria-label="Cerrar panel"
          onClick={() => (pipHost ? pipWin?.close() : setOpen(false))}
        >
          ✕
        </button>
      </div>

      {session && (
        <div className={`bubble-session ${session.status === "cerrada" ? "off" : ""}`}>
          <span className="bubble-session-code">{session.code}</span>
          <span className="bubble-session-meta">
            {session.status === "cerrada"
              ? `cerrada · ${session.closedReason ?? "fin"}`
              : session.peer
                ? `${session.peer} conectado · ${formatClock(remaining)}`
                : `esperando a la otra persona · ${formatClock(remaining)}`}
          </span>
          {session.status !== "cerrada" && (
            <button type="button" className="bubble-mini danger" onClick={() => void hangUp()}>
              Colgar
            </button>
          )}
        </div>
      )}

      <div className="bubble-grid">
        <button type="button" className={`bubble-action ${listening ? "on" : ""}`} onClick={listen}>
          <span aria-hidden="true">🎙️</span>
          {listening ? "Parar" : "Escuchar"}
        </button>
        <button
          type="button"
          className="bubble-action"
          onClick={() => {
            navigate("/acompanante");
            if (pipHost) pipWin?.close();
          }}
        >
          <span aria-hidden="true">🤝</span>
          Acompañante
        </button>
        <button type="button" className="bubble-action" onClick={() => void openFloating()}>
          <span aria-hidden="true">🪟</span>
          Ventana
        </button>
        <button
          type="button"
          className="bubble-action"
          onClick={() => {
            navigate("/");
            if (pipHost) pipWin?.close();
          }}
        >
          <span aria-hidden="true">💬</span>
          Jarvis
        </button>
      </div>

      {lastReply && <p className="bubble-reply">{lastReply}</p>}
      {notice && <p className="bubble-notice">{notice}</p>}
      <p className="bubble-foot">
        {pipHost
          ? "Flotando sobre todo lo demás: sigue el trabajo aunque cambies de programa."
          : "Se arrastra a cualquier esquina. En PC puedes sacarlo a una ventana flotante real."}
      </p>
    </div>
  );

  return (
    <>
      {pipHost && pipWin ? (
        createPortal(panel, pipHost)
      ) : (
        <>
          {open && (
            <div className="bubble-panel-host" style={style} onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp}>
              {panel}
            </div>
          )}
          {!open && (
            <button
              type="button"
              className={`float-bubble ${listening ? "listening" : busy ? "busy" : ""} ${session && session.status !== "cerrada" ? "has-session" : ""}`}
              style={style}
              aria-label={listening ? "Jarvis está escuchando" : "Abrir ventana flotante de Jarvis"}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
            >
              <span className="float-bubble-core" aria-hidden="true" />
              {session && session.status !== "cerrada" && <span className="float-bubble-badge" aria-hidden="true">🤝</span>}
            </button>
          )}
        </>
      )}
    </>
  );
}
