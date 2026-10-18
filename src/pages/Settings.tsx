import { useEffect, useState } from "react";
import { useStore } from "../stores/useStore";
import { isCloudEnabled, signIn, signInWithGoogle, signUp } from "../lib/supabase";
import { requestPermission } from "../lib/notify";
import { aiConfigured, aiImprove } from "../lib/ai";
import {
  speakSpanishAudio,
  unlockSpanishAudio,
  warmUpSpanishVoice,
  describeVoiceEngine,
  getSpeechRate,
  getVoiceEngine,
  preferredSpanishVoice,
  setAssistantVoice,
  setSpeechRate,
  setVoiceEngine,
  spanishVoiceOptions,
  type VoiceEngine,
  type VoiceOption
} from "../lib/voice";
import { useAccess } from "../stores/useAccess";
import { LOCAL_OWNER_EMAIL, clearLocalOwner, readLocalOwner, setLocalOwner } from "../lib/billing";
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
  const [engine, setEngine] = useState<VoiceEngine>(getVoiceEngine());
  const [rate, setRate] = useState(getSpeechRate());
  const [voiceList, setVoiceList] = useState<VoiceOption[]>([]);
  const [selectedVoice, setSelectedVoice] = useState("");
  const localOwner = readLocalOwner();
  const [ownerEmail, setOwnerEmail] = useState(localOwner?.email || LOCAL_OWNER_EMAIL);

  const activateOwner = async () => {
    const saved = setLocalOwner(ownerEmail);
    if (!saved) {
      toast("Escribe el correo del propietario", "⚠️");
      return;
    }
    await refreshAccess();
    toast(`Cuenta propietaria activada · ${saved.email}`, "👑");
  };

  const deactivateOwner = async () => {
    clearLocalOwner();
    await refreshAccess();
    toast("Cuenta propietaria desactivada en este dispositivo", "🔓");
  };

  useEffect(() => {
    if (!("speechSynthesis" in window)) return;
    const sync = () => {
      window.speechSynthesis.getVoices();
      const options = spanishVoiceOptions();
      setVoiceList(options);
      setSelectedVoice((prev) => prev || preferredSpanishVoice()?.name || options[0]?.name || "");
    };
    sync();
    window.speechSynthesis.addEventListener("voiceschanged", sync);
    return () => window.speechSynthesis.removeEventListener("voiceschanged", sync);
  }, []);

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
              <div className="list-sub">{describeVoiceEngine()}</div>
            </div>
          </div>

          <div className="field-group mt-16">
            <label className="field-label">Motor de voz</label>
            <div className="chips">
              {([
                { id: "auto", label: "Automático" },
                { id: "sistema", label: "Voz del sistema" },
                { id: "neural", label: "Neural local (offline)" }
              ] as { id: VoiceEngine; label: string }[]).map((option) => (
                <button
                  key={option.id}
                  className={`chip ${engine === option.id ? "active" : ""}`}
                  onClick={() => {
                    setVoiceEngine(option.id);
                    setEngine(option.id);
                  }}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          {engine !== "neural" && voiceList.length > 0 && (
            <div className="field-group mt-16">
              <label className="field-label">Voz en español · {voiceList.length} disponible{voiceList.length === 1 ? "" : "s"}</label>
              <select
                className="field"
                value={selectedVoice}
                onChange={(e) => {
                  setAssistantVoice(e.target.value);
                  setSelectedVoice(e.target.value);
                }}
              >
                {voiceList.map((voice) => (
                  <option key={voice.name} value={voice.name}>
                    {voice.label}
                  </option>
                ))}
              </select>
              {!voiceList.some((voice) => voice.neural) && (
                <p className="muted small mt-8">
                  No hay voces neuronales en este equipo. Abre la app en Edge, o instala el idioma español en Windows
                  (Configuración → Hora e idioma → Voz y región).
                </p>
              )}
            </div>
          )}

          {engine !== "neural" && voiceList.length === 0 && (
            <p className="muted small mt-16">
              Este equipo no tiene voces en español instaladas, así que se usará la voz neural local.
            </p>
          )}

          {engine !== "neural" && (
            <div className="field-group mt-16">
              <label className="field-label">Velocidad · {rate.toFixed(2)}×</label>
              <input
                type="range"
                min={0.7}
                max={1.4}
                step={0.05}
                value={rate}
                onChange={(e) => {
                  const value = Number(e.target.value);
                  setRate(value);
                  setSpeechRate(value);
                }}
              />
            </div>
          )}

          <button
            className="btn btn-secondary btn-block mt-16"
            onClick={async () => {
              unlockSpanishAudio();
              void warmUpSpanishVoice();
              const phrase = "Buenas tardes, jefe. Sistemas en línea. Estoy listo para ayudarle.";
              if (!(await speakSpanishAudio(phrase, engine))) toast("No se pudo reproducir la voz. Prueba con otro motor.", "⚠️");
            }}
          >
            Probar voz
          </button>
          <p className="muted small mt-8">
            La voz del sistema suena natural en Edge y Chrome y no descarga nada. La neural local funciona sin internet,
            pero tarda en arrancar y suena más plana.
          </p>
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
                      : localOwner
                        ? `Cuenta propietaria · ${localOwner.email}`
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

          <div className="mt-16" style={{ borderTop: "1px solid var(--border)", paddingTop: 12 }}>
            {localOwner ? (
              <>
                <div className="list-title">👑 Cuenta propietaria · acceso total</div>
                <div className="list-sub">
                  {localOwner.email} · en este dispositivo
                  {localOwner.since ? ` desde ${new Date(localOwner.since).toLocaleDateString("es-PE")}` : ""}
                </div>
                <button className="btn btn-secondary btn-sm mt-8" onClick={deactivateOwner}>
                  Salir de la cuenta propietaria
                </button>
              </>
            ) : (
              <>
                <div className="list-title">Cuenta de administrador</div>
                <div className="list-sub">
                  Si eres el propietario de Habits, actívala aquí en este dispositivo. No necesita
                  contraseña: desbloquea el acceso total de forma local.
                </div>
                <div className="field-group mt-8">
                  <label className="field-label">Correo del propietario</label>
                  <input
                    type="email"
                    className="field"
                    placeholder="habits@correo.com"
                    value={ownerEmail}
                    onChange={(e) => setOwnerEmail(e.target.value)}
                  />
                </div>
                <button className="btn btn-primary btn-sm mt-8" onClick={activateOwner}>
                  Activar cuenta de administrador
                </button>
              </>
            )}
          </div>
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
