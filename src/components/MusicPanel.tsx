import { useEffect, useState } from "react";
import { audioEngine, FREQUENCIES } from "../lib/audio";
import { updateMediaSession, clearMediaSession, spotifyEmbedUrl } from "../lib/mediaSession";
import {
  getSpotifyToken,
  getSpotifyAccessToken,
  clearSpotifyToken,
  spotifyAuthUrl,
  completeSpotifyLogin,
  getSpotifyProfile,
  getSpotifyLibrary,
  hasSpotifySession,
  searchSpotify,
  type SpotifyItem,
  type SpotifyProfile
} from "../lib/spotify";
import { useStore } from "../stores/useStore";
import { toast } from "../stores/useToasts";
import { IconPlay, IconStop, IconMusic, IconExternal, IconSearch } from "./ui/Icons";

interface MusicPanelProps {
  compact?: boolean;
}

export default function MusicPanel({ compact = false }: MusicPanelProps) {
  const spotifyClientId = useStore((s) => s.data.settings.spotifyClientId);
  const configuredClientId = ((import.meta.env.VITE_SPOTIFY_CLIENT_ID as string | undefined) || spotifyClientId).trim();

  const [tab, setTab] = useState<"freq" | "music">("music");
  const [playing, setPlaying] = useState(audioEngine.isPlaying());
  const [freq, setFreq] = useState(audioEngine.getFrequency());
  const [volume, setVolume] = useState(audioEngine.getVolume());

  const [connected, setConnected] = useState(hasSpotifySession());
  const [profile, setProfile] = useState<SpotifyProfile | null>(null);
  const [library, setLibrary] = useState<SpotifyItem[]>([]);
  const [loadingLibrary, setLoadingLibrary] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SpotifyItem[]>([]);
  const [searching, setSearching] = useState(false);
  const [embed, setEmbed] = useState<string | null>(null);
  const [pasteInput, setPasteInput] = useState("");
  const [expanded, setExpanded] = useState(!compact);

  const active = FREQUENCIES.find((p) => p.freq === freq);

  useEffect(() => {
    const id = window.setInterval(() => {
      setPlaying(audioEngine.isPlaying());
      setFreq(audioEngine.getFrequency());
    }, 500);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    if (playing && active) updateMediaSession(active.freq, active.name);
    else if (!playing) clearMediaSession();
  }, [playing, freq, active]);

  useEffect(() => {
    let active = true;
    const restoreSpotify = async () => {
      const redirect = window.location.origin + window.location.pathname;
      try {
        const completed = configuredClientId
          ? await completeSpotifyLogin(window.location.search, configuredClientId, redirect)
          : false;
        if (completed) {
          window.history.replaceState(null, "", window.location.pathname + window.location.hash);
          toast("Spotify conectado", "🎧");
        }
        const token = getSpotifyToken() ?? await getSpotifyAccessToken(configuredClientId);
        if (!token || !active) return;
        setConnected(true);
        setLoadingLibrary(true);
        const [account, personalLibrary] = await Promise.all([
          getSpotifyProfile(token),
          getSpotifyLibrary(token)
        ]);
        if (!active) return;
        setProfile(account);
        setLibrary(personalLibrary);
      } catch {
        if (!active) return;
        clearSpotifyToken();
        setConnected(false);
        toast("No se pudo conectar con Spotify", "⚠️");
      } finally {
        if (active) setLoadingLibrary(false);
      }
    };
    void restoreSpotify();
    return () => { active = false; };
  }, [configuredClientId]);

  const toggleFreq = (f: number) => {
    audioEngine.toggle(f);
    setPlaying(audioEngine.isPlaying());
    setFreq(audioEngine.getFrequency());
  };

  const connect = async () => {
    if (!configuredClientId) {
      toast("Primero pon tu Spotify Client ID en Ajustes", "⚠️");
      return;
    }
    const redirect = window.location.origin + window.location.pathname;
    window.location.href = await spotifyAuthUrl(configuredClientId, redirect);
  };

  const doSearch = async () => {
    const token = getSpotifyToken() ?? await getSpotifyAccessToken(configuredClientId);
    if (!token) {
      toast("Conecta tu cuenta de Spotify primero", "🎧");
      return;
    }
    if (!query.trim()) return;
    setSearching(true);
    try {
      const items = await searchSpotify(query.trim(), token);
      setResults(items);
      if (items.length === 0) toast("Sin resultados", "🔍");
    } catch {
      toast("Error al buscar en Spotify", "⚠️");
    } finally {
      setSearching(false);
    }
  };

  const playPaste = () => {
    const url = spotifyEmbedUrl(pasteInput);
    if (!url) {
      toast("Pega un enlace válido de Spotify", "🎵");
      return;
    }
    setEmbed(url);
  };

  const playEmbed = (u: string) => setEmbed(u);

  return (
    <div className={`card reveal music-panel ${compact ? "music-panel-compact" : ""}`}>
      <div className="card-section music-panel-section">
        <div className="row-between">
          <div className="row music-panel-summary">
            <span className="music-panel-icon"><IconMusic size={17} /></span>
            <div className="grow">
              <div className="list-title">Música</div>
              <div className="list-sub music-panel-status">
                {connected ? `Spotify · ${profile?.displayName ?? "Conectado"}` : playing ? active?.name : `${freq} Hz`}
              </div>
            </div>
          </div>
          {compact && (
            <div className="row music-panel-actions">
              <button
                className={`music-quick-play ${playing ? "active" : ""}`}
                onClick={() => toggleFreq(freq)}
                aria-label={playing ? "Pausar música" : "Reproducir frecuencia"}
              >
                {playing ? <IconStop size={15} /> : <IconPlay size={15} />}
              </button>
              <button
                className="music-expand-button"
                onClick={() => setExpanded((value) => !value)}
                aria-expanded={expanded}
              >
                {expanded ? "Cerrar" : "Opciones"}
              </button>
            </div>
          )}
        </div>

        {expanded && (
          <>
        <div className="segmented mt-16">
          <button className={tab === "freq" ? "active" : ""} onClick={() => setTab("freq")}>
            Frecuencias
          </button>
          <button className={tab === "music" ? "active" : ""} onClick={() => setTab("music")}>
            Tu música
          </button>
        </div>

        {tab === "freq" && (
          <div className="mt-16">
            <div className="row" style={{ gap: 14 }}>
              <button
                className="btn btn-primary btn-round"
                style={{ width: 62, height: 62, flexShrink: 0 }}
                onClick={() => toggleFreq(freq)}
                aria-label={playing ? "Pausar frecuencia" : "Reproducir frecuencia"}
              >
                {playing ? <IconStop size={24} /> : <IconPlay size={24} />}
              </button>
              <div className="grow">
                <div style={{ fontSize: 30, fontWeight: 800, fontVariantNumeric: "tabular-nums", lineHeight: 1.1 }}>
                  {freq} <span style={{ fontSize: 14, fontWeight: 600, color: "var(--label-secondary)" }}>Hz</span>
                </div>
                <div className="muted small">{playing ? active?.name : "Toca una frecuencia"}</div>
              </div>
            </div>

            <div className="chips mt-16">
              {FREQUENCIES.map((p) => (
                <button
                  key={p.freq}
                  className={`chip ${playing && p.freq === freq ? "active" : ""}`}
                  onClick={() => toggleFreq(p.freq)}
                >
                  {p.freq === 244 ? "✨ " : ""}
                  {p.name} · {p.freq}
                </button>
              ))}
            </div>

            <div className="mt-16">
              <div className="row-between">
                <span className="small muted">Volumen</span>
                <span className="small muted">{Math.round(volume * 100)}%</span>
              </div>
              <input
                type="range"
                min={0}
                max={1}
                step={0.01}
                value={volume}
                onChange={(e) => {
                  const v = Number(e.target.value);
                  setVolume(v);
                  audioEngine.setVolume(v);
                }}
                style={{ width: "100%", accentColor: "var(--accent)", height: 34 }}
              />
            </div>
          </div>
        )}

        {tab === "music" && (
          <div className="mt-16">
            {!connected ? (
              <div className="card" style={{ background: "var(--fill)", boxShadow: "none", borderRadius: 16 }}>
                <div style={{ padding: 16, textAlign: "center" }}>
                  <div style={{ fontSize: 34 }}>🎧</div>
                  <h3 style={{ fontWeight: 700, marginTop: 8, fontSize: 17 }}>Conecta tu cuenta de Spotify</h3>
                  <p className="muted small mt-8" style={{ lineHeight: 1.5 }}>
                    Entra con tu cuenta y podrás buscar cualquier canción o playlist y escucharla aquí mismo.
                  </p>
                  <button className="btn btn-primary btn-block mt-16" onClick={connect}>
                    Iniciar sesión con Spotify
                  </button>
                  <p className="muted small mt-8">
                    ¿No aparece? Pon tu <b>Spotify Client ID</b> en Ajustes.
                  </p>
                </div>
              </div>
            ) : (
              <>
                {profile && (
                  <div className="spotify-account">
                    {profile.image ? <img src={profile.image} alt="" /> : <span><IconMusic size={17} /></span>}
                    <div className="grow">
                      <div className="list-title">{profile.displayName}</div>
                      <div className="list-sub">Spotify conectado{profile.product ? ` · ${profile.product}` : ""}</div>
                    </div>
                    <span className="spotify-connected-dot" aria-label="Conectado" />
                  </div>
                )}

                {(loadingLibrary || library.length > 0) && (
                  <div className="spotify-library mt-16">
                    <div className="small muted">Tu biblioteca</div>
                    {loadingLibrary ? (
                      <div className="small muted mt-8">Cargando tu música…</div>
                    ) : (
                      <div className="spotify-library-strip mt-8">
                        {library.map((item) => (
                          <button key={`${item.type}-${item.id}`} onClick={() => playEmbed(item.embedUrl)}>
                            {item.image ? <img src={item.image} alt="" /> : <span><IconMusic size={18} /></span>}
                            <strong>{item.name}</strong>
                            <small>{item.type === "playlist" ? "Playlist" : "Guardada"}</small>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                <div className="row" style={{ gap: 8 }}>
                  <div className="grow">
                    <div className="row" style={{ gap: 6, background: "var(--fill)", borderRadius: 14, padding: "4px 6px 4px 14px" }}>
                      <IconSearch size={16} style={{ color: "var(--label-secondary)" }} />
                      <input
                        className="field"
                        style={{ background: "transparent", boxShadow: "none", padding: "10px 4px" }}
                        placeholder="Buscar canción o playlist…"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && void doSearch()}
                      />
                    </div>
                  </div>
                  <button className="btn btn-primary" onClick={doSearch} disabled={searching}>
                    {searching ? "…" : "Buscar"}
                  </button>
                </div>

                {results.length > 0 && (
                  <div className="list-group mt-16" style={{ boxShadow: "none" }}>
                    {results.map((r, i) => (
                      <div key={`${r.type}-${r.id}`} className="list-item" onClick={() => playEmbed(r.embedUrl)}>
                        {r.image ? (
                          <img src={r.image} alt="" style={{ width: 44, height: 44, borderRadius: 8, objectFit: "cover", flexShrink: 0 }} />
                        ) : (
                          <div style={{ width: 44, height: 44, borderRadius: 8, background: "var(--fill)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                            <IconMusic size={18} style={{ color: "var(--label-tertiary)" }} />
                          </div>
                        )}
                        <div className="grow" style={{ minWidth: 0 }}>
                          <div className="list-title" style={{ fontSize: 14, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{r.name}</div>
                          <div className="list-sub" style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{r.subtitle}</div>
                        </div>
                        <IconPlay size={18} style={{ color: "var(--accent)", flexShrink: 0 }} />
                        <span className="muted small" style={{ display: "none" }}>{i}</span>
                      </div>
                    ))}
                  </div>
                )}

                {embed && (
                  <div className="mt-16" style={{ borderRadius: 16, overflow: "hidden" }}>
                    <iframe
                      src={embed}
                      width="100%"
                      height="152"
                      frameBorder="0"
                      allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
                      loading="lazy"
                      title="Reproductor de Spotify"
                      style={{ display: "block" }}
                    />
                  </div>
                )}

                <div className="row mt-16" style={{ gap: 6, flexWrap: "wrap" }}>
                  {[
                    ["Lofi · focus", "https://open.spotify.com/embed/playlist/37i9dQZF1DX8Uebhn9wzrS?utm_source=generator&theme=0"],
                    ["Deep focus", "https://open.spotify.com/embed/playlist/37i9dQZF1DX3rxVfibe1L0?utm_source=generator&theme=0"],
                    ["Calma total", "https://open.spotify.com/embed/playlist/37i9dQZF1DX3Ogo9pFvBkY?utm_source=generator&theme=0"]
                  ].map(([label, url]) => (
                    <button key={label} className="chip" onClick={() => playEmbed(url)}>
                      {label}
                    </button>
                  ))}
                </div>

                <div className="row mt-8" style={{ gap: 6 }}>
                  <button
                    className="btn btn-secondary btn-sm"
                    onClick={() => {
                      window.open("https://open.spotify.com", "_blank", "noopener,noreferrer");
                    }}
                  >
                    <IconExternal size={13} /> Abrir Spotify
                  </button>
                  <button className="btn btn-secondary btn-sm" onClick={() => { clearSpotifyToken(); setConnected(false); setProfile(null); setLibrary([]); setResults([]); setEmbed(null); }}>
                    Cerrar sesión
                  </button>
                </div>
              </>
            )}

            <div className="row mt-16" style={{ gap: 8 }}>
              <input
                className="field grow"
                placeholder="…o pega un enlace de Spotify"
                value={pasteInput}
                onChange={(e) => setPasteInput(e.target.value)}
              />
              <button className="btn btn-secondary" onClick={playPaste}>Reproducir</button>
            </div>
          </div>
        )}
          </>
        )}
      </div>
    </div>
  );
}
