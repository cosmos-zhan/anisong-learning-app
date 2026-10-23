import assert from 'node:assert/strict';
import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve, extname, sep } from 'node:path';
import { chromium } from 'playwright-core';

const live = process.argv.includes('--live');
const reportOnly = process.argv.includes('--report-only');
const url = live ? 'https://anisong.sekifufu.xyz/' : 'https://anisong.test/';
const root = resolve('dist'), output = resolve('test-results/piano-browser');
const mime = {'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json'};
mkdirSync(output, {recursive:true});
const browser = await chromium.launch({executablePath:process.env.BROWSER_EXECUTABLE_PATH || undefined,args:['--no-sandbox','--disable-dev-shm-usage']});
const results = [];
async function swipe(cdp, width, height) {
  const x = Math.round(width * .5), y = Math.round(height * .68);
  await cdp.send('Input.dispatchTouchEvent', {type:'touchStart',touchPoints:[{x,y}]});
  for (let i=1;i<=12;i++) {
    await cdp.send('Input.dispatchTouchEvent', {type:'touchMove',touchPoints:[{x,y:y-Math.round(Math.min(240,height*.4)*i/12)}]});
    await new Promise(resolve=>setTimeout(resolve,20));
  }
  await cdp.send('Input.dispatchTouchEvent', {type:'touchEnd',touchPoints:[]});
}
try {
  for (const [width,height] of [[360,800],[393,873],[412,915],[740,360]]) {
    const context = await browser.newContext({viewport:{width,height},deviceScaleFactor:3,isMobile:true,hasTouch:true});
    if (!live) await context.route('https://anisong.test/**', route=>{
      const pathname = new URL(route.request().url()).pathname;
      const path = resolve(root,'.'+decodeURIComponent(pathname==='/'?'/index.html':pathname));
      if (!path.startsWith(root+sep) || !existsSync(path)) return route.fulfill({status:404,body:'Missing'});
      return route.fulfill({body:readFileSync(path),contentType:mime[extname(path)] || 'application/octet-stream'});
    });
    const page = await context.newPage(), cdp = await context.newCDPSession(page);
    const errors=[];page.on('pageerror',error=>errors.push(error.message));
    for (const entry of ['fresh','reload']) {
      if (entry==='fresh') await page.goto(url,{waitUntil:'domcontentloaded'});
      else await page.reload({waitUntil:'domcontentloaded'});
      await page.locator('.page-home').waitFor({state:'attached'});
      // Do not take a screenshot, read geometry, click, hover or navigate before
      // the first real touch: those actions can hide first-frame hit-test bugs.
      await swipe(cdp,width,height);
      let passed=true;
      try {
        await page.waitForFunction(()=>Math.max(document.querySelector('.shell-content')?.scrollTop ?? 0,document.scrollingElement?.scrollTop ?? 0)>20,undefined,{timeout:4000});
      } catch {passed=false;}
      const geometry=await page.evaluate(()=>({
        url:location.href,viewport:{width:innerWidth,height:innerHeight,visualHeight:visualViewport?.height},
        nodes:[document.documentElement,document.body,document.getElementById('root'),document.querySelector('.app-shell'),document.querySelector('.shell-content')].map(el=>({tag:el.tagName,classes:el.className,top:el.scrollTop,height:el.clientHeight,content:el.scrollHeight,overflow:getComputedStyle(el).overflowY,touch:getComputedStyle(el).touchAction})),
      }));
      // Evidence is captured after the gesture, never as a prerequisite to it.
      await page.screenshot({path:resolve(output,`mobile-home-${live?'live':'built'}-${entry}-${width}x${height}.png`)});
      const result={check:'mobile-first-home-touch',live,entry,width,height,passed,...geometry,errors};
      results.push(result);console.log(JSON.stringify(result));
    }
    await context.close();
  }
  writeFileSync(resolve(output,`mobile-home-${live?'live':'built'}-results.json`),JSON.stringify(results,null,2)+'\n');
  if (!reportOnly) assert(results.every(row=>row.passed && row.errors.length===0),'Mobile home must scroll on first touch without navigation');
} finally {await browser.close();}
