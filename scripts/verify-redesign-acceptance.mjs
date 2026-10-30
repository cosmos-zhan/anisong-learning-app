import assert from 'node:assert/strict';
import {readFileSync,existsSync,mkdirSync} from 'node:fs';
import {resolve,extname,sep} from 'node:path';
import {chromium} from 'playwright-core';

// Take a consistent mobile snapshot of each redesigned workflow, including
// native-only entry points in a simulated Capacitor host. No account is used.
const root=resolve('dist'),output=resolve('test-results/piano-browser/redesign');mkdirSync(output,{recursive:true});
const browser=await chromium.launch({args:['--no-sandbox','--disable-dev-shm-usage']});
const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.wav':'audio/wav','.lrc':'text/plain','.musicxml':'application/xml'};
async function context(native=false){
 const c=await browser.newContext({viewport:{width:393,height:873},isMobile:true,hasTouch:true});
 if(native)await c.addInitScript(()=>{window.CapacitorCustomPlatform={name:'android'};});
 await c.route('**/*',route=>{
  const u=new URL(route.request().url());
  if(u.origin==='https://model.example')return route.fulfill({json:{choices:[{message:{content:JSON.stringify({meaning:'想继续唱歌',pieces:[{text:'歌っていたい',romaji:'utatte itai',explanation:'持续的愿望'}],points:[]})}}]}});
  if(u.origin!=='https://anisong.test')return route.abort();
  const path=resolve(root,'.'+decodeURIComponent(u.pathname==='/'?'/index.html':u.pathname));
  if(!path.startsWith(root+sep)||!existsSync(path))return route.fulfill({status:404});
  return route.fulfill({body:readFileSync(path),contentType:mime[extname(path)]||'application/octet-stream'});
 });
 return c;
}
try {
 const c=await context(),page=await c.newPage();
 const shot=async name=>page.screenshot({path:resolve(output,name+'.png')});
 await page.goto('https://anisong.test/?song=demo-original#downloads');
 const header=page.locator('.download-page-header');
 const position=await header.evaluate(el=>({align:getComputedStyle(el).justifyContent,back:el.querySelector('button').getBoundingClientRect().right,title:el.querySelector('h1').getBoundingClientRect().left}));
 assert.equal(position.align,'flex-start');assert(position.title-position.back<20,JSON.stringify(position));
 await shot('01-download-hub');
 await page.getByRole('button',{name:'在线歌曲',exact:true}).click();await page.getByRole('heading',{name:'在线歌曲',exact:true}).waitFor();await shot('02-online-songs');
 await page.getByRole('button',{name:'返回上一页'}).click();await page.getByRole('heading',{name:'下载与导入',exact:true}).waitFor();
 await page.getByRole('button',{name:'下载任务',exact:true}).click();await page.getByRole('heading',{name:'下载任务',exact:true}).first().waitFor();await shot('10-download-tasks');
 await page.getByRole('button',{name:'返回上一页'}).click();await page.getByRole('button',{name:'下载源设置'}).click();await shot('11-source');
 await page.goto('https://anisong.test/?song=demo-original#materials');await page.getByRole('heading',{name:'添加歌曲资料'}).waitFor();await shot('05-materials');
 await page.goto('https://anisong.test/?song=demo-original#updates');await page.getByRole('region',{name:'版本更新说明'}).waitFor();await shot('09-updates');
 await page.goto('https://anisong.test/?song=demo-original#lyrics');
 await page.getByRole('button',{name:/^第 2 句 /}).waitFor();
 await page.getByRole('button',{name:'解读本句',exact:true}).click();
 const dialog=page.getByRole('dialog',{name:'语法解读'});
 await dialog.getByLabel('接口地址').fill('https://model.example/v1/chat/completions');await dialog.getByLabel('模型名称').fill('fixture');await dialog.getByLabel('API 密钥').fill('fixture-key');
 await shot('08-model-settings');await dialog.getByRole('button',{name:'保存并开始解读'}).click();await dialog.getByText('想继续唱歌').waitFor();await shot('06-reading');
 await dialog.getByRole('button',{name:'围绕这句追问'}).click();await dialog.getByLabel('对当前句子的追问').fill('这句是什么意思？');await shot('07-chat');
 await c.close();
 const native=await context(true),n=await native.newPage();
 await n.goto('https://anisong.test/?song=demo-original#downloads');
 await n.getByRole('button',{name:'网易云导入',exact:true}).click();
 await n.getByLabel('分享链接或歌曲 ID').fill('https://music.163.com/song?id=123');
 await n.screenshot({path:resolve(output,'03-netease-import.png')});
 await n.getByRole('button',{name:/网易云账号/}).click();await n.getByRole('tab',{name:'短信登录'}).waitFor();
 await n.screenshot({path:resolve(output,'04-netease-account.png')});
 await n.getByRole('button',{name:'返回上一页'}).click();assert.equal(await n.getByLabel('分享链接或歌曲 ID').inputValue(),'https://music.163.com/song?id=123');
 await native.close();console.log(JSON.stringify({check:'redesign-acceptance',screens:11,native:'simulated Capacitor, no real device'}));
}finally{await browser.close();}
