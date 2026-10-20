import type { Song } from "./song";

export const HARUHIKAGE: Song = {
  id: "haruhikage-crychic",
  title: "春日影（CRYCHIC ver.）",
  scoreIds: [],
  updatedAt: "",
};
export const HARUHIKAGE_REFERENCE = {
  videoId: "wRwQUk0Dl30",
  watchUrl: "https://www.youtube.com/watch?v=wRwQUk0Dl30",
  label: "CRYCHIC · 动画第 3 话官方片段",
};
export const isHaruhikage = (song?: Pick<Song, "id">) =>
  song?.id === HARUHIKAGE.id;
