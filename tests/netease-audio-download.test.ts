import 'fake-indexeddb/auto';
import {Blob as NodeBlob} from 'node:buffer';
import {webcrypto} from 'node:crypto';
import {afterEach,beforeEach,expect,test,vi} from 'vitest';
vi.mock('../packages/core/netease-session',()=>({getNeteaseSession:async()=> 'MUSIC_U=fixture-account; __csrf=fixture-csrf',neteaseNativeTransport:{request:vi.fn()}}));
import {neteaseApi} from '../packages/core/netease-api.mjs';
import {parseNetease,importNetease} from '../packages/core/netease';
import {materialStore} from '../packages/core/app-state';
import {detectAudioFormat,audioFormats,type NeteaseAudioFormat} from '../packages/core/netease-audio.mjs';
import {neteaseAudioRequest} from '../packages/core/netease-player.mjs';
const json=(data:unknown)=>new Response(JSON.stringify(data),{headers:{'Content-Type':'application/json'}});
const request=(audio=false)=>new Request('https://device.test/api/netease/'+(audio?'audio?id=2097485072':'parse'),{
  method:audio?'GET':'POST',headers:{'X-Anisong-Upload':'1'},...audio?{}:{body:JSON.stringify({input:'2097485072'})}});
const options={cookie:'MUSIC_U=fixture-account; __csrf=fixture-csrf'};
const payload=(format:NeteaseAudioFormat)=>{
  const bytes=new Uint8Array(1000);
  if(format==='mp3')bytes.set([73,68,51]);
  if(format==='flac')bytes.set([102,76,97,67]);
  if(format==='aac')bytes.set([255,241,80,128,0,255,252]);
  if(format==='m4a')bytes.set([0,0,0,24,102,116,121,112,77,52,65,32,0,0,0,0]);
  return bytes;
};
const track=(format='mp3')=>({id:2097485072,url:'https://m801.music.126.net/fixture.'+format,type:format,size:1000,code:200,fee:1,freeTrialInfo:null});
function fixture(audio:(url:string,init?:RequestInit)=>Promise<Response>):typeof fetch{
  return async(input,init)=>{
    const url=String(input);
    if(url.includes('/api/song/detail'))return json({songs:[{id:2097485072,name:'Fixture',duration:200000,fee:1}]});
    if(url.includes('/api/song/lyric'))return json({lrc:{lyric:'[00:01]fixture'}});
    return audio(url,init);
  };
}
beforeEach(async()=>{
  vi.stubGlobal('crypto',webcrypto);vi.stubGlobal('Blob',NodeBlob);
  await materialStore.removeDownload('netease-2097485072');
});
afterEach(()=>{vi.restoreAllMocks();vi.unstubAllGlobals();});
test('download v1 uses a scalar id and player v1 uses ids, authenticated and without IP overrides',async()=>{
  vi.spyOn(crypto,'getRandomValues').mockImplementation(array=>{(array as Uint8Array).fill(0);return array;});
  const decode=async(body:string)=>{
    const key=async(text:string)=>crypto.subtle.importKey('raw',new TextEncoder().encode(text),'AES-CBC',false,['decrypt']);
    const decrypt=async(value:string,secret:string)=>new TextDecoder().decode(await crypto.subtle.decrypt({name:'AES-CBC',iv:new TextEncoder().encode('0102030405060708')},await key(secret),Uint8Array.from(atob(value),char=>char.charCodeAt(0))));
    return JSON.parse(await decrypt(await decrypt(new URLSearchParams(body).get('params')!,'aaaaaaaaaaaaaaaa'),'0CoJUm6Qyw8W8jud'));
  };
  for(const kind of ['download','player'] as const){
    const call=await neteaseAudioRequest('2097485072',kind,'exhigh',undefined,options.cookie+'; Authorization=private');
    expect(call.url).toBe(`https://music.163.com/weapi/song/enhance/${kind}/url/v1`);
    expect(await decode(String(call.init.body))).toMatchObject({level:'exhigh',csrf_token:'fixture-csrf',...kind==='download'?{id:'2097485072'}:{ids:'[2097485072]',encodeType:'flac'}});
    const headers=new Headers(call.init.headers);expect(headers.get('Cookie')).toBe(options.cookie);
    expect(headers.has('Authorization')).toBe(false);expect(headers.has('X-Forwarded-For')).toBe(false);
  }
});
test.each(['mp3','flac','m4a','aac'] as const)('a real %s container keeps its MIME, extension and bytes through local import',async format=>{
  const bytes=payload(format),calls:string[]=[];
  const fetcher=fixture(async(url,init)=>{
    calls.push(url);
    if(url.includes('/weapi/'))return json({code:200,data:track(format)});
    expect(new Headers(init?.headers).has('Cookie')).toBe(false);
    return new Response(bytes,{headers:{'Content-Length':'1000','Content-Type':audioFormats[format].mime}});
  });
  const signal=new AbortController().signal,parsed=await parseNetease('2097485072',signal,fetcher);
  expect(parsed.audio).toMatchObject({status:'available',format});
  await importNetease(parsed,signal,()=>{},{fetcher,measureDuration:async blob=>{expect(blob.type).toBe(audioFormats[format].mime);return 200;}});
  const saved=await materialStore.get('netease-2097485072:audio');
  expect(saved?.name).toBe('Fixture.'+audioFormats[format].extension);expect(saved?.blob?.size).toBe(1000);
  expect(calls[0]).toContain('/download/url/v1');expect(calls.some(url=>url.includes('/player/'))).toBe(false);
});
test('a successful address with a denied file does not prevent a usable player v1 fallback',async()=>{
  const fetcher=fixture(async(url)=>{
    if(url.includes('/download/'))return json({code:200,data:{...track(),url:'https://m801.music.126.net/denied.mp3'}});
    if(url.includes('/weapi/'))return json({code:200,data:[track()]});
    return url.endsWith('denied.mp3')?new Response('denied',{status:403}):new Response(payload('mp3'),{headers:{'Content-Length':'1000'}});
  });
  const parsed=await(await neteaseApi(request(),fetcher,options)).json();
  expect(parsed.audio).toMatchObject({status:'available',format:'mp3'});
  expect(parsed.audio.diagnostics).toEqual(expect.arrayContaining([expect.objectContaining({source:'download-v1',stage:'audio',http:403})]));
});
test('lossless is tried after high quality fails, and an overlarge lossless file falls back to standard',async()=>{
  vi.spyOn(crypto,'getRandomValues').mockImplementation(array=>{(array as Uint8Array).fill(0);return array;});
  const decrypt=async(value:string,secret:string)=>{
    const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(secret),'AES-CBC',false,['decrypt']);
    return new TextDecoder().decode(await crypto.subtle.decrypt({name:'AES-CBC',iv:new TextEncoder().encode('0102030405060708')},key,Uint8Array.from(atob(value),char=>char.charCodeAt(0))));
  };
  let overlarge=false;const qualities:string[]=[];
  const fetcher=fixture(async(url,init)=>{
    if(url.includes('/weapi/')){
      const data=JSON.parse(await decrypt(await decrypt(new URLSearchParams(String(init?.body)).get('params')!,'aaaaaaaaaaaaaaaa'),'0CoJUm6Qyw8W8jud'));
      qualities.push(data.level??'legacy');
      if(!url.includes('/download/'))return json({data:[]});
      if(data.level==='exhigh')return json({data:null});
      if(data.level==='lossless')return json({data:{...track('flac'),size:overlarge?30*1024*1024:1000}});
      // A slow standard response lets the lossless candidate finish first.
      await new Promise(resolve=>setTimeout(resolve,20));return json({data:track()});
    }
    return new Response(payload(url.endsWith('.flac')?'flac':'mp3'),{headers:{'Content-Length':'1000'}});
  });
  expect((await(await neteaseApi(request(),fetcher,options)).json()).audio.format).toBe('flac');
  expect(qualities).toContain('lossless');overlarge=true;
  expect((await(await neteaseApi(request(),fetcher,options)).json()).audio.format).toBe('mp3');
});
test('403, 404 and 500 retain the actual file status without exposing credentials or signed URLs',async()=>{
  for(const status of [403,404,500]){
    const fetcher=fixture(async url=>url.includes('/weapi/')?json({code:200,data:[{...track(),url:'https://m801.music.126.net/private-signed-path.mp3?secret=hidden'}]}):new Response('private upstream body',{status}));
    const result=await(await neteaseApi(request(),fetcher,options)).json();
    expect(result.audio.status).toBe('unavailable');expect(result.audio.message).toContain('HTTP '+status);
    expect(result.audio.diagnostics.every((row:{stage:string;http:number})=>row.stage==='audio'&&row.http===status)).toBe(true);
    const text=JSON.stringify(result);for(const secret of ['fixture-account','fixture-csrf','private-signed-path','secret=hidden','private upstream body'])expect(text).not.toContain(secret);
  }
});
test('trials, encrypted caches, HTML and mislabeled files cannot be imported',async()=>{
  for(const invalid of [{...track(),freeTrialInfo:{start:0,end:30}},{...track(),type:'ncm'}]){
    let fileRequested=false;
    const fetcher=fixture(async url=>{if(url.includes('/weapi/'))return json({data:[invalid]});fileRequested=true;return new Response(payload('mp3'));});
    expect((await(await neteaseApi(request(),fetcher,options)).json()).audio.status).toBe('unavailable');expect(fileRequested).toBe(false);
  }
  for(const bytes of [new TextEncoder().encode('<html>denied</html>'),payload('flac')]){
    const fetcher=fixture(async url=>url.includes('/weapi/')?json({data:[track()]}):new Response(bytes));
    expect((await(await neteaseApi(request(),fetcher,options)).json()).audio.status).toBe('unavailable');
  }
  expect(detectAudioFormat(payload('aac'))).toBe('aac');
});
test('a failed full transfer invalidates the checked address cache so retry obtains a fresh one',async()=>{
  const cache=new Map<string,unknown>();let requests=0,denyFull=false;
  const fetcher=fixture(async(url,init)=>{
    if(url.includes('/weapi/')){requests++;return json({data:track()});}
    if(denyFull&&!new Headers(init?.headers).has('Range'))return new Response('expired',{status:403});
    return new Response(payload('mp3'),{headers:{'Content-Length':'1000'}});
  });
  await neteaseApi(request(),fetcher,{...options,cache});expect(requests).toBe(1);denyFull=true;
  const failed=await neteaseApi(request(true),fetcher,{...options,cache});expect(failed.status).toBe(422);expect((await failed.json()).error).toContain('HTTP 403');
  await neteaseApi(request(),fetcher,{...options,cache});expect(requests).toBe(2);
});
