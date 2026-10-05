import { useEffect, useState } from "react";
import { useStore } from "../stores/useStore";
import { isCloudEnabled, signIn, signInWithGoogle, signUp } from "../lib/supabase";
import { requestPermission } from "../lib/notify";
import { aiConfigured, aiImprove } from "../lib/ai";
import { speakSpanishAudio, unlockSpanishAudio, warmUpSpanishVoice } from "../lib/voice";
import { useAccess } from "../stores/useAccess";
import { Link } from "react-router-dom";
import { toast } from "../stores/useToasts";
import Switch from "../components/ui/Switch";
import Sheet from "../components/ui/Sheet";
import { IconCloud, IconBell, IconMoon, IconSun, IconSparklesAI, IconRefresh } from "../components/ui/Icons";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: string }>;
}

export default function Settings() {
  const settings = useStore((s) => s.data.settings);
  const setSettings = useStore((s) => s.setSettings);
  const cloudEnabled = useStore((s) => s.cloudEnabled);
  const cloudUser = useStore((s) => s.cloudUser);
  const enableCloud = useStore((s) => s.enableCloud);
  const disableCloud = useStore((s) => s.disableCloud);
  const { access, refresh: refreshAccess } = useAccess();

  const [authOpen, setAuthOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [installEvt, setInstallEvt] = useState<BeforeInstallPromptEvent | null>(null);
  const [testing, setTesting] = useState(false);

  useEffect(() => {
    const onPrompt = (e: Event) => setInstallEvt(e as BeforeInstallPromptEvent);
    window.addEventListener("beforeinstallprompt", onPrompt);
    return () => window.removeEventListener("beforeinstallprompt", onPrompt);
  }, []);

  const install = async () => {
    if (!installEvt) return;
    installEvt.prompt();
    await installEvt.userChoice;
    setInstallEvt(null);
  };

  const doAuth = async () => {
    if (!email.trim() || password.length < 6) {
      toast("Correo válido y contraseña de 6+ caracteres", "⚠️");
      return;
    }
    const res =
      mode === "login" ? await signIn(email.trim(), password) : await signUp(email.trim(), password);
    if (!res.ok) {
      toast(res.error || "Error", "⚠️");
      return;
    }
    toast(mode === "login" ? "Sesión iniciada" : "Cuenta creada", "🔑");
    setAuthOpen(false);
    setEmail("");
    setPassword("");
    await useStore.getState().enableCloud();
    await refreshAccess();
  };

  return (
    <div className="page">
      <header className="page-header">
        <h1 className="page-title">Ajustes</h1>
        <p className="page-subtitle">Personaliza tu app y tu sincronización</p>
      </header>

      <div className="stack">
        <div className="card card-section">
          <div className="field-group">
            <label className="field-label">Tu nombre</label>
            <input
              className="field"
              placeholder="¿Cómo te llamas?"
              value={settings.name}
              onChange={(e) => setSettings({ name: e.target.value })}
            />
          </div>
          <div className="field-group">
            <label className="field-label">Usuario de X (Twitter)</label>
            <input
              className="field"
              placeholder="@tu_usuario"
              value={settings.xHandle}
              onChange={(e) => setSettings({ xHandle: e.target.value })}
            />
          </div>
          <div className="field-group">
            <label className="field-label">Usuario de Instagram</label>
            <input
              className="field"
              placeholder="@tu_usuario"
              value={settings.instagramHandle}
              onChange={(e) => setSettings({ instagramHandle: e.target.value })}
            />
          </div>
        </div>

        <div className="list-group">
          <div className="list-item">
            <div className="grow">
              <div className="list-title">Clases</div>
              <div className="list-sub">Notificarme antes de cada clase</div>
            </div>
            <Switch on={settings.notifyClasses} onChange={(v) => setSettings({ notifyClasses: v })} />
          </div>
          <div className="list-item">
            <div className="grow">
              <div className="list-title">Comidas</div>
              <div className="list-sub">Recordarme qué consumir cada día</div>
            </div>
            <Switch on={settings.notifyMeals} onChange={(v) => setSettings({ notifyMeals: v })} />
          </div>
          <div className="list-item">
            <div className="grow">
              <div className="list-title">Tareas</div>
              <div className="list-sub">Avisarme cuando se acerca una entrega</div>
            </div>
            <Switch on={settings.notifyTasks} onChange={(v) => setSettings({ notifyTasks: v })} />
          </div>
        </div>

        <div className="card card-section">
          <div className="row-between">
            <div>
              <div className="list-title">Voz de JARVIS</div>
              <div className="list-sub">Voz neural española local · se descarga una vez y queda en caché</div>
            </div>
          </div>
          <button
            className="btn btn-secondary btn-block mt-16"
            onClick={async () => {
              unlockSpanishAudio();
              await warmUpSpanishVoice();
              if ("speechSynthesis" in window) window.speechSynthesis.cancel();
              const phrase = "Buenas tardes, jefe. Sistemas en línea. Estoy listo para ayudarle.";
              if (!(await speakSpanishAudio(phrase))) toast("No se pudo cargar la voz neural. Revisa tu conexión y prueba otra vez.", "⚠️");
            }}
          >
            Probar voz neural
          </button>
          <p className="muted small mt-8">Jarvis ya no utiliza la voz del sistema. La primera prueba descarga el modelo y las siguientes usan la copia local.</p>
        </div>

        <div className="card card-section">
          <div className="field-group">
            <label className="field-label">Avisar con anticipación</label>
            <div className="chips">
              {[15, 30, 60, 120].map((m) => (
                <button key={m} className={`chip ${settings.reminderLead === m ? "active" : ""}`} onClick={() => setSettings({ reminderLead: m })}>
                  {m} min
                </button>
              ))}
            </div>
          </div>
          <button
            className="btn btn-secondary btn-block mt-16"
            onClick={() => requestPermission().then((ok) => toast(ok ? "Notificaciones activadas" : "Notificaciones bloqueadas", ok ? "🔔" : "⚠️"))}
          >
            <IconBell size={16} /> Activar notificaciones
          </button>
        </div>

        <div className="card card-section">
          <div className="field-group">
            <label className="field-label">Apariencia</label>
            <div className="chips">
              <button className={`chip ${settings.darkMode === "auto" ? "active" : ""}`} onClick={() => setSettings({ darkMode: "auto" })}>
                Automático
              </button>
              <button className={`chip ${settings.darkMode === "light" ? "active" : ""}`} onClick={() => setSettings({ darkMode: "light" })}>
                <IconSun size={14} /> Claro
              </button>
              <button className={`chip ${settings.darkMode === "dark" ? "active" : ""}`} onClick={() => setSettings({ darkMode: "dark" })}>
                <IconMoon size={14} /> Oscuro
              </button>
            </div>
          </div>
          <div className="field-group mt-20">
            <label className="field-label">Color de acento</label>
            <div className="theme-grid">
              {[
                { id: "blue", color: "#0a84ff", label: "Azul" },
                { id: "indigo", color: "#5e5ce6", label: "Índigo" },
                { id: "purple", color: "#af52de", label: "Púrpura" },
                { id: "rose", color: "#ff375f", label: "Rosa" },
                { id: "orange", color: "#ff9500", label: "Naranja" },
                { id: "green", color: "#34c759", label: "Verde" },
                { id: "teal", color: "#30b0c7", label: "Turquesa" },
                { id: "gold", color: "#d4a017", label: "Dorado" },
                { id: "sky", color: "#40c8e0", label: "Cielo" },
                { id: "mint", color: "#66d4cf", label: "Menta" }
              ].map((t) => (
                <button
                  key={t.id}
                  className={`theme-dot ${(settings.accentColor ?? "blue") === t.id ? "active" : ""}`}
                  style={{ background: t.color }}
                  title={t.label}
                  onClick={() => {
                    setSettings({ accentColor: t.id });
                    document.documentElement.setAttribute("data-accent", t.id);
                  }}
                  aria-label={`Tema ${t.label}`}
                />
              ))}
            </div>
          </div>
        </div>

        <div className="card card-section">
          <div className="row-between">
            <div className="row">
              <span style={{ fontSize: 22 }}>🎧</span>
              <div>
                <div className="list-title">Spotify</div>
                <div className="list-sub">
                  {settings.spotifyClientId.trim()
                    ? "Client ID configurado · puedes conectarte"
                    : "Sin configurar · el reproductor básico sigue funcionando"}
                </div>
              </div>
            </div>
          </div>
          <div className="field-group mt-16">
            <label className="field-label">Spotify Client ID</label>
            <input
              className="field"
              placeholder="Tu Client ID de Spotify"
              value={settings.spotifyClientId}
              onChange={(e) => setSettings({ spotifyClientId: e.target.value })}
            />
          </div>
          <p className="muted small mt-8" style={{ lineHeight: 1.5 }}>
            Crea una app gratis en <b>developer.spotify.com</b> y registra exactamente esta Redirect URI:
            {" "}<b>{window.location.origin + "/"}</b>. Solo necesitas el Client ID; no coloques ningún
            Client Secret en Habits. La conexión usa autorización segura PKCE.
          </p>
        </div>

        <div className="card card-section">
          <div className="row-between">
            <div className="row">
              <IconSparklesAI size={22} style={{ color: "var(--accent)" }} />
              <div>
                <div className="list-title">Inteligencia Artificial</div>
                <div className="list-sub">
                  {aiConfigured(settings.ai) ? "IA conectada · corrige y mejora tus escritos" : "Sin configurar · se usa el corrector local"}
                </div>
              </div>
            </div>
          </div>
          <div className="field-group mt-16">
            <label className="field-label">Servidor (compatible con OpenAI)</label>
            <input
              className="field"
              placeholder="https://api.openai.com/v1"
              value={settings.ai.baseUrl}
              onChange={(e) => setSettings({ ai: { ...settings.ai, baseUrl: e.target.value } })}
            />
          </div>
          <div className="field-group">
            <label className="field-label">Modelo</label>
            <input
              className="field"
              placeholder="gpt-4o-mini"
              value={settings.ai.model}
              onChange={(e) => setSettings({ ai: { ...settings.ai, model: e.target.value } })}
            />
          </div>
          <div className="field-group">
            <label className="field-label">Clave de API</label>
            <input
              type="password"
              className="field"
              placeholder="sk-…"
              value={settings.ai.apiKey}
              onChange={(e) => setSettings({ ai: { ...settings.ai, apiKey: e.target.value } })}
            />
          </div>
          <div className="row mt-16" style={{ gap: 10 }}>
            <button
              className="btn btn-secondary grow"
              disabled={testing}
              onClick={async () => {
                if (!aiConfigured(settings.ai)) {
                  toast("Pon tu clave de API primero", "⚠️");
                  return;
                }
                setTesting(true);
                const out = await aiImprove("hola como estas hoy", "corrige", settings.ai).catch((e) => {
                  toast(`Error: ${e.message}`, "⚠️");
                  return null;
                });
                setTesting(false);
                if (out) toast(`IA responde: «${out.slice(0, 40)}»`, "✅");
              }}
            >
              <IconRefresh size={15} /> {testing ? "Probando…" : "Probar IA"}
            </button>
          </div>
          <p className="muted small mt-8" style={{ lineHeight: 1.5 }}>
            Compatible con DeepSeek, OpenAI, Groq y otros proveedores. La clave se guarda solo en este dispositivo y nunca se sincroniza en la nube.
          </p>
        </div>

        <div className="card card-section">
          <div className="row-between">
            <div>
              <div className="list-title">Noticias (opcional)</div>
              <div className="list-sub">Clave de NewsAPI para titulares en español</div>
            </div>
          </div>
          <div className="field-group mt-16">
            <label className="field-label">Clave NewsAPI (newsapi.org)</label>
            <input
              type="password"
              className="field"
              placeholder="Deja vacío para usar RSS gratis"
              value={settings.newsApiKey}
              onChange={(e) => setSettings({ newsApiKey: e.target.value })}
            />
          </div>
          <p className="muted small mt-8">
            Sin clave, la app usa fuentes RSS gratis (Reuters, Guardian, CNBC, Yahoo).
          </p>
        </div>

        <div className="card card-section">
          <div className="row-between">
            <div className="row">
              <span style={{ fontSize: 24 }}>☁️</span>
              <div>
                <div className="list-title">Cuenta y sincronización</div>
                <div className="list-sub">
                  {!isCloudEnabled()
                    ? "Configura Supabase (ver .env)"
                    : cloudEnabled
                      ? `Activa · ${cloudUser?.email ?? "sesión anónima"}`
                      : "Desactivada"}
                </div>
              </div>
            </div>
            {cloudEnabled ? (
              <button
                className="btn btn-secondary btn-sm"
                onClick={() => disableCloud().then(() => toast("Sincronización apagada", "🔒"))}
              >
                Desactivar
              </button>
            ) : (
              <button className="btn btn-primary btn-sm" onClick={() => (isCloudEnabled() ? setAuthOpen(true) : enableCloud())}>
                Activar
              </button>
            )}
          </div>
          {cloudEnabled && cloudUser?.email && (
            <>
              <div className="account-plan-row mt-16">
                <span>
                  {access.isOwner
                    ? "Propietario"
                    : access.subscriptionStatus === "complimentary"
                      ? "Cuenta invitada"
                      : access.plan === "student"
                        ? "Estudiante"
                        : "Gratis"}
                </span>
                {(access.isOwner || access.subscriptionStatus === "complimentary") && <b>Acceso total</b>}
              </div>
              <p className="muted small mt-8" style={{ lineHeight: 1.5 }}>
                <IconCloud size={13} /> Tus datos se sincronizan automáticamente entre tu celular, tablet y laptop.
              </p>
            </>
          )}
          {access.plan !== "owner" && access.plan !== "student" && (
            <Link className="btn btn-primary btn-block mt-16" to="/planes">Ver planes</Link>
          )}
        </div>

        {installEvt && (
          <button className="btn btn-primary btn-block" onClick={install}>
            Instalar Habits en tu dispositivo
          </button>
        )}

        <p className="muted small" style={{ textAlign: "center", padding: "16px 8px" }}>
          Habits v1.0 · Tu vida, organizada y en calma.
        </p>
      </div>

      <Sheet open={authOpen} title={mode === "login" ? "Iniciar sesión" : "Crear cuenta"} onClose={() => setAuthOpen(false)}>
        <button
          className="btn btn-secondary btn-block"
          onClick={async () => {
            const result = await signInWithGoogle();
            if (!result.ok) toast(result.error || "No se pudo abrir Google", "⚠️");
          }}
        >
          Continuar con Google
        </button>
        <div className="auth-divider"><span>o con correo</span></div>
        <div className="field-group">
          <label className="field-label">Correo</label>
          <input
            type="email"
            className="field"
            placeholder="tu@correo.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        <div className="field-group">
          <label className="field-label">Contraseña</label>
          <input
            type="password"
            className="field"
            placeholder="Mínimo 6 caracteres"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
        <div className="chips mt-16">
          <button className={`chip ${mode === "login" ? "active" : ""}`} onClick={() => setMode("login")}>
            Iniciar sesión
          </button>
          <button className={`chip ${mode === "signup" ? "active" : ""}`} onClick={() => setMode("signup")}>
            Crear cuenta
          </button>
        </div>
        <button className="btn btn-primary btn-block mt-24" onClick={doAuth}>
          {mode === "login" ? "Entrar" : "Registrarme"}
        </button>
        <button className="btn btn-secondary btn-block mt-16" onClick={() => { setAuthOpen(false); enableCloud(); }}>
          O continuar sin cuenta (solo este dispositivo)
        </button>
      </Sheet>
    </div>
  );
}
