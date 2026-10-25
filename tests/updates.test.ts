import { describe, expect, it, vi, afterEach } from 'vitest';
import { compareVersions, selectUpdate, verifyUpdateInfo, fetchReleases, RELEASES_PAGE } from '../packages/core/updates';
const digest = 'a'.repeat(64), signer = 'b'.repeat(64);
const asset = (tag: string, name: string, size = 10000000) => ({ name, size, state: 'uploaded', digest: `sha256:${digest}`, browser_download_url: `${RELEASES_PAGE}/download/${tag}/${name}` });
const release = (version = '0.6.0-alpha.1') => ({ tag_name: `v${version}`, draft: false, prerelease: true, html_url: `${RELEASES_PAGE}/tag/v${version}`, assets: [asset(`v${version}`, `anisong-${version}-debug.apk`), asset(`v${version}`, 'build-info.json', 900)] });
afterEach(() => vi.unstubAllGlobals());
describe('application updates', () => {
  it('includes Alpha releases, compares versions numerically and never offers a downgrade', () => {
    expect(compareVersions('0.10.0-alpha.1', '0.9.0')).toBe(1);
    expect(compareVersions('0.6.0', '0.6.0-rc.9')).toBe(1);
    expect(compareVersions('0.6.0-beta.1', '0.6.0-alpha.9')).toBe(1);
    expect(selectUpdate([release(), release('0.10.0-alpha.1'), release('0.9.0')], '0.5.0-alpha.1')?.version).toBe('0.10.0-alpha.1');
    expect(selectUpdate([release()], '0.6.0-alpha.1')).toBeUndefined();
    expect(selectUpdate([{ ...release(), draft: true }], '0.5.0')).toBeUndefined();
  });
  it('rejects incomplete releases, foreign download URLs and assets without hashes', () => {
    const r = release();
    expect(selectUpdate([{ ...r, assets: r.assets.slice(0, 1) }], '0.5.0')).toBeUndefined();
    expect(selectUpdate([{ ...r, assets: [{ ...r.assets[0], browser_download_url: 'https://evil.test/app.apk' }, r.assets[1]] }], '0.5.0')).toBeUndefined();
    expect(selectUpdate([{ ...r, assets: [{ ...r.assets[0], digest: null }, r.assets[1]] }], '0.5.0')).toBeUndefined();
  });
  it('requires consistent build metadata, a newer install code and the same actual signer', () => {
    const update = selectUpdate([release()], '0.5.0')!;
    const installed = { version: '0.5.0', versionCode: 5, signerSha256: signer };
    const info = { repository: 'cosmos-zhan/anisong-learning-app', tag: update.tag, version: update.version, apkName: update.apk.name,
      apkSha256: digest, signerSha256: signer, versionCode: 6, publicMediaOnly: true };
    expect(verifyUpdateInfo(update, info, installed)).toMatchObject({ sha256: digest, versionCode: 6 });
    expect(() => verifyUpdateInfo(update, { ...info, signerSha256: 'c'.repeat(64) }, installed)).toThrow('签名不同');
    for (const change of [{ apkSha256: 'c'.repeat(64) }, { versionCode: 4 }, { repository: 'other/repo' }, { publicMediaOnly: false }])
      expect(() => verifyUpdateInfo(update, { ...info, ...change }, installed)).toThrow('不一致');
  });
  it('reports GitHub rate limiting clearly', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 403 })));
    await expect(fetchReleases(new AbortController().signal)).rejects.toThrow('暂时受限');
  });
});
