import type { NoteEvent } from './types';

/** Explicit practice projection, never a replacement for the source score. */
export function highestNotes(notes: NoteEvent[]): NoteEvent[] {
 const groups = new Map<number, NoteEvent>();
 for (const note of notes) {
  const previous = groups.get(note.tick);
  if (!previous || (note.pitch?.midi ?? -1) > (previous.pitch?.midi ?? -1)) groups.set(note.tick, note);
 }
 return [...groups.values()].sort((a,b)=>a.tick-b.tick);
}
