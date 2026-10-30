import assert from 'node:assert/strict';
import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve, extname, sep } from 'node:path';
import { chromium } from 'playwright-core';
const root=resolve('dist'), output=resolve('test-results/piano-browser');
mkdirSync(output,{recursive:true});
const browser=await chromium.launch({args:['--no-sandbox','--disable-dev-shm-usage']});
const lines='[00:00.00]もう一度\n[00:01.00]歌っていたい\n[00:03.00]明日へ\n';
const answer=JSON.stringify({meaning:'想继续唱歌',pieces:[{text:'歌っていたい',romaji:'utatte itai',explanation:'想继续唱着',segments:[{text:'歌',reading:'うた'},{text:'っていたい'}]}],points:[{title:'ている＋たい',explanation:'持续状态的愿望'}]});
const results=[], errors=[];
try {
 for(const [width,height] of [[320,640],[393,873]]){
  const context=await browser.newContext({viewport:{width,height},isMobile:true,hasTouch:true});let calls=0;
  await context.route('**/*',route=>{
   const request=route.request(),url=new URL(request.url());
   if(url.origin==='https://model.example'){
    calls++; const body=JSON.parse(request.postData()||'{}');
    assert(body.messages.some(m=>m.content.includes('歌っていたい')));
    return route.fulfill({json:{choices:[{message:{content:calls===1?answer:'## 重点\n\n这是 **持续状态**。\n\n- 想继续唱\n- 不是过去式'}}]}});
   }
   if(url.origin!=='https://anisong.test')return route.abort();
   if(url.pathname==='/demo/demo.lrc')return route.fulfill({body:lines,contentType:'text/plain'});
   const path=resolve(root,'.'+decodeURIComponent(url.pathname==='/'?'/index.html':url.pathname));
   if(!path.startsWith(root+sep)||!existsSync(path))return route.fulfill({status:404});
   return route.fulfill({body:readFileSync(path),contentType:({'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.wav':'audio/wav'})[extname(path)]||'application/octet-stream'});
  });
  const page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));
  await page.goto('https://anisong.test/?song=demo-original#lyrics');
  await page.getByRole('button',{name:'第 2 句 歌っていたい',exact:true}).waitFor();
  await page.getByRole('button',{name:'解读本句',exact:true}).click();
  const dialog=page.getByRole('dialog',{name:'语法解读'});
  await dialog.getByLabel('接口地址').fill('https://model.example/v1/chat/completions');
  await dialog.getByLabel('模型名称').fill('fixture');
  await dialog.getByLabel('API 密钥').fill('test-secret');
  await dialog.getByRole('button',{name:'保存并开始解读'}).click();
  await dialog.getByText('想继续唱歌',{exact:true}).waitFor();
  await dialog.getByRole('button',{name:'播放本句',exact:true}).click();
  await dialog.getByRole('button',{name:'停止本句',exact:true}).waitFor();
  await dialog.getByRole('button',{name:'播放本句',exact:true}).waitFor({timeout:10000});
  assert.equal(await dialog.locator('ruby rt').first().textContent(),'うた');
  assert.equal(await dialog.getByText('utatte itai',{exact:true}).first().isVisible(),true);
  await dialog.getByRole('button',{name:'罗马音开'}).click(); assert.equal(await dialog.getByText('utatte itai',{exact:true}).count(),0);
  await dialog.getByRole('button',{name:'罗马音关'}).click();
  await dialog.getByRole('button',{name:'假名开'}).click();assert.equal(await dialog.locator('ruby').count(),0);
  await dialog.getByRole('button',{name:'假名关'}).click();assert((await dialog.locator('ruby').count())>0);
  await dialog.getByRole('button',{name:'围绕这句追问'}).click();
  await page.evaluate(() => document.documentElement.style.setProperty('--safe-area-inset-bottom', '32px'));
  const sendBottom=await dialog.getByRole('button',{name:'发送'}).boundingBox();
  assert(sendBottom && height - (sendBottom.y + sendBottom.height) >= 47, JSON.stringify({sendBottom,height}));
  const dockBefore=await dialog.locator('.grammar-ask').boundingBox();
  await dialog.locator('.grammar-content').evaluate(el=>{el.scrollTop=el.scrollHeight});
  const dockAfter=await dialog.locator('.grammar-ask').boundingBox();
  assert(dockBefore && dockAfter && Math.abs(dockAfter.y-dockBefore.y)<1 && dockAfter.y+dockAfter.height<=height+1, JSON.stringify({dockBefore,dockAfter}));
  await dialog.getByRole('button',{name:'这句的动词是怎么变化的？'}).click();
  await dialog.getByRole('heading',{name:'重点'}).waitFor();assert.equal(await dialog.getByText('持续状态',{exact:true}).evaluate(e=>e.tagName),'STRONG');
  assert.equal(await dialog.locator('.grammar-answer li').count(),2);
  await dialog.getByRole('button',{name:'隐藏历史'}).click(); assert.equal(await dialog.getByRole('heading',{name:'重点'}).count(),0);
  await dialog.getByRole('button',{name:'显示历史'}).click(); assert.equal(await dialog.getByRole('heading',{name:'重点'}).count(),1);
  const geometry=await dialog.evaluate(e=>({width:e.clientWidth,scrollWidth:e.scrollWidth}));
  assert(geometry.width<=width && geometry.scrollWidth<=geometry.width+1,JSON.stringify(geometry));
  await page.screenshot({path:resolve(output,`grammar-${width}x${height}.png`)});
  await dialog.getByRole('button',{name:'关闭语法解读'}).click();
  await dialog.getByRole('button',{name:'围绕这句追问'}).waitFor();
  await dialog.getByRole('button',{name:'关闭语法解读'}).click();
  await dialog.waitFor({state:'hidden'});assert(await page.getByLabel('当前选中歌词').textContent()==='第 2 句');
  await page.getByRole('button',{name:'解读本句',exact:true}).click();
  await dialog.getByRole('tab',{name:'本句追问 1'}).click(); await dialog.getByRole('heading',{name:'重点'}).waitFor();
  assert.equal(calls,2); await dialog.getByRole('button',{name:'关闭语法解读'}).click();
  await dialog.getByRole('button',{name:'关闭语法解读'}).click();
  results.push({width,height,calls,singleLinePlaybackCompleted:true,furiganaToggle:true,markdown:true,practiceRestored:true,...geometry});
  await context.close();
 }
 assert.deepEqual(errors,[]);writeFileSync(resolve(output,'grammar-results.json'),JSON.stringify(results,null,2));
 console.log(JSON.stringify({check:'grammar-browser',results}));
} finally {await browser.close();}
