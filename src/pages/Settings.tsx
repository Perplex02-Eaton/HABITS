import { useEffect, useState } from "react";
import { useStore } from "../stores/useStore";
import { isCloudEnabled, signIn, signUp } from "../lib/supabase";
import { requestPermission } from "../lib/notify";
import { aiConfigured, aiImprove } from "../lib/ai";
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
            Gratis en <b>developer.spotify.com</b> → «Create app». Registra como Redirect URI la
            dirección de tu app (ej. <b>http://localhost:5173/</b>). Así podrás iniciar sesión y buscar
            música dentro de Habits.
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
                <div className="list-title">Sincronización en la nube</div>
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
            <p className="muted small mt-16" style={{ lineHeight: 1.5 }}>
              <IconCloud size={13} /> Tus datos se sincronizan automáticamente entre tu celular, tablet y laptop al iniciar sesión con la misma cuenta.
            </p>
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
