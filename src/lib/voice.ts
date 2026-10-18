export const ASSISTANT_VOICE_KEY = "habits-assistant-voice";
export const ASSISTANT_ENGINE_KEY = "habits-assistant-voice-engine";
export const ASSISTANT_RATE_KEY = "habits-assistant-voice-rate";

/**
 * Motor de voz de JARVIS.
 * - "sistema": voces del navegador/SO. Edge y Chrome traen voces neuronales
 *   en español ("Microsoft Camila Online (Natural) - Spanish (Peru)",
 *   "Google español"…). Suenan naturales, hablan español de verdad y no
 *   descargan nada.
 * - "neural": modelo local MMS (Xenova/mms-tts-spa) generado en el navegador.
 *   Funciona sin conexión pero suena más plano y tarda en arrancar.
 * - "auto": la mejor voz española del sistema y, si el equipo no tiene
 *   ninguna, cae al modelo local.
 */
export type VoiceEngine = "auto" | "sistema" | "neural";

let activeSpanishAudio: HTMLAudioElement | null = null;
let activeSpanishSource: AudioBufferSourceNode | null = null;
let spanishAudioContext: AudioContext | null = null;
let spanishAudioUnlocked = false;
let spanishUtterance: SpeechSynthesisUtterance | null = null;
type SpanishSynthesizer = (text: string) => Promise<{ audio: Float32Array; sampling_rate: number }>;
let spanishSynthesizerPromise: Promise<SpanishSynthesizer> | null = null;

function readSetting(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeSetting(key: string, value: string | null): void {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    /* almacenamiento no disponible */
  }
}

export function getVoiceEngine(): VoiceEngine {
  const saved = readSetting(ASSISTANT_ENGINE_KEY);
  return saved === "sistema" || saved === "neural" || saved === "auto" ? saved : "auto";
}

export function setVoiceEngine(engine: VoiceEngine): void {
  writeSetting(ASSISTANT_ENGINE_KEY, engine);
}

export function getSpeechRate(): number {
  const parsed = Number(readSetting(ASSISTANT_RATE_KEY));
  return Number.isFinite(parsed) && parsed >= 0.5 && parsed <= 1.6 ? parsed : 1;
}

export function setSpeechRate(rate: number): void {
  writeSetting(ASSISTANT_RATE_KEY, String(rate));
}

export function setAssistantVoice(name: string | null): void {
  writeSetting(ASSISTANT_VOICE_KEY, name);
}

/** Prepara la reproducción desde el gesto del usuario antes de escuchar. */
export function unlockSpanishAudio(): void {
  if (typeof window === "undefined") return;

  // Las voces del sistema llegan de forma asíncrona: pedirlas aquí evita que
  // la primera respuesta se lea con la voz inglesa por defecto.
  if ("speechSynthesis" in window) {
    try {
      window.speechSynthesis.getVoices();
    } catch {
      /* sin voces del sistema */
    }
  }

  // Keep a real, resumed Web Audio context. The neural voice is generated
  // asynchronously, so a later HTMLAudio.play() can be blocked by autoplay
  // policies even though the user did click the microphone.
  if (!spanishAudioContext) {
    const AudioContextCtor = window.AudioContext ||
      (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (AudioContextCtor) {
      try { spanishAudioContext = new AudioContextCtor(); } catch { /* usa HTMLAudio como respaldo */ }
    }
  }
  if (spanishAudioContext?.state === "suspended") void spanishAudioContext.resume();
  if (spanishAudioContext) spanishAudioUnlocked = true;
  if (spanishAudioUnlocked) return;

  const silent = new Audio(
    "data:audio/wav;base64,UklGRigAAABXQVZFZm10IBAAAAABAAEARKwAAESsAAABAAgAZGF0YQQAAAAA"
  );
  silent.volume = 0.001;
  void silent.play().then(() => {
    spanishAudioUnlocked = true;
    silent.pause();
  }).catch(() => {
    // El navegador puede permitir la reproducción real aunque bloquee este desbloqueo.
  });
}

function speechChunks(text: string, maxLength = 190): string[] {
  const clean = text.replace(/\s+/g, " ").trim();
  if (clean.length <= maxLength) return clean ? [clean] : [];
  const sentences = clean.match(/[^.!?]+[.!?]+|[^.!?]+$/g) || [clean];
  const chunks: string[] = [];
  let current = "";
  for (const sentence of sentences) {
    const next = `${current} ${sentence}`.trim();
    if (current && next.length > maxLength) {
      chunks.push(current);
      current = sentence.trim();
    } else {
      current = next;
    }
  }
  if (current) chunks.push(current);
  return chunks.flatMap((chunk) => {
    if (chunk.length <= maxLength) return [chunk];
    const words = chunk.split(" ");
    const result: string[] = [];
    let part = "";
    for (const word of words) {
      const next = `${part} ${word}`.trim();
      if (part && next.length > maxLength) {
        result.push(part);
        part = word;
      } else {
        part = next;
      }
    }
    if (part) result.push(part);
    return result;
  });
}

export function cancelSpanishAudio(): void {
  if (typeof window !== "undefined" && "speechSynthesis" in window) {
    try { window.speechSynthesis.cancel(); } catch { /* nada sonando */ }
  }
  spanishUtterance = null;
  activeSpanishAudio?.pause();
  activeSpanishAudio = null;
  if (activeSpanishSource) {
    try { activeSpanishSource.stop(); } catch { /* already stopped */ }
    activeSpanishSource = null;
  }
}

function wavBlob(samples: Float32Array, sampleRate: number): Blob {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);
  const write = (offset: number, value: string) => {
    for (let i = 0; i < value.length; i++) view.setUint8(offset + i, value.charCodeAt(i));
  };
  write(0, "RIFF");
  view.setUint32(4, 36 + samples.length * 2, true);
  write(8, "WAVE");
  write(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  write(36, "data");
  view.setUint32(40, samples.length * 2, true);
  for (let i = 0; i < samples.length; i++) {
    const sample = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(44 + i * 2, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
  }
  return new Blob([buffer], { type: "audio/wav" });
}

async function localSpanishSynthesizer(): Promise<SpanishSynthesizer> {
  if (!spanishSynthesizerPromise) {
    spanishSynthesizerPromise = import("@huggingface/transformers")
      .then(({ pipeline }) => pipeline("text-to-speech", "Xenova/mms-tts-spa"))
      .then((synthesizer) => synthesizer as unknown as SpanishSynthesizer);
  }
  return spanishSynthesizerPromise;
}

/** Descarga y prepara la voz neural tras el clic del usuario. */
export async function warmUpSpanishVoice(): Promise<boolean> {
  try {
    await localSpanishSynthesizer();
    return true;
  } catch {
    return false;
  }
}

async function playGeneratedAudio(blob: Blob): Promise<void> {
  if (spanishAudioContext) {
    if (spanishAudioContext.state === "suspended") await spanishAudioContext.resume();
    const buffer = await spanishAudioContext.decodeAudioData(await blob.arrayBuffer());
    await new Promise<void>((resolve) => {
      const source = spanishAudioContext!.createBufferSource();
      activeSpanishSource = source;
      source.buffer = buffer;
      source.connect(spanishAudioContext!.destination);
      source.onended = () => {
        if (activeSpanishSource === source) activeSpanishSource = null;
        resolve();
      };
      source.start();
    });
    return;
  }

  const url = URL.createObjectURL(blob);
  const audio = new Audio(url);
  audio.preload = "auto";
  activeSpanishAudio = audio;
  try {
    await audio.play();
    await new Promise<void>((resolve, reject) => {
      audio.onended = () => resolve();
      audio.onerror = () => reject(new Error("No se pudo reproducir la voz generada"));
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function remoteSpanishAudio(chunks: string[]): Promise<void> {
  for (const chunk of chunks) {
    const audio = new Audio(
      `https://translate.google.com/translate_tts?ie=UTF-8&client=tw-ob&tl=es-ES&q=${encodeURIComponent(chunk)}`
    );
    audio.preload = "auto";
    activeSpanishAudio = audio;
    await audio.play();
    await new Promise<void>((resolve, reject) => {
      audio.onended = () => resolve();
      audio.onerror = () => reject(new Error("No se pudo reproducir la voz española"));
    });
  }
}

/** Voz neural local (MMS) generada en el navegador, sin conexión. */
async function neuralSpanishAudio(chunks: string[]): Promise<void> {
  const synthesize = await localSpanishSynthesizer();
  for (const chunk of chunks) {
    const output = await synthesize(chunk);
    await playGeneratedAudio(wavBlob(output.audio, output.sampling_rate));
  }
}

function utteranceFor(text: string, voice: SpeechSynthesisVoice | null): SpeechSynthesisUtterance {
  const delivery = text
    .replace(/\s+/g, " ")
    .replace(/([.!?])\s+/g, "$1   ")
    .replace(/:\s+/g, ":  ")
    .trim();
  const utterance = new SpeechSynthesisUtterance(delivery);
  if (voice) utterance.voice = voice;
  utterance.lang = voice?.lang || "es-PE";
  const neural = !!voice && /online \(natural\)|natural|neural|premium|enhanced/i.test(voice.name);
  // Las voces neuronales ya suenan bien: no conviene deformarlas moviendo tono ni velocidad.
  utterance.pitch = neural ? 1 : 0.96;
  utterance.rate = neural ? getSpeechRate() : Math.min(getSpeechRate(), 0.97);
  utterance.volume = 1;
  return utterance;
}

/** Habla con la voz española del sistema. Devuelve false si no hay ninguna. */
export async function speakWithSystemVoice(text: string, timeoutMs = 1600): Promise<boolean> {
  if (typeof window === "undefined" || !("speechSynthesis" in window) || !text.trim()) return false;
  const voice = await waitForSpanishVoice(timeoutMs);
  if (!voice) return false;

  const chunks = speechChunks(text, 260);
  if (!chunks.length) return false;
  try { window.speechSynthesis.cancel(); } catch { /* nada sonando */ }
  try { window.speechSynthesis.resume(); } catch { /* no soportado */ }
  let spoke = false;

  for (const chunk of chunks) {
    const ok = await new Promise<boolean>((resolve) => {
      const utterance = utteranceFor(chunk, voice);
      spanishUtterance = utterance;
      let started = false;
      const done = (result: boolean) => {
        if (spanishUtterance === utterance) spanishUtterance = null;
        resolve(result);
      };
      utterance.onstart = () => { started = true; };
      utterance.onend = () => done(started);
      utterance.onerror = (event) => {
        // "interrupted"/"canceled" sale al cancelar; "not-allowed" o
        // "audio-busy" cuando el navegador bloquea el audio. En esos casos
        // devolvemos false para que se pruebe el otro motor.
        const error = (event as SpeechSynthesisErrorEvent).error;
        done(started && error !== "not-allowed" && error !== "audio-busy");
      };
      window.speechSynthesis.speak(utterance);
      // Salvavidas: algunos navegadores no disparan onend nunca.
      window.setTimeout(() => {
        if (spanishUtterance === utterance) {
          try { window.speechSynthesis.cancel(); } catch { /* nada */ }
          done(started);
        }
      }, Math.max(8000, chunk.length * 110));
    });
    if (ok) spoke = true;
    else if (!spoke) return false;
  }
  return spoke;
}

/** ¿Hay alguna voz en español instalada en este equipo? */
export function hasSystemSpanishVoice(): boolean {
  return spanishVoices().length > 0;
}

/**
 * Voz principal de JARVIS. Por defecto usa la mejor voz española del sistema
 * (natural en Edge/Chrome) y solo cae al modelo local o al TTS remoto si el
 * equipo no tiene ninguna voz en español.
 */
export async function speakSpanishAudio(text: string, engine: VoiceEngine = getVoiceEngine()): Promise<boolean> {
  if (typeof window === "undefined" || !text.trim()) return false;
  const chunks = speechChunks(text);
  if (!chunks.length) return false;
  cancelSpanishAudio();

  if ((engine === "sistema" || engine === "auto") && hasSystemSpanishVoice()) {
    if (await speakWithSystemVoice(text)) return true;
  }
  if (engine === "sistema") return false;

  try {
    await neuralSpanishAudio(chunks);
    activeSpanishAudio = null;
    return true;
  } catch {
    try {
      await remoteSpanishAudio(chunks);
      activeSpanishAudio = null;
      return true;
    } catch {
      cancelSpanishAudio();
      return false;
    }
  }
}

export function spanishVoices(): SpeechSynthesisVoice[] {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return [];
  return window.speechSynthesis
    .getVoices()
    .filter((voice) => /^es(?:-|_|$)/i.test(voice.lang));
}

function voiceScore(voice: SpeechSynthesisVoice): number {
  const name = voice.name.toLowerCase();
  const lang = voice.lang.toLowerCase().replace("_", "-");
  const locale = (typeof navigator !== "undefined" ? navigator.language : "es-PE").toLowerCase();
  let score = 0;

  // Las voces "Online (Natural)" son las que suenan humanas.
  if (/online \(natural\)|natural|neural/.test(name)) score += 220;
  if (/premium|enhanced|siri/.test(name)) score += 120;
  if (lang === locale) score += 100;
  // Perú primero, luego Latinoamérica, España después.
  if (/^es-pe/.test(lang)) score += 90;
  if (/^es-(mx|co|ar|cl|uy|ec|bo|ve|py|do|gt|hn|ni|pa|pr|sv|cr|us)/.test(lang)) score += 65;
  if (/^es-es/.test(lang)) score += 40;
  if (/camila|dalia|jorge|elena|elvira|álvaro|alvaro|pablo|lucía|lucia|sabina|helena|laura|mónica|monica|paulina|raquel|andrea|diego|javier|carlos|marisol|ximena|renata|salomé|salome|gonzalo|tomás|tomas|larissa/.test(name)) score += 30;
  if (/microsoft/.test(name)) score += 20;
  if (/google/.test(name)) score += 15;
  if (voice.localService) score += 12;
  if (/desktop/.test(name)) score -= 25; // variantes viejas de Windows
  return score;
}

export interface VoiceOption {
  name: string;
  lang: string;
  label: string;
  local: boolean;
  neural: boolean;
  score: number;
}

/** Lista ordenada de voces españolas disponibles, para el selector de Ajustes. */
export function spanishVoiceOptions(): VoiceOption[] {
  return spanishVoices()
    .map((voice) => {
      const neural = /online \(natural\)|natural|neural|premium|enhanced/i.test(voice.name);
      return {
        name: voice.name,
        lang: voice.lang,
        label: `${voice.name} · ${voice.lang}${neural ? " · neural" : ""}`,
        local: voice.localService,
        neural,
        score: voiceScore(voice)
      };
    })
    .sort((a, b) => b.score - a.score);
}

export function preferredSpanishVoice(): SpeechSynthesisVoice | null {
  const voices = spanishVoices();
  if (!voices.length) return null;
  const saved = readSetting(ASSISTANT_VOICE_KEY);
  const selected = saved ? voices.find((voice) => voice.name === saved) : null;
  return selected ?? [...voices].sort((a, b) => voiceScore(b) - voiceScore(a))[0];
}

/**
 * Chrome, Edge and Safari often expose their voices asynchronously. Waiting
 * here prevents the first response from using the operating system's English
 * default before the Spanish voices arrive.
 */
export function waitForSpanishVoice(timeoutMs = 1400): Promise<SpeechSynthesisVoice | null> {
  if (!("speechSynthesis" in window)) return Promise.resolve(null);
  const immediate = preferredSpanishVoice();
  if (immediate) return Promise.resolve(immediate);

  return new Promise((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      window.speechSynthesis.removeEventListener("voiceschanged", check);
      window.clearInterval(poll);
      window.clearTimeout(timer);
      resolve(preferredSpanishVoice());
    };
    const check = () => {
      if (preferredSpanishVoice()) finish();
    };
    const poll = window.setInterval(check, 80);
    const timer = window.setTimeout(finish, timeoutMs);
    window.speechSynthesis.addEventListener("voiceschanged", check);
    window.speechSynthesis.getVoices();
  });
}

export function cinematicSpanish(text: string): SpeechSynthesisUtterance {
  return utteranceFor(text, preferredSpanishVoice());
}

export async function cinematicSpanishReady(text: string): Promise<SpeechSynthesisUtterance> {
  const voice = await waitForSpanishVoice();
  return utteranceFor(text, voice);
}

/** Descripción corta del motor de voz activo, para Ajustes. */
export function describeVoiceEngine(): string {
  const options = spanishVoiceOptions();
  if (!options.length) return "Sin voces en español en este equipo · usando voz neural local";
  return `Voz natural: ${options[0].name} (${options[0].lang})`;
}
