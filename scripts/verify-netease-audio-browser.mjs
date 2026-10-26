import assert from 'node:assert/strict';
import {readFileSync,mkdirSync,writeFileSync,rmSync} from 'node:fs';
import {resolve} from 'node:path';
import {build} from 'vite';
import {chromium} from 'playwright-core';

// Self-generated CC0 two-second tones, fixed so CI needs no system encoder.
// Exercise actual browser decoding, native Fetch adaptation and IndexedDB import.
const fixtures=JSON.parse(readFileSync('tests/fixtures/netease-generated-audio.json','utf8')).fixtures;
let browser;
const entry=resolve('test-results/netease-audio-browser-entry.ts');
mkdirSync(resolve('test-results'),{recursive:true});
writeFileSync(entry,`export * from ${JSON.stringify(resolve('packages/core/netease.ts'))};export {materialStore} from ${JSON.stringify(resolve('packages/core/app-state.ts'))};`);
try{
 const nativeMock=`
 export const Capacitor={isNativePlatform:()=>true};
 export const registerPlugin=()=>({read:async()=>({cookie:'MUSIC_U=audio-fixture-session'}),request:async(options)=>{
  const f=globalThis.__neteaseAudioFixture,u=new URL(options.url);let data,status=200;
  f.hostsOnly&&=u.hostname==='music.163.com'||u.hostname==='m801.music.126.net';
  if(u.hostname==='music.163.com'){
   f.accountAttached&&=options.headers.cookie==='MUSIC_U=audio-fixture-session';
   if(u.pathname.includes('/api/song/detail'))data={songs:[{id:f.id,name:'Generated tone',duration:2000,fee:1}]};
   else if(u.pathname.includes('/api/song/lyric'))data={lrc:{lyric:'[00:00]Generated tone'},romalrc:{lyric:'[00:00]tone'},tlyric:{lyric:'[00:00]测试音'}};
   else {const denied=f.mode==='denied'||f.mode==='fallback'&&u.pathname.includes('/download/');
    data={code:200,data:{id:f.id,url:'https://m801.music.126.net/'+(denied?'denied':f.format),type:f.format,size:f.audio.bytes,code:200,fee:1,freeTrialInfo:null}};}
   return {status,url:options.url,headers:{'Content-Type':'application/json'},data:btoa(String.fromCharCode(...new TextEncoder().encode(JSON.stringify(data))))};
  }
  f.cdnNoCookie&&=!options.headers.cookie;
  if(u.pathname==='/denied')return {status:403,url:options.url,headers:{'Content-Type':'text/html'},data:btoa('denied')};
  return {status:200,url:options.url,headers:{'Content-Type':f.audio.mime,'Content-Length':String(f.audio.bytes)},data:f.audio.data};
 }});`;
 const output=await build({configFile:false,logLevel:'error',plugins:[{
  name:'netease-audio-native-fixture',enforce:'pre',
  resolveId(id){if(id==='@capacitor/core')return '\0native-audio-fixture';},
  load(id){if(id==='\0native-audio-fixture')return nativeMock;},
 }],build:{write:false,target:'es2022',lib:{entry,name:'NeteaseAudioCheck',formats:['iife']}}});
 const code=(Array.isArray(output)?output[0]:output).output.find(row=>row.type==='chunk').code;
 assert(code.includes('__neteaseAudioFixture'));
 browser=await chromium.launch({executablePath:process.env.BROWSER_EXECUTABLE_PATH||undefined,args:['--no-sandbox','--disable-dev-shm-usage']});
 const context=await browser.newContext();
 await context.route('**/*',route=>new URL(route.request().url()).origin==='https://netease-audio.test'
  ?route.fulfill({contentType:'text/html',body:'<!doctype html><title>Generated audio import check</title>'}):route.abort());
 const page=await context.newPage();await page.goto('https://netease-audio.test/');await page.addScriptTag({content:code});
 const results=[];
 for(const [index,format]of Object.keys(fixtures).entries()){
  await page.evaluate(fixture=>{globalThis.__neteaseAudioFixture=fixture;},{format,audio:fixtures[format],id:2097000000+index,mode:'success',hostsOnly:true,accountAttached:true,cdnNoCookie:true});
  const result=await page.evaluate(async()=>{
   const f=globalThis.__neteaseAudioFixture,api=globalThis.NeteaseAudioCheck,signal=new AbortController().signal;
   const parsed=await api.parseNetease(String(f.id),signal);
   const saved=await api.importNetease(parsed,signal,()=>{});
   const reopened=await api.materialStore.get('netease-'+f.id+':audio');
   const audio=new Audio(),url=URL.createObjectURL(reopened.blob);
   const seconds=await new Promise((resolve,reject)=>{const timeout=setTimeout(()=>reject(new Error('Persisted audio metadata timed out')),10000);
    audio.onloadedmetadata=()=>{clearTimeout(timeout);resolve(audio.duration);};audio.onerror=()=>{clearTimeout(timeout);reject(new Error('Persisted audio did not decode'));};audio.src=url;audio.load();});
   audio.removeAttribute('src');audio.load();URL.revokeObjectURL(url);
   const decoder=new AudioContext();let decodedSeconds=0,pcmRms=0;
   try{const pcm=await decoder.decodeAudioData(await reopened.blob.arrayBuffer());decodedSeconds=pcm.duration;const samples=pcm.getChannelData(0);for(const value of samples)pcmRms+=value*value;pcmRms=Math.sqrt(pcmRms/samples.length);}finally{await decoder.close();}
   return {decodedSeconds,pcmRms,format:parsed.audio.format,name:reopened.name,bytes:reopened.blob.size,seconds,
    localSaved:!!saved.download,lyricsSaved:!!(await api.materialStore.get('netease-'+f.id+':lyrics'))?.text,
    hostsOnly:f.hostsOnly,accountAttached:f.accountAttached,cdnNoCookie:f.cdnNoCookie,
    noCredentialsInResult:!JSON.stringify(parsed).includes('audio-fixture-session')};
  });
  assert.equal(result.format,format);assert(result.name.endsWith('.'+format));assert.equal(result.bytes,fixtures[format].bytes);
  assert(Math.abs(result.seconds-2)<.3&&Math.abs(result.decodedSeconds-2)<.3&&result.pcmRms>.01,JSON.stringify(result));
  for(const key of ['localSaved','lyricsSaved','hostsOnly','accountAttached','cdnNoCookie','noCredentialsInResult'])assert.equal(result[key],true,key);
  results.push(result);
 }
 const fallback=await page.evaluate(async()=>{
  const f=globalThis.__neteaseAudioFixture,api=globalThis.NeteaseAudioCheck;f.mode='fallback';f.id++;
  const parsed=await api.parseNetease(String(f.id),new AbortController().signal);
  f.mode='denied';f.id++;
  const failed=await api.parseNetease(String(f.id),new AbortController().signal);
  return {fallbackAfterFile403:parsed.audio.status==='available'&&parsed.audio.diagnostics.some(row=>row.http===403),
   file403Visible:failed.audio.status==='unavailable'&&failed.audio.message.includes('HTTP 403'),
   safeDiagnostics:!JSON.stringify(failed).includes('https://m801')&&!JSON.stringify(failed).includes('audio-fixture-session')};
 });
 for(const value of Object.values(fallback))assert.equal(value,true);
 const out=resolve(process.env.BROWSER_RESULTS_DIR||'test-results/piano-browser');mkdirSync(out,{recursive:true});
 writeFileSync(resolve(out,'netease-audio-import.json'),JSON.stringify({results,...fallback},null,2)+'\n');
 console.log(JSON.stringify({check:'netease-native-audio-browser',results,...fallback}));await context.close();
}finally{await browser?.close();rmSync(entry,{force:true});}
