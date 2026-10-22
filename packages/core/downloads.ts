import { materialStore, type LocalMaterial } from "./app-state";
import { parseLrc } from "./lrc";
import { readScore } from "../piano/musicxml";

export interface RemoteAsset { url: string; name: string; bytes: number; sha256: string }
export interface RemoteSong {
  id: string; title: string; revision: string;
  audio: RemoteAsset; lyrics?: RemoteAsset; score?: RemoteAsset;
}
export interface MediaCatalog { schema: 1; title: string; songs: RemoteSong[] }
export interface DownloadProgress { phase: string; received: number; total: number }
const LIMITS = { audio: 30 * 1024 * 1024, lyrics: 128 * 1024, score: 4 * 1024 * 1024 };
const abortCheck = (signal: AbortSignal) => { if (signal.aborted) throw new DOMException("下载已取消", "AbortError"); };
export function sourceUrl(input: string, base = location.href): URL {
  const url = new URL(input, base);
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password ||
      (url.protocol !== 'https:' && url.origin !== new URL(base).origin))
    throw new Error("请使用 HTTPS 素材地址；不支持账号密码写在地址中。");
  url.hash = "";
  return url;
}
export function parseCatalog(value: unknown, address: string): MediaCatalog {
  const d = value as Partial<MediaCatalog>;
  if (!d || d.schema !== 1 || typeof d.title !== 'string' || !d.title.trim() || d.title.length > 120 || !Array.isArray(d.songs) || !d.songs.length || d.songs.length > 100)
    throw new Error("素材目录格式不正确（需要 schema: 1 和歌曲列表）。");
  const ids = new Set<string>();
  const songs = d.songs.map(row => {
    if (!row || typeof row.id !== 'string' || !/^[a-z0-9][a-z0-9-]{0,79}$/.test(row.id) || ids.has(row.id) || typeof row.title !== 'string' || !row.title.trim() || row.title.length > 120 || typeof row.revision !== 'string' || !row.revision || row.revision.length > 80)
      throw new Error("素材目录包含无效或重复的歌曲信息。");
    ids.add(row.id);
    const asset = (key: keyof typeof LIMITS): RemoteAsset | undefined => {
      const item = row[key];
      if (!item && key !== 'audio') return;
      if (!item || typeof item.url !== 'string' || typeof item.name !== 'string' || !item.name || item.name.length > 160 || /[/\\]/.test(item.name) || !Number.isSafeInteger(item.bytes) || item.bytes <= 0 || item.bytes > LIMITS[key] || !/^[a-f0-9]{64}$/i.test(item.sha256))
        throw new Error("素材文件缺少有效大小或 SHA-256，或超过文件限制。");
      return { ...item, sha256: item.sha256.toLowerCase(), url: sourceUrl(item.url, address).href };
    };
    return { id: row.id, title: row.title.trim(), revision: row.revision, audio: asset('audio')!, lyrics: asset('lyrics'), score: asset('score') };
  });
  return { schema: 1, title: d.title.trim(), songs };
}

async function bytesFrom(url: string, limit: number, signal: AbortSignal, progress?: (received: number) => void): Promise<Uint8Array> {
  abortCheck(signal);
  const response = await fetch(url, { signal, credentials: 'same-origin', cache: 'no-store' });
  if (!response.ok) throw new Error(`下载失败（HTTP ${response.status}）。请检查地址或访问授权。`);
  if (Number(response.headers.get('content-length')) > limit) throw new Error("下载文件超过目录声明的大小，已停止。");
  const reader = response.body?.getReader();
  if (!reader) {
    const data = new Uint8Array(await response.arrayBuffer());
    if (data.length > limit) throw new Error("下载文件超过大小限制。");
    abortCheck(signal); progress?.(data.length); return data;
  }
  const chunks: Uint8Array[] = []; let size = 0;
  try {
    while (true) {
      abortCheck(signal);
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > limit) throw new Error("下载文件超过目录声明的大小，已停止。");
      chunks.push(value); progress?.(size);
    }
  } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
  abortCheck(signal);
  const result = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) { result.set(chunk, offset); offset += chunk.length; }
  return result;
}
export async function loadCatalog(address: string, signal: AbortSignal): Promise<MediaCatalog> {
  const url = sourceUrl(address).href;
  const bytes = await bytesFrom(url, 512 * 1024, signal);
  try { return parseCatalog(JSON.parse(new TextDecoder('utf-8', {fatal:true}).decode(bytes)), url); }
  catch (error) { if (error instanceof SyntaxError) throw new Error("地址返回的不是歌曲目录，可能是登录页或分享页面。请使用目录 JSON 的直链。"); throw error; }
}
export async function downloadSong(song: RemoteSong, signal: AbortSignal, progress: (value: DownloadProgress) => void): Promise<LocalMaterial> {
  if (!crypto.subtle) throw new Error("当前环境无法校验文件，请通过 HTTPS 打开应用。");
  const total = song.audio.bytes + (song.lyrics?.bytes ?? 0) + (song.score?.bytes ?? 0);
  let received = 0;
  const rows: LocalMaterial[] = [];
  const summary: NonNullable<LocalMaterial['download']>['summary'] = {};
  for (const key of ['audio', 'lyrics', 'score'] as const) {
    const asset = song[key]; if (!asset) continue;
    const phase = { audio:'下载音频', lyrics:'下载歌词', score:'下载乐谱' }[key];
    const data = await bytesFrom(asset.url, asset.bytes, signal, n => progress({phase,received:received+n,total}));
    if (data.length !== asset.bytes) throw new Error("文件下载不完整，原有本地资料已保留。请重试。");
    progress({phase:'校验文件',received:received+data.length,total});
    const buffer = data.buffer as ArrayBuffer;
    const digest = [...new Uint8Array(await crypto.subtle.digest('SHA-256', buffer))].map(b=>b.toString(16).padStart(2,'0')).join('');
    if (digest !== asset.sha256) throw new Error("文件校验不一致，未保存下载内容。请刷新素材目录后重试。");
    abortCheck(signal);
    if (key === 'audio') {
      rows.push({ id:`${song.id}:audio`, name:asset.name, blob:new Blob([buffer], {type:'application/octet-stream'}) });
      summary.audio = asset.name;
    } else if (key === 'lyrics') {
      const text = new TextDecoder('utf-8',{fatal:true}).decode(data);
      summary.lyrics = parseLrc(text).lines.length;
      rows.push({id:`${song.id}:lyrics`,name:asset.name,text});
    } else {
      const score = await readScore({name:asset.name,size:data.length,arrayBuffer:async()=>buffer});
      summary.score = score.title; summary.bars = score.parts[0]?.measures.length ?? 0; summary.parts = score.parts.length;
      rows.push({id:`${song.id}:score`,name:asset.name,text:score.xml});
    }
    received += data.length;
  }
  abortCheck(signal);
  const record: LocalMaterial = { id:`${song.id}:download`,name:song.title,download:{ songId:song.id,title:song.title,revision:song.revision,bytes:total,downloadedAt:new Date().toISOString(),summary } };
  progress({phase:'保存到本地',received:total,total});
  await materialStore.putMany([...rows,record], signal);
  return record;
}
