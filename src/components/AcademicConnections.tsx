import { Link } from "react-router-dom";

const providers = [
  { name: "Moodle", detail: "Cursos y entregas", tone: "purple" },
  { name: "Canvas", detail: "Tareas y calendario", tone: "orange" },
  { name: "Blackboard", detail: "Clases y avisos", tone: "blue" }
];

export default function AcademicConnections() {
  return (
    <section className="academic-connect card reveal">
      <div className="academic-connect-head">
        <div>
          <span className="section-kicker">CAMPUS CONNECT</span>
          <h2>Tu universidad, dentro de Jarvis</h2>
          <p>Centraliza cursos, entregas y avisos de tu campus.</p>
        </div>
        <span className="academic-connect-signal" aria-hidden="true"><i /></span>
      </div>
      <div className="academic-provider-row">
        {providers.map((provider) => (
          <div className={`academic-provider ${provider.tone}`} key={provider.name}>
            <strong>{provider.name}</strong>
            <span>{provider.detail}</span>
          </div>
        ))}
      </div>
      <Link className="academic-connect-link" to="/conexiones">
        Ver conexiones disponibles <span aria-hidden="true">→</span>
      </Link>
    </section>
  );
}
