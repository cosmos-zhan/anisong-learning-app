import assert from 'node:assert/strict';
import { readFileSync, existsSync, mkdirSync } from 'node:fs';
import { resolve, extname, sep } from 'node:path';
import { chromium } from 'playwright-core';
const root=resolve('dist'),output=resolve('test-results/piano-browser');mkdirSync(output,{recursive:true});
const browser=await chromium.launch({executablePath:process.env.BROWSER_EXECUTABLE_PATH||undefined,args:['--no-sandbox','--disable-dev-shm-usage']});
const sample=Array.from({length:25},(_,i)=>`[00:${(i*1.2).toFixed(2).padStart(5,'0')}]赤い花が咲く\n[00:${(i*1.2).toFixed(2).padStart(5,'0')}][romaji]akai hana ga saku\n[00:${(i*1.2).toFixed(2).padStart(5,'0')}][translation]红花开放`).join('\n');
const results=[];
try {
 for (const [width,height] of [[320,640],[393,873],[740,320]]) {
  const context=await browser.newContext({viewport:{width,height},isMobile:true,hasTouch:true});
  await context.route('https://anisong.test/**',route=>{
   const url=new URL(route.request().url());if(url.pathname==='/demo/demo.lrc')return route.fulfill({body:sample,contentType:'text/plain'});
   const path=resolve(root,'.'+decodeURIComponent(url.pathname==='/'?'/index.html':url.pathname));
   if(!path.startsWith(root+sep)||!existsSync(path))return route.fulfill({status:404});
   return route.fulfill({body:readFileSync(path),contentType:({'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.wav':'audio/wav'})[extname(path)]||'application/octet-stream'});
  });
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('https://anisong.test/?song=demo-original#lyrics');
  await page.locator('.lyric[data-line="0"] ruby').first().waitFor();
  const geometry=await page.locator('.lyric[data-line="0"]').evaluate(row=>{
    const pairs=[...row.querySelectorAll('ruby')].map(r=>{const rt=r.querySelector('rt'),b=r.getBoundingClientRect(),a=rt.getBoundingClientRect();return {text:r.firstChild.textContent,reading:rt.textContent,centerDelta:Math.abs((b.left+b.right-a.left-a.right)/2),above:a.bottom<=b.bottom&&a.top<b.top+b.height*.5};});
    return {pairs,scrollWidth:row.scrollWidth,clientWidth:row.clientWidth};
  });
  assert(geometry.pairs.length>=3,JSON.stringify(geometry));
  for(const p of geometry.pairs)assert(p.centerDelta<2&&p.above,JSON.stringify(p));
  assert(geometry.scrollWidth<=geometry.clientWidth+1,JSON.stringify(geometry));
  const values=await page.evaluate(async()=>{
    const list=document.querySelector('.lyrics');list.scrollTo({top:0,behavior:'instant'});
    const row=list.querySelector('[data-line="14"]');row.click();
    const samples=[];const start=performance.now();
    while(performance.now()-start<900){samples.push(list.scrollTop);await new Promise(requestAnimationFrame);}
    return samples;
  });
  const unique=[...new Set(values.map(n=>Math.round(n)))];
  assert(unique.length>=4 && Math.max(...values)>Math.min(...values)+10,JSON.stringify({width,unique}));
  await page.screenshot({path:resolve(output,`romaji-practice-${width}x${height}.png`)});
  await page.getByRole('button',{name:'歌词显示'}).click();
  assert(await page.getByText('在原文上方显示发音').isVisible());
  await page.getByRole('checkbox',{name:'显示罗马音'}).uncheck();assert.equal(await page.locator('.lyrics ruby').count(),0);
  assert.deepEqual(errors,[]);results.push({width,height,groups:geometry.pairs.length,animationFrames:unique.length});await context.close();
 }
 console.log(JSON.stringify({check:'romaji-alignment-and-smooth-follow',results}));
}finally{await browser.close();}
