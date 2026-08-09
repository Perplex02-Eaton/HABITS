interface EmptyProps {
  icon: string;
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
}

export default function Empty({ icon, title, subtitle, action }: EmptyProps) {
  return (
    <div className="empty">
      <div className="empty-icon">{icon}</div>
      <h3 style={{ color: "var(--label)", fontWeight: 600, fontSize: 17 }}>{title}</h3>
      {subtitle && <p className="muted mt-8">{subtitle}</p>}
      {action && <div className="mt-16">{action}</div>}
    </div>
  );
}
