let lastShown = new Set<string>();

export function canNotify(): boolean {
  return "Notification" in window;
}

export async function requestPermission(): Promise<boolean> {
  if (!canNotify()) return false;
  if (Notification.permission === "granted") return true;
  if (Notification.permission === "denied") return false;
  const result = await Notification.requestPermission();
  return result === "granted";
}

export function notify(title: string, body: string) {
  if (!canNotify() || Notification.permission !== "granted") return;
  const key = `${title}::${body}`;
  if (lastShown.has(key)) return;
  lastShown.add(key);
  window.setTimeout(() => lastShown.delete(key), 60 * 60 * 1000);
  try {
    new Notification(title, { body, icon: "/icons/icon-192.png" });
  } catch {
    /* algunos navegadores requieren registration */
  }
}

/** Busca los próximos eventos y lanza notificaciones cuando toca. */
export function scheduleTick(onFire: () => void) {
  const check = () => {
    const now = new Date();
    if (now.getSeconds() === 0) onFire();
  };
  check();
  const id = window.setInterval(check, 1000);
  return () => window.clearInterval(id);
}
