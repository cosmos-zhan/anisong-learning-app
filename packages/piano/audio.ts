import type { PianoAudio } from "./types";
type Voice = { oscillators: OscillatorNode[]; gain: GainNode; ended: boolean };
/** A licensed-sample-free, damped additive piano. All times are AudioContext times. */
export class SynthPiano implements PianoAudio {
  private context?: AudioContext;
  private voices = new Map<string, Voice>();
  private interruptions = new Set<() => void>();
  onInterruption(listener: () => void) {
    this.interruptions.add(listener);
    return () => {
      this.interruptions.delete(listener);
    };
  }
  get now() {
    return this.context?.currentTime ?? 0;
  }
  async enable() {
    if (!this.context) {
      this.context = new AudioContext({ latencyHint: "interactive" });
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
    if (!Number.isInteger(midi) || midi < 0 || midi > 127)
      throw new Error("音高超出支持范围。");
    this.release(id);
    if (this.voices.size >= 64) this.release(this.voices.keys().next().value!);
    const start = Math.max(ctx.currentTime, at),
      gain = ctx.createGain();
    gain.connect(ctx.destination);
    gain.gain.setValueAtTime(0, start);
    gain.gain.linearRampToValueAtTime(0.12, start + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.035, start + 0.25);
    gain.gain.exponentialRampToValueAtTime(0.008, start + 3);
    const voice: Voice = { oscillators: [], gain, ended: false };
    this.voices.set(id, voice);
    for (const [harmonic, weight] of [
      [1, 1],
      [2, 0.3],
      [3, 0.12],
    ] as const) {
      const oscillator = ctx.createOscillator(),
        partial = ctx.createGain();
      oscillator.type = "sine";
      oscillator.frequency.value = 440 * 2 ** ((midi - 69) / 12) * harmonic;
      partial.gain.value = weight;
      oscillator.connect(partial).connect(gain);
      oscillator.start(start);
      voice.oscillators.push(oscillator);
      oscillator.onended = () => {
        oscillator.disconnect();
        partial.disconnect();
        if (
          voice.oscillators.every((o) =>
            o !== oscillator ? !this.voices.has(id) : true,
          )
        )
          gain.disconnect();
      };
    }
    if (duration !== undefined) this.end(id, voice, start + duration);
  }
  private end(id: string, voice: Voice, at: number) {
    voice.gain.gain.cancelScheduledValues(at);
    voice.gain.gain.setTargetAtTime(0, at, 0.025);
    for (const oscillator of voice.oscillators) {
      try {
        oscillator.stop(at + 0.15);
      } catch {
        /* already stopped */
      }
    }
    const first = voice.oscillators[0];
    const previous = first.onended;
    first.onended = (event) => {
      if (this.voices.get(id) === voice) this.voices.delete(id);
      voice.gain.disconnect();
      previous?.call(first, event);
    };
  }
  release(id: string) {
    const voice = this.voices.get(id);
    if (!voice || voice.ended) return;
    voice.ended = true;
    this.voices.delete(id);
    this.end(id, voice, this.now);
  }
  stop() {
    for (const id of Array.from(this.voices.keys())) this.release(id);
  }
  dispose() {
    this.stop();
    if (this.context) this.context.onstatechange = null;
    void this.context?.close();
    this.context = undefined;
    this.interruptions.clear();
  }
}
