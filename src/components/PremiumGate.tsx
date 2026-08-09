import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { useAccess } from "../stores/useAccess";

export default function PremiumGate({ children }: { children: ReactNode }) {
  const { access, loading } = useAccess();
  if (loading) return <div className="route-loader" role="status" aria-label="Verificando acceso" />;
  if (access.plan === "student" || access.plan === "owner") return <>{children}</>;
  return (
    <main className="page paywall-page">
      <div className="paywall-symbol" aria-hidden="true">✦</div>
      <h1 className="page-title">Desbloquea tu sistema completo</h1>
      <p className="page-subtitle">Sincronización, apuntes avanzados, reportes e inteligencia personal en todos tus dispositivos.</p>
      <Link className="btn btn-primary btn-block mt-24" to="/planes">Ver planes</Link>
      <Link className="btn btn-secondary btn-block mt-16" to="/ajustes">Iniciar sesión</Link>
    </main>
  );
}
