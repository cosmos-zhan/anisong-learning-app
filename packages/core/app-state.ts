import type { Labels } from "../piano/types";

const read = <T>(key: string, fallback: T): T => {
  try {
    return JSON.parse(localStorage.getItem(key) ?? "null") ?? fallback;
  } catch {
    return fallback;
  }
};
export interface Preferences {
  speed: number;
  labels: Labels;
}
export function preferences(): Preferences {
  const p = read<Preferences>("anisong:preferences", {
    speed: 0.75,
    labels: "name",
  });
  return {
    speed: [0.5, 0.75, 1].includes(p.speed) ? p.speed : 0.75,
    labels: ["name", "solfege", "none"].includes(p.labels) ? p.labels : "name",
  };
}
export function savePreferences(value: Preferences) {
  localStorage.setItem("anisong:preferences", JSON.stringify(value));
}
export interface PracticeRecord {
  songId: string;
  module: "lyrics" | "piano";
  range: [number, number] | null;
  speed: number;
  loop: boolean;
  mode: string;
  savedAt: string;
}
export function practiceRecords(): PracticeRecord[] {
  const rows = read<PracticeRecord[]>("anisong:recents", []);
  return Array.isArray(rows)
    ? rows.filter(
        (r) =>
          r &&
          typeof r.songId === "string" &&
          ["lyrics", "piano"].includes(r.module) &&
          Number.isFinite(r.speed) &&
          typeof r.savedAt === "string" &&
          typeof r.loop === "boolean" &&
          typeof r.mode === "string" &&
          (r.range === null ||
            (Array.isArray(r.range) &&
              r.range.length === 2 &&
              r.range.every((n) => Number.isInteger(n) && n >= 0))),
      )
    : [];
}
export function rememberPractice(record: PracticeRecord) {
  const rows = practiceRecords().filter(
    (r) => r.songId !== record.songId || r.module !== record.module,
  );
  localStorage.setItem(
    "anisong:recents",
    JSON.stringify([record, ...rows].slice(0, 30)),
  );
}
export interface MaterialSummary {
  audio?: string;
  duration?: number;
  lyrics?: number;
  score?: string;
  bars?: number;
  parts?: number;
}
export function materialSummary(id: string): MaterialSummary {
  return read(`anisong:materials:${id}`, {});
}
export function saveMaterialSummary(id: string, patch: MaterialSummary) {
  localStorage.setItem(
    `anisong:materials:${id}`,
    JSON.stringify({ ...materialSummary(id), ...patch }),
  );
}

/** Browser-local data only. A transaction must commit before reporting a save. */
export interface LocalMaterial {
  id: string;
  blob?: Blob;
  text?: string;
  source?: string;
  name: string;
  download?: {
    songId: string; title: string; revision: string; bytes: number;
    downloadedAt: string; summary: MaterialSummary;
  };
}
async function materialTransaction<T>(
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    const r = indexedDB.open("anisong-materials", 1);
    r.onupgradeneeded = () =>
      r.result.createObjectStore("materials", { keyPath: "id" });
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction("materials", mode),
        r = run(tx.objectStore("materials"));
      let result: T;
      r.onsuccess = () => {
        result = r.result;
      };
      tx.oncomplete = () => resolve(result);
      tx.onabort = () => reject(tx.error ?? r.error);
      tx.onerror = () => reject(tx.error ?? r.error);
    });
  } finally {
    db.close();
  }
}
export const materialStore = {
  all: () => materialTransaction<LocalMaterial[]>("readonly", s => s.getAll()),
  get: (id: string) =>
    materialTransaction<LocalMaterial | undefined>("readonly", (s) =>
      s.get(id),
    ),
  put: (value: LocalMaterial) =>
    materialTransaction("readwrite", (s) => s.put(value)),
  removeDownload: (songId:string) => {
    if(!/^[a-z0-9][a-z0-9-]{0,79}$/.test(songId))throw new Error('无效歌曲编号。');
    return materialTransaction('readwrite',store=>{
      for(const kind of ['audio','lyrics','score'])store.delete(`${songId}:${kind}`);
      return store.delete(`${songId}:download`);
    });
  },
  putMany: async (values: LocalMaterial[], signal?: AbortSignal) => {
    if (signal?.aborted) throw new DOMException("已取消", "AbortError");
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const r = indexedDB.open("anisong-materials", 1);
      r.onupgradeneeded = () => r.result.createObjectStore("materials", { keyPath: "id" });
      r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error);
    });
    try {
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction("materials", "readwrite");
        const abort = () => tx.abort();
        signal?.addEventListener("abort", abort, { once: true });
        tx.oncomplete = () => { signal?.removeEventListener("abort", abort); resolve(); };
        tx.onabort = tx.onerror = () => { signal?.removeEventListener("abort", abort); reject(tx.error ?? new DOMException("保存已取消", "AbortError")); };
        if (signal?.aborted) { tx.abort(); return; }
        const store = tx.objectStore("materials");
        for (const value of values) store.put(value);
      });
    } finally { db.close(); }
  },
};
