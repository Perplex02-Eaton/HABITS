const TOKEN_KEY = "habits:spotifyToken";

export interface SpotifyItem {
  id: string;
  name: string;
  subtitle: string;
  image: string | null;
  type: "track" | "playlist" | "album";
  embedUrl: string;
}

interface TokenData {
  access: string;
  expires: number;
}

export function getSpotifyToken(): string | null {
  try {
    const raw = localStorage.getItem(TOKEN_KEY);
    if (!raw) return null;
    const t = JSON.parse(raw) as TokenData;
    if (Date.now() > t.expires) {
      localStorage.removeItem(TOKEN_KEY);
      return null;
    }
    return t.access;
  } catch {
    return null;
  }
}

export function setSpotifyToken(access: string, expiresIn: number) {
  const t: TokenData = { access, expires: Date.now() + expiresIn * 1000 - 60000 };
  localStorage.setItem(TOKEN_KEY, JSON.stringify(t));
}

export function clearSpotifyToken() {
  localStorage.removeItem(TOKEN_KEY);
}

export function spotifyAuthUrl(clientId: string, redirect: string, state: string): string {
  const scope =
    "user-read-email user-read-private user-read-playback-state user-modify-playback-state streaming";
  const params = new URLSearchParams({
    client_id: clientId,
    response_type: "token",
    redirect_uri: redirect,
    scope,
    state,
    show_dialog: "false"
  });
  return `https://accounts.spotify.com/authorize?${params.toString()}`;
}

export function parseSpotifyCallback(hash: string): { access: string; expiresIn: number } | null {
  const m = hash.match(/access_token=([^&]+)/);
  if (!m) return null;
  const exp = hash.match(/expires_in=(\d+)/);
  return { access: m[1], expiresIn: exp ? Number(exp[1]) : 3600 };
}

export async function searchSpotify(query: string, token: string): Promise<SpotifyItem[]> {
  const url = `https://api.spotify.com/v1/search?q=${encodeURIComponent(query)}&type=track,playlist,album&limit=12&market=US`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(`Spotify ${res.status}`);
  const data = await res.json();

  const out: SpotifyItem[] = [];

  for (const t of data?.tracks?.items ?? []) {
    out.push({
      id: t.id,
      name: t.name,
      subtitle: `${t.artists?.map((a: { name: string }) => a.name).join(", ") ?? "Artista"}`,
      image: t.album?.images?.[1]?.url ?? t.album?.images?.[0]?.url ?? null,
      type: "track",
      embedUrl: `https://open.spotify.com/embed/track/${t.id}?utm_source=generator&theme=0`
    });
  }

  for (const p of data?.playlists?.items ?? []) {
    out.push({
      id: p.id,
      name: p.name,
      subtitle: `Playlist · ${p.owner?.display_name ?? "Spotify"}`,
      image: p.images?.[0]?.url ?? null,
      type: "playlist",
      embedUrl: `https://open.spotify.com/embed/playlist/${p.id}?utm_source=generator&theme=0`
    });
  }

  for (const a of data?.albums?.items ?? []) {
    out.push({
      id: a.id,
      name: a.name,
      subtitle: `Álbum · ${a.artists?.map((x: { name: string }) => x.name).join(", ") ?? ""}`,
      image: a.images?.[1]?.url ?? a.images?.[0]?.url ?? null,
      type: "album",
      embedUrl: `https://open.spotify.com/embed/album/${a.id}?utm_source=generator&theme=0`
    });
  }

  return out.slice(0, 20);
}
