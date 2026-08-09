export const ASSISTANT_VOICE_KEY = "habits-assistant-voice";

export function spanishVoices(): SpeechSynthesisVoice[] {
  if (!("speechSynthesis" in window)) return [];
  return window.speechSynthesis
    .getVoices()
    .filter((voice) => voice.lang.toLowerCase().startsWith("es"));
}

function voiceScore(voice: SpeechSynthesisVoice): number {
  const name = voice.name.toLowerCase();
  const lang = voice.lang.toLowerCase();
  const locale = navigator.language.toLowerCase();
  let score = 0;

  if (lang === locale) score += 100;
  if (/es-(pe|mx|es|co|ar|cl)/.test(lang)) score += 55;
  if (/es-us/.test(lang)) score -= 20;
  if (/natural|neural|premium|enhanced/.test(name)) score += 70;
  if (/pablo|jorge|diego|javier|andres|andrés|alvaro|álvaro|raul|raúl|dario|darío|sergio/.test(name)) score += 35;
  if (/microsoft/.test(name)) score += 18;
  if (/google/.test(name)) score += 12;
  if (voice.localService) score += 5;
  return score;
}

export function preferredSpanishVoice(): SpeechSynthesisVoice | null {
  const voices = spanishVoices();
  if (!voices.length) return null;
  const saved = localStorage.getItem(ASSISTANT_VOICE_KEY);
  const selected = saved ? voices.find((voice) => voice.name === saved) : null;
  return selected ?? [...voices].sort((a, b) => voiceScore(b) - voiceScore(a))[0];
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
