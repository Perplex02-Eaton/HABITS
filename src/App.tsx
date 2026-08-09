import { Route, Routes, useLocation } from "react-router-dom";
import { lazy, Suspense, useEffect } from "react";
import TabBar from "./components/TabBar";
import Toasts from "./components/Toasts";
import ReminderWatcher from "./components/ReminderWatcher";
import { useStore } from "./stores/useStore";
import PremiumGate from "./components/PremiumGate";

const Dashboard = lazy(() => import("./pages/Dashboard"));
const Courses = lazy(() => import("./pages/Courses"));
const Meals = lazy(() => import("./pages/Meals"));
const Ideas = lazy(() => import("./pages/Ideas"));
const Tasks = lazy(() => import("./pages/Tasks"));
const Notas = lazy(() => import("./pages/Notas"));
const Noticias = lazy(() => import("./pages/Noticias"));
const Performance = lazy(() => import("./pages/Performance"));
const Settings = lazy(() => import("./pages/Settings"));
const Calendar = lazy(() => import("./pages/Calendar"));
const Pricing = lazy(() => import("./pages/Pricing"));

export default function App() {
  const location = useLocation();
  const darkMode = useStore((s) => s.data.settings.darkMode);

  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [location.pathname]);

  useEffect(() => {
    const root = document.documentElement;
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const applyTheme = () => {
      if (darkMode === "auto") root.removeAttribute("data-theme");
      else root.setAttribute("data-theme", darkMode);
      const isDark = darkMode === "dark" || (darkMode === "auto" && media.matches);
      document.querySelector('meta[name="theme-color"]')?.setAttribute("content", isDark ? "#000000" : "#f2f2f7");
    };
    applyTheme();
    media.addEventListener("change", applyTheme);
    return () => media.removeEventListener("change", applyTheme);
  }, [darkMode]);

  return (
    <>
      <ReminderWatcher />
      <Toasts />
      <Suspense fallback={<div className="route-loader" role="status" aria-label="Cargando" />}>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/cursos" element={<Courses />} />
          <Route path="/comidas" element={<Meals />} />
          <Route path="/ideas" element={<PremiumGate><Ideas /></PremiumGate>} />
          <Route path="/tareas" element={<Tasks />} />
          <Route path="/notas" element={<PremiumGate><Notas /></PremiumGate>} />
          <Route path="/noticias" element={<PremiumGate><Noticias /></PremiumGate>} />
          <Route path="/rendimiento" element={<PremiumGate><Performance /></PremiumGate>} />
          <Route path="/ajustes" element={<Settings />} />
          <Route path="/agenda" element={<Calendar />} />
          <Route path="/planes" element={<Pricing />} />
          <Route path="*" element={<Dashboard />} />
        </Routes>
      </Suspense>
      <TabBar />
    </>
  );
}
