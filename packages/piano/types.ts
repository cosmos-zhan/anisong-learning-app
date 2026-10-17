export const PPQ = 480;
export type PracticeMode = "listen" | "wait" | "free";
export type Labels = "none" | "name" | "solfege";
export interface Pitch {
  step: string;
  alter: number;
  octave: number;
  midi: number;
}
export interface NoteEvent {
  id: string;
  measure: number;
  tick: number;
  duration: number;
  staff: string;
  voice: string;
  pitch: Pitch | null;
  chord: boolean;
  tieStart: boolean;
  tieStop: boolean;
}
export interface Measure {
  id: string;
  label: string;
  index: number;
  tick: number;
  duration: number;
  fifths: number;
  beats: number;
  beatType: number;
  events: NoteEvent[];
}
export interface Track {
  id: string;
  staff: string;
  voice: string;
  blocked: string[];
  projection?: "highest";
}
export interface ScorePart {
  id: string;
  name: string;
  measures: Measure[];
  tracks: Track[];
}
export interface Tempo {
  tick: number;
  bpm: number;
}
export interface Score {
  id: string;
  title: string;
  xml: string;
  format: "musicxml" | "mxl";
  parts: ScorePart[];
  tempos: Tempo[];
  warnings: string[];
  needsWrittenOrder: boolean;
}
export interface PracticeRange {
  startMeasureId: string;
  endMeasureId: string;
}
export interface Step {
  tick: number;
  end: number;
  pitch: Pitch | null;
  noteIds: string[];
  segments: { id: string; tick: number; end: number; measure: number }[];
}
export interface PianoSession {
  partId: string;
  trackId: string;
  range: PracticeRange;
  mode: PracticeMode;
  speed: number;
  loop: boolean;
  labels: Labels;
  tick: number;
  practicedAt: string;
}
export interface PianoState {
  mode: PracticeMode;
  phase: "ready" | "playing" | "waiting" | "paused" | "ended";
  speed: number;
  loop: boolean;
  range: [number, number];
  tick: number;
  step: number;
  rounds: number;
  epoch: number;
  error: string;
  message: string;
  sound: "off" | "ready";
}
export interface PianoAudio {
  readonly now: number;
  enable(): Promise<void>;
  note(id: string, midi: number, at?: number, duration?: number): void;
  release(id: string): void;
  stop(): void;
  dispose(): void;
  onInterruption?(listener: () => void): () => void;
}
