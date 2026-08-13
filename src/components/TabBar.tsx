import { NavLink } from "react-router-dom";
import {
  IconHome,
  IconCalendar,
  IconBook,
  IconPen,
  IconSettings
} from "./ui/Icons";

const TABS = [
  { to: "/", label: "Hoy", Icon: IconHome, end: true },
  { to: "/agenda", label: "Agenda", Icon: IconCalendar },
  { to: "/cursos", label: "Cursos", Icon: IconBook },
  { to: "/notas", label: "Notas", Icon: IconPen },
  { to: "/ajustes", label: "Ajustes", Icon: IconSettings }
];

export default function TabBar() {
  return (
    <nav className="tabbar" style={{ paddingBottom: "calc(var(--safe-bottom) + 2px)" }}>
      {TABS.map(({ to, label, Icon, end }) => (
        <NavLink
          key={to}
          to={to}
          end={end}
          className={({ isActive }) => `tab-item ${isActive ? "active" : ""}`}
        >
          <Icon size={21} strokeWidth={1.7} />
          <span>{label}</span>
        </NavLink>
      ))}
    </nav>
  );
}
