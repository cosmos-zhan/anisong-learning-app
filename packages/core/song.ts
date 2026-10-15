/** Shared song identity; audio, lyrics and score practice retain independent timing. */
export interface Song {
  id: string;
  title: string;
  scoreIds: string[];
  updatedAt: string;
}
const KEY = "anisong:songs:v1";
export const DEMO_SONG: Song = {
  id: "demo-original",
  title: "小小的练习曲",
  scoreIds: [],
  updatedAt: "",
};
export function songs(): Song[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "[]").filter(
      (s: Song) =>
        typeof s.id === "string" &&
        typeof s.title === "string" &&
        Array.isArray(s.scoreIds),
    );
  } catch {
    return [];
  }
}
export function rememberSong(song: Song) {
  const stored = songs(),
    previous = stored.find((s) => s.id === song.id),
    all = stored.filter((s) => s.id !== song.id);
  const next = {
    ...song,
    scoreIds: Array.from(
      new Set([...(previous?.scoreIds ?? []), ...song.scoreIds]),
    ),
    updatedAt: new Date().toISOString(),
  };
  localStorage.setItem(KEY, JSON.stringify([next, ...all].slice(0, 100)));
  localStorage.setItem("anisong:currentSong", song.id);
  return next;
}
export function currentSong() {
  const id = localStorage.getItem("anisong:currentSong");
  return songs().find((s) => s.id === id) ?? DEMO_SONG;
}
