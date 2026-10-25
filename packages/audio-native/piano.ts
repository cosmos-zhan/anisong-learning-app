import { bridge } from "./index";
import type { PianoPlayback, PianoPlaybackEvent, PianoSequence } from "../piano/types";
export class NativePianoPlayback implements PianoPlayback {
  private listeners = new Set<(event: PianoPlaybackEvent) => void>();
  private handle = bridge.addListener("pianoEvent", event => {
    for (const listener of this.listeners) listener(event);
  });
  private revision = 0;
  async play(sequence: PianoSequence) {
    const revision = ++this.revision;
    await this.handle;
    if (revision !== this.revision) throw new Error("已取消");
    await bridge.playPiano(sequence);
  }
  private failed = () => { for (const listener of this.listeners) listener({ type: "error", code: "原生钢琴播放中断，请重试。" }); };
  stop() { ++this.revision; void bridge.stopPiano().catch(this.failed); }
  setLoop(loop: boolean) { void bridge.pianoLoop({ loop }).catch(this.failed); }
  sync() { void bridge.syncPiano().catch(this.failed); }
  subscribe(listener: (event: PianoPlaybackEvent) => void) {
    this.listeners.add(listener); return () => { this.listeners.delete(listener); };
  }
  dispose() { this.stop(); this.listeners.clear(); void this.handle.then(h => h.remove()).catch(() => undefined); }
}
