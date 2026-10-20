import assert from "node:assert/strict";
import { readFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve, extname, sep } from "node:path";
import { chromium } from "playwright-core";

// Real Chromium, production assets, real XML/SVG/canvas and Web Audio. A route
// serves dist without a development server. No renderer or audio replacements.
const root = resolve("dist");
const output = resolve(process.env.BROWSER_RESULTS_DIR || "test-results/piano-browser");
mkdirSync(output, { recursive: true });
const config = JSON.parse(readFileSync("apps/web/src/bundled-audio.json", "utf8"));
const song = config.score ? "haruhikage-crychic" : "demo-original";
const browser = await chromium.launch({
  executablePath: process.env.BROWSER_EXECUTABLE_PATH || undefined,
  headless: true,
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});
const cases = [
  ["phone-small", 320, 640],
  ["phone-portrait", 360, 800],
  ["phone-long", 393, 873],
  ["landscape-short", 740, 320],
  ["landscape-short-insets", 740, 320, { top: 24, right: 24, bottom: 16, left: 0 }],
  ["landscape", 844, 390],
  ["landscape-insets", 844, 390, { top: 24, right: 24, bottom: 16, left: 0 }],
  ["landscape-wide", 960, 432],
  ["tablet-portrait", 768, 1024],
  ["tablet-landscape", 1024, 768],
];
const results = [];
const errors = [];
const mime = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".mp3": "audio/mpeg", ".lrc": "text/plain", ".xml": "application/xml", ".musicxml": "application/xml", ".wav": "audio/wav" };
async function ready(page, bar = 1) {
  await page.getByRole("button", { name: `谱面小节 ${bar}`, exact: true }).waitFor();
  await page.waitForFunction(() => document.querySelector(".score-fit-frame")?.style.visibility === "visible");
  await page.evaluate(() => document.fonts.ready);
}
async function geometry(page) {
  return page.evaluate(() => {
    const box = (s) => {
      const el = document.querySelector(s), b = el?.getBoundingClientRect();
      return b && { x: b.x, y: b.y, width: b.width, height: b.height, right: b.right, bottom: b.bottom, scrollWidth: el.scrollWidth, scrollHeight: el.scrollHeight };
    };
    return {
      viewport: { width: innerWidth, height: innerHeight },
      body: { width: document.body.scrollWidth, height: document.body.scrollHeight },
      root: box(".piano-practice"), paper: box(".staff-region"),
      viewportBox: box(".score-viewport"), frame: box(".score-fit-frame"),
      keyboard: box(".piano-keys"), controls: box(".focus-piano-transport"),
      title: box(".piano-song-heading h1"),
      compatible: !!document.querySelector(".score-window.is-compatible"),
      scale: Number(document.querySelector(".score-sheet")?.dataset.scoreScale),
      bars: [...document.querySelectorAll(".measure-hit")].map(e => e.getAttribute("aria-label")),
      barRows: new Set([...document.querySelectorAll(".measure-hit")].map(e => Math.round(e.getBoundingClientRect().y))).size,
      svgPaths: document.querySelectorAll(".score-sheet svg path").length,
      audio: window.__pianoAudioEvidence,
    };
  });
}
function check(g, name) {
  assert.equal(g.compatible, false, `${name}: OSMD must render without falling back`);
  assert(g.svgPaths > 10, `${name}: actual notation paths`);
  assert(g.body.width <= g.viewport.width + 1, `${name}: body horizontal overflow`);
  assert(g.body.height <= g.viewport.height + 1, `${name}: body vertical overflow`);
  assert(g.keyboard.height >= 100, `${name}: keys too short`);
  if (g.viewport.height > g.viewport.width) assert(g.keyboard.height <= 221, `${name}: portrait keys too tall`);
  assert(g.keyboard.bottom <= g.viewport.height + 1, `${name}: keys clipped`);
  assert(g.paper.bottom <= g.controls.y + 1 || g.controls.bottom <= g.paper.y + 1, `${name}: score/control overlap`);
  assert(g.controls.bottom <= g.keyboard.y + 1, `${name}: control/key overlap`);
  assert(g.title.width >= 45, `${name}: title squeezed by header controls`);
  assert(g.scale >= 0.75 && g.scale <= 1.5, `${name}: unreadable/oversized staff`);
  assert(g.frame.y >= g.viewportBox.y - 1, `${name}: auto-scroll clipped clef/header`);
  // A dense staff may legitimately overflow; its holder must not add empty space.
  assert(g.viewportBox.scrollWidth <= Math.max(g.viewportBox.width, g.frame.width) + 3, `${name}: phantom horizontal overflow`);
  assert.equal(g.bars.length, 4, `${name}: preserve the four-bar page`);
  if (g.viewport.width <= 393 && g.viewport.height > g.viewport.width)
    assert(g.barRows > 1, `${name}: portrait bars did not reflow`);
}
try {
  for (const [name, width, height, insets] of cases) {
    const context = await browser.newContext({ viewport: { width, height }, isMobile: true, hasTouch: true, deviceScaleFactor: 1.5 });
    await context.route("https://anisong.test/**", async route => {
      const url = new URL(route.request().url());
      const path = resolve(root, "." + decodeURIComponent(url.pathname === "/" ? "/index.html" : url.pathname));
      if (!path.startsWith(root + sep) || !existsSync(path)) return route.fulfill({ status: 404, body: "Missing" });
      return route.fulfill({ body: readFileSync(path), contentType: mime[extname(path)] || "application/octet-stream" });
    });
    await context.addInitScript(({ insets }) => {
      if (insets) document.addEventListener("DOMContentLoaded", () => {
        for (const [side, value] of Object.entries(insets)) document.documentElement.style.setProperty("--safe-area-inset-" + side, value + "px");
      });
      // Observe real oscillator calls, preserving their native implementation.
      const evidence = window.__pianoAudioEvidence = { starts: 0, stops: 0 };
      const start = OscillatorNode.prototype.start, stop = OscillatorNode.prototype.stop;
      OscillatorNode.prototype.start = function(...args) { evidence.starts++; return start.apply(this, args); };
      OscillatorNode.prototype.stop = function(...args) { evidence.stops++; return stop.apply(this, args); };
    }, { insets });
    const page = await context.newPage();
    page.on("pageerror", error => errors.push({ name, message: error.message }));
    await page.goto(`https://anisong.test/?song=${song}#piano`);
    await ready(page);
    check(await geometry(page), name);
    await page.getByRole("button", { name: "启用声音", exact: true }).click();
    await page.waitForFunction(() => !document.querySelector('.piano-key[aria-label="琴键 C4"]').disabled);
    await page.getByRole("button", { name: "琴键 C4", exact: true }).waitFor({ state: "visible" });
    // Actual pointer down/up reaches the controller and real Web Audio engine.
    const key = page.getByRole("button", { name: "琴键 C4", exact: true });
    await key.hover(); await page.mouse.down();
    assert.equal(await key.getAttribute("aria-pressed"), "true");
    assert((await geometry(page)).audio.starts > 0, `${name}: key did not start an oscillator`);
    await page.mouse.up();
    assert.equal(await key.getAttribute("aria-pressed"), "false");
    assert((await geometry(page)).audio.stops > 0, `${name}: release did not stop real audio`);
    const g = await geometry(page); check(g, name);
    await page.screenshot({ path: resolve(output, `${name}.png`) });
    const play = page.getByRole("button", { name: "播放", exact: true });
    const playBox = await play.boundingBox();
    assert(playBox.x >= g.controls.x && playBox.x + playBox.width <= g.controls.right + 1, `${name}: play control clipped`);
    await page.getByRole("button", { name: "谱面小节 2", exact: true }).click();
    await page.getByRole("button", { name: "暂停", exact: true }).waitFor();
    assert((await geometry(page)).audio.starts > g.audio.starts, `${name}: selecting a bar did not schedule real audio`);
    await page.getByRole("button", { name: "暂停", exact: true }).click();
    // Every four-bar page uses declaration-bearing XML again in Chromium.
    const totalPages = name === "landscape" ? (config.score ? 35 : 2) : 2;
    for (let p = 1; p < totalPages; p++) {
      await page.getByRole("button", { name: "后 4 小节", exact: true }).click();
      await ready(page, p * 4 + 1);
      assert.equal((await geometry(page)).compatible, false, `${name}: page ${p + 1} fell back`);
    }
    if (name === "phone-portrait") {
      // Rotate the same loaded session (not a separate page pretending to rotate).
      const selected = await page.locator(".range-button").innerText();
      for (const viewport of [{ width: 800, height: 360 }, { width: 360, height: 800 }]) {
        await page.setViewportSize(viewport);
        await page.waitForFunction(({height}) => Math.abs(document.querySelector(".piano-practice").getBoundingClientRect().height - height) < 1, {height: viewport.height});
        await ready(page, 5);
        await page.waitForFunction(() => document.querySelector(".score-sheet").style.width !== "1px");
        check(await geometry(page), `rotation-${viewport.width}`);
        assert.equal(await page.locator(".range-button").innerText(), selected);
        assert.equal(await page.getByRole("button", { name: "播放", exact: true }).count(), 1);
        await page.screenshot({ path: resolve(output, `rotation-${viewport.width}.png`) });
      }
    }
    results.push({ name, width, height, ...g, pagesChecked: totalPages });
    await context.close();
  }
  assert.deepEqual(errors, [], "Uncaught browser errors");
  console.log(`Chromium ${browser.version()}: ${cases.length} aspect/inset scenarios, real key down/up/audio scheduling, four-bar pages and in-session rotation passed.`);
} finally {
  writeFileSync(resolve(output, "results.json"), JSON.stringify({ browser: browser.version(), results, errors }, null, 2));
  await browser.close();
}
