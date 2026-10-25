import type { PianoAudio } from "./types";
type Voice = {
  oscillators: OscillatorNode[];
  gain: GainNode;
  start: number;
  releaseAt?: number;
  ended: number;
};
export const PIANO_PEAK = 0.075;
export const PIANO_RELEASE = 0.08;
/** The analytical envelope also lets note-off hold the *scheduled* gain,
 * including during attack. AudioParam.value is not that future value. */
export function pianoEnvelope(elapsed: number) {
  if (elapsed <= 0) return 0;
  if (elapsed < 0.008) return PIANO_PEAK * elapsed / 0.008;
  return PIANO_PEAK * Math.exp(-(elapsed - 0.008) * 3.5);
}
/** Sample-free piano, bounded output and click-free note cancellation. */
export class SynthPiano implements PianoAudio {
  private context?: AudioContext;
  private output?: GainNode;
  private voices = new Map<string, Voice>();
  private interruptions = new Set<() => void>();
  onInterruption(listener: () => void) {
    this.interruptions.add(listener);
    return () => { this.interruptions.delete(listener); };
  }
  get now() { return this.context?.currentTime ?? 0; }
  async enable() {
    if (!this.context) {
      this.context = new AudioContext({ latencyHint: "interactive" });
      // A memoryless soft limiter provides an absolute ceiling even for dense
      // chords/release tails. A compressor alone cannot bound transient peaks.
      const limiter = this.context.createWaveShaper();
      const curve = new Float32Array(8193);
      for (let i = 0; i < curve.length; i++) {
        const x = i * 2 / (curve.length - 1) - 1;
        curve[i] = 0.55 * Math.tanh(x / 0.55);
      }
      limiter.curve = curve;
      limiter.oversample = "4x";
      this.output = this.context.createGain();
      this.output.gain.value = 0.8;
      this.output.connect(limiter).connect(this.context.destination);
      this.context.onstatechange = () => {
        if (this.context && this.context.state !== "running")
          for (const listener of this.interruptions) listener();
      };
    }
    await this.context.resume();
    if (this.context.state !== "running")
      throw new Error("浏览器尚未启用音频，请再次点击“启用声音”。");
  }
  note(id: string, midi: number, at = this.now, duration?: number) {
    const ctx = this.context;
    if (!ctx || ctx.state !== "running")
      throw new Error("声音已中断，请点击“启用声音”或播放重试。");
    if (!Number.isInteger(midi) || midi < 0 || midi > 127 || !Number.isFinite(at) ||
      (duration !== undefined && (!Number.isFinite(duration) || duration <= 0)))
      throw new Error("音高或音符时长无效。");
    this.release(id);
    if (this.voices.size >= 32) this.release(this.voices.keys().next().value!);
    const start = Math.max(ctx.currentTime, at), gain = ctx.createGain();
    gain.connect(this.output!);
    gain.gain.setValueAtTime(0, start);
    gain.gain.linearRampToValueAtTime(PIANO_PEAK, start + 0.008);
    gain.gain.exponentialRampToValueAtTime(pianoEnvelope(8), start + 8);
    const voice: Voice = { oscillators: [], gain, start, ended: 0 };
    this.voices.set(id, voice);
    for (const [harmonic, weight] of [[1, 1], [2, 0.22], [3, 0.08]] as const) {
      const frequency = 440 * 2 ** ((midi - 69) / 12) * harmonic;
      // Never synthesize partials above Nyquist (aliasing sounds metallic).
      if (frequency >= ctx.sampleRate / 2) continue;
      const oscillator = ctx.createOscillator(), partial = ctx.createGain();
      oscillator.type = "sine";
      oscillator.frequency.value = frequency;
      partial.gain.value = weight;
      oscillator.connect(partial).connect(gain);
      oscillator.start(start);
      voice.oscillators.push(oscillator);
      oscillator.onended = () => {
        oscillator.disconnect(); partial.disconnect();
        if (++voice.ended === voice.oscillators.length) {
          gain.disconnect();
          if (this.voices.get(id) === voice) this.voices.delete(id);
        }
      };
    }
    // Manual held keys also expire, so lost pointer events cannot leak voices.
    this.end(voice, start + (duration ?? 8));
  }
  private end(voice: Voice, at: number) {
    if (voice.releaseAt !== undefined && voice.releaseAt <= at) return;
    voice.releaseAt = at;
    const param = voice.gain.gain;
    if (typeof param.cancelAndHoldAtTime === "function") param.cancelAndHoldAtTime(at);
    else {
      param.cancelScheduledValues(at);
      const value = pianoEnvelope(at - voice.start);
      if (at <= voice.start) param.setValueAtTime(0, at);
      else if (at < voice.start + 0.008) param.linearRampToValueAtTime(value, at);
      else param.exponentialRampToValueAtTime(Math.max(1e-15, value), at);
    }
    param.linearRampToValueAtTime(0, at + PIANO_RELEASE);
    for (const oscillator of voice.oscillators) oscillator.stop(at + PIANO_RELEASE + 0.005);
  }
  release(id: string) {
    const voice = this.voices.get(id);
    if (!voice) return;
    this.voices.delete(id);
    // Cancelling a queued note must cancel its future attack as well.
    this.end(voice, this.now);
  }
  stop() { for (const id of Array.from(this.voices.keys())) this.release(id); }
  dispose() {
    this.stop();
    if (this.context) this.context.onstatechange = null;
    void this.context?.close();
    this.context = undefined; this.output = undefined; this.interruptions.clear();
  }
}
