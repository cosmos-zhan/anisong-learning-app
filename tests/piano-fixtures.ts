import { readFileSync } from "node:fs";
import { parseMusicXml } from "../packages/piano/musicxml";
import type { PianoAudio } from "../packages/piano/types";
export const demoXml = readFileSync("public/demo/piano-demo.musicxml", "utf8");
export const demoScore = () => parseMusicXml(demoXml);
export function note(step = "C", duration = 480, extra = "", voice = "1") {
  return `<note><pitch><step>${step}</step><octave>4</octave></pitch><duration>${duration}</duration><voice>${voice}</voice><type>quarter</type>${extra}</note>`;
}
export const rest = (duration = 480) =>
  `<note><rest/><duration>${duration}</duration><voice>1</voice><type>quarter</type></note>`;
export function fixture(bars: string[], extraAttrs = "", extraPart = "") {
  return `<score-partwise version="4.0"><part-list><score-part id="P1"><part-name>Melody</part-name></score-part><score-part id="P2"><part-name>Second</part-name></score-part></part-list><part id="P1">${bars.map((bar, i) => `<measure number="${i + 1}">${i === 0 ? `<attributes><divisions>480</divisions><key><fifths>-2</fifths></key><time><beats>4</beats><beat-type>4</beat-type></time><clef><sign>G</sign><line>2</line></clef>${extraAttrs}</attributes><direction><sound tempo="120"/></direction>` : ""}${bar}</measure>`).join("")}</part>${extraPart}</score-partwise>`;
}
export class PianoTestAudio implements PianoAudio {
  now = 0;
  enabled = false;
  stopped = 0;
  disposed = false;
  calls: { id: string; midi: number; at: number; duration?: number }[] = [];
  releases: string[] = [];
  enable = async () => {
    this.enabled = true;
  };
  note(id: string, midi: number, at = this.now, duration?: number) {
    if (!this.enabled) throw new Error("Sound disabled");
    this.calls.push({ id, midi, at, duration });
  }
  release(id: string) {
    this.releases.push(id);
  }
  stop() {
    this.stopped++;
  }
  dispose() {
    this.disposed = true;
  }
}
