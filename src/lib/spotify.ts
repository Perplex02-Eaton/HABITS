const TOKEN_KEY = "habits:spotifyToken";
const PKCE_VERIFIER_KEY = "habits:spotifyPkceVerifier";
const PKCE_STATE_KEY = "habits:spotifyOauthState";

export interface SpotifyItem {
  id: string;
  name: string;
  subtitle: string;
  image: string | null;
  type: "track" | "playlist" | "album";
  embedUrl: string;
}

export interface SpotifyProfile {
  displayName: string;
  email?: string;
  image: string | null;
  product?: string;
}

interface TokenData {
  access: string;
  refresh?: string;
  expires: number;
  scope?: string;
}

interface SpotifyTokenResponse {
  access_token: string;
  token_type: string;
  scope?: string;
  expires_in: number;
  refresh_token?: string;
}

function readToken(): TokenData | null {
  try {
    const raw = localStorage.getItem(TOKEN_KEY);
    return raw ? JSON.parse(raw) as TokenData : null;
  } catch {
    return null;
  }
}

function saveToken(response: SpotifyTokenResponse, previousRefresh?: string) {
  const token: TokenData = {
    access: response.access_token,
    refresh: response.refresh_token ?? previousRefresh,
    expires: Date.now() + response.expires_in * 1000,
    scope: response.scope
  };
  localStorage.setItem(TOKEN_KEY, JSON.stringify(token));
  return token.access;
}

export function hasSpotifySession(): boolean {
  return Boolean(readToken());
}

export function getSpotifyToken(): string | null {
  const token = readToken();
  if (!token || Date.now() >= token.expires - 60_000) return null;
  return token.access;
}

export function clearSpotifyToken() {
  localStorage.removeItem(TOKEN_KEY);
  sessionStorage.removeItem(PKCE_VERIFIER_KEY);
  sessionStorage.removeItem(PKCE_STATE_KEY);
}

function randomUrlSafe(length: number) {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~"[byte % 66]).join("");
}

function base64Url(bytes: Uint8Array) {
  let binary = "";
  bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function codeChallenge(verifier: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  return base64Url(new Uint8Array(digest));
}

export async function spotifyAuthUrl(clientId: string, redirect: string): Promise<string> {
  const verifier = randomUrlSafe(72);
  const state = randomUrlSafe(28);
  sessionStorage.setItem(PKCE_VERIFIER_KEY, verifier);
  sessionStorage.setItem(PKCE_STATE_KEY, state);

  const scope = [
    "user-read-email",
    "user-read-private",
    "playlist-read-private",
    "playlist-read-collaborative",
    "user-library-read",
    "user-top-read",
    "user-read-recently-played"
  ].join(" ");
  const params = new URLSearchParams({
    client_id: clientId,
    response_type: "code",
    redirect_uri: redirect,
    scope,
    state,
    code_challenge_method: "S256",
    code_challenge: await codeChallenge(verifier),
    show_dialog: "false"
  });
  return `https://accounts.spotify.com/authorize?${params.toString()}`;
}

async function requestToken(params: URLSearchParams): Promise<SpotifyTokenResponse> {
  const response = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params
  });
  if (!response.ok) throw new Error(`Spotify OAuth ${response.status}`);
  return response.json() as Promise<SpotifyTokenResponse>;
}

export async function completeSpotifyLogin(search: string, clientId: string, redirect: string): Promise<boolean> {
  const params = new URLSearchParams(search);
  const oauthError = params.get("error");
  if (oauthError) throw new Error(oauthError);
  const code = params.get("code");
  if (!code) return false;

  const returnedState = params.get("state");
  const expectedState = sessionStorage.getItem(PKCE_STATE_KEY);
  const verifier = sessionStorage.getItem(PKCE_VERIFIER_KEY);
  if (!verifier || !expectedState || returnedState !== expectedState) {
    throw new Error("La sesión de Spotify no pudo verificarse");
  }

  const token = await requestToken(new URLSearchParams({
    client_id: clientId,
    grant_type: "authorization_code",
    code,
    redirect_uri: redirect,
    code_verifier: verifier
  }));
  saveToken(token);
  sessionStorage.removeItem(PKCE_VERIFIER_KEY);
  sessionStorage.removeItem(PKCE_STATE_KEY);
  return true;
}

export async function getSpotifyAccessToken(clientId: string): Promise<string | null> {
  const stored = readToken();
  if (!stored) return null;
  if (Date.now() < stored.expires - 60_000) return stored.access;
  if (!stored.refresh || !clientId) return null;

  const refreshed = await requestToken(new URLSearchParams({
    client_id: clientId,
    grant_type: "refresh_token",
    refresh_token: stored.refresh
  }));
  return saveToken(refreshed, stored.refresh);
}

async function spotifyGet<T>(path: string, token: string): Promise<T> {
  const response = await fetch(`https://api.spotify.com/v1${path}`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  if (!response.ok) throw new Error(`Spotify ${response.status}`);
  return response.json() as Promise<T>;
}

export async function getSpotifyProfile(token: string): Promise<SpotifyProfile> {
  const profile = await spotifyGet<{
    display_name?: string;
    email?: string;
    images?: Array<{ url: string }>;
    product?: string;
  }>("/me", token);
  return {
    displayName: profile.display_name || "Cuenta de Spotify",
    email: profile.email,
    image: profile.images?.[0]?.url ?? null,
    product: profile.product
  };
}

export async function getSpotifyLibrary(token: string): Promise<SpotifyItem[]> {
  const [playlists, tracks] = await Promise.all([
    spotifyGet<{ items?: Array<any> }>("/me/playlists?limit=12", token),
    spotifyGet<{ items?: Array<{ track?: any }> }>("/me/tracks?limit=8", token)
  ]);
  const items: SpotifyItem[] = [];

  for (const playlist of playlists.items ?? []) {
    if (!playlist?.id) continue;
    items.push({
      id: playlist.id,
      name: playlist.name,
      subtitle: `Playlist · ${playlist.tracks?.total ?? 0} canciones`,
      image: playlist.images?.[0]?.url ?? null,
      type: "playlist",
      embedUrl: `https://open.spotify.com/embed/playlist/${playlist.id}?utm_source=generator&theme=0`
    });
  }
  for (const entry of tracks.items ?? []) {
    const track = entry.track;
    if (!track?.id) continue;
    items.push({
      id: track.id,
      name: track.name,
      subtitle: track.artists?.map((artist: { name: string }) => artist.name).join(", ") || "Canción guardada",
      image: track.album?.images?.[1]?.url ?? track.album?.images?.[0]?.url ?? null,
      type: "track",
      embedUrl: `https://open.spotify.com/embed/track/${track.id}?utm_source=generator&theme=0`
    });
  }
  return items;
}

export async function searchSpotify(query: string, token: string): Promise<SpotifyItem[]> {
  const data = await spotifyGet<any>(`/search?q=${encodeURIComponent(query)}&type=track,playlist,album&limit=12`, token);
  const out: SpotifyItem[] = [];

  for (const track of data?.tracks?.items ?? []) {
    out.push({
      id: track.id,
      name: track.name,
      subtitle: track.artists?.map((artist: { name: string }) => artist.name).join(", ") ?? "Artista",
      image: track.album?.images?.[1]?.url ?? track.album?.images?.[0]?.url ?? null,
      type: "track",
      embedUrl: `https://open.spotify.com/embed/track/${track.id}?utm_source=generator&theme=0`
    });
  }
  for (const playlist of data?.playlists?.items ?? []) {
    if (!playlist?.id) continue;
    out.push({
      id: playlist.id,
      name: playlist.name,
      subtitle: `Playlist · ${playlist.owner?.display_name ?? "Spotify"}`,
      image: playlist.images?.[0]?.url ?? null,
      type: "playlist",
      embedUrl: `https://open.spotify.com/embed/playlist/${playlist.id}?utm_source=generator&theme=0`
    });
  }
  for (const album of data?.albums?.items ?? []) {
    out.push({
      id: album.id,
      name: album.name,
      subtitle: `Álbum · ${album.artists?.map((artist: { name: string }) => artist.name).join(", ") ?? ""}`,
      image: album.images?.[1]?.url ?? album.images?.[0]?.url ?? null,
      type: "album",
      embedUrl: `https://open.spotify.com/embed/album/${album.id}?utm_source=generator&theme=0`
    });
  }
  return out.slice(0, 20);
}
