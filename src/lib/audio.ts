import type { FrequencyPreset } from "./types";

export const FREQUENCIES: FrequencyPreset[] = [
  { name: "Frecuencia de Dios", freq: 244, desc: "Conexión espiritual profunda" },
  { name: "Sanación", freq: 174, desc: "Alivio y regeneración" },
  { name: "Energía", freq: 285, desc: "Rejuvenecimiento celular" },
  { name: "Liberación", freq: 396, desc: "Suelta el miedo y la culpa" },
  { name: "Cambio", freq: 417, desc: "Nueva perspectiva" },
  { name: "Transformación", freq: 528, desc: "El milagro · ADN" },
  { name: "Conexión", freq: 639, desc: "Relaciones y armonía" },
  { name: "Intuición", freq: 741, desc: "Despertar y expresión" },
  { name: "Orden", freq: 852, desc: "Retorno al equilibrio" },
  { name: "Iluminación", freq: 963, desc: "Conexión con la fuente" },
  { name: "Frecuencia universal", freq: 432, desc: "Afina la naturaleza" }
];

class AudioEngine {
  private ctx: AudioContext | null = null;
  private gain: GainNode | null = null;
  private osc: OscillatorNode | null = null;
  private osc2: OscillatorNode | null = null;
  private playing = false;
  private volume = 0.4;
  private frequency = 244;

  private ensureContext(): AudioContext {
    if (!this.ctx) {
      const Ctor =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new Ctor();
    }
    if (this.ctx.state === "suspended") void this.ctx.resume();
    return this.ctx;
  }

  setVolume(v: number) {
    this.volume = v;
    if (this.gain) {
      this.gain.gain.setTargetAtTime(v, this.ctx!.currentTime, 0.05);
    }
  }

  getVolume() {
    return this.volume;
  }

  isPlaying() {
    return this.playing;
  }

  getFrequency() {
    return this.frequency;
  }

  play(freq: number) {
    this.ensureContext();
    if (this.playing) this.stop();
    this.frequency = freq;

    const ctx = this.ctx!;
    this.gain = ctx.createGain();
    this.gain.gain.setValueAtTime(0, ctx.currentTime);
    this.gain.gain.setTargetAtTime(this.volume, ctx.currentTime, 0.5);

    const master = ctx.createGain();
    master.gain.value = 0.9;
    master.connect(ctx.destination);

    this.gain.connect(master);

    this.osc = ctx.createOscillator();
    this.osc.type = "sine";
    this.osc.frequency.value = freq;
    this.osc.connect(this.gain);
    this.osc.start();

    this.osc2 = ctx.createOscillator();
    this.osc2.type = "sine";
    this.osc2.frequency.value = freq * 2;
    const g2 = ctx.createGain();
    g2.gain.value = 0.12;
    this.osc2.connect(g2);
    g2.connect(this.gain);
    this.osc2.start();

    this.playing = true;
  }

  stop() {
    if (!this.playing) return;
    const ctx = this.ctx!;
    try {
      const g = this.gain!;
      g.gain.setTargetAtTime(0, ctx.currentTime, 0.2);
      const osc = this.osc!;
      const osc2 = this.osc2!;
      window.setTimeout(() => {
        try {
          osc.stop();
          osc2.stop();
          osc.disconnect();
          osc2.disconnect();
        } catch {
          /* noop */
        }
      }, 700);
    } catch {
      /* noop */
    }
    this.playing = false;
    this.osc = null;
    this.osc2 = null;
  }

  toggle(freq: number) {
    if (this.playing && this.frequency === freq) {
      this.stop();
    } else {
      this.play(freq);
    }
  }
}

export const audioEngine = new AudioEngine();
