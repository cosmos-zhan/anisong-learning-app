import 'fake-indexeddb/auto';
import {Blob as NodeBlob} from 'node:buffer';
import {webcrypto,createHash} from 'node:crypto';
import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import {parseCatalog,downloadSong,loadCatalog,sourceUrl,sourceAccess,type RemoteSong} from '../packages/core/downloads';
import {materialStore} from '../packages/core/app-state';
import {fixture,note} from './piano-fixtures';
const bytes = (s:string)=>new TextEncoder().encode(s);
const hash = (b:Uint8Array)=>createHash('sha256').update(b).digest('hex');
const content = {audio:bytes('fixture audio'),lyrics:bytes('[00:00]line\n[00:00][romaji]line'),score:bytes(fixture([note()]))};
function song():RemoteSong {return {id:'download-test',title:'Downloaded test',revision:'1',...Object.fromEntries(Object.entries(content).map(([key,data])=>[key,{url:`https://source.test/${key}`,name:key==='score'?'score.musicxml':key,bytes:data.length,sha256:hash(data)}]))} as RemoteSong;}
beforeEach(()=>{vi.stubGlobal('Blob',NodeBlob);vi.stubGlobal('crypto',webcrypto);vi.stubGlobal('fetch',vi.fn(async(input:string)=>new Response(content[new URL(input).pathname.slice(1) as keyof typeof content])));});
afterEach(()=>vi.unstubAllGlobals());
it('validates remote manifests, rejects duplicate IDs/unsafe sources and resolves relative assets',()=>{
 const d={schema:1,title:'My source',songs:[song()]};
 expect(parseCatalog(d,'https://source.test/catalog.json').songs).toHaveLength(1);
 expect(()=>parseCatalog({...d,songs:[song(),song()]},'https://source.test/catalog.json')).toThrow('重复');
 expect(()=>parseCatalog({...d,songs:[{...song(),id:undefined}]},'https://source.test/catalog.json')).toThrow();
 expect(()=>sourceUrl('file:///etc/passwd')).toThrow();
 expect(()=>sourceUrl('https://user:pass@example.org/a')).toThrow();
 expect(()=>sourceUrl('http://other.test/a','https://app.test/')).toThrow();
 expect(parseCatalog({...d,songs:[{...song(),audio:{...song().audio,url:'audio'}}]},'https://source.test/a/catalog.json').songs[0].audio.url).toBe('https://source.test/a/audio');
});
it('downloads verified materials in one local package that is readable with the network gone',async()=>{
 const p=vi.fn();await downloadSong(song(),new AbortController().signal,p);
 vi.stubGlobal('fetch',vi.fn().mockRejectedValue(new Error('offline')));
 expect((await materialStore.get('download-test:lyrics'))?.text).toContain('[romaji]');
 expect((await materialStore.get('download-test:score'))?.text).toContain('score-partwise');
 expect((await materialStore.get('download-test:audio'))?.blob?.size).toBe(content.audio.length);
 expect((await materialStore.get('download-test:download'))?.download?.revision).toBe('1');
 expect(p).toHaveBeenLastCalledWith({phase:'保存到本地',received:content.audio.length+content.lyrics.length+content.score.length,total:content.audio.length+content.lyrics.length+content.score.length});
});
it('bad checksum, partial download and cancellation preserve all old local material',async()=>{
 await materialStore.put({id:'download-test:lyrics',name:'old',text:'old original'});
 const bad=song();bad.lyrics!.sha256='0'.repeat(64);
 await expect(downloadSong(bad,new AbortController().signal,()=>{})).rejects.toThrow('校验');
 expect((await materialStore.get('download-test:lyrics'))?.text).toBe('old original');
 const short=song();short.audio.bytes++;
 await expect(downloadSong(short,new AbortController().signal,()=>{})).rejects.toThrow('不完整');
 const controller=new AbortController();controller.abort();
 await expect(downloadSong(song(),controller.signal,()=>{})).rejects.toThrow();
 expect((await materialStore.get('download-test:lyrics'))?.text).toBe('old original');
});
it('rejects oversized body, malformed lyrics and invalid score without committing staged audio',async()=>{
 const s={...song(),id:'invalid-download'};s.audio.bytes=1;
 await expect(downloadSong(s,new AbortController().signal,()=>{})).rejects.toThrow('超过');
 vi.stubGlobal('fetch',vi.fn(async(input:string)=>new Response(input.endsWith('lyrics')?'not lrc':content.audio)));
 const invalid={...song(),id:'invalid-download',lyrics:{...song().lyrics!,bytes:7,sha256:hash(bytes('not lrc'))},score:undefined};
 await expect(downloadSong(invalid,new AbortController().signal,()=>{})).rejects.toThrow('时间戳');
 expect(await materialStore.get('invalid-download:audio')).toBeUndefined();
});
it('database transaction rolls back writes when cancelled',async()=>{
 const controller=new AbortController();controller.abort();
 await expect(materialStore.putMany([{id:'cancelled-write',name:'test'}],controller.signal)).rejects.toThrow();
 expect(await materialStore.get('cancelled-write')).toBeUndefined();
});
it('rejects sign-in HTML and HTTP errors as catalogs',async()=>{
 vi.stubGlobal('fetch',vi.fn(async()=>new Response('<html>login</html>')));
 await expect(loadCatalog('https://source.test/catalog.json',new AbortController().signal)).rejects.toThrow('登录页');
 vi.stubGlobal('fetch',vi.fn(async()=>new Response('',{status:403})));
 await expect(loadCatalog('https://source.test/catalog.json',new AbortController().signal)).rejects.toThrow('403');
});
it('sends a private access code only to its exact HTTPS origin and refuses redirects there',async()=>{
 const code='test-access-code-01234567890123456789';
 const auth=sourceAccess('https://source.test/catalog.json',code)!;
 expect(sourceAccess('https://source.test/catalog.json','')).toBeUndefined();
 expect(()=>sourceAccess('https://source.test/catalog.json','short')).toThrow('访问码');
 expect(()=>sourceAccess('http://localhost/catalog.json',code)).toThrow('HTTPS');
 const fetcher=vi.fn(async()=>new Response(JSON.stringify({schema:1,title:'Private',songs:[song()]})));
 vi.stubGlobal('fetch',fetcher);
 await loadCatalog('https://source.test/catalog.json',new AbortController().signal,auth);
 expect(fetcher.mock.calls[0]).toEqual(['https://source.test/catalog.json',expect.objectContaining({headers:{Authorization:`Bearer ${code}`},redirect:'error'})]);
 const s=song();s.lyrics!.url='https://cdn.test/lyrics';
 vi.stubGlobal('fetch',vi.fn(async(input:string)=>new Response(content[new URL(input).pathname.slice(1) as keyof typeof content])));
 await downloadSong(s,new AbortController().signal,()=>{},auth);
 const calls=vi.mocked(fetch).mock.calls;
 expect(calls[0][1]).toMatchObject({headers:{Authorization:`Bearer ${code}`},redirect:'error'});
 expect(calls[1][1]?.headers).toBeUndefined();
 expect(calls[1][1]?.redirect).toBeUndefined();
 expect(JSON.stringify(await materialStore.all())).not.toContain(code);
});
it('explains missing/invalid private source authorization without exposing the code',async()=>{
 vi.stubGlobal('fetch',vi.fn(async()=>new Response('',{status:401})));
 await expect(loadCatalog('https://source.test/catalog.json',new AbortController().signal)).rejects.toThrow('访问码');
});
