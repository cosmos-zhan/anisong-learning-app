import 'fake-indexeddb/auto';
import {Blob as NodeBlob} from 'node:buffer';
import {webcrypto} from 'node:crypto';
import {fixture,note} from './piano-fixtures';
import {afterEach,beforeEach,expect,test,vi} from 'vitest';
import {Capacitor} from '@capacitor/core';
import {neteaseNativeTransport} from '../packages/core/netease-session';
import {materialStore} from '../packages/core/app-state';
import {parseNetease,importNetease,nativeNeteaseFetch} from '../packages/core/netease';
const bytes=new Uint8Array(1000);bytes.set([73,68,51,4,0,0,0,0,0,0]);
const calls:string[]=[];
const json=(data:unknown)=>new Response(JSON.stringify(data),{headers:{'Content-Type':'application/json'}});
const fake:typeof fetch=async(input,init)=>{
  const url=String(input);calls.push(url);
  if(url.includes('/api/song/detail/'))return json({songs:[{id:123,name:'テスト',artists:[{name:'歌手'}],duration:200000,fee:0}]});
  if(url.includes('/api/song/lyric?'))return json({lrc:{lyric:'[00:10.000]テスト\n[00:20.000]うた'},romalrc:{lyric:'[00:10.000]tesuto'},tlyric:{lyric:'[00:10.000]测试\n[00:20.000]歌'}});
  if(url.includes('/weapi/song/')){expect(init?.method).toBe('POST');return json({data:[{id:123,url:'https://m801.music.126.net/test.mp3',type:'mp3',size:1000,fee:0,code:200,freeTrialInfo:null}]});}
  if(url==='https://m801.music.126.net/test.mp3')return new Response(bytes,{status:init?.headers&&new Headers(init.headers).has('Range')?206:200,headers:{'Content-Type':'audio/mpeg','Content-Length':'1000','Content-Range':'bytes 0-999/1000'}});
  throw new Error('Unexpected network destination '+url);
};
beforeEach(async()=>{calls.length=0;await materialStore.removeDownload('netease-123');vi.restoreAllMocks();vi.stubGlobal('Blob',NodeBlob);vi.stubGlobal('crypto',webcrypto);});
afterEach(()=>vi.unstubAllGlobals());
test('a shared song link resolves to MP3 and all available lyric variants',async()=>{
  const parsed=await parseNetease('https://music.163.com/#/song?id=123',new AbortController().signal,fake);
  expect(parsed.song.id).toBe('123');expect(parsed.audio.status).toBe('available');expect(parsed.lyrics.counts).toMatchObject({original:2,romaji:1,translation:2});
  expect(parsed.lyrics.lrc).toContain('[00:10.000][romaji]tesuto');
});
test('the app downloads and atomically imports only local materials, with no catalogue writes',async()=>{
  const controller=new AbortController(),parsed=await parseNetease('123',controller.signal,fake);
  const row=await importNetease(parsed,controller.signal,()=>{}, {fetcher:fake,measureDuration:async()=>200});
  expect(row.download?.songId).toBe('netease-123');expect(row.download?.summary.lyrics).toBe(2);
  expect((await materialStore.get('netease-123:audio'))?.blob?.size).toBe(1000);
  expect((await materialStore.get('netease-123:lyrics'))?.text).toContain('[translation]测试');
  expect(calls.every(value=>['music.163.com','m801.music.126.net'].includes(new URL(value).hostname))).toBe(true);
  expect(calls.some(value=>/publish|uploader|catalog/.test(value))).toBe(false);
});
test('reimporting the same NetEase song updates one device record and retains original lyrics if missing remotely',async()=>{
  const signal=new AbortController().signal,parsed=await parseNetease('123',signal,fake);
  await importNetease(parsed,signal,()=>{},{fetcher:fake,measureDuration:async()=>200});
  await importNetease({...parsed,lyrics:{...parsed.lyrics,lrc:''}},signal,()=>{},{fetcher:fake,measureDuration:async()=>200});
  expect((await materialStore.all()).filter(row=>row.download)).toHaveLength(1);
  expect((await materialStore.get('netease-123:lyrics'))?.text).toContain('tesuto');
});
test('a short/trial-length file cannot replace an existing local song',async()=>{
  const signal=new AbortController().signal,parsed=await parseNetease('123',signal,fake);
  await materialStore.put({id:'netease-123:audio',name:'old.mp3',text:'old-data'});
  await expect(importNetease(parsed,signal,()=>{},{fetcher:fake,measureDuration:async()=>30})).rejects.toThrow('时长');
  expect((await materialStore.get('netease-123:audio'))?.text).toBe('old-data');
});
test('cancellation before or during transfer never commits a local import',async()=>{
  const initial=new AbortController(),parsed=await parseNetease('123',initial.signal,fake);initial.abort();
  await expect(importNetease(parsed,initial.signal,()=>{},{fetcher:fake,measureDuration:async()=>200})).rejects.toThrow();
  const controller=new AbortController();const late:typeof fetch=async(input,init)=>{if(String(input).includes('/weapi/song/'))controller.abort();return fake(input,init);};
  await expect(importNetease(parsed,controller.signal,()=>{},{fetcher:late,measureDuration:async()=>200})).rejects.toThrow();
  expect(await materialStore.all()).toHaveLength(0);
});
test('native HTTP uses the device bridge and blocks arbitrary hosts and management credentials',async()=>{
  vi.spyOn(Capacitor,'isNativePlatform').mockReturnValue(true);
  const request=vi.spyOn(neteaseNativeTransport,'request').mockResolvedValue({status:200,headers:{'Content-Type':'audio/mpeg'},data:btoa('ID3audio'),url:'https://m801.music.126.net/test.mp3'});
  expect(await(await nativeNeteaseFetch('https://m801.music.126.net/test.mp3')).text()).toBe('ID3audio');
  expect(request).toHaveBeenCalledWith(expect.objectContaining({responseType:'arraybuffer',disableRedirects:true}));
  await expect(nativeNeteaseFetch('https://evil.test/test.mp3')).rejects.toThrow('来源');
  await expect(nativeNeteaseFetch('https://music.163.com/api/song/lyric',{headers:{Authorization:'private'}})).rejects.toThrow('凭据');
  expect(request).toHaveBeenCalledTimes(1);
});

test('reimporting preserves and reparses a previously imported local score',async()=>{
 const signal=new AbortController().signal,parsed=await parseNetease('123',signal,fake);
 await materialStore.put({id:'netease-123:score',name:'previous.musicxml',text:fixture([note()])});
 const saved=await importNetease(parsed,signal,()=>{},{fetcher:fake,measureDuration:async()=>200});
 expect(saved.download?.summary.score).toBeTruthy();
 expect((await materialStore.get('netease-123:score'))?.text).toContain('score-partwise');
});

test('native cancellation rejects immediately and ignores a late network completion',async()=>{
 vi.spyOn(Capacitor,'isNativePlatform').mockReturnValue(true);
 let finish!:(value:Awaited<ReturnType<typeof neteaseNativeTransport.request>>)=>void;
 const transport=vi.spyOn(neteaseNativeTransport,'request').mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve;}));
 const controller=new AbortController(),pending=nativeNeteaseFetch('https://m801.music.126.net/test.mp3',{signal:controller.signal});
 await vi.waitFor(()=>expect(transport).toHaveBeenCalled());
 controller.abort();await expect(pending).rejects.toMatchObject({name:'AbortError'});
 finish({status:200,headers:{'Content-Type':'audio/mpeg'},data:btoa('ID3audio'),url:'https://m801.music.126.net/test.mp3'});
 await Promise.resolve();expect(await materialStore.all()).toHaveLength(0);
});

test('cancelling while loading the encrypted session prevents the native request from starting',async()=>{
 vi.spyOn(Capacitor,'isNativePlatform').mockReturnValue(true);
 const transport=vi.spyOn(neteaseNativeTransport,'request'),controller=new AbortController();
 const pending=nativeNeteaseFetch('https://music.163.com/api/test',{signal:controller.signal});controller.abort();
 await expect(pending).rejects.toMatchObject({name:'AbortError'});expect(transport).not.toHaveBeenCalled();
});
