import { Route, Routes, useLocation } from "react-router-dom";
import { lazy, Suspense, useEffect } from "react";
import TabBar from "./components/TabBar";
import Toasts from "./components/Toasts";
import ReminderWatcher from "./components/ReminderWatcher";
import FloatingBubble from "./components/FloatingBubble";
import { useStore } from "./stores/useStore";

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
const Study = lazy(() => import("./pages/Study"));
const CourseNotebook = lazy(() => import("./pages/CourseNotebook"));
const Connections = lazy(() => import("./pages/Connections"));
const Companion = lazy(() => import("./pages/Companion"));

export default function App() {
  const location = useLocation();
  const darkMode = useStore((s) => s.data.settings.darkMode);
  const accentColor = useStore((s) => s.data.settings.accentColor);

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

  useEffect(() => {
    const root = document.documentElement;
    if (accentColor) root.setAttribute("data-accent", accentColor);
    else root.removeAttribute("data-accent");
  }, [accentColor]);

  return (
    <>
      <ReminderWatcher />
      <Toasts />
      <Suspense fallback={<div className="route-loader" role="status" aria-label="Cargando" />}>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/cursos" element={<Courses />} />
          <Route path="/comidas" element={<Meals />} />
          <Route path="/ideas" element={<Ideas />} />
          <Route path="/tareas" element={<Tasks />} />
          <Route path="/notas" element={<Notas />} />
          <Route path="/noticias" element={<Noticias />} />
          <Route path="/rendimiento" element={<Performance />} />
          <Route path="/ajustes" element={<Settings />} />
          <Route path="/agenda" element={<Calendar />} />
          <Route path="/planes" element={<Pricing />} />
          <Route path="/conexiones" element={<Connections />} />
          <Route path="/acompanante" element={<Companion />} />
          <Route path="/estudio" element={<Study />} />
          <Route path="/cuaderno/:courseId" element={<CourseNotebook />} />
          <Route path="*" element={<Dashboard />} />
        </Routes>
      </Suspense>
      <FloatingBubble />
      <TabBar />
    </>
  );
}
