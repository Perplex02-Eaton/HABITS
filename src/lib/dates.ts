export const DAY_NAMES = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];

export const DAY_SHORT = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];

export const MONTHS = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"
];

export function pad(n: number): string {
  return n < 10 ? `0${n}` : `${n}`;
}

export function toKey(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function fromKey(key: string): Date {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function todayKey(): string {
  return toKey(new Date());
}

export function addDays(key: string, days: number): string {
  const d = fromKey(key);
  d.setDate(d.getDate() + days);
  return toKey(d);
}

export function formatLong(key: string): string {
  const d = fromKey(key);
  return `${DAY_NAMES[d.getDay()]}, ${d.getDate()} de ${MONTHS[d.getMonth()]}`;
}

export function formatShort(key: string): string {
  const d = fromKey(key);
  return `${DAY_SHORT[d.getDay()]} ${d.getDate()}`;
}

export function nowTime(): string {
  const d = new Date();
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function timeToMinutes(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

export function minutesNow(): number {
  const d = new Date();
  return d.getHours() * 60 + d.getMinutes();
}

export function relativeDue(key: string, time?: string): string {
  const today = todayKey();
  const d = fromKey(key);
  const diff = Math.round((d.getTime() - fromKey(today).getTime()) / 86400000);
  let label: string;
  if (diff === 0) label = "Hoy";
  else if (diff === 1) label = "Mañana";
  else if (diff === -1) label = "Ayer";
  else if (diff > 1 && diff <= 7) label = `En ${diff} días`;
  else if (diff < -1) label = `Hace ${-diff} días`;
  else label = formatShort(key);
  return time ? `${label} · ${time}` : label;
}

export function greeting(): string {
  const h = new Date().getHours();
  if (h < 6) return "Buenas noches";
  if (h < 12) return "Buenos días";
  if (h < 19) return "Buenas tardes";
  return "Buenas noches";
}
