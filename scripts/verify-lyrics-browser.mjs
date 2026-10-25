import assert from 'node:assert/strict';
import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve, extname, sep } from 'node:path';
import { chromium } from 'playwright-core';
const root=resolve('dist'), output=resolve('test-results/piano-browser');
mkdirSync(output,{recursive:true});
const browser=await chromium.launch({args:['--no-sandbox','--disable-dev-shm-usage']});
const lrc=Array.from({length:25},(_,i)=>`[00:${(i*1.2).toFixed(2).padStart(5,'0')}]练习原文 ${i+1}\n[00:${(i*1.2).toFixed(2).padStart(5,'0')}][romaji]renshū ${i+1}\n[00:${(i*1.2).toFixed(2).padStart(5,'0')}][translation]学习译文 ${i+1}`).join('\n');
const results=[], errors=[];
try {
  for(const [width,height] of [[320,640],[393,873],[430,932],[740,320],[844,390]]) {
    const context=await browser.newContext({viewport:{width,height},isMobile:true,hasTouch:true});
    await context.route('https://anisong.test/**',route=>{
      const url=new URL(route.request().url());
      if(url.pathname==='/demo/demo.lrc')return route.fulfill({body:lrc,contentType:'text/plain'});
      const path=resolve(root,'.'+decodeURIComponent(url.pathname==='/'?'/index.html':url.pathname));
      if(!path.startsWith(root+sep)||!existsSync(path))return route.fulfill({status:404});
      return route.fulfill({body:readFileSync(path),contentType:({'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.wav':'audio/wav'})[extname(path)]||'application/octet-stream'});
    });
    const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
    await page.goto('https://anisong.test/?song=demo-original#lyrics');
    const line=i=>page.getByRole('button',{name:`第 ${i} 句 练习原文 ${i}`,exact:true});
    await line(1).waitFor();
    await page.getByRole('button',{name:'多句连续',exact:true}).click();
    await line(1).click(); await line(12).click();
    await page.getByRole('button',{name:'暂停',exact:true}).waitFor();
    await page.waitForFunction(()=>Number(document.querySelector('[aria-label="片段进度"]')?.value)>1.3);
    await page.getByRole('button',{name:'暂停',exact:true}).click();
    await page.getByRole('button',{name:'歌词显示',exact:true}).click();
    const checkbox=page.getByRole('checkbox',{name:'显示罗马音',exact:true});
    assert(await checkbox.isChecked());await checkbox.uncheck();
    assert.equal(await page.locator('.lyrics .lyric-romaji').count(),0);
    assert.equal(await page.locator('.lyrics .lyric-translation').count(),25);
    await page.screenshot({path:resolve(output,`lyrics-display-${width}x${height}.png`)});
    await checkbox.check(); await page.getByRole('button',{name:'完成',exact:true}).click();
    await page.getByRole('dialog').waitFor({state:'hidden'});
    await page.getByRole('button',{name:'单句循环',exact:true}).click();
    await line(10).click();await page.getByRole('button',{name:'暂停',exact:true}).click();
    await page.waitForFunction(()=>{const list=document.querySelector('.lyrics'),row=document.querySelector('.lyric[aria-current="true"]');if(!list||!row)return false;const a=list.getBoundingClientRect(),b=row.getBoundingClientRect();return b.top>=a.top-1&&b.bottom<=a.bottom+1;});
    const geometry=await page.evaluate(()=>{const a=document.querySelector('.lyrics-header').getBoundingClientRect(),b=document.querySelector('.lyrics-player').getBoundingClientRect();return {width:document.body.scrollWidth,height:document.body.scrollHeight,headerTop:a.top,playerBottom:b.bottom};});
    assert(geometry.width<=width+1&&geometry.height<=height+1,JSON.stringify(geometry));
    assert(geometry.headerTop>=0&&geometry.playerBottom<=height+1,JSON.stringify(geometry));
    await page.screenshot({path:resolve(output,`lyrics-practice-${width}x${height}.png`)});
    await page.locator('.lyrics').hover();await page.mouse.wheel(0,400);
    await page.getByRole('button',{name:'回到当前句',exact:true}).waitFor();
    await page.getByRole('button',{name:'回到当前句',exact:true}).click();
    await page.getByRole('button',{name:'自动滚动 开',exact:true}).click();
    await page.reload();await line(1).waitFor();
    assert(await page.getByRole('button',{name:'自动滚动 关',exact:true}).isVisible());
    results.push({width,height,...geometry,realMediaTimeAdvanced:true,toggles:true,manualResume:true,persistence:true});
    await context.close();
  }
  assert.deepEqual(errors,[]);writeFileSync(resolve(output,'lyrics-results.json'),JSON.stringify(results,null,2));
  console.log(JSON.stringify({check:'lyrics-browser',results}));
} finally {await browser.close();}
