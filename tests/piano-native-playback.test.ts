import { expect, it, vi } from "vitest";
import { PianoController } from "../packages/piano/controller";
import { demoScore, PianoTestAudio } from "./piano-fixtures";
import type { PianoPlayback, PianoPlaybackEvent, PianoSequence } from "../packages/piano/types";
class Playback implements PianoPlayback {
  listener?: (event: PianoPlaybackEvent) => void;
  play = vi.fn(async (_sequence: PianoSequence) => {});
  stop = vi.fn(); setLoop = vi.fn(); sync = vi.fn(); dispose = vi.fn();
  subscribe(listener: (event: PianoPlaybackEvent) => void) { this.listener = listener; return () => { this.listener = undefined; }; }
}
it("native audition queues actual notes once; only native position drives progress and lock-screen controls", async () => {
  const audio = new PianoTestAudio(), playback = new Playback(), c = new PianoController(audio, playback);
  c.load(demoScore()); c.select(1, 2, false); await c.play();
  const seq = playback.play.mock.calls[0][0];
  expect(seq.notes.length).toBeGreaterThan(0);
  expect(seq.notes[0].at).toBe(0);
  expect(seq.notes.every(n => n.at + n.duration <= seq.duration + 0.001)).toBe(true);
  expect(audio.calls).toHaveLength(0); // No parallel WebAudio scheduler.
  const before = c.getSnapshot().tick;
  audio.now = 50; c.pump();
  expect(c.getSnapshot().tick).toBe(before);
  playback.listener?.({ type: "position", position: 1, rounds: 3 });
  expect(c.getSnapshot().tick).toBeGreaterThan(before);
  expect(c.getSnapshot().rounds).toBe(3);
  playback.listener?.({ type: "playing", playing: false });
  expect(c.getSnapshot().phase).toBe("paused");
  playback.listener?.({ type: "playing", playing: true });
  expect(c.getSnapshot().phase).toBe("playing");
  c.setLoop(false); expect(playback.setLoop).toHaveBeenCalledWith(false);
  c.syncPlayback(); expect(playback.sync).toHaveBeenCalled();
  c.pause(); const tick = c.getSnapshot().tick;
  playback.listener?.({ type: "position", position: 2 });
  expect(c.getSnapshot().tick).toBe(tick);
  c.dispose();
});
it("pausing during PCM preparation cancels late success and preserves the pause", async () => {
  const playback = new Playback(), c = new PianoController(new PianoTestAudio(), playback);
  let finish!: () => void;
  playback.play.mockImplementation(() => new Promise<void>(r => { finish = r; }));
  c.load(demoScore()); const pending = c.play();
  await vi.waitFor(() => expect(playback.play).toHaveBeenCalled());
  c.pause(); finish(); await pending;
  expect(c.getSnapshot().phase).toBe("paused");
  c.dispose();
});
it("native preparation failure is visible and waiting mode still requires real keys", async () => {
  const playback = new Playback(), c = new PianoController(new PianoTestAudio(), playback);
  playback.play.mockRejectedValueOnce(new Error("render failed"));
  c.load(demoScore()); await c.play();
  expect(c.getSnapshot().error).toBe("render failed");
  c.mode("wait"); await c.play();
  expect(c.getSnapshot().phase).toBe("waiting");
  expect(playback.play).toHaveBeenCalledTimes(1);
  c.dispose();
});
