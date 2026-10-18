import "fake-indexeddb/auto";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, it, vi } from "vitest";
import { HARUHIKAGE, HARUHIKAGE_REFERENCE } from "../packages/core/presets";
import {
  DEMO_SONG,
  initialSong,
  rememberSong,
  songs,
} from "../packages/core/song";
import { PianoWorkspace } from "../apps/web/src/piano/PianoWorkspace";
import { OfficialReference } from "../apps/web/src/components/OfficialReference";
import { Workspace } from "../apps/web/src/Workspace";
import { App } from "../apps/web/src/App";
import { LoopController } from "../packages/core/controller";
import { PianoController } from "../packages/piano/controller";
import { PianoTestAudio, demoXml } from "./piano-fixtures";
import { TestEngine } from "./helpers";
vi.mock("../apps/web/src/bundled-audio.json", () => ({
  default: {
    available: false,
    src: "",
    sha256: "",
    bytes: 0,
    lyrics: null,
    score: null,
  },
}));
vi.mock("../apps/web/src/piano/ScoreView", () => ({
  ScoreView: () => <div>Imported fixture score</div>,
}));
beforeEach(() => {
  localStorage.clear();
  history.replaceState(null, "", "/");
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({ ok: true, text: async () => demoXml }),
  );
});

it("defaults to CRYCHIC and migrates the old built-in without deleting score links", () => {
  rememberSong({ ...DEMO_SONG, scoreIds: ["saved-original"] });
  expect(initialSong("").id).toBe(HARUHIKAGE.id);
  expect(songs().find((s) => s.id === DEMO_SONG.id)?.scoreIds).toEqual([
    "saved-original",
  ]);
  rememberSong(DEMO_SONG);
  expect(initialSong("").id).toBe(DEMO_SONG.id);
  expect(initialSong("?song=haruhikage-crychic").id).toBe(HARUHIKAGE.id);
});
it("preserves a previously imported song unless the CRYCHIC link is explicitly selected", () => {
  rememberSong({
    id: "private-local",
    title: "Local song",
    scoreIds: [],
    updatedAt: "",
  });
  expect(initialSong("").id).toBe("private-local");
  expect(initialSong("?song=haruhikage-crychic").id).toBe(HARUHIKAGE.id);
  expect(songs().some((s) => s.id === "private-local")).toBe(true);
});
it("CRYCHIC opens with honest missing-score state and sounding free keys, without fetching another melody", async () => {
  const audio = new PianoTestAudio(),
    c = new PianoController(audio);
  const ui = render(<PianoWorkspace song={HARUHIKAGE} active controller={c} />);
  await waitFor(() =>
    expect(screen.getByRole("status")).toHaveTextContent("已选 CRYCHIC 版"),
  );
  expect(fetch).not.toHaveBeenCalled();
  expect(c.score).toBeUndefined();
  expect(c.getSnapshot().mode).toBe("free");
  expect(screen.queryByRole("button", { name: "第 1 小节" })).toBeNull();
  expect(screen.getByRole("button", { name: "等待弹对" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "自动试听" })).toBeDisabled();
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: "启用声音" }));
  const key = screen.getByRole("button", { name: "琴键 C4" });
  fireEvent.keyDown(key, { key: "Enter" });
  fireEvent.keyUp(key, { key: "Enter" });
  expect(audio.calls.at(-1)?.midi).toBe(60);
  ui.unmount();
  c.dispose();
});
it("switching from a loaded score to the missing CRYCHIC score cancels old audio and clears all targets", async () => {
  const audio = new PianoTestAudio(),
    c = new PianoController(audio),
    ui = render(<PianoWorkspace song={DEMO_SONG} active controller={c} />);
  await screen.findByRole("button", { name: "第 8 小节" });
  await act(() => c.play());
  const stops = audio.stopped;
  ui.rerender(<PianoWorkspace song={HARUHIKAGE} active controller={c} />);
  await waitFor(() =>
    expect(screen.getByRole("status")).toHaveTextContent("已选 CRYCHIC 版"),
  );
  expect(c.steps).toHaveLength(0);
  expect(c.score).toBeUndefined();
  expect(audio.stopped).toBeGreaterThan(stops);
  expect(c.getSnapshot().phase).toBe("ready");
  ui.unmount();
  c.dispose();
});
it("a user-imported XML becomes the actual score and restores under the CRYCHIC identity", async () => {
  // This is the CC0 synthetic test fixture, not a transcription of Haruhikage.
  const c = new PianoController(new PianoTestAudio()),
    ui = render(<PianoWorkspace song={HARUHIKAGE} active controller={c} />);
  await waitFor(() =>
    expect(screen.getByRole("status")).toHaveTextContent("已选 CRYCHIC 版"),
  );
  const file = {
    name: "user-score.musicxml",
    size: demoXml.length,
    arrayBuffer: async () => new TextEncoder().encode(demoXml).buffer,
  };
  fireEvent.change(screen.getByLabelText("导入 MusicXML 或 MXL"), {
    target: { files: [file] },
  });
  await screen.findByRole("button", { name: "第 8 小节" });
  expect(c.score?.xml).toBe(demoXml);
  await waitFor(() =>
    expect(
      localStorage.getItem(`anisong:lastScore:${HARUHIKAGE.id}`),
    ).not.toBeNull(),
  );
  ui.unmount();
  c.dispose();
  const restored = new PianoController(new PianoTestAudio()),
    next = render(
      <PianoWorkspace song={HARUHIKAGE} active controller={restored} />,
    );
  await screen.findByRole("button", { name: "第 8 小节" });
  expect(restored.score?.xml).toBe(demoXml);
  expect(fetch).not.toHaveBeenCalled();
  next.unmount();
  restored.dispose();
});
it("official reference loads only on demand, uses the verified episode-3 video, and disappears when inactive", async () => {
  const user = userEvent.setup(),
    pause = vi.fn(),
    ui = render(<OfficialReference active onOpen={pause} />);
  expect(screen.queryByTitle("春日影 CRYCHIC 官方试听")).toBeNull();
  await user.click(screen.getByRole("button", { name: "官方试听（片段）" }));
  expect(pause).toHaveBeenCalledOnce();
  expect(screen.getByTitle("春日影 CRYCHIC 官方试听")).toHaveAttribute(
    "src",
    `https://www.youtube-nocookie.com/embed/${HARUHIKAGE_REFERENCE.videoId}?playsinline=1&rel=0`,
  );
  expect(screen.getByRole("link", { name: "打开官方视频 ↗" })).toHaveAttribute(
    "href",
    HARUHIKAGE_REFERENCE.watchUrl,
  );
  ui.rerender(<OfficialReference active={false} onOpen={pause} />);
  expect(screen.queryByRole("dialog")).toBeNull();
});
it("lyrics preset does not silently auto-load the original audio under the CRYCHIC title", () => {
  const engine = new TestEngine(),
    load = vi.spyOn(engine, "load"),
    c = new LoopController(engine),
    ui = render(
      <App
        initialSong={HARUHIKAGE}
        controller={c}
        bundledAudio={{ available: false, src: "", sha256: "", bytes: 0 }}
      />,
    );
  expect(screen.getByRole("heading", { name: HARUHIKAGE.title })).toBeVisible();
  expect(load).not.toHaveBeenCalled();
  expect(fetch).not.toHaveBeenCalled();
  expect(c.getSnapshot().duration).toBe(0);
  ui.unmount();
  c.dispose();
});
it("the shared workspace CRYCHIC deep link selects the same song without loading a fake score", async () => {
  history.replaceState(null, "", "?song=haruhikage-crychic#piano");
  const ui = render(<Workspace />);
  await waitFor(() =>
    expect(screen.getByRole("status")).toHaveTextContent("已选 CRYCHIC 版"),
  );
  expect(screen.getByRole("heading", { name: "春日影" })).toBeVisible();
  expect(localStorage.getItem("anisong:currentSong")).toBe(HARUHIKAGE.id);
  expect(fetch).not.toHaveBeenCalled();
  ui.unmount();
});
