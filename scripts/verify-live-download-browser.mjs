import assert from 'node:assert/strict';
import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve, extname, sep } from 'node:path';
import { chromium } from 'playwright-core';
const root = resolve('dist'), host = 'https://anisong-media-source.woolly-mochi-2205.chatgpt.site';
const requested=process.env.ANISONG_LIVE_SONG_ID??'all';
const profiles={
 'haruhikage-crychic':{title:'春日影 · CRYCHIC',lyrics:42,bars:140},
 'netease-27733896':{title:'私たちはずっと…でしょう？ · 765PRO ALLSTARS',lyrics:43,bars:0,romaji:39,translation:39,firstLine:4},
};
const selected=requested==='all'?Object.keys(profiles):[requested];
for(const id of selected)assert(profiles[id],'Unknown live song verification profile');
const browser=await chromium.launch({args:['--no-sandbox','--disable-dev-shm-usage']});
const results = [];
try {
 for(const songId of selected){
  const profile=profiles[songId];
  for (const origin of ['https://anisong-live.test', 'https://localhost']) {
    const context = await browser.newContext({ viewport: { width: 393, height: 873 }, isMobile: true, hasTouch: true });
    const actual = [], errors = [];
    // Only the built App is supplied locally. The material host is never intercepted.
    await context.route(`${origin}/**`, route => {
      const url = new URL(route.request().url());
      const path = resolve(root, '.' + decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname));
      if (!path.startsWith(root + sep) || !existsSync(path)) return route.fulfill({ status: 404 });
      return route.fulfill({ body: readFileSync(path), contentType: ({ '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json' })[extname(path)] || 'application/octet-stream' });
    });
    const page = await context.newPage();
    page.on('pageerror', e => errors.push(e.message));
    page.on('response', response => {
      if (response.url().startsWith(host + '/')) actual.push({ path: new URL(response.url()).pathname, status: response.status() });
    });
    page.on('request', request => {
      if (request.url().startsWith(host + '/')) {
        assert.equal(request.headers().authorization, undefined, 'A direct download must not send any access code');
        assert.equal(request.headers()['oai-sites-authorization'], undefined, 'Never send platform credentials');
      }
    });
    await page.goto(`${origin}/?song=${songId}#downloads`);
    await page.getByRole('heading', { name: profile.title, exact: true }).waitFor();
    assert.equal(await page.getByLabel('访问码（私人素材源可选）', { exact: true }).count(), 0);
    await page.locator('article.download-row').filter({has:page.getByRole('heading',{name:profile.title,exact:true})}).getByRole('button',{name:'下载到本地',exact:true}).click();
    await page.getByText('已下载并保存到此设备，可以离线练习。', { exact: true }).waitFor({ timeout: 120000 });
    assert(actual.some(r => r.path.endsWith('.mp3') && r.status === 200), JSON.stringify(actual));
    assert(actual.some(r => r.path.endsWith('.lrc') && r.status === 200));
    if(profile.bars)assert(actual.some(r => r.path.endsWith('.mxl') && r.status === 200));
    // Once saved, any further media-host request must fail: exercise the actual offline path.
    let contactedAfterSave = 0;
    await context.route(`${host}/**`, route => { contactedAfterSave++; return route.abort(); });
    await page.goto(`${origin}/?song=${songId}#lyrics`);
    await page.getByRole('button', { name: new RegExp('^第 '+profile.lyrics+' 句 ') }).waitFor({ state: 'attached', timeout: 30000 });
    if(profile.romaji){
      assert.equal(await page.locator('.lyric-romaji').count(),profile.romaji);
      assert.equal(await page.locator('.lyric-translation').count(),profile.translation);
    }
    const first=page.getByRole('button',{name:new RegExp('^第 '+(profile.firstLine??1)+' 句 ')});
    await first.click();
    await page.getByRole('button', { name: '暂停', exact: true }).waitFor();
    const begin = await page.getByLabel('片段进度', { exact: true }).inputValue();
    await page.waitForTimeout(800);
    const end = await page.getByLabel('片段进度', { exact: true }).inputValue();
    assert(Number(end) > Number(begin), 'The downloaded MP3 must decode and actually advance playback');
    await page.getByRole('button', { name: '暂停', exact: true }).click();
    if(profile.bars){
    await page.goto(`${origin}/?song=${songId}#piano-prep`);
    // Free-play navigation is visible before IndexedDB restoration finishes.
    // Wait for the actual parsed score, not merely the preparation-page button.
    await page.waitForFunction(() => document.querySelector('.piano-preparation')?.textContent?.includes('140 小节'), undefined, { timeout: 30000 });
    await page.getByRole('button', { name: '进入钢琴练习 →', exact: true }).waitFor();
    assert.match(await page.locator('.piano-preparation').innerText(), /140/);
    }
    assert.equal(contactedAfterSave, 0, 'Offline practice must read saved materials');
    assert.deepEqual(errors, []);
    results.push({ origin, oneClick: true, accessCode: false, realHttps: true, actual, songId,offlineRomaji:profile.romaji,offlineTranslation:profile.translation,offlineLyrics:profile.lyrics,offlineBars:profile.bars, mp3PlaybackAdvanced: true });
    await context.close();
  }
 }
  mkdirSync('test-results', { recursive: true });
  writeFileSync(`test-results/live-download-results-${requested}.json`, JSON.stringify(results, null, 2));
  console.log(JSON.stringify({ check: 'live-song-one-click', results }));
} finally { await browser.close(); }
