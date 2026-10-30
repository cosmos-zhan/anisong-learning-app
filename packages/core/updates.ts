export const RELEASES_API = 'https://api.github.com/repos/cosmos-zhan/anisong-learning-app/releases?per_page=100';
export const RELEASES_PAGE = 'https://github.com/cosmos-zhan/anisong-learning-app/releases';
const DOWNLOAD_PREFIX = `${RELEASES_PAGE}/download/`;
export interface UpdateAsset { name: string; browser_download_url: string; size: number; digest: string; state: string }
export interface AppRelease { tag_name: string; draft: boolean; prerelease: boolean; html_url: string; body?: string; assets: UpdateAsset[] }
export interface AppUpdate { version: string; tag: string; apk: UpdateAsset; infoUrl: string; notes: string; page: string }
export interface InstalledApp { version: string; versionCode: number; signerSha256: string }
export interface VerifiedUpdate { url: string; sha256: string; bytes: number; versionCode: number; signerSha256: string }
export interface ReleaseNote { version: string; changes: string[]; page: string }
function versionParts(input: string): number[] | undefined {
  const m = /^v?(\d+)\.(\d+)\.(\d+)(?:-(alpha|beta|rc)\.(\d+))?$/.exec(input);
  if (!m) return;
  const numbers = [Number(m[1]), Number(m[2]), Number(m[3]), m[4] ? ['alpha', 'beta', 'rc'].indexOf(m[4]) : 3, Number(m[5] ?? 0)];
  return numbers.every(Number.isSafeInteger) ? numbers : undefined;
}
export function compareVersions(a: string, b: string): number {
  const aa = versionParts(a), bb = versionParts(b);
  if (!aa || !bb) throw new Error('版本信息格式无效。');
  for (let i = 0; i < aa.length; i++) if (aa[i] !== bb[i]) return Math.sign(aa[i] - bb[i]);
  return 0;
}
/** Extract only the release's update section; render the returned strings as text. */
export function releaseHistory(value: unknown): ReleaseNote[] {
  if (!Array.isArray(value)) return [];
  return (value as AppRelease[]).filter(r => r && !r.draft && typeof r.tag_name === 'string' && versionParts(r.tag_name))
    .sort((a,b) => compareVersions(b.tag_name,a.tag_name)).slice(0, 100).map(r => {
      const body = typeof r.body === 'string' ? r.body.slice(0, 20000) : '';
      const section = body.match(/(?:^|\n)#{1,3}\s*本次更新[^\n]*\n([\s\S]*?)(?=\n#{1,3}\s|$)/)?.[1] ?? '';
      const changes = section.split('\n').map(line => line.trim().replace(/^[-*]\s+/, '')).filter(Boolean).slice(0, 20).map(line => line.slice(0, 500));
      return { version: r.tag_name.replace(/^v/, ''), changes, page: `${RELEASES_PAGE}/tag/${r.tag_name}` };
    });
}
function assetAt(asset: UpdateAsset, tag: string, name: string): boolean {
  return asset?.state === 'uploaded' && asset.name === name && asset.browser_download_url === `${DOWNLOAD_PREFIX}${tag}/${name}` &&
    Number.isSafeInteger(asset.size) && asset.size > 0;
}
export function selectUpdate(value: unknown, current: string): AppUpdate | undefined {
  if (!Array.isArray(value)) throw new Error('更新服务返回了无效信息。');
  const releases = (value as AppRelease[]).filter(r => r && !r.draft && versionParts(r.tag_name) && Array.isArray(r.assets))
    .sort((a, b) => compareVersions(b.tag_name, a.tag_name));
  for (const release of releases) {
    if (compareVersions(release.tag_name, current) <= 0) continue;
    const version = release.tag_name.replace(/^v/, '');
    const apk = release.assets.find(a => assetAt(a, release.tag_name, `anisong-${version}-debug.apk`) && /^sha256:[a-f0-9]{64}$/.test(a.digest ?? '') && a.size <= 150 * 1024 * 1024);
    const info = release.assets.find(a => assetAt(a, release.tag_name, 'build-info.json') && a.size <= 64 * 1024);
    if (!apk || !info) continue;
    return { version, tag: release.tag_name, apk, infoUrl: info.browser_download_url,
      notes: typeof release.body === 'string' ? release.body.slice(0, 6000) : '', page: `${RELEASES_PAGE}/tag/${release.tag_name}` };
  }
}
export function verifyUpdateInfo(update: AppUpdate, raw: unknown, installed: InstalledApp): VerifiedUpdate {
  const info = raw as Record<string, unknown>;
  if (!info || info.repository !== 'cosmos-zhan/anisong-learning-app' || info.tag !== update.tag || info.version !== update.version ||
      info.apkName !== update.apk.name || info.apkSha256 !== update.apk.digest.slice(7) || !/^[a-f0-9]{64}$/.test(String(info.signerSha256)) ||
      !Number.isSafeInteger(info.versionCode) || Number(info.versionCode) <= installed.versionCode || info.publicMediaOnly !== true)
    throw new Error('安装包的版本或校验信息不一致，已停止更新。');
  if (info.signerSha256 !== installed.signerSha256)
    throw new Error('新版与当前安装的 App 签名不同，无法覆盖更新。请保留现有 App 和练习资料，联系维护者处理。');
  return { url: update.apk.browser_download_url, sha256: String(info.apkSha256), bytes: update.apk.size,
    versionCode: Number(info.versionCode), signerSha256: String(info.signerSha256) };
}
export async function fetchReleases(signal: AbortSignal): Promise<unknown> {
  const response = await fetch(RELEASES_API, { signal, cache: 'no-store', credentials: 'omit', headers: { Accept: 'application/vnd.github+json' } });
  if (response.status === 403 || response.status === 429) throw new Error('更新检查暂时受限，请稍后重试。');
  if (!response.ok) throw new Error(`更新服务暂不可用（HTTP ${response.status}）。`);
  return response.json();
}
