import { useEffect, useRef, useState } from "react";
import { IconUndo, IconTrash } from "./ui/Icons";

const COLORS = ["#1C1C1E", "#0A84FF", "#FF3B30", "#34C759", "#FF9500", "#AF52DE", "#FFFFFF"];
const ERASE = "__erase__";
const HEIGHT = 240;

interface Stroke {
  color: string;
  width: number;
  pts: { x: number; y: number }[];
}

interface PenPadProps {
  initial?: string | null;
  onChange: (dataUrl: string | null) => void;
}

export default function PenPad({ initial, onChange }: PenPadProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const strokesRef = useRef<Stroke[]>([]);
  const currentRef = useRef<Stroke | null>(null);
  const drawingRef = useRef(false);
  const baseRef = useRef<HTMLImageElement | null>(null);
  const [color, setColor] = useState(COLORS[0]);
  const [erase, setErase] = useState(false);
  const [, setTick] = useState(0);

  const redraw = (withBase = true) => {
    const cv = canvasRef.current;
    const ctx = cv?.getContext("2d");
    if (!cv || !ctx) return;
    const w = cv.clientWidth;
    ctx.clearRect(0, 0, w, HEIGHT);
    if (withBase && baseRef.current) {
      ctx.drawImage(baseRef.current, 0, 0, w, HEIGHT);
    }
    for (const s of strokesRef.current) {
      if (s.pts.length === 0) continue;
      if (s.color === ERASE) {
        ctx.globalCompositeOperation = "destination-out";
      } else {
        ctx.globalCompositeOperation = "source-over";
      }
      ctx.strokeStyle = s.color;
      ctx.lineWidth = s.width;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.beginPath();
      s.pts.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
      ctx.stroke();
    }
    ctx.globalCompositeOperation = "source-over";
  };

  const emit = () => {
    const cv = canvasRef.current;
    if (!cv) return;
    onChange(cv.toDataURL("image/png"));
  };

  useEffect(() => {
    const cv = canvasRef.current;
    if (!cv) return;
    const dpr = window.devicePixelRatio || 1;
    const w = cv.clientWidth;
    cv.width = w * dpr;
    cv.height = HEIGHT * dpr;
    cv.getContext("2d")!.scale(dpr, dpr);

    if (initial) {
      const img = new Image();
      img.onload = () => {
        baseRef.current = img;
        redraw();
      };
      img.src = initial;
    } else {
      baseRef.current = null;
      redraw();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initial]);

  const point = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const cv = canvasRef.current!;
    const rect = cv.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const onDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const cv = canvasRef.current!;
    cv.setPointerCapture(e.pointerId);
    drawingRef.current = true;
    const pressure = e.pointerType === "mouse" ? 0.5 : e.pressure > 0 ? e.pressure : 0.5;
    const c = erase ? ERASE : color;
    currentRef.current = {
      color: c,
      width: c === ERASE ? 16 : 1.5 + pressure * 5,
      pts: [point(e)]
    };
  };

  const onMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawingRef.current || !currentRef.current) return;
    const p = point(e);
    currentRef.current.pts.push(p);
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx || !canvasRef.current) return;
    const s = currentRef.current;
    ctx.globalCompositeOperation = s.color === ERASE ? "destination-out" : "source-over";
    ctx.strokeStyle = s.color;
    ctx.lineWidth = s.width;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.beginPath();
    ctx.moveTo(s.pts[s.pts.length - 2].x, s.pts[s.pts.length - 2].y);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    ctx.globalCompositeOperation = "source-over";
  };

  const onUp = () => {
    if (!drawingRef.current) return;
    drawingRef.current = false;
    if (currentRef.current) {
      strokesRef.current.push(currentRef.current);
      currentRef.current = null;
      emit();
      setTick((t) => t + 1);
    }
  };

  const undo = () => {
    strokesRef.current.pop();
    redraw();
    emit();
    setTick((t) => t + 1);
  };

  const clear = () => {
    strokesRef.current = [];
    baseRef.current = null;
    redraw(false);
    emit();
    setTick((t) => t + 1);
  };

  return (
    <div>
      <div
        className="card"
        style={{
          background: "var(--bg)",
          boxShadow: "none",
          border: "1px solid var(--separator)",
          borderRadius: 16,
          overflow: "hidden",
          touchAction: "none"
        }}
      >
        <canvas
          ref={canvasRef}
          style={{ width: "100%", height: HEIGHT, display: "block", touchAction: "none", cursor: "crosshair" }}
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerCancel={onUp}
        />
      </div>

      <div className="row mt-8" style={{ flexWrap: "wrap", gap: 6 }}>
        {COLORS.map((c) => (
          <button
            key={c}
            onClick={() => {
              setColor(c);
              setErase(false);
            }}
            style={{
              width: 26,
              height: 26,
              borderRadius: "50%",
              background: c,
              border: color === c && !erase ? "3px solid var(--accent)" : "2px solid var(--separator)",
              boxShadow: c === "#FFFFFF" ? "inset 0 0 0 1px var(--separator)" : undefined
            }}
            aria-label={`Color ${c}`}
          />
        ))}
        <button
          className={`chip ${erase ? "active" : ""}`}
          style={{ fontSize: 12, padding: "6px 10px" }}
          onClick={() => setErase(!erase)}
        >
          🧽 Borrar
        </button>
        <button className="chip" style={{ fontSize: 12, padding: "6px 10px" }} onClick={undo}>
          <IconUndo size={13} /> Deshacer
        </button>
        <button className="chip" style={{ fontSize: 12, padding: "6px 10px", color: "var(--red)" }} onClick={clear}>
          <IconTrash size={13} /> Limpiar
        </button>
      </div>
      <p className="muted small mt-8" style={{ fontSize: 12 }}>
        Escribe con el lápiz de tu tablet (SPen) o con el dedo. La presión se tiene en cuenta.
      </p>
    </div>
  );
}
