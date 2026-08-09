import { audioEngine } from "./audio";

export function updateMediaSession(freq: number, name: string) {
  if (!("mediaSession" in navigator)) return;
  try {
    navigator.mediaSession.metadata = new MediaMetadata({
      title: `${name} · ${freq} Hz`,
      artist: "Habits",
      album: "Frecuencias"
    });
    navigator.mediaSession.setActionHandler("play", () => audioEngine.play(freq));
    navigator.mediaSession.setActionHandler("pause", () => audioEngine.stop());
    navigator.mediaSession.playbackState = audioEngine.isPlaying() ? "playing" : "paused";
  } catch {
    /* noop */
  }
}

export function clearMediaSession() {
  if (!("mediaSession" in navigator)) return;
  try {
    navigator.mediaSession.metadata = null;
  } catch {
    /* noop */
  }
}

/** Convierte una URL de Spotify (o spotify:track:ID) en la URL de embed. */
export function spotifyEmbedUrl(input: string): string | null {
  const s = input.trim();
  if (!s) return null;
  const match =
    s.match(/spotify\.com\/(track|playlist|album|artist|show|episode)\/([a-zA-Z0-9]+)/) ||
    s.match(/^spotify:(?:track|playlist|album|artist|show|episode):([a-zA-Z0-9]+)/);
  if (!match) return null;
  const type = s.includes("spotify.com")
    ? match[1]
    : s.split(":")[1];
  const id = match[2];
  const types: Record<string, string> = {
    track: "track",
    playlist: "playlist",
    album: "album",
    artist: "artist",
    show: "show",
    episode: "episode"
  };
  const t = types[type];
  if (!t) return null;
  return `https://open.spotify.com/embed/${t}/${id}?utm_source=generator&theme=0`;
}
