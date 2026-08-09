import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useStore } from "../stores/useStore";
import { toast } from "../stores/useToasts";
import { uid } from "../lib/uid";
import type { MealType, Priority } from "../lib/types";
import { aiAssistant, aiConfigured } from "../lib/ai";

const WEEKDAYS: Record<string, number> = {
  domingo: 0,
  lunes: 1,
  martes: 2,
  miercoles: 3,
  miércoles: 3,
  jueves: 4,
  viernes: 5,
  sabado: 6,
  sábado: 6
};

function dateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function addDays(base: Date, n: number): Date {
  const d = new Date(base);
  d.setDate(d.getDate() + n);
  return d;
}

function scrubEdges(text: string): string {
  return text.replace(/\s+/g, " ").trim().replace(/^[:;.,\-–—\s]+|[:;.,\-–—\s]+$/g, "");
}

function stripWords(text: string, words: string[]): string {
  let t = text.trim();
  for (const w of words) {
    t = t.replace(new RegExp(w, "gi"), " ");
  }
  return scrubEdges(t);
}

function cleanTitle(text: string): string {
  return scrubEdges(
    text
      .replace(/^[a-záéíóúñü]+\s+/, "")
      .replace(/^(para|el|la|los|las|un|una|me)\s+/gi, "")
  );
}

function findWeekday(text: string): number | null {
  const low = text.toLowerCase();
  for (const [name, num] of Object.entries(WEEKDAYS)) {
    if (low.includes(name)) return num;
  }
  return null;
}

function stripTime(text: string): { text: string; time?: string } {
  const m = text.match(/(?:a las|a la|las|a)\s+(\d{1,2})(?::(\d{2}))?\s*(a\.?m\.?|p\.?m\.?)?/i);
  if (!m) return { text };
  let h = parseInt(m[1], 10);
  const min = m[2] ? parseInt(m[2], 10) : 0;
  const ap = (m[3] || "").toLowerCase();
  if (ap.startsWith("p") && h < 12) h += 12;
  if (ap.startsWith("a") && h === 12) h = 0;
  const time = `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
  return { text: stripWords(text, [m[0]]), time };
}

function getRecognition(): SpeechRecognition | null {
  const W = window as unknown as {
    SpeechRecognition?: { new (): SpeechRecognition };
    webkitSpeechRecognition?: { new (): SpeechRecognition };
  };
  const Ctor = W.SpeechRecognition || W.webkitSpeechRecognition;
  return Ctor ? new Ctor() : null;
}

function pickVoice(): SpeechSynthesisVoice | null {
  const vs = window.speechSynthesis.getVoices();
  const spanish = vs.filter((v) => v.lang.toLowerCase().startsWith("es"));
  if (!spanish.length) return null;
  const locale = navigator.language.toLowerCase().startsWith("es")
    ? navigator.language.toLowerCase()
    : "es-pe";
  const score = (voice: SpeechSynthesisVoice) => {
    const name = voice.name.toLowerCase();
    const lang = voice.lang.toLowerCase();
    let value = 0;
    if (lang === locale) value += 60;
    if (/es-(pe|mx|us|co|ar|cl)/.test(lang)) value += 30;
    if (/pablo|jorge|diego|javier|andres|andrés|alvaro|álvaro|raul|raúl|male|hombre/.test(name)) value += 20;
    if (voice.localService) value += 8;
    if (voice.default) value += 4;
    return value;
  };
  return [...spanish].sort((a, b) => score(b) - score(a))[0] ?? null;
}

const ORB_SIZE = 120;

const NODES: [number, number][] = [
  [60, 60],
  [28, 34], [92, 30], [22, 62], [98, 64], [38, 86], [82, 86],
  [40, 14], [80, 14], [14, 92], [106, 92], [60, 106], [14, 34], [106, 34], [60, 16]
];

export function NeuralOrb({ active }: { active: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = ORB_SIZE * dpr;
    canvas.height = ORB_SIZE * dpr;
    ctx.scale(dpr, dpr);

    const edges: [number, number][] = [];
    for (let i = 0; i < NODES.length; i++) {
      for (let j = i + 1; j < NODES.length; j++) {
        const dx = NODES[i][0] - NODES[j][0];
        const dy = NODES[i][1] - NODES[j][1];
        if (Math.hypot(dx, dy) < 52) edges.push([i, j]);
      }
    }

    let raf = 0;
    const tick = (time: number) => {
      const S = ORB_SIZE;
      ctx.clearRect(0, 0, S, S);
      const on = active;

      const halo = ctx.createRadialGradient(60, 60, 4, 60, 60, 58);
      halo.addColorStop(0, `rgba(225, 249, 255, ${on ? 0.3 : 0.18})`);
      halo.addColorStop(0.45, `rgba(62, 180, 255, ${on ? 0.12 : 0.06})`);
      halo.addColorStop(1, "rgba(20, 110, 255, 0)");
      ctx.fillStyle = halo;
      ctx.fillRect(0, 0, S, S);

      ctx.save();
      ctx.translate(60, 60);
      ctx.rotate(time / (on ? 1700 : 5200));
      for (let i = 0; i < 24; i++) {
        const start = (i / 24) * Math.PI * 2;
        ctx.strokeStyle = `rgba(110, 210, 255, ${i % 3 === 0 ? 0.82 : 0.3})`;
        ctx.lineWidth = i % 3 === 0 ? 1.7 : 0.8;
        ctx.beginPath();
        ctx.arc(0, 0, 53, start, start + (i % 3 === 0 ? 0.14 : 0.075));
        ctx.stroke();
      }
      ctx.restore();

      ctx.save();
      ctx.translate(60, 60);
      ctx.rotate(-time / (on ? 1200 : 4000));
      ctx.setLineDash([3, 5]);
      ctx.strokeStyle = "rgba(125, 215, 255, 0.48)";
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      ctx.arc(0, 0, 43, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();

      edges.forEach(([i, j], k) => {
        const [ax, ay] = NODES[i];
        const [bx, by] = NODES[j];
        const alpha = on ? 0.34 : 0.22;
        ctx.strokeStyle = `rgba(96, 178, 255, ${alpha})`;
        ctx.lineWidth = on ? 1.2 : 1;
        ctx.beginPath();
        ctx.moveTo(ax, ay);
        ctx.lineTo(bx, by);
        ctx.stroke();

        const speed = on ? 620 : 1350;
        const p = (time / speed + k * 0.127) % 1;
        const x = ax + (bx - ax) * p;
        const y = ay + (by - ay) * p;
        const glow = (on ? 0.9 : 0.55) * (1 - p) + (on ? 0.35 : 0.18);
        ctx.fillStyle = `rgba(190, 228, 255, ${glow})`;
        ctx.shadowColor = "rgba(120, 200, 255, 0.9)";
        ctx.shadowBlur = on ? 7 : 4;
        ctx.beginPath();
        ctx.arc(x, y, on ? 1.7 : 1.2, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
      });

      NODES.forEach(([x, y], i) => {
        const isCenter = i === 0;
        const drift = 0.6 * Math.sin(time / 1600 + i * 1.7);
        const px = x + drift;
        const py = y + 0.5 * Math.cos(time / 2100 + i * 1.3);
        const pulse = on
          ? 1.4 + 1.1 * Math.sin(time / 220 + i * 0.9)
          : 0.6 + 0.7 * Math.sin(time / 700 + i * 0.8);
        const r = (isCenter ? 4.6 : 2.4) + pulse;
        ctx.fillStyle = isCenter ? "rgba(190, 228, 255, 0.95)" : `rgba(130, 200, 255, ${on ? 0.95 : 0.75})`;
        ctx.shadowColor = isCenter ? "rgba(120, 200, 255, 0.95)" : "rgba(120, 200, 255, 0.5)";
        ctx.shadowBlur = isCenter ? 12 : 6;
        ctx.beginPath();
        ctx.arc(px, py, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
      });

      const corePulse = on ? 1 + Math.sin(time / 150) * 0.08 : 1 + Math.sin(time / 900) * 0.025;
      const core = ctx.createRadialGradient(57, 56, 1, 60, 60, 22 * corePulse);
      core.addColorStop(0, "rgba(255, 255, 255, 1)");
      core.addColorStop(0.16, "rgba(165, 232, 255, 0.98)");
      core.addColorStop(0.5, "rgba(48, 155, 255, 0.25)");
      core.addColorStop(1, "rgba(20, 110, 255, 0)");
      ctx.fillStyle = core;
      ctx.shadowColor = "rgba(80, 195, 255, 0.95)";
      ctx.shadowBlur = on ? 18 : 10;
      ctx.beginPath();
      ctx.arc(60, 60, 22 * corePulse, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;

      ctx.strokeStyle = "rgba(232, 251, 255, 0.94)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(60, 47);
      ctx.lineTo(71.3, 66.5);
      ctx.lineTo(48.7, 66.5);
      ctx.closePath();
      ctx.stroke();
      if (!reduceMotion) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [active]);

  return <canvas ref={ref} width={ORB_SIZE} height={ORB_SIZE} className="jarvis-orb-canvas" />;
}

const HOLOGRAM_W = 420;
const HOLOGRAM_H = 230;

function HologramStage({ active }: { active: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = HOLOGRAM_W * dpr;
    canvas.height = HOLOGRAM_H * dpr;
    ctx.scale(dpr, dpr);
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let raf = 0;

    const energySphere = (x: number, y: number, radius: number, time: number, warm = false) => {
      const color = warm ? "255, 173, 54" : "66, 216, 255";
      const phase = reduceMotion ? 0 : time;
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(phase / (warm ? 4100 : -3600));
      ctx.strokeStyle = `rgba(${color}, 0.55)`;
      ctx.shadowColor = `rgba(${color}, 0.8)`;
      ctx.shadowBlur = active ? 13 : 7;
      for (let i = 0; i < 5; i++) {
        ctx.lineWidth = i === 0 ? 1.2 : 0.65;
        ctx.beginPath();
        ctx.ellipse(0, 0, radius - i * 4, radius * (0.32 + i * 0.1), i * 0.58, 0, Math.PI * 2);
        ctx.stroke();
      }
      for (let i = 0; i < 28; i++) {
        const a = i * 2.399 + phase / 2500;
        const r = radius * (0.25 + ((i * 17) % 70) / 100);
        ctx.fillStyle = `rgba(${color}, ${0.35 + (i % 4) * 0.12})`;
        ctx.beginPath();
        ctx.arc(Math.cos(a) * r, Math.sin(a) * r * 0.72, i % 5 === 0 ? 1.5 : 0.8, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    };

    const draw = (time: number) => {
      ctx.clearRect(0, 0, HOLOGRAM_W, HOLOGRAM_H);
      const phase = reduceMotion ? 0 : time;
      const pulse = active ? 0.78 + Math.sin(phase / 135) * 0.17 : 0.56 + Math.sin(phase / 900) * 0.06;

      const aura = ctx.createRadialGradient(210, 106, 8, 210, 106, 120);
      aura.addColorStop(0, `rgba(61, 220, 255, ${0.16 + pulse * 0.12})`);
      aura.addColorStop(0.5, "rgba(27, 135, 255, 0.055)");
      aura.addColorStop(1, "rgba(10, 90, 200, 0)");
      ctx.fillStyle = aura;
      ctx.fillRect(70, 0, 280, 220);

      ctx.save();
      ctx.strokeStyle = "rgba(75, 200, 242, 0.12)";
      ctx.lineWidth = 0.65;
      for (let y = 174; y <= 222; y += 12) {
        ctx.beginPath();
        ctx.moveTo(38, y);
        ctx.lineTo(382, y);
        ctx.stroke();
      }
      for (let x = 70; x <= 350; x += 28) {
        ctx.beginPath();
        ctx.moveTo(210, 142);
        ctx.lineTo(x, 226);
        ctx.stroke();
      }
      ctx.restore();

      energySphere(64, 115, 43, phase, true);
      energySphere(352, 100, 34, phase, false);

      ctx.save();
      ctx.translate(210, 102);
      ctx.strokeStyle = `rgba(98, 226, 255, ${pulse})`;
      ctx.fillStyle = `rgba(91, 220, 255, ${pulse * 0.13})`;
      ctx.shadowColor = "rgba(62, 218, 255, 0.95)";
      ctx.shadowBlur = active ? 18 : 10;
      ctx.lineWidth = 1.15;

      ctx.beginPath();
      ctx.arc(0, -46, 17, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(-18, -25);
      ctx.quadraticCurveTo(-48, -13, -58, 18);
      ctx.quadraticCurveTo(-35, 4, -27, 38);
      ctx.lineTo(-20, 74);
      ctx.moveTo(18, -25);
      ctx.quadraticCurveTo(48, -13, 58, 18);
      ctx.quadraticCurveTo(35, 4, 27, 38);
      ctx.lineTo(20, 74);
      ctx.moveTo(-18, -24);
      ctx.quadraticCurveTo(0, -10, 18, -24);
      ctx.moveTo(-27, 38);
      ctx.quadraticCurveTo(0, 50, 27, 38);
      ctx.stroke();

      ctx.lineWidth = 0.7;
      for (let branch = 0; branch < 14; branch++) {
        const side = branch % 2 === 0 ? -1 : 1;
        const baseY = -24 + (branch % 7) * 14;
        ctx.strokeStyle = `rgba(105, 231, 255, ${0.14 + (branch % 4) * 0.045})`;
        ctx.beginPath();
        ctx.moveTo(side * (12 + (branch % 3) * 6), baseY);
        for (let step = 1; step <= 5; step++) {
          const reach = 13 + step * 8;
          const jitter = Math.sin(phase / 430 + branch * 1.9 + step * 2.2) * 7;
          ctx.lineTo(side * reach, baseY + step * 3 + jitter);
        }
        ctx.stroke();
      }

      ctx.strokeStyle = `rgba(190, 249, 255, ${0.38 + pulse * 0.35})`;
      ctx.beginPath();
      ctx.arc(0, -46, 8, Math.PI * 0.12, Math.PI * 0.88);
      ctx.stroke();

      for (let i = 0; i < 90; i++) {
        const a = i * 2.399 + phase / 4200;
        const vertical = -50 + ((i * 37) % 125);
        const width = 16 + Math.max(0, vertical + 42) * 0.38;
        const x = Math.cos(a) * width * (0.55 + (i % 7) / 12);
        const y = vertical + Math.sin(a * 1.7) * 5;
        ctx.globalAlpha = 0.25 + (i % 6) * 0.1;
        ctx.beginPath();
        ctx.arc(x, y, i % 9 === 0 ? 1.6 : 0.75, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      ctx.restore();

      const scanY = reduceMotion ? 112 : 24 + ((phase / 18) % 160);
      const scan = ctx.createLinearGradient(100, scanY, 320, scanY);
      scan.addColorStop(0, "rgba(80, 220, 255, 0)");
      scan.addColorStop(0.5, `rgba(130, 240, 255, ${active ? 0.48 : 0.22})`);
      scan.addColorStop(1, "rgba(80, 220, 255, 0)");
      ctx.fillStyle = scan;
      ctx.fillRect(105, scanY, 210, 1);

      if (!reduceMotion) raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [active]);

  return <canvas ref={ref} className="jarvis-hologram-canvas" aria-hidden="true" />;
}

export default function Jarvis() {
  const [listening, setListening] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [thinking, setThinking] = useState(false);
  const [supported, setSupported] = useState(true);
  const [partial, setPartial] = useState("");
  const [reply, setReply] = useState<string | null>(null);
  const [externalAction, setExternalAction] = useState<{ url: string; label: string } | null>(null);
  const recRef = useRef<SpeechRecognition | null>(null);
  const finalRef = useRef("");
  const voicesReady = useRef(false);
  const speakId = useRef(0);
  const navigate = useNavigate();

  useEffect(() => {
    if (!("webkitSpeechRecognition" in window || "SpeechRecognition" in window)) {
      setSupported(false);
    }
    if ("speechSynthesis" in window) {
      window.speechSynthesis.getVoices();
      window.speechSynthesis.onvoiceschanged = () => {
        voicesReady.current = true;
      };
    }
    return () => {
      recRef.current?.abort();
      if ("speechSynthesis" in window) window.speechSynthesis.cancel();
    };
  }, []);

  const speak = (text: string) => {
    if (!("speechSynthesis" in window)) return;
    const id = ++speakId.current;
    const u = new SpeechSynthesisUtterance(text);
    if (!voicesReady.current) window.speechSynthesis.getVoices();
    const v = pickVoice();
    if (v) u.voice = v;
    u.lang = v?.lang || "es-PE";
    u.pitch = 0.84;
    u.rate = 0.96;
    u.volume = 1;
    const done = () => {
      if (speakId.current === id) setSpeaking(false);
    };
    u.onend = done;
    u.onerror = done;
    setSpeaking(true);
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(u);
  };

  const openWeb = (url: string, label: string): string => {
    const popup = window.open(url, "_blank");
    if (popup) {
      popup.opener = null;
      setExternalAction(null);
      return `Abriendo ${label}.`;
    }
    setExternalAction({ url, label });
    return `Preparé ${label}. Toca el enlace para abrirlo.`;
  };

  const dispatch = (raw: string): string => {
    const low = raw.toLowerCase().replace(/\s+/g, " ");
    const s = useStore.getState();
    const now = new Date();
    const today = dateKey(now);

    const parseDue = (txt: string): string => {
      if (/mañana/.test(txt)) return dateKey(addDays(now, 1));
      const wd = findWeekday(txt);
      if (wd !== null) {
        const diff = (wd - now.getDay() + 7) % 7 || 7;
        return dateKey(addDays(now, diff));
      }
      return today;
    };

    if (/youtube/i.test(low) && /\b(abre|abrir|busca|búscame|pon|reproduce|reproducir|quiero ver)\b/i.test(low)) {
      const query = scrubEdges(
        raw
          .replace(/\b(abre|abrir|busca|búscame|pon|reproduce|reproducir|quiero ver)\b/gi, " ")
          .replace(/\b(en\s+)?youtube\b/gi, " ")
      );
      const url = query
        ? `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`
        : "https://www.youtube.com/";
      return openWeb(url, query ? `YouTube con ${query}` : "YouTube");
    }

    if (/\bnoticias\b/i.test(low) && /\b(busca|búscame|encuentra|dame|muéstrame)\b/i.test(low)) {
      const topic = scrubEdges(
        raw
          .replace(/\b(busca|búscame|encuentra|dame|muéstrame)\b/gi, " ")
          .replace(/\b(las|noticias|últimas|de|sobre|acerca de)\b/gi, " ")
      );
      const url = topic
        ? `https://news.google.com/search?q=${encodeURIComponent(topic)}&hl=es-419&gl=PE&ceid=PE:es-419`
        : "https://news.google.com/home?hl=es-419&gl=PE&ceid=PE:es-419";
      return openWeb(url, topic ? `noticias sobre ${topic}` : "Google Noticias");
    }

    if (/\b(google|internet|web)\b/i.test(low) && /\b(busca|búscame|investiga|encuentra)\b/i.test(low)) {
      const query = scrubEdges(
        raw
          .replace(/\b(busca|búscame|investiga|encuentra)\b/gi, " ")
          .replace(/\b(en|google|internet|la web|web)\b/gi, " ")
      );
      if (query) return openWeb(`https://www.google.com/search?q=${encodeURIComponent(query)}`, `la búsqueda de ${query}`);
    }

    const webApps: Array<[RegExp, string, string]> = [
      [/\b(spotify)\b/i, "https://open.spotify.com/", "Spotify"],
      [/\b(gmail|correo)\b/i, "https://mail.google.com/", "Gmail"],
      [/\b(whatsapp)\b/i, "https://web.whatsapp.com/", "WhatsApp Web"],
      [/\b(calendario|calendar)\b/i, "https://calendar.google.com/", "Google Calendar"],
      [/\b(canva)\b/i, "https://www.canva.com/", "Canva"]
    ];
    if (/\b(abre|abrir|ve a|inicia)\b/i.test(low)) {
      const app = webApps.find(([pattern]) => pattern.test(low));
      if (app) return openWeb(app[1], app[2]);
    }

    if (/^(hola|hey|ey|buenas|o+la)\b/.test(low) && /jarvis|asistente|habi/i.test(low)) {
      return "A sus órdenes. ¿Qué hacemos hoy?";
    }

    if (/qué tengo|que tengo|resumen|como voy|cómo voy|qué hay hoy|que hay hoy|mis pendientes|estado del día/i.test(low)) {
      const pending = s.data.tasks.filter((t) => t.status === "pending" && t.dueDate <= today);
      const todayPending = pending.filter((t) => t.dueDate === today);
      const plan = s.data.mealPlans.find((p) => p.date === today);
      const meals = plan ? plan.meals.filter((m) => !m.consumed).length : 0;
      const events = s.data.calendarEvents.filter((event) => event.date === today).length;
      const parts: string[] = [];
      if (todayPending.length) parts.push(`${todayPending.length} tarea${todayPending.length === 1 ? "" : "s"} para hoy`);
      if (events) parts.push(`${events} evento${events === 1 ? "" : "s"} en tu agenda`);
      if (meals) parts.push(`${meals} comida${meals === 1 ? "" : "s"} por marcar`);
      if (s.data.courses.length) parts.push(`${s.data.courses.length} curso${s.data.courses.length === 1 ? "" : "s"} registrados`);
      return parts.length ? parts.join(". ") + "." : "Todo en orden. No hay pendientes por hoy.";
    }

    if (/\b(ve(?:r|amos|ríamos)?|abre|abrir|muestra|muéstrame|pon)\b.*(rendimiento|gráfica|grafica)/i.test(low)) {
      window.setTimeout(() => {
        navigate("/rendimiento");
      }, 300);
      return "Abriendo el panel de rendimiento.";
    }
    if (/\b(ve(?:r|amos|ríamos)?|abre|abrir|muestra|muéstrame)\b.*(noticias|al día|al dia)/i.test(low)) {
      window.setTimeout(() => {
        navigate("/noticias");
      }, 300);
      return "Abriendo el resumen de noticias.";
    }
    if (/\b(ve(?:r|amos|ríamos)?|abre|abrir|muestra|muéstrame|mis)\b.*(curso|clase|materia)/i.test(low)) {
      window.setTimeout(() => {
        navigate("/cursos");
      }, 300);
      return "Abriendo tus cursos.";
    }
    if (/\b(ve(?:r|amos)?|abre|abrir|muestra|muéstrame)\b.*(agenda|horario|calendario)/i.test(low) && !/google/i.test(low)) {
      window.setTimeout(() => navigate("/agenda"), 200);
      return "Abriendo tu agenda semanal.";
    }
    if (/\b(ve(?:r|amos|ríamos)?|abre|abrir|muestra|muéstrame|mis)\b.*(tarea|pendiente|lista)/i.test(low)) {
      window.setTimeout(() => {
        navigate("/tareas");
      }, 300);
      return "Abriendo tu lista de tareas.";
    }
    if (/\b(ve(?:r|amos|ríamos)?|abre|abrir|muestra|muéstrame)\b.*(comida|comidas|menú|menu|plan)/i.test(low)) {
      window.setTimeout(() => {
        navigate("/comidas");
      }, 300);
      return "Abriendo el plan de comidas.";
    }
    if (/\b(ve(?:r|amos|ríamos)?|abre|abrir|muestra|muéstrame|pon|reproduce|reproducir)\b.*(música|musica|canción|cancion|spotify)/i.test(low)) {
      return "La música está aquí mismo, en la página de inicio.";
    }

    const mealMatch = low.match(/^.*?(desayuno|almuerzo|cena|snack)/i);
    if (/(comida|comer|almuerzo|desayuno|cena|snack|merienda)/i.test(low)) {
      const typeRaw = mealMatch ? mealMatch[1] : "almuerzo";
      const type = (typeRaw.toLowerCase() === "cena" ? "cena" : typeRaw.toLowerCase() === "snack" || typeRaw.toLowerCase() === "merienda" ? "snack" : typeRaw.toLowerCase() === "desayuno" ? "desayuno" : "almuerzo") as MealType;
      const cleaned = cleanTitle(stripWords(raw, ["agregar", "agrega", "añade", "añadir", "quiero", "planifica", "planificar", "comida", "planear", "registra", "registrar", typeRaw]));
      const dish = cleaned.replace(/^(el|la|un|una|de|para|hoy|mañana)\s+/gi, "").replace(/^(desayuno|almuerzo|cena|snack)\s*/i, "").trim();
      const target = /mañana/.test(low) ? dateKey(addDays(now, 1)) : today;
      const plan = s.data.mealPlans.find((p) => p.date === target);
      const meals = plan ? [...plan.meals] : [];
      const existing = meals.find((m) => m.type === type);
      if (existing) {
        meals[meals.indexOf(existing)] = { ...existing, name: dish || existing.name };
      } else {
        meals.push({ id: uid(), type, name: dish || "Sin nombre", consumed: false });
      }
      s.upsertMealPlan({ id: plan?.id ?? uid(), date: target, meals });
      toast(dish ? `${type} registrado: ${dish}` : "Comida registrada", "🍽️");
      return dish
        ? `Registrado. ${type.charAt(0).toUpperCase() + type.slice(1)}: ${dish}.`
        : "Comida registrada en el plan de hoy.";
    }

    if (/\b(idea|publicar|post|tuit|tweet|historia|video|reel|contenido)\b/i.test(low)) {
      const title = cleanTitle(stripWords(raw, ["agregar", "agrega", "añade", "añadir", "guardar", "guarda", "registra", "registrar", "nueva", "nuevo", "idea", "publicar", "publica", "escribe", "escribir", "anota", "anotar"]));
      const platform = /instagram/i.test(low) ? "instagram" : /twitter|x\b|tuit|tweet/.test(low) ? "x" : "ambos";
      if (title) {
        s.addIdea({ title, content: "", topic: "general", platform });
        toast("Idea guardada", "💡");
        return "Idea registrada en tu tablero.";
      }
      return "Dime de qué trata la idea.";
    }

    if (/\b(curso|materia|clase|asignatura)\b/i.test(low)) {
      const name = cleanTitle(stripWords(raw, ["agregar", "agrega", "añade", "añadir", "guardar", "guarda", "registra", "registrar", "nueva", "nuevo", "curso", "materia", "clase", "asignatura"]));
      if (name) {
        s.addCourse({ name, color: "var(--accent)", schedule: [] });
        toast("Curso agregado", "🎓");
        return `Curso ${name} agregado. Luego puedes añadirle horario en la pestaña Cursos.`;
      }
      return "Dime el nombre del curso.";
    }

    const taskTriggers = /(tarea|recu(?:érda|érdame|erdame)|recorda|recordá|tengo que|debo|comprar|pagar|llamar|hacer|acordate|anota|anotar|pon en la lista|en la lista|urgente|pendiente)/i;
    if (taskTriggers.test(low)) {
      const txt = stripWords(raw, [
        "agregar", "agrega", "añade", "añadir", "guardar", "guarda", "crear", "crea",
        "nueva", "nuevo", "tarea", "recu", "recuerda", "recuerdame", "recordar",
        "recuérdame", "tengo que", "debo", "porfa", "por favor", "pon en la lista",
        "en mi lista", "hazme", "haceme", "anota", "anotar"
      ]);
      const { text, time } = stripTime(txt);
      let title = text.replace(/^(hacer|comprar|pagar|llamar)\s+/i, "").trim();
      if (!title) title = cleanTitle(raw);
      title = title.replace(/^(para|hoy|mañana|el|la|los|las)\s+/gi, "").trim();
      if (title.length < 2) {
        return "No te entendí. Dime por ejemplo: agrega una tarea, comprar pan.";
      }
      const priority: Priority = /urgente|ya mismo|importante|lo antes posible/i.test(low) ? "alta" : /cuando pueda|sin prisa|baja/i.test(low) ? "baja" : "media";
      s.addTask({
        title,
        dueDate: parseDue(low),
        dueTime: time,
        priority,
        status: "pending",
        remind: true
      });
      toast(`Tarea: ${title}`, "✅");
      return `Tarea registrada: ${title}.`;
    }

    return "";
  };

  const handleCommand = async (text: string) => {
    let r = dispatch(text);
    if (!r && aiConfigured(useStore.getState().data.settings.ai)) {
      setThinking(true);
      setReply("Procesando tu consulta…");
      try {
        r = await aiAssistant(text, useStore.getState().data.settings.ai);
      } catch {
        r = "No pude conectar con la inteligencia artificial. Revisa la configuración de DeepSeek en Ajustes.";
      } finally {
        setThinking(false);
      }
    }
    if (!r) r = "No entendí la instrucción. Puedes pedirme una tarea, una comida, un curso o tu resumen de hoy.";
    setReply(r);
    speak(r);
  };

  const toggle = () => {
    if (listening) {
      recRef.current?.stop();
      return;
    }
    const rec = getRecognition();
    if (!rec) {
      setSupported(false);
      setReply("Este navegador no soporta el reconocimiento de voz.");
      return;
    }
    rec.lang = navigator.language.toLowerCase().startsWith("es") ? navigator.language : "es-PE";
    rec.interimResults = true;
    rec.continuous = false;
    rec.onstart = () => {
      setListening(true);
      setPartial("");
      setReply(null);
      setExternalAction(null);
    };
    rec.onresult = (ev) => {
      let final = "";
      let interim = "";
      for (let i = ev.resultIndex; i < ev.results.length; i++) {
        const r = ev.results[i];
        if (r.isFinal) final += r[0].transcript;
        else interim += r[0].transcript;
      }
      if (final) {
        finalRef.current += final;
        setPartial(finalRef.current);
      } else if (interim) {
        setPartial(interim);
      }
    };
    rec.onerror = (ev) => {
      setListening(false);
      if (ev.error !== "aborted" && ev.error !== "no-speech") {
        setReply("No pude captar tu voz. Inténtalo de nuevo.");
      }
    };
    rec.onend = () => {
      setListening(false);
      const text = finalRef.current.trim();
      finalRef.current = "";
      setPartial("");
      if (text) void handleCommand(text);
      else setReply("Dime qué necesitas, estoy escuchando.");
    };
    recRef.current = rec;
    try {
      rec.start();
    } catch {
      setListening(false);
    }
  };

  return (
    <section
      className={`jarvis-card reveal ${listening ? "listening" : ""} ${speaking ? "speaking" : ""} ${thinking ? "thinking" : ""}`}
      aria-label="Asistente Jarvis"
    >
      <button
        className="jarvis-core-button"
        onClick={toggle}
        aria-label={listening ? "Detener escucha" : "Hablar con Jarvis"}
        disabled={!supported}
      >
        <span className={`jarvis-hologram ${listening || speaking || thinking ? "active" : ""}`}>
          <HologramStage active={listening || speaking || thinking} />
        </span>
      </button>

      <div className="jarvis-identity">
        <div className="jarvis-title">
          JARVIS <span className="jarvis-dot" />
        </div>
        <div className="jarvis-state" aria-live="polite">
          {listening
            ? "Escuchando…"
            : thinking
              ? "Pensando…"
              : speaking
                ? "Respondiendo…"
                : reply
                  ? "Listo para ayudarte"
                  : "Tu asistente personal en español"}
        </div>
      </div>

      <button
        className={`jarvis-mic ${listening ? "active" : ""}`}
        onClick={toggle}
        disabled={!supported}
      >
        <span className="jarvis-mic-icon" aria-hidden="true">{listening ? "■" : "●"}</span>
        <span>{listening ? "Detener" : "Hablar con Jarvis"}</span>
      </button>

      <div className="jarvis-conversation">
        {partial && <div className="jarvis-transcript">“{partial}”</div>}

        {reply && (
          <div className="jarvis-reply">
            <span className="jarvis-reply-tag">JARVIS</span>
            <span>{reply}</span>
          </div>
        )}

        {externalAction && (
          <a
            className="jarvis-action-link"
            href={externalAction.url}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => setExternalAction(null)}
          >
            Abrir {externalAction.label}
          </a>
        )}
      </div>

      <div className="jarvis-hints" aria-label="Ejemplos de comandos">
        <span>Busca música en YouTube</span>
        <span>Dame noticias sobre tecnología</span>
        <span>Abre Spotify</span>
      </div>
    </section>
  );
}
