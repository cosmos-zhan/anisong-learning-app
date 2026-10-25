import 'fake-indexeddb/auto';
import {Blob as NodeBlob} from 'node:buffer';
import {webcrypto,createHash} from 'node:crypto';
import {zipSync,strToU8} from 'fflate';
import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import {importMediaPackage} from '../packages/core/media-package';
import {materialStore} from '../packages/core/app-state';
import {fixture,note} from './piano-fixtures';
const content={'audio.wav':strToU8('unit audio fixture'),'lyrics.lrc':strToU8('[00:00]line'),'score.musicxml':strToU8(fixture([note()]))};
function asset(name:keyof typeof content){const data=content[name];return {url:String(name),name,bytes:data.length,sha256:createHash('sha256').update(data).digest('hex')};}
function catalog(){return {schema:1,title:'Offline package',songs:[{id:'package-test',title:'Package song',revision:'1',audio:asset('audio.wav'),lyrics:asset('lyrics.lrc'),score:asset('score.musicxml')}]};}
function file(value=catalog(),extra:Record<string,Uint8Array>={}){
 const data=zipSync({'catalog.json':strToU8(JSON.stringify(value)),...content,...extra});
 return {name:'test.anisong.zip',size:data.length,arrayBuffer:async()=>data.buffer as ArrayBuffer};
}
function renamedZip(from:string,to:string){
 const data=zipSync({'catalog.json':strToU8(JSON.stringify(catalog())),[from]:strToU8('malicious fixture')});
 const old=strToU8(from),next=strToU8(to);expect(old.length).toBe(next.length);
 for(let i=0;i<=data.length-old.length;i++)if(old.every((b,j)=>data[i+j]===b))data.set(next,i);
 return {name:'unsafe.zip',size:data.length,arrayBuffer:async()=>data.buffer as ArrayBuffer};
}
beforeEach(()=>{vi.stubGlobal('Blob',NodeBlob);vi.stubGlobal('crypto',webcrypto);vi.stubGlobal('fetch',vi.fn(()=>{throw new Error('No network allowed');}));});
afterEach(()=>vi.unstubAllGlobals());
it('imports all three package materials atomically without any network and restores metadata',async()=>{
 const p=vi.fn(),row=await importMediaPackage(file(),new AbortController().signal,p);
 expect(row.download).toMatchObject({songId:'package-test',revision:'1',summary:{lyrics:1,bars:1,parts:1}});
 expect((await materialStore.get('package-test:audio'))?.blob?.size).toBe(content['audio.wav'].length);
 expect((await materialStore.get('package-test:lyrics'))?.text).toBe('[00:00]line');
 expect((await materialStore.get('package-test:score'))?.text).toContain('score-partwise');
 expect(fetch).not.toHaveBeenCalled();expect(p).toHaveBeenLastCalledWith(expect.objectContaining({phase:'保存到本地'}));
});
it('rejects corruption without replacing existing song files',async()=>{
 await materialStore.put({id:'package-test:lyrics',name:'original',text:'Keep me'});
 const bad=catalog();bad.songs[0].lyrics.sha256='0'.repeat(64);
 await expect(importMediaPackage(file(bad),new AbortController().signal,()=>{})).rejects.toThrow('校验');
 expect((await materialStore.get('package-test:lyrics'))?.text).toBe('Keep me');
});
it('rejects remote references, traversal, duplicate or extra files',async()=>{
 const remote=catalog();remote.songs[0].audio.url='https://other.test/audio.wav';
 await expect(importMediaPackage(file(remote),new AbortController().signal,()=>{})).rejects.toThrow('包内');
 for(const name of ['../secret','/absolute','not-in-catalog.txt'])
  await expect(importMediaPackage(file(catalog(),{[name]:strToU8('bad')}),new AbortController().signal,()=>{})).rejects.toThrow();
 await expect(importMediaPackage(renamedZip('safe-name','__proto__'),new AbortController().signal,()=>{})).rejects.toThrow('不安全路径');
 await expect(importMediaPackage(renamedZip('catalog.copy','catalog.json'),new AbortController().signal,()=>{})).rejects.toThrow('重复');
 expect(fetch).not.toHaveBeenCalled();
});
it('rejects invalid/missing manifests, arbitrary ZIPs, missing assets and multi-song bundles',async()=>{
 const zip=zipSync({'readme.txt':strToU8('not a practice package')});
 await expect(importMediaPackage({name:'other.zip',size:zip.length,arrayBuffer:async()=>zip.buffer as ArrayBuffer},new AbortController().signal,()=>{})).rejects.toThrow('catalog.json');
 const bad=catalog();bad.songs[0].audio.url='missing.wav';
 await expect(importMediaPackage(file(bad),new AbortController().signal,()=>{})).rejects.toThrow('缺少');
 const many=catalog();many.songs.push({...many.songs[0],id:'second'});
 await expect(importMediaPackage(file(many),new AbortController().signal,()=>{})).rejects.toThrow('一首');
});
it('bounds archive size and expanded allocation before parsing',async()=>{
 await expect(importMediaPackage({name:'large.zip',size:37*1024*1024,arrayBuffer:async()=>new ArrayBuffer(0)},new AbortController().signal,()=>{})).rejects.toThrow('36 MB');
 const data=zipSync({'audio.wav':new Uint8Array(30*1024*1024+1)},{level:1});
 await expect(importMediaPackage({name:'bomb.zip',size:data.length,arrayBuffer:async()=>data.buffer as ArrayBuffer},new AbortController().signal,()=>{})).rejects.toThrow('展开后过大');
});
it('cancellation after file read preserves previous material and never commits',async()=>{
 await materialStore.put({id:'package-test:lyrics',name:'old',text:'Old'});
 const controller=new AbortController(),input=file(),buffer=await input.arrayBuffer();
 await expect(importMediaPackage({...input,arrayBuffer:async()=>{controller.abort();return buffer;}},controller.signal,()=>{})).rejects.toThrow('取消');
 expect((await materialStore.get('package-test:lyrics'))?.text).toBe('Old');
});
