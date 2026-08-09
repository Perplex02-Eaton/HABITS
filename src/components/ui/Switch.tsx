interface SwitchProps {
  on: boolean;
  onChange: (v: boolean) => void;
}

export default function Switch({ on, onChange }: SwitchProps) {
  return (
    <button
      role="switch"
      aria-checked={on}
      className={`switch ${on ? "on" : ""}`}
      onClick={() => onChange(!on)}
      style={{ WebkitTapHighlightColor: "transparent" }}
    >
      <span className="thumb" />
    </button>
  );
}
