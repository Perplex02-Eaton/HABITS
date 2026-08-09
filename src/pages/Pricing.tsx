import { useState } from "react";
import { Link } from "react-router-dom";
import { createSubscription } from "../lib/billing";
import { supabase } from "../lib/supabase";
import { useAccess } from "../stores/useAccess";
import { toast } from "../stores/useToasts";

export default function Pricing() {
  const { access } = useAccess();
  const [busy, setBusy] = useState<"monthly" | "yearly" | null>(null);
  const subscribed = access.plan === "student" || access.plan === "owner";

  const checkout = async (cycle: "monthly" | "yearly") => {
    const { data } = await supabase?.auth.getSession() || { data: { session: null } };
    if (!data.session) {
      toast("Inicia sesión antes de suscribirte", "🔐");
      return;
    }
    setBusy(cycle);
    try {
      window.location.assign(await createSubscription(cycle));
    } catch (error) {
      toast(error instanceof Error ? error.message : "No se pudo abrir el pago", "⚠️");
      setBusy(null);
    }
  };

  return (
    <main className="page pricing-page">
      <header className="page-header pricing-header">
        <span className="pricing-eyebrow">HABITS STUDENT</span>
        <h1 className="page-title">Todo tu día, en un solo sistema.</h1>
        <p className="page-subtitle">Empieza gratis. Mejora cuando necesites sincronización y herramientas avanzadas.</p>
      </header>

      {access.isOwner && <div className="owner-banner">✓ Cuenta propietaria · acceso total permanente</div>}

      <section className="pricing-grid">
        <article className="pricing-card">
          <span className="pricing-plan">Gratis</span>
          <div className="pricing-price">S/0</div>
          <p>Organización esencial en este dispositivo.</p>
          <ul><li>Agenda y tareas</li><li>Asistente de voz local</li><li>Datos guardados localmente</li></ul>
          <Link className="btn btn-secondary btn-block" to="/">Continuar gratis</Link>
        </article>

        <article className="pricing-card featured">
          <span className="pricing-badge">Más elegido</span>
          <span className="pricing-plan">Estudiante</span>
          <div className="pricing-price">S/12.90 <small>/ mes</small></div>
          <p>Tu información disponible en laptop, tablet y celular.</p>
          <ul><li>Sincronización multidispositivo</li><li>Apuntes, PDF y escritura con lápiz</li><li>Reportes y metas avanzadas</li><li>Funciones premium futuras incluidas</li></ul>
          <button className="btn btn-primary btn-block" disabled={subscribed || busy !== null} onClick={() => checkout("monthly")}>
            {subscribed ? "Plan activo" : busy === "monthly" ? "Abriendo pago…" : "Elegir mensual"}
          </button>
          <button className="pricing-yearly" disabled={subscribed || busy !== null} onClick={() => checkout("yearly")}>
            O S/119 al año · ahorra S/35.80
          </button>
        </article>
      </section>
      <p className="pricing-note">Pago seguro procesado por Mercado Pago. Puedes cancelar tu suscripción desde tu cuenta.</p>
    </main>
  );
}
