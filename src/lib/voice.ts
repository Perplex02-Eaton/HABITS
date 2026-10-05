export const ASSISTANT_VOICE_KEY = "habits-assistant-voice";

let activeSpanishAudio: HTMLAudioElement | null = null;
let activeSpanishSource: AudioBufferSourceNode | null = null;
let spanishAudioContext: AudioContext | null = null;
let spanishAudioUnlocked = false;
type SpanishSynthesizer = (text: string) => Promise<{ audio: Float32Array; sampling_rate: number }>;
let spanishSynthesizerPromise: Promise<SpanishSynthesizer> | null = null;

/** Prepara la reproducción desde el gesto del usuario antes de escuchar. */
export function unlockSpanishAudio(): void {
  if (typeof window === "undefined") return;

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

/** Voz neural española local (MMS), con respaldo remoto si el modelo no carga. */
export async function speakSpanishAudio(text: string): Promise<boolean> {
  if (typeof window === "undefined" || !text.trim()) return false;
  const chunks = speechChunks(text);
  if (!chunks.length) return false;
  cancelSpanishAudio();

  try {
    const synthesize = await localSpanishSynthesizer();
    for (const chunk of chunks) {
      const output = await synthesize(chunk);
      await playGeneratedAudio(wavBlob(output.audio, output.sampling_rate));
    }
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
  if (!("speechSynthesis" in window)) return [];
  return window.speechSynthesis
    .getVoices()
    .filter((voice) => /^es(?:-|$)/i.test(voice.lang));
}

function voiceScore(voice: SpeechSynthesisVoice): number {
  const name = voice.name.toLowerCase();
  const lang = voice.lang.toLowerCase();
  const locale = navigator.language.toLowerCase();
  let score = 0;

  if (lang === locale) score += 100;
  if (/es-(pe|mx|es|co|ar|cl|uy|ec|bo)/.test(lang)) score += 55;
  if (/es-us/.test(lang)) score -= 20;
  if (/natural|neural|premium|enhanced/.test(name)) score += 70;
  if (/pablo|jorge|diego|javier|andres|andrés|alvaro|álvaro|raul|raúl|dario|darío|sergio/.test(name)) score += 35;
  if (/microsoft/.test(name)) score += 18;
  if (/google/.test(name)) score += 12;
  if (voice.localService) score += 10;
  return score;
}

export function preferredSpanishVoice(): SpeechSynthesisVoice | null {
  const voices = spanishVoices();
  if (!voices.length) return null;
  const saved = localStorage.getItem(ASSISTANT_VOICE_KEY);
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
  const delivery = text
    .replace(/\s+/g, " ")
    .replace(/([.!?])\s+/g, "$1   ")
    .replace(/:\s+/g, ":  ")
    .trim();
  const utterance = new SpeechSynthesisUtterance(delivery);
  const voice = preferredSpanishVoice();
  if (voice) utterance.voice = voice;
  utterance.lang = voice?.lang || "es-PE";
  // Mantener el tono cerca del original preserva la pronunciación española.
  utterance.pitch = 0.94;
  utterance.rate = 0.91;
  utterance.volume = 1;
  return utterance;
}

export async function cinematicSpanishReady(text: string): Promise<SpeechSynthesisUtterance> {
  const voice = await waitForSpanishVoice();
  const utterance = cinematicSpanish(text);
  if (voice) {
    utterance.voice = voice;
    utterance.lang = voice.lang;
  } else {
    // Keep the language explicit if this device has no Spanish voice at all.
    utterance.lang = "es-PE";
  }
  return utterance;
}
