import { JSDOM } from 'jsdom';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';

// Execute the delivered ESM with an instrumented media boundary. This is not
// browser rendering, audio decoding or a listening test; no clock is animated.
const dist = resolve('dist'), html = readFileSync(resolve(dist, 'index.html'), 'utf8');
const config = JSON.parse(readFileSync('apps/web/src/bundled-audio.json', 'utf8'));
const song = config.available ? 'haruhikage-crychic' : 'demo-original';
const dom = new JSDOM(html, { url: `https://lyrics-build.invalid/?song=${song}#lyrics`, pretendToBeVisual: true });
for (const key of ['window', 'document', 'navigator', 'location', 'history', 'localStorage', 'DOMParser', 'XMLSerializer', 'MutationObserver', 'Element', 'HTMLElement', 'HTMLInputElement', 'Node', 'Event', 'CustomEvent', 'getComputedStyle'])
  Object.defineProperty(globalThis, key, { configurable: true, writable: true, value: dom.window[key] });
globalThis.self = dom.window;
globalThis.requestAnimationFrame = dom.window.requestAnimationFrame.bind(dom.window);
globalThis.cancelAnimationFrame = dom.window.cancelAnimationFrame.bind(dom.window);
const media = [];
class InstrumentedMedia extends dom.window.EventTarget {
  duration = config.available ? 257.880816 : 35.5;
  paused = true; ended = false; seeking = false; preservesPitch = true; playbackRate = 1;
  src = ''; preload = ''; time = 0; plays = [];
  get currentTime() { return this.time; }
  set currentTime(value) {
    this.seeking = true;
    queueMicrotask(() => { this.time = value; this.seeking = false; this.dispatchEvent(new Event('seeked')); });
  }
  constructor() { super(); media.push(this); }
  load() { queueMicrotask(() => this.dispatchEvent(new Event('loadedmetadata'))); }
  async play() { this.plays.push(this.currentTime); this.paused = false; }
  pause() { this.paused = true; this.dispatchEvent(new Event('pause')); }
  removeAttribute() {}
}
globalThis.Audio = InstrumentedMedia;
globalThis.fetch = async input => {
  const url = new URL(String(input), 'https://lyrics-build.invalid/'), path = resolve(dist, '.' + url.pathname);
  if (url.origin !== 'https://lyrics-build.invalid' || !path.startsWith(dist + sep) || !existsSync(path)) return new Response('Missing', { status: 404 });
  return new Response(readFileSync(path));
};
const errors = [];
window.addEventListener('error', event => errors.push(event.message));
process.on('unhandledRejection', error => errors.push(String(error)));
const until = async predicate => {
  const end = Date.now() + 10000;
  while (!predicate() && Date.now() < end) await new Promise(resolve => setTimeout(resolve, 20));
  if (!predicate()) throw new Error('Production lyrics did not settle: ' + predicate.toString());
};
const click = node => { if (!node) throw new Error('Production lyric control missing'); node.dispatchEvent(new window.MouseEvent('click', { bubbles: true })); };
const exactButton = text => [...document.querySelectorAll('button')].find(b => b.textContent.trim() === text);
const lyricText = readFileSync(resolve(dist, config.lyrics?.src ?? 'demo/demo.lrc'), 'utf8');
const starts = [...lyricText.matchAll(/\[(\d+):(\d+(?:\.\d+)?)\]/g)].map(match => Number(match[1]) * 60 + Number(match[2]));
try {
  const entry = html.match(/src="([^\"]+\.js)"/)[1];
  await import(pathToFileURL(resolve(dist, entry)));
  await until(() => document.querySelectorAll('.lyrics-focus .lyric').length >= 3);
  click(document.querySelectorAll('.lyrics-focus .lyric')[1]);
  await until(() => media.some(item => item.plays.length && !item.paused));
  const audio = media.find(item => item.plays.length), slider = document.querySelector('[aria-label="片段进度"]');
  if (Math.abs(audio.plays.at(-1) - starts[1]) > 0.001) throw new Error('Clicked lyric did not seek before playing');
  if (Number(slider.min) !== starts[1] || Number(slider.max) !== starts[2]) throw new Error('Displayed lyric range differs from imported LRC');
  if (document.querySelectorAll('.lyrics-focus .lyric small').length || document.querySelector('.lyrics-focus .section-title')) throw new Error('Old timestamp/title clutter remains');
  if (document.querySelectorAll('.lyrics-focus .play-options > button').length !== 3) throw new Error('Practice parameters are not grouped');
  const nativeValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
  nativeValue.call(slider, String(starts[1] + 1.2));
  slider.dispatchEvent(new Event('input', { bubbles: true }));
  slider.dispatchEvent(new Event('change', { bubbles: true }));
  await until(() => Math.abs(audio.currentTime - starts[1] - 1.2) < 0.001);
  if (!document.querySelector('[aria-label="片段内时间"]').textContent.includes('00:01.20')) throw new Error('Clip progress is not relative to its boundary');
  click(exactButton('微调片段')); await until(() => document.querySelector('.trim-draft'));
  const plays = audio.plays.length, originalEnd = Number(slider.max);
  const priorPreview = document.querySelector('[aria-label="预览终点"]').textContent;
  click(document.querySelector('[aria-label="终点延后 0.1 秒"]'));
  await until(() => document.querySelector('[aria-label="预览终点"]').textContent !== priorPreview);
  if (Number(slider.max) !== originalEnd || !audio.paused) throw new Error('Trim preview changed live range or kept playing');
  click(exactButton('应用并返回')); await until(() => !document.querySelector('[role="dialog"]'));
  const expectedEnd = Math.round((originalEnd + 0.1) * 1000) / 1000;
  if (Number(slider.max) !== expectedEnd || audio.plays.length !== plays || !audio.paused) throw new Error('Trim confirmation did not apply exactly once while paused');
  click(document.querySelector('.lyrics-focus [aria-label="更多学唱操作"]')); await until(() => exactButton('反馈问题 ↗'));
  click(exactButton('反馈问题 ↗')); await until(() => document.querySelector('.report')?.value.includes('"sha"'));
  if (!document.querySelector('.report').value.includes('"end": ' + expectedEnd)) throw new Error('Feedback lost the applied original-time boundary');
  if (errors.length) throw new Error(errors.join(';'));
  console.log(JSON.stringify({ check: 'production-lyrics-esm-dom', lines: document.querySelectorAll('.lyrics-focus .lyric').length, seekBeforePlay: true, originalLrcBounds: true, relativeProgress: true, trimPreviewIsolated: true, trimConfirmPaused: true, feedbackSnapshot: true, method: 'jsdom and instrumented media metadata/seek/play events; no simulated clock, physical browser rendering or audible verification' }));
  dom.window.close(); process.exit(0);
} catch (error) { console.error(error.message); dom.window.close(); process.exit(1); }
