import {
  PPQ,
  type Score,
  type ScorePart,
  type Step,
  type Tempo,
  type Track,
} from "./types";
import {highestNotes} from './projection';

export function rangeIndices(
  part: ScorePart,
  a: number,
  b: number,
): [number, number] {
  const clamp = (n: number) =>
    Math.max(
      0,
      Math.min(
        part.measures.length - 1,
        Number.isFinite(n) ? Math.trunc(n) : 0,
      ),
    );
  return [Math.min(clamp(a), clamp(b)), Math.max(clamp(a), clamp(b))];
}
export function secondsBetween(
  tempos: Tempo[],
  start: number,
  end: number,
  speed = 1,
) {
  let tick = start,
    bpm = tempos[0]?.bpm ?? 100,
    seconds = 0;
  for (const tempo of tempos) {
    if (tempo.tick <= start) {
      bpm = tempo.bpm;
      continue;
    }
    if (tempo.tick >= end) break;
    seconds += (((tempo.tick - tick) / PPQ) * 60) / bpm;
    tick = tempo.tick;
    bpm = tempo.bpm;
  }
  return (seconds + ((Math.max(0, end - tick) / PPQ) * 60) / bpm) / speed;
}
export function tickAfter(
  tempos: Tempo[],
  start: number,
  end: number,
  seconds: number,
  speed: number,
) {
  let lo = start,
    hi = end;
  for (let i = 0; i < 36; i++) {
    const mid = (lo + hi) / 2;
    if (secondsBetween(tempos, start, mid, speed) < seconds) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}
export function buildSteps(
  score: Score,
  part: ScorePart,
  track: Track,
  range: [number, number],
): Step[] {
  void score;
  const [a, b] = rangeIndices(part, ...range);
  const start = part.measures[a].tick;
  const end = part.measures[b].tick + part.measures[b].duration;
  const sourceNotes = part.measures
    .slice(a, b + 1)
    .flatMap((m) => m.events)
    .filter((e) => e.staff === track.staff && e.voice === track.voice)
    .sort((x, y) => x.tick - y.tick);
  const notes=track.projection==='highest'?highestNotes(sourceNotes):sourceNotes;
  const result: Step[] = [];
  let cursor = start;
  // Chord tones have independent ties; adjacent XML order is not tie identity.
  const ties = new Map<number, Step>();
  for (const note of notes) {
    if (note.tick > cursor + 0.01)
      result.push({
        tick: cursor,
        end: note.tick,
        pitch: null,
        noteIds: [],
        segments: [],
      });
    const previous = note.pitch ? ties.get(note.pitch.midi) : undefined;
    if (
      previous &&
      note.tieStop &&
      previous.pitch?.midi === note.pitch?.midi &&
      note.pitch &&
      Math.abs(previous.end - note.tick) < 0.01
    ) {
      previous.end = note.tick + note.duration;
      previous.noteIds.push(note.id);
      previous.segments.push({
        id: note.id,
        tick: note.tick,
        end: note.tick + note.duration,
        measure: note.measure,
      });
    } else {
      const next: Step = {
        tick: note.tick,
        end: note.tick + note.duration,
        pitch: note.pitch,
        noteIds: [note.id],
        segments: [
          {
            id: note.id,
            tick: note.tick,
            end: note.tick + note.duration,
            measure: note.measure,
          },
        ],
      };
      result.push(next);
      if (note.pitch && note.tieStart) ties.set(note.pitch.midi, next);
    }
    if (note.pitch && !note.tieStart) ties.delete(note.pitch.midi);
    cursor = Math.max(cursor, note.tick + note.duration);
  }
  if (cursor < end - 0.01)
    result.push({ tick: cursor, end, pitch: null, noteIds: [], segments: [] });
  return result;
}
export function pitchLabel(
  pitch: { step: string; alter: number; octave: number },
  solfege = false,
) {
  const accidental =
    pitch.alter > 0
      ? "♯".repeat(Math.min(2, pitch.alter))
      : "♭".repeat(Math.min(2, -pitch.alter));
  const names: Record<string, string> = {
    C: "Do",
    D: "Re",
    E: "Mi",
    F: "Fa",
    G: "Sol",
    A: "La",
    B: "Si",
  };
  return `${solfege ? names[pitch.step] : pitch.step}${accidental}${solfege ? "" : pitch.octave}`;
}
