import { Link } from "react-router-dom";

const TODO_LO_QUE_INCLUYE = [
  "Agenda, tareas, metas y hábitos",
  "Jarvis: asistente de voz en español",
  "Cursos, cuadernos y memoria de cada clase",
  "Apuntes con lápiz, ideas, noticias y rendimiento",
  "Comidas, recordatorios e instalación como app",
  "Sincronización entre tus dispositivos (opcional)",
  "Tus datos guardados en tu propio dispositivo"
];

export default function Pricing() {
  return (
    <main className="page pricing-page">
      <header className="page-header pricing-header">
        <span className="pricing-eyebrow">HABITS · LIBRE Y GRATIS</span>
        <h1 className="page-title">Todo gratis. Para siempre. Para todos.</h1>
        <p className="page-subtitle">
          Sin planes, sin pagos y sin candados: cada función está abierta desde el primer segundo.
        </p>
      </header>

      <section className="pricing-grid">
        <article className="pricing-card featured">
          <span className="pricing-badge">Acceso total</span>
          <span className="pricing-plan">Todo incluido</span>
          <div className="pricing-price">
            S/0 <small>/ siempre</small>
          </div>
          <p>Nada que comprar, nada que activar, nada que cancelar.</p>
          <ul>
            {TODO_LO_QUE_INCLUYE.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
          <Link className="btn btn-primary btn-block" to="/">Entrar a Habits</Link>
        </article>
      </section>
      <p className="pricing-note">
        HABITS es de código abierto: no existe pasarela de pago, ni suscripción, ni muro premium. Si algún día
        quieres sincronizar entre tus dispositivos, también es gratis y opcional.
      </p>
    </main>
  );
}
