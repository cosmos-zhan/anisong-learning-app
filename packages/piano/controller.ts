import {
  buildSteps,
  rangeIndices,
  secondsBetween,
  tickAfter,
} from "./timeline";
import type {
  PianoAudio,
  PianoPlayback,
  PianoPlaybackEvent,
  PianoSession,
  PianoState,
  PracticeMode,
  Score,
  ScorePart,
  Step,
  Track,
} from "./types";

export class PianoController {
  private listeners = new Set<() => void>();
  private timer?: ReturnType<typeof setInterval>;
  private generation = 0;
  private scheduled = new Set<string>();
  private originTime = 0;
  private originTick = 0;
  score?: Score;
  part?: ScorePart;
  track?: Track;
  steps: Step[] = [];
  writtenOrderAccepted = false;
  private state: PianoState = {
    mode: "listen",
    phase: "ready",
    speed: 1,
    loop: true,
    range: [0, 0],
    tick: 0,
    step: 0,
    rounds: 0,
    epoch: 0,
    error: "",
    message: "",
    sound: "off",
  };
  private removeInterruption?: () => void;
  private nativeSequence = false;
  private removePlayback?: () => void;
  constructor(readonly audio: PianoAudio, readonly playback?: PianoPlayback) {
    this.removePlayback = playback?.subscribe(event => this.nativeEvent(event));
    this.removeInterruption = audio.onInterruption?.(() => {
      if (this.nativeSequence) { this.update({ sound: "off" }); return; }
      this.cancel();
      this.update({
        phase: "paused",
        sound: "off",
        message: "音频被系统中断，请点击启用声音或播放重试。",
      });
    });
  }
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  getSnapshot = () => this.state;
  private update(patch: Partial<PianoState>) {
    this.state = { ...this.state, ...patch, epoch: this.generation };
    for (const listener of this.listeners) listener();
  }
  private cancel() {
    ++this.generation;
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
    this.scheduled.clear();
    this.nativeSequence = false;
    this.playback?.stop();
    this.audio.stop();
  }
  get backgroundPlayback() { return !!this.playback; }
  syncPlayback() { if (this.nativeSequence) this.playback?.sync(); }
  private nativeEvent(event: PianoPlaybackEvent) {
    if (!this.nativeSequence || !this.score || !this.part) return;
    if (event.type === "position") {
      if (this.state.phase === "preparing") return;
      const start = this.part.measures[this.state.range[0]].tick;
      const last = this.part.measures[this.state.range[1]];
      const tick = tickAfter(this.score.tempos, start, last.tick + last.duration, event.position, 1);
      this.update({ tick, step: Math.max(0, this.steps.findIndex(s => s.end > tick)), rounds: event.rounds ?? this.state.rounds });
    } else if (event.type === "playing") {
      // Clearing the previous media item emits pause before PCM is ready.
      // Keep the preparation cancellable until the new player actually starts.
      if (this.state.phase === "preparing" && !event.playing) return;
      if (this.state.phase !== "ended") this.update({ phase: event.playing ? "playing" : "paused", message: "" });
    } else if (event.type === "loop") this.update({ rounds: event.rounds });
    else if (event.type === "end") {
      const last = this.part.measures[this.state.range[1]];
      this.update({ phase: "ended", tick: last.tick + last.duration, step: this.steps.length - 1 });
    } else if (event.type === "error") {
      this.cancel(); this.update({ phase: "paused", error: event.code });
    }
  }
  private rebuild() {
    if (this.score && this.part && this.track)
      this.steps = buildSteps(
        this.score,
        this.part,
        this.track,
        this.state.range,
      );
  }
  clear() {
    this.cancel();
    this.score = undefined;
    this.part = undefined;
    this.track = undefined;
    this.steps = [];
    this.writtenOrderAccepted = false;
    this.update({
      mode: "free",
      phase: "ready",
      range: [0, 0],
      tick: 0,
      step: 0,
      rounds: 0,
      error: "",
      message: "",
    });
  }
  private melody(part: ScorePart, track: Track) {
    return (
      !track.blocked.length &&
      part.measures.some((m) =>
        m.events.some(
          (e) => e.staff === track.staff && e.voice === track.voice && e.pitch,
        ),
      )
    );
  }
  load(
    score: Score,
    partId?: string,
    trackId?: string,
    session?: PianoSession,
  ) {
    this.cancel();
    this.score = score;
    this.part =
      score.parts.find((p) => p.id === (partId ?? session?.partId)) ??
      score.parts.find((p) => p.tracks.some((t) => !t.projection&&this.melody(p, t))) ??
      score.parts[0];
    this.track =
      this.part.tracks.find((t) => t.id === (trackId ?? session?.trackId)) ??
      this.part.tracks.find((t) => !t.projection&&this.melody(this.part!, t)) ??
      this.part.tracks[0];
    this.writtenOrderAccepted = false;
    const find = (id?: string) =>
      this.part!.measures.findIndex((m) => m.id === id);
    const range = rangeIndices(
      this.part,
      Math.max(0, find(session?.range.startMeasureId)),
      Math.max(0, find(session?.range.endMeasureId)),
    );
    const start = this.part.measures[range[0]].tick,
      end =
        this.part.measures[range[1]].tick +
        this.part.measures[range[1]].duration;
    const tick =
      session && Number.isFinite(session.tick)
        ? Math.max(start, Math.min(end - 0.001, session.tick))
        : start;
    this.update({
      range,
      tick,
      phase: "ready",
      step: 0,
      rounds: 0,
      error: "",
      message: "",
      mode: session?.mode ?? "listen",
      speed: [0.5, 0.75, 1, 1.25].includes(session?.speed ?? 1)
        ? (session?.speed ?? 1)
        : 1,
      loop: session?.loop ?? true,
    });
    this.rebuild();
    this.update({
      step: Math.max(
        0,
        this.steps.findIndex((s) => s.end > tick),
      ),
    });
  }
  selectPart(partId: string, trackId?: string) {
    if (!this.score) return;
    const old = this.state;
    const selected = this.score.parts.find((p) => p.id === partId);
    if (!selected) return;
    this.cancel();
    this.part = selected;
    this.track =
      selected.tracks.find((t) => t.id === trackId) ??
      selected.tracks.find((t) => !t.projection&&this.melody(selected, t)) ??
      selected.tracks[0];
    const range = rangeIndices(selected, ...old.range);
    this.update({
      range,
      phase: "ready",
      tick: selected.measures[range[0]].tick,
      step: 0,
      error: "",
      message:
        range[1] !== old.range[1] ? "声部小节较少，范围已安全裁剪。" : "",
    });
    this.rebuild();
  }
  select(a: number, b = a, autoplay = true) {
    if (!this.part) return;
    this.cancel();
    const range = rangeIndices(this.part, a, b);
    this.update({
      range,
      tick: this.part.measures[range[0]].tick,
      step: 0,
      rounds: 0,
      phase: "ready",
      message: "",
      error: "",
    });
    this.rebuild();
    if (autoplay && this.state.mode !== "free") void this.play();
  }
  get trackBlocked() {
    if (this.state.mode === "free") return "";
    const problems = this.state.mode === "listen"
      ? this.track?.listenBlocked ?? this.track?.blocked
      : this.track?.blocked;
    return problems?.join(" ") ?? "";
  }
  get blocked() {
    if (this.state.mode === "free") return "";
    return (
      this.trackBlocked ||
      (this.score?.needsWrittenOrder && !this.writtenOrderAccepted
        ? "此谱有反复或跳转，请先确认按书写顺序练习。"
        : "")
    );
  }
  get target() {
    return this.steps[this.state.step];
  }
  async enable() {
    try {
      await this.audio.enable();
      this.update({ sound: "ready", error: "" });
      return true;
    } catch (error) {
      this.cancel();
      this.update({
        sound: "off",
        phase: "paused",
        error: (error as Error).message,
      });
      return false;
    }
  }
  async play() {
    if (!this.steps.length || this.state.mode === "free") return;
    if (this.blocked) {
      this.update({ error: this.blocked });
      return;
    }
    this.cancel();
    const generation = this.generation;
    try {
      await this.audio.enable();
      if (generation !== this.generation) return;
    } catch (error) {
      if (generation === this.generation)
        this.update({
          phase: "paused",
          sound: "off",
          error: (error as Error).message,
        });
      return;
    }
    if (this.state.phase === "ended")
      this.update({ tick: this.steps[0].tick, step: 0 });
    this.update({
      sound: "ready",
      phase: this.state.mode === "wait" ? "waiting" : this.playback ? "preparing" : "playing",
      error: "",
      message: "",
    });
    if (this.state.mode === "wait") return;
    if (this.playback && this.score && this.part) {
      const start = this.part.measures[this.state.range[0]].tick;
      const last = this.part.measures[this.state.range[1]];
      const end = last.tick + last.duration;
      const duration = secondsBetween(this.score.tempos, start, end, 1);
      this.nativeSequence = true;
      this.update({ phase: "preparing", message: "正在准备试听，可随时取消…" });
      try {
        await this.playback.play({
          notes: this.steps.filter(s => s.pitch).map(s => ({
            at: secondsBetween(this.score!.tempos, start, s.tick, 1),
            duration: secondsBetween(this.score!.tempos, s.tick, s.end, 1),
            midi: s.pitch!.midi,
          })), duration,
          position: secondsBetween(this.score.tempos, start, this.state.tick, 1),
          speed: this.state.speed, loop: this.state.loop,
        });
        if (generation === this.generation) {
          // Rendering captured the old loop value; apply any change made while
          // it was running before handing control back to the player UI.
          this.playback.setLoop(this.state.loop);
          if (this.state.phase === "preparing")
            this.update({ phase: "playing", message: "" });
        }
      } catch (error) {
        if (generation === this.generation) {
          this.cancel(); this.update({ phase: "paused", error: (error as Error).message, message: "" });
        }
      }
      return;
    }
    this.originTick = this.state.tick;
    this.originTime = this.audio.now + 0.03;
    this.pump();
    if (this.state.phase === "playing")
      this.timer = setInterval(() => this.pump(), 20);
  }
  /** The audio clock drives both queued sound and UI position; no synthetic progress clock. */
  pump() {
    if (this.nativeSequence || this.state.phase !== "playing" || !this.score || !this.steps.length)
      return;
    const { tempos } = this.score,
      { speed, loop } = this.state,
      start = this.part!.measures[this.state.range[0]].tick,
      lastMeasure = this.part!.measures[this.state.range[1]],
      end = lastMeasure.tick + lastMeasure.duration;
    const full = secondsBetween(tempos, start, end, speed),
      first = secondsBetween(tempos, this.originTick, end, speed),
      elapsed = Math.max(0, this.audio.now - this.originTime);
    if (full <= 0) return;
    if (!loop && elapsed >= first) {
      this.cancel();
      this.update({ phase: "ended", tick: end, step: this.steps.length - 1 });
      return;
    }
    const cycle =
      elapsed < first ? 0 : 1 + Math.floor((elapsed - first) / full);
    const local = cycle === 0 ? elapsed : (elapsed - first) % full;
    const tick = tickAfter(
      tempos,
      cycle === 0 ? this.originTick : start,
      end,
      local,
      speed,
    );
    const step = Math.max(
      0,
      this.steps.findIndex((s) => s.end > tick),
    );
    this.update({ tick, step, rounds: cycle });
    const horizon = this.audio.now + 0.12;
    try {
      for (let c = cycle; c <= cycle + 2; c++) {
        if (!loop && c > 0) break;
        const offset =
          c === 0 ? this.originTime : this.originTime + first + (c - 1) * full;
        const from = c === 0 ? this.originTick : start;
        if (offset > horizon) break;
        this.steps.forEach((event, i) => {
          if (!event.pitch || event.end <= from) return;
          const at =
              offset +
              secondsBetween(tempos, from, Math.max(from, event.tick), speed),
            until = offset + secondsBetween(tempos, from, event.end, speed);
          const key = `${c}:${i}`;
          if (
            at <= horizon &&
            until > this.audio.now &&
            !this.scheduled.has(key)
          ) {
            this.scheduled.add(key);
            this.audio.note(
              `auto:${this.generation}:${key}`,
              event.pitch.midi,
              Math.max(at, this.audio.now),
              until - Math.max(at, this.audio.now),
            );
          }
        });
      }
      for (const key of this.scheduled)
        if (Number(key.split(":")[0]) < cycle - 1) this.scheduled.delete(key);
    } catch (error) {
      this.cancel();
      this.update({
        phase: "paused",
        sound: "off",
        error: (error as Error).message,
      });
    }
  }
  pause(message = "") {
    if (this.state.phase === "playing") this.pump();
    this.cancel();
    this.update({
      phase: this.state.phase === "ended" ? "ended" : "paused",
      message,
    });
  }
  restart() {
    if (!this.part) return;
    this.select(...this.state.range, false);
    if (this.state.mode !== "free") void this.play();
  }
  mode(mode: PracticeMode) {
    this.cancel();
    this.update({
      mode,
      phase: "ready",
      step: 0,
      tick: this.steps[0]?.tick ?? 0,
      message: "",
      error: "",
    });
  }
  setSpeed(speed: number) {
    if (![0.5, 0.75, 1, 1.25].includes(speed)) return;
    if (this.state.mode !== "listen") {
      this.update({ speed });
      return;
    }
    const running = this.state.phase === "playing";
    this.pause();
    this.update({ speed });
    if (running) void this.play();
  }
  setLoop(loop: boolean) {
    this.update({ loop });
    if (this.nativeSequence) this.playback?.setLoop(loop);
  }
  press(token: string, midi: number) {
    if (this.state.sound !== "ready") {
      this.update({ error: "请先点击“启用声音”，再弹奏琴键。" });
      return;
    }
    try {
      this.audio.note(`key:${token}`, midi);
    } catch (error) {
      this.cancel();
      this.update({
        sound: "off",
        phase: "paused",
        error: (error as Error).message,
      });
      return;
    }
    if (this.state.mode === "wait" && this.state.phase === "waiting") {
      if (this.target?.pitch?.midi === midi) this.advance();
      else
        this.update({
          message: this.target?.pitch
            ? "这个音不同，请按高亮的目标键。"
            : "当前为休止，请点“下一步（休止）”。",
        });
    }
  }
  release(token: string) {
    this.audio.release(`key:${token}`);
  }
  nextRest() {
    if (
      this.state.mode === "wait" &&
      this.state.phase === "waiting" &&
      !this.target?.pitch
    )
      this.advance();
  }
  private advance() {
    const next = this.state.step + 1;
    if (next >= this.steps.length) {
      if (this.state.loop)
        this.update({
          step: 0,
          tick: this.steps[0].tick,
          rounds: this.state.rounds + 1,
          message: "新一轮，请继续。",
        });
      else {
        this.update({
          phase: "ended",
          tick: this.steps.at(-1)!.end,
          message: "所选范围已完成。",
        });
      }
      return;
    }
    this.update({ step: next, tick: this.steps[next].tick, message: "" });
  }
  dispose() {
    this.cancel();
    this.removeInterruption?.();
    this.removePlayback?.();
    this.playback?.dispose();
    this.audio.dispose();
    this.listeners.clear();
  }
}
