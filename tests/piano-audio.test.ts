import { afterEach, it, expect, vi } from "vitest";
import { SynthPiano, pianoEnvelope } from "../packages/piano/audio";
class Parameter {
  value = 0;
  setValueAtTime = vi.fn();
  linearRampToValueAtTime = vi.fn();
  exponentialRampToValueAtTime = vi.fn();
  cancelScheduledValues = vi.fn();
  setTargetAtTime = vi.fn();
}
class Gain {
  gain = new Parameter();
  connect = vi.fn(() => this);
  disconnect = vi.fn();
}
class Oscillator {
  type = "sine";
  frequency = { value: 0 };
  start = vi.fn();
  stop = vi.fn();
  connect = vi.fn(() => new Gain());
  disconnect = vi.fn();
  onended: (() => void) | null = null;
}
class Context {
  sampleRate = 48000;
  currentTime = 0;
  state = "suspended";
  destination = {};
  onstatechange: (() => void) | null = null;
  oscillators: Oscillator[] = [];
  gains: Gain[] = [];
  resume = vi.fn(async () => {
    this.state = "running";
  });
  close = vi.fn(async () => {
    this.state = "closed";
  });
  createWaveShaper() { return { curve: null, oversample: "none", connect: vi.fn(() => new Gain()) }; }
  createOscillator() {
    const o = new Oscillator();
    this.oscillators.push(o);
    return o;
  }
  createGain() {
    const g = new Gain();
    this.gains.push(g);
    return g;
  }
}
afterEach(() => vi.unstubAllGlobals());
it("the actual synth adapter schedules real Web Audio nodes, preserves A4 pitch and releases every finger independently", async () => {
  const context = new Context();
  vi.stubGlobal(
    "AudioContext",
    class {
      constructor() {
        return context;
      }
    },
  );
  const audio = new SynthPiano();
  await audio.enable();
  audio.note("one", 69, 1, 0.5);
  audio.note("two", 60);
  expect(context.oscillators).toHaveLength(6);
  expect(context.oscillators[0].frequency.value).toBe(440);
  expect(context.oscillators[0].start).toHaveBeenCalledWith(1);
  expect(context.oscillators[0].stop).toHaveBeenCalledWith(1.585);
  expect(context.oscillators[3].stop).toHaveBeenCalledWith(8.085);
  context.currentTime = 0.2;
  audio.release("two");
  for (const osc of context.oscillators.slice(3))
    expect(osc.stop).toHaveBeenCalledWith(0.28500000000000003);
  audio.stop();
  for (const osc of context.oscillators) expect(osc.stop).toHaveBeenCalled();
  audio.dispose();
  expect(context.close).toHaveBeenCalled();
});
it("suspended audio cannot claim successful key sound; system interruption is observable", async () => {
  const context = new Context();
  vi.stubGlobal(
    "AudioContext",
    class {
      constructor() {
        return context;
      }
    },
  );
  const audio = new SynthPiano(),
    interrupted = vi.fn();
  audio.onInterruption(interrupted);
  await audio.enable();
  context.state = "suspended";
  context.onstatechange?.();
  expect(interrupted).toHaveBeenCalled();
  expect(() => audio.note("x", 60)).toThrow("中断");
  audio.dispose();
});
it("an unsuccessful resume returns a user-action error", async () => {
  const context = new Context();
  context.resume = vi.fn(async () => {});
  vi.stubGlobal(
    "AudioContext",
    class {
      constructor() {
        return context;
      }
    },
  );
  const audio = new SynthPiano();
  await expect(audio.enable()).rejects.toThrow("启用声音");
  expect(context.oscillators).toHaveLength(0);
  audio.dispose();
});

it("cancels a future attack and holds the analytical envelope on rapid release", async () => {
  const context = new Context();
  vi.stubGlobal("AudioContext", class { constructor() { return context; } });
  const audio = new SynthPiano(); await audio.enable();
  audio.note("queued", 60, 1, 0.5);
  audio.release("queued");
  const queued = context.gains[1].gain;
  expect(queued.cancelScheduledValues).toHaveBeenLastCalledWith(0);
  expect(queued.setValueAtTime).toHaveBeenLastCalledWith(0, 0);
  audio.note("tap", 69);
  context.currentTime = 0.004;
  audio.release("tap");
  const tap = context.gains[5].gain;
  expect(tap.linearRampToValueAtTime).toHaveBeenCalledWith(pianoEnvelope(0.004), 0.004);
  expect(tap.linearRampToValueAtTime).toHaveBeenLastCalledWith(0, 0.084);
  expect(() => audio.note("bad", 60, 0, Number.NaN)).toThrow("无效");
  audio.dispose();
});
it("does not generate harmonics above the output Nyquist frequency", async () => {
  const context = new Context(); context.sampleRate = 24000;
  vi.stubGlobal("AudioContext", class { constructor() { return context; } });
  const audio = new SynthPiano(); await audio.enable(); audio.note("high", 120);
  expect(context.oscillators).toHaveLength(1);
  expect(context.oscillators.every(o => o.frequency.value < 12000)).toBe(true);
  audio.dispose();
});
