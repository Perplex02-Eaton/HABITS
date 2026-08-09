import { useToasts } from "../stores/useToasts";

export default function Toasts() {
  const toasts = useToasts((s) => s.toasts);
  const dismiss = useToasts((s) => s.dismiss);
  if (toasts.length === 0) return null;
  return (
    <div className="toasts">
      {toasts.map((t) => (
        <div key={t.id} className="toast" onClick={() => dismiss(t.id)}>
          {t.icon && <span>{t.icon}</span>}
          <span className="grow">{t.message}</span>
        </div>
      ))}
    </div>
  );
}
