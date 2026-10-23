import assert from "node:assert/strict";
import { readFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve, extname, sep } from "node:path";
import { chromium } from "playwright-core";
import { build } from "vite";
const root = resolve("dist"), output = resolve(process.env.BROWSER_RESULTS_DIR || "test-results/piano-browser");
mkdirSync(output, { recursive: true });
// Compile the actual synth source for OfflineAudioContext, never a duplicate DSP
// implementation. PCM is rendered by Chromium's real Web Audio graph.
const bundle = await build({ configFile: false, logLevel: "error", build: { write: false, lib: { entry: resolve("packages/piano/audio.ts"), formats: ["es"] } } });
const code = (Array.isArray(bundle) ? bundle[0] : bundle).output.find(o => o.type === "chunk").code;
const browser = await chromium.launch({ executablePath: process.env.BROWSER_EXECUTABLE_PATH || undefined, args: ["--no-sandbox", "--disable-dev-shm-usage"] });
const mime = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".wav": "audio/wav", ".musicxml": "application/xml" };
const results = [], errors = [];
async function swipe(page, cdp, frame, width) {
  const x = Math.round(width / 2), start = Math.round(frame.y + frame.height * .75), distance = Math.min(250, frame.height * .5);
  // Use actual touchstart/move/end input; no script assigns scrollTop.
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y: start }] });
  for (let i = 1; i <= 12; i++) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: Math.round(start - distance * i / 12) }] });
    await page.waitForTimeout(20);
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
}
try {
  for (const [width, height] of [[320,640],[393,873],[740,320],[960,432]]) {
    const context = await browser.newContext({ viewport: {width,height}, isMobile: true, hasTouch: true });
    await context.route("https://anisong.test/**", route => {
      const url = new URL(route.request().url());
      const path = resolve(root, "." + decodeURIComponent(url.pathname === "/" ? "/index.html" : url.pathname));
      if (!path.startsWith(root + sep) || !existsSync(path)) return route.fulfill({ status: 404, body: "Missing" });
      return route.fulfill({ body: readFileSync(path), contentType: mime[extname(path)] || "application/octet-stream" });
    });
    const page = await context.newPage(); page.on("pageerror", e => errors.push(e.message));
    // A fresh URL with no hash and no navigation clicks must accept the first touch swipe.
    await page.goto('https://anisong.test/');
    await page.locator('.page-home .shell-title').waitFor();
    await page.screenshot({ path: resolve(output, `first-home-before-touch-${width}x${height}.png`) });
    const frame = await page.locator('.shell-content').boundingBox();
    const cdp = await context.newCDPSession(page);
    console.log(JSON.stringify({check:'initial-touch-frame',width,height,frame,dom:await page.locator('.shell-content').evaluate(el=>({height:el.clientHeight,content:el.scrollHeight,top:el.scrollTop,touch:getComputedStyle(el).touchAction}))}));
    await swipe(page, cdp, frame, width);
    await page.waitForFunction(() => document.querySelector('.shell-content').scrollTop > 20, undefined, { timeout: 5000 });
    const firstScroll = await page.locator('.shell-content').evaluate(el => el.scrollTop);
    assert(firstScroll > 20, 'First mobile touch scroll required navigation');
    await page.reload();
    await page.locator('.page-home .shell-title').waitFor();
    await page.screenshot({ path: resolve(output, `home-reload-before-touch-${width}x${height}.png`) });
    await swipe(page, cdp, await page.locator('.shell-content').boundingBox(), width);
    await page.waitForFunction(() => document.querySelector('.shell-content').scrollTop > 20, undefined, { timeout: 5000 });
    results.push({ name: 'first-home-touch-scroll', width, height, firstScroll, reloadScroll: await page.locator('.shell-content').evaluate(el => el.scrollTop) });
    for (const name of ["home", "library", "downloads", "song", "materials", "piano-prep", "settings", "recents", "about"]) {
      await page.goto(`https://anisong.test/?song=demo-original#${name}`);
      await page.locator(".shell-title").waitFor();
      await page.evaluate(() => document.fonts.ready);
      if (name === "piano-prep") await page.getByRole("button", {name:"进入钢琴练习 →",exact:true}).waitFor();
      const header = await page.locator(".shell-header").boundingBox();
      const back = page.locator(".shell-back"); const before = await back.count() ? await back.boundingBox() : null;
      await page.locator(".shell-content").hover(); await page.mouse.wheel(0, 1200);
      await page.waitForTimeout(150); // Let the browser process real wheel scrolling.
      const after = await page.locator(".shell-header").boundingBox();
      assert(Math.abs(header.y - after.y) < 1, `${name}: header moved on scroll`);
      if (before) {
        const b = await back.boundingBox();
        assert(Math.abs(before.x-b.x)<1 && Math.abs(before.y-b.y)<1, `${name}: back moved`);
        assert(b.x<=20 && b.y<=30, `${name}: back is not top left`);
        assert.equal(await page.getByRole("button", {name:/^返回(歌曲|曲库|设置|练习)$/}).count(), 1, `${name}: duplicate back button`);
      }
      if (name === "song") {
        const theme = await page.locator(".view-preview .play-button").evaluate(el => ({
          background: getComputedStyle(el).backgroundColor, color: getComputedStyle(el).color,
        }));
        assert.equal(theme.background, "rgb(40, 102, 83)", "song preview kept legacy blue controls");
        assert.equal(theme.color, "rgb(255, 253, 247)", "song preview play label contrast");
      }
      const geometry = await page.evaluate(() => ({ height:document.body.scrollHeight, width:document.body.scrollWidth, scroll:document.querySelector(".shell-content").scrollTop }));
      assert(geometry.width <= width+1 && geometry.height<=height+1, `${name}: document overflow ${JSON.stringify(geometry)}`);
      await page.screenshot({ path: resolve(output, `app-${name}-${width}x${height}.png`) });
      results.push({ name, width,height,header:after,...geometry });
    }
    await context.close();
  }
  const page = await browser.newPage();
  const pcm = await page.evaluate(async code => {
    const { SynthPiano } = await import(URL.createObjectURL(new Blob([code], {type:"text/javascript"})));
    const measure = async kind => {
      const ctx = new OfflineAudioContext(1, 48000, 48000);
      const Original = globalThis.AudioContext;
      // Only context creation/lifecycle is adapted to the real offline context;
      // all synth gain/oscillator/limiter nodes and scheduling are production code.
      globalThis.AudioContext = class {
        constructor() { return new Proxy(ctx, {get(target,key) {
          if (key === "state") return "running";
          if (key === "resume" || key === "close") return async () => {};
          const value=Reflect.get(target,key,target);return typeof value==="function"?value.bind(target):value;
        },set(target,key,value) { return Reflect.set(target,key,value,target); }}); }
      };
      const synth = new SynthPiano(); await synth.enable();
      if (kind === "cancel") { synth.note("future", 69, .3, .2); synth.stop(); }
      else if (kind === "chord") for(let i=0;i<32;i++) synth.note("chord"+i, 69, .02, .3);
      else synth.note("single", 69, .02, .5);
      const data=(await ctx.startRendering()).getChannelData(0);
      let peak=0,rms=0,delta=0;
      for(let i=0;i<data.length;i++){peak=Math.max(peak,Math.abs(data[i]));rms+=data[i]**2;if(i)delta=Math.max(delta,Math.abs(data[i]-data[i-1]));}
      synth.dispose(); globalThis.AudioContext=Original;
      return {peak,rms:Math.sqrt(rms/data.length),delta,tail:Math.max(...data.slice(-1000).map(Math.abs))};
    };
    return {single:await measure("single"),chord:await measure("chord"),cancel:await measure("cancel")};
  }, code);
  assert(pcm.single.peak>.01 && pcm.single.rms>.001, "actual single-note PCM is silent");
  assert(pcm.chord.peak<.56, "chord clipped output ceiling");
  assert(pcm.cancel.peak<1e-6, "cancelled queued note produced a ghost attack");
  assert(pcm.chord.tail<1e-6, "note release left an audible tail");
  assert.deepEqual(errors, [], "uncaught app errors");
  writeFileSync(resolve(output,"app-audio-results.json"),JSON.stringify({browser:browser.version(),results,pcm,errors},null,2));
  console.log(`32 app layouts, fixed navigation scroll checks and actual Web Audio PCM rendering passed: ${JSON.stringify(pcm)}`);
} finally { await browser.close(); }
