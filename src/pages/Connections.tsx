import { useState } from "react";
import { Link } from "react-router-dom";

type Connector = {
  name: string;
  kind: string;
  detail: string;
  mark: string;
  tone: "blue" | "orange" | "purple" | "green";
};

const connectors: Connector[] = [
  { name: "UTP", kind: "Universidad", detail: "Campus y aula virtual", mark: "U", tone: "blue" },
  { name: "UPC", kind: "Universidad", detail: "Cursos y calendario", mark: "U", tone: "orange" },
  { name: "Universidad de Lima", kind: "Universidad", detail: "Portal académico", mark: "UL", tone: "purple" },
  { name: "Moodle", kind: "Plataforma", detail: "Tareas, cursos y avisos", mark: "M", tone: "green" },
  { name: "Canvas", kind: "Plataforma", detail: "Entregas y calendario", mark: "C", tone: "orange" },
  { name: "Blackboard", kind: "Plataforma", detail: "Clases y actividades", mark: "B", tone: "blue" }
];

export default function Connections() {
  const [requested, setRequested] = useState<string | null>(null);

  return (
    <main className="page connections-page">
      <header className="page-header connections-header">
        <Link className="back-link" to="/">‹ Hoy</Link>
        <span className="section-kicker">CAMPUS CONNECT</span>
        <h1 className="page-title">Conecta tu vida académica</h1>
        <p className="page-subtitle">Jarvis reunirá tus cursos, fechas y avisos en un solo lugar.</p>
      </header>

      <section className="connection-hero card">
        <div className="connection-hero-orb" aria-hidden="true"><span>⌁</span></div>
        <div>
          <span className="badge badge-blue">En desarrollo</span>
          <h2>Un conector para cada campus</h2>
          <p>Empezaremos con las plataformas que más usan los estudiantes y ampliaremos la cobertura con tus solicitudes.</p>
        </div>
      </section>

      <div className="connection-grid">
        {connectors.map((connector) => {
          const isRequested = requested === connector.name;
          return (
            <article className="connection-card card" key={connector.name}>
              <div className={`connection-mark ${connector.tone}`}>{connector.mark}</div>
              <div className="connection-copy">
                <span>{connector.kind}</span>
                <h2>{connector.name}</h2>
                <p>{connector.detail}</p>
              </div>
              <button
                className={`connection-button ${isRequested ? "requested" : ""}`}
                onClick={() => setRequested(connector.name)}
                disabled={isRequested}
              >
                {isRequested ? "Te avisaremos" : "Solicitar acceso"}
              </button>
            </article>
          );
        })}
      </div>

      <p className="connections-note">Las conexiones requieren autorización del campus. Jarvis solo leerá la información que tú permitas.</p>
    </main>
  );
}
