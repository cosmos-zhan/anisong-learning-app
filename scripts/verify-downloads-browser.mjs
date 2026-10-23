import assert from 'node:assert/strict';
import {readFileSync,existsSync,mkdirSync,writeFileSync} from 'node:fs';
import {resolve,extname,sep} from 'node:path';
import {chromium} from 'playwright-core';
import mediaWorker from '../services/media-source/worker.ts';
import {zipSync,strToU8} from 'fflate';
const root=resolve('dist'),output=resolve('test-results/piano-browser');mkdirSync(output,{recursive:true});
const browser=await chromium.launch({args:['--no-sandbox','--disable-dev-shm-usage']});
const results=[],errors=[];
try {
 for(const [width,height] of [[393,873],[740,320]]) {
  const context=await browser.newContext({viewport:{width,height},isMobile:true,hasTouch:true});let blockMedia=false,blocked=0,authorizedFiles=0,holdAudio=true,releaseAudio;
  const audioGate=new Promise(resolve=>{releaseAudio=resolve;});
  const accessCode='browser-test-private-source-0123456789';
  const rawCatalog=JSON.parse(readFileSync(resolve(root,'demo/catalog.json'),'utf8'));
  await context.route('https://raw.githubusercontent.com/**',route=>{
   if(blockMedia){blocked++;return route.abort();}
   const name=new URL(route.request().url()).pathname.split('/').at(-1),path=resolve(root,'demo',name);
   if(!path.startsWith(resolve(root,'demo')+sep)||!existsSync(path))return route.fulfill({status:404});
   return route.fulfill({body:readFileSync(path),headers:{'Access-Control-Allow-Origin':'*'},contentType:name.endsWith('.json')?'application/json':'application/octet-stream'});
  });
  const privateCatalog=structuredClone(rawCatalog),assetPaths=new Map();
  for(const song of privateCatalog.songs)for(const key of ['audio','lyrics','score'])if(song[key]){
   const asset=song[key],name=asset.sha256.slice(0,16)+'-'+asset.name;
   assetPaths.set('/'+name,resolve(root,'demo',asset.url));asset.url=name;
  }
  await context.route('https://private-media.test/**',async route=>{
   if(blockMedia){blocked++;return route.abort();}
   const req=route.request(),headers=await req.allHeaders();
   const response=await mediaWorker.fetch(new Request(req.url(),{method:req.method(),headers}),{
    MEDIA_TOKEN:accessCode,ALLOWED_ORIGINS:'https://anisong.test',ASSETS:{fetch:async request=>{
     authorizedFiles++;const path=new URL(request.url).pathname;
     if(path==='/catalog.json')return new Response(JSON.stringify(privateCatalog),{headers:{'Content-Type':'application/json'}});
     const file=assetPaths.get(path);return file?new Response(readFileSync(file)):new Response('',{status:404});
    }}
   });
   return route.fulfill({status:response.status,headers:Object.fromEntries(response.headers),body:Buffer.from(await response.arrayBuffer())});
  });
  await context.route('https://anisong.test/**',async route=>{
   const url=new URL(route.request().url());
   if(blockMedia&&url.pathname.startsWith('/demo/')){blocked++;return route.abort();}
   if(holdAudio&&url.pathname.endsWith('/demo.wav'))await audioGate;
   const path=resolve(root,'.'+decodeURIComponent(url.pathname==='/'?'/index.html':url.pathname));
   if(!path.startsWith(root+sep)||!existsSync(path))return route.fulfill({status:404});
   return route.fulfill({body:readFileSync(path),contentType:({'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.wav':'audio/wav','.lrc':'text/plain','.musicxml':'application/xml'})[extname(path)]||'application/octet-stream'});
  });
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
  await page.goto('https://anisong.test/?song=demo-original#downloads');
  await page.getByRole('heading',{name:'春日影 · CRYCHIC',exact:true}).waitFor();
  await page.getByRole('button',{name:'下载到本地',exact:true}).waitFor();
  await page.getByRole('button',{name:'下载源设置',exact:true}).click();
  await page.getByRole('button',{name:'试用原创示例源',exact:true}).click();
  await page.getByRole('button',{name:'下载到本地',exact:true}).click();
  await page.getByRole('tabpanel',{name:'下载任务',exact:true}).waitFor();
  // Delay the actual audio response, leave the module, and only then release it.
  await page.getByRole('button',{name:'曲库',exact:true}).click();
  holdAudio=false;releaseAudio();
  await page.getByRole('button',{name:/下载管理 · 1 首已下载/}).waitFor();
  await page.getByRole('button',{name:/下载管理 · 1 首已下载/}).click();
  await page.getByRole('tab',{name:'已下载',exact:true}).click();
  await page.getByRole('region',{name:'本地下载',exact:true}).getByRole('button',{name:'歌词学唱',exact:true}).waitFor();
  await page.getByRole('button',{name:'下载源设置',exact:true}).click();
  // Cross-origin private source: wrong code must fail before the asset binding is invoked.
  await page.getByLabel('素材源地址',{exact:true}).fill('https://private-media.test/catalog.json');
  await page.getByLabel('访问码（私人素材源可选）',{exact:true}).fill('wrong-private-source-code-0123456789');
  await page.getByRole('button',{name:'查看歌曲',exact:true}).click();
  await page.getByRole('alert').filter({hasText:'需要有效访问码'}).waitFor();
  assert.equal(authorizedFiles,0);
  await page.getByLabel('访问码（私人素材源可选）',{exact:true}).fill(accessCode);
  await page.getByRole('button',{name:'查看歌曲',exact:true}).click();
  await page.getByRole('button',{name:'重新下载并替换',exact:true}).click();
  await page.getByText('已下载并保存到此设备，可以离线练习。',{exact:true}).waitFor();
  assert.equal(authorizedFiles,4,'Private catalog and three actual media files must be authenticated');
  assert.equal(await page.evaluate(code=>JSON.stringify({...localStorage}).includes(code),accessCode),false,'Never persist the access code');
  // The replacement for cloud-browser login: download a private package in the user's browser,
  // then import its real bytes through the App file picker with the media server unavailable.
  blockMedia=true;
  await page.getByText('本地导入与存储',{exact:true}).click();
  const packFiles={};for(const [name,path] of assetPaths)packFiles[name.slice(1)]=readFileSync(path);
  const badCatalog=structuredClone(privateCatalog);badCatalog.songs[0].lyrics.sha256='0'.repeat(64);
  await page.getByLabel('选择素材包导入',{exact:true}).setInputFiles({name:'bad.anisong.zip',mimeType:'application/zip',buffer:Buffer.from(zipSync({'catalog.json':strToU8(JSON.stringify(badCatalog)),...packFiles}))});
  await page.getByRole('alert').filter({hasText:'文件校验不一致'}).waitFor();
  await page.getByLabel('选择素材包导入',{exact:true}).setInputFiles({name:'demo.anisong.zip',mimeType:'application/zip',buffer:Buffer.from(zipSync({'catalog.json':strToU8(JSON.stringify(privateCatalog)),...packFiles}))});
  await page.getByText('素材包已导入并保存到此设备，可以离线练习。',{exact:true}).waitFor();
  await page.getByRole('region',{name:'本地下载',exact:true}).getByRole('button',{name:'歌词学唱',exact:true}).waitFor();
  await page.screenshot({path:resolve(output,`downloads-${width}x${height}.png`)});
  blockMedia=true;
  await page.goto('https://anisong.test/?song=demo-original#lyrics');
  await page.getByRole('button',{name:'第 2 句 いつまでも覚えていたい',exact:true}).click();
  await page.waitForFunction(()=>Number(document.querySelector('[aria-label="片段进度"]')?.value)>16.6);
  await page.getByRole('button',{name:'暂停',exact:true}).click();
  await page.goto('https://anisong.test/?song=demo-original#piano-prep');
  await page.getByRole('button',{name:'进入钢琴练习 →',exact:true}).waitFor();
  assert.equal(blocked,0,'Saved audio, LRC and score must load without contacting the media host after a page reload');
  blockMedia=false;
  await page.goto('https://anisong.test/?song=demo-original#downloads');
  await page.getByRole('tab',{name:'已下载',exact:true}).click();
  await page.getByRole('button',{name:'移除下载',exact:true}).click();
  await page.getByRole('alertdialog',{name:'确认移除下载',exact:true}).getByRole('button',{name:'确认移除',exact:true}).click();
  await page.getByText('还没有下载歌曲',{exact:true}).waitFor();
  results.push({width,height,downloaded:true,continuesAcrossNavigation:true,localDownloadManagement:true,removeDownload:true,privateSource:true,invalidCodeRejected:true,codeNotPersisted:true,offlinePackageImport:true,corruptPackageRejected:true,reloadWithMediaUnavailable:true,realLocalPlayback:true,scoreRestored:true});
  await context.close();
 }
 assert.deepEqual(errors,[]);writeFileSync(resolve(output,'downloads-results.json'),JSON.stringify(results,null,2));console.log(JSON.stringify({check:'downloads-browser',results}));
} finally {await browser.close();}
