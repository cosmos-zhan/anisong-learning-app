import { afterEach, describe, it, expect, vi } from "vitest";
import { PianoController } from "../packages/piano/controller";
import { parseMusicXml } from "../packages/piano/musicxml";
import {
  PianoTestAudio,
  demoScore,
  fixture,
  note,
  rest,
} from "./piano-fixtures";
const controllers: PianoController[] = [];
function setup(xml?: string) {
  const audio = new PianoTestAudio(),
    c = new PianoController(audio);
  c.load(xml ? parseMusicXml(xml) : demoScore());
  controllers.push(c);
  return { c, audio };
}
afterEach(() => {
  controllers.forEach((c) => c.dispose());
  controllers.length = 0;
  vi.useRealTimers();
});
describe("Piano state and audio scheduling", () => {
  it("a click on bar 5 sounds only that bar; range 8→5 includes both end bars", async () => {
    const { c, audio } = setup();
    c.select(4);
    await vi.waitFor(() => expect(c.getSnapshot().phase).toBe("playing"));
    expect(c.getSnapshot().range).toEqual([4, 4]);
    expect(audio.calls[0].midi).toBe(60);
    expect(audio.calls[0].at).toBeCloseTo(0.03);
    c.select(7, 4, false);
    expect(c.getSnapshot().range).toEqual([4, 7]);
    expect(c.steps[0].tick).toBe(7680);
    expect(c.steps.at(-1)?.end).toBe(15360);
  });
  it("uses audio time for highlight and scheduling, retains pitch at .75×, and ends at range boundary", async () => {
    vi.useFakeTimers();
    const { c, audio } = setup();
    c.setLoop(false);
    c.setSpeed(0.75);
    await c.play();
    expect(audio.calls[0].midi).toBe(60);
    expect(audio.calls[0].duration).toBeCloseTo(0.625 / 0.75);
    vi.advanceTimersByTime(10000);
    expect(c.getSnapshot().tick).toBeCloseTo(0);
    audio.now = 0.03 + 0.625 / 0.75 + 0.01;
    c.pump();
    expect(c.getSnapshot().step).toBe(1);
    expect(c.target?.pitch?.midi).toBe(62);
    audio.now = 5;
    c.pump();
    expect(c.getSnapshot().phase).toBe("ended");
    expect(c.getSnapshot().tick).toBe(1920);
  });
  it("repeats against the same audio clock and changes tempo without changing musical range", async () => {
    const { c, audio } = setup();
    await c.play();
    audio.now = 2.55;
    c.pump();
    expect(c.getSnapshot().rounds).toBe(1);
    expect(c.getSnapshot().tick).toBeLessThan(20);
    const range = c.getSnapshot().range;
    c.setSpeed(0.5);
    await vi.waitFor(() => expect(c.getSnapshot().phase).toBe("playing"));
    expect(c.getSnapshot().range).toEqual(range);
    expect(c.getSnapshot().speed).toBe(0.5);
    expect(audio.calls.at(-1)?.midi).toBe(60);
  });
  it("pause cancels queued sound and resumes from the captured musical position", async () => {
    const { c, audio } = setup();
    await c.play();
    audio.now = 0.53;
    c.pause();
    const tick = c.getSnapshot().tick;
    expect(tick).toBeCloseTo(384);
    expect(audio.stopped).toBeGreaterThan(1);
    audio.now = 10;
    await c.play();
    expect(c.getSnapshot().tick).toBeCloseTo(tick);
    expect(audio.calls.at(-1)?.duration).toBeCloseTo(0.125);
  });
  it("an old pending unlock cannot restart after pause, mode or range changes", async () => {
    const { c, audio } = setup();
    let finish!: () => void;
    audio.enable = () =>
      new Promise<void>((resolve) => {
        finish = () => {
          audio.enabled = true;
          resolve();
        };
      });
    const play = c.play();
    c.mode("free");
    finish();
    await play;
    expect(c.getSnapshot().mode).toBe("free");
    expect(c.getSnapshot().phase).toBe("ready");
    expect(audio.calls).toHaveLength(0);
  });
  it("wrong keys never advance; correct key down advances exactly once and rest requires Next", async () => {
    vi.useFakeTimers();
    const { c, audio } = setup(
      fixture([note("C") + note("D") + rest() + note("E")]),
    );
    c.mode("wait");
    await c.play();
    const tick = c.getSnapshot().tick;
    vi.advanceTimersByTime(60000);
    expect(c.getSnapshot().tick).toBe(tick);
    expect(audio.calls).toHaveLength(0);
    c.press("wrong", 61);
    expect(c.getSnapshot().step).toBe(0);
    c.release("wrong");
    c.press("correct", 60);
    expect(c.getSnapshot().step).toBe(1);
    vi.advanceTimersByTime(60000);
    expect(c.getSnapshot().step).toBe(1);
    c.release("correct");
    c.press("second", 62);
    expect(c.target?.pitch).toBeNull();
    c.press("not-rest", 64);
    expect(c.getSnapshot().step).toBe(2);
    c.nextRest();
    expect(c.target?.pitch?.midi).toBe(64);
    c.setLoop(false);
    c.press("last", 64);
    expect(c.getSnapshot().phase).toBe("ended");
  });
  it("wait loops to range start; held tied notes need no repeated press", async () => {
    const { c } = setup(
      fixture([
        note("C", 1920, '<tie type="start"/>'),
        note("C", 1920, '<tie type="stop"/>'),
      ]),
    );
    c.select(0, 1, false);
    c.mode("wait");
    await c.play();
    expect(c.steps).toHaveLength(1);
    c.press("key", 60);
    expect(c.getSnapshot().rounds).toBe(1);
    expect(c.getSnapshot().step).toBe(0);
  });
  it("free mode makes real note requests without any automatic progression; mode switch stops all voices", async () => {
    const { c, audio } = setup();
    await c.enable();
    c.mode("free");
    const stopped = audio.stopped;
    c.press("a", 60);
    c.press("b", 66);
    expect(audio.calls.map((n) => n.midi)).toEqual([60, 66]);
    c.release("a");
    c.release("b");
    expect(audio.releases).toEqual(["key:a", "key:b"]);
    const tick = c.getSnapshot().tick;
    audio.now = 200;
    c.pump();
    expect(c.getSnapshot().tick).toBe(tick);
    c.mode("wait");
    expect(audio.stopped).toBeGreaterThan(stopped);
  });
  it("blocked chords and repeat notation do not claim playback success", async () => {
    const { c, audio } = setup(fixture([note() + note("E", 480, "<chord/>")]));
    await c.play();
    expect(c.getSnapshot().phase).toBe("ready");
    expect(audio.calls).toHaveLength(0);
    const s = parseMusicXml(
      fixture([note() + '<barline><repeat direction="backward"/></barline>']),
    );
    c.load(s);
    await c.play();
    expect(audio.calls).toHaveLength(0);
    c.writtenOrderAccepted = true;
    await c.play();
    expect(c.getSnapshot().phase).toBe("playing");
  });
  it("voice switching stops audio and clamps a range when the target part is shorter", async () => {
    const { c, audio } = setup(
      fixture(
        [note(), note(), note()],
        "",
        `<part id="P2"><measure number="1"><attributes><divisions>480</divisions></attributes>${note("G")}</measure></part>`,
      ),
    );
    c.select(1, 2, false);
    await c.play();
    c.selectPart("P2");
    expect(c.getSnapshot()).toMatchObject({
      range: [0, 0],
      phase: "ready",
      tick: 0,
    });
    expect(c.getSnapshot().message).toContain("裁剪");
    expect(audio.stopped).toBeGreaterThan(1);
  });
  it("blocked audio initialization reports an error and never shows playing", async () => {
    const { c, audio } = setup();
    audio.enable = async () => {
      throw new Error("gesture blocked");
    };
    await c.play();
    expect(c.getSnapshot()).toMatchObject({
      phase: "paused",
      sound: "off",
      error: "gesture blocked",
    });
  });
});

it("defaults to a playable pitched melody when the first part has only unsupported chords",()=>{const {c}=setup(fixture([note()+note("E",480,"<chord/>")],"",`<part id="P2"><measure number="1"><attributes><divisions>480</divisions></attributes>${note("G")}</measure></part>`));expect(c.part?.id).toBe("P2");expect(c.track?.blocked).toHaveLength(0);});
