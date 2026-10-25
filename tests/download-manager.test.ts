import 'fake-indexeddb/auto';
import {it,expect,vi,afterEach} from 'vitest';
import {DownloadManager} from '../packages/core/download-manager';
import {type downloadSong,type RemoteSong,type DownloadProgress} from '../packages/core/downloads';
import {materialStore,type LocalMaterial} from '../packages/core/app-state';
const song=(id:string):RemoteSong=>({id,title:id,revision:'1',audio:{url:'https://media.test/'+id,name:'test.wav',bytes:10,sha256:'a'.repeat(64)}});
const receipt=(id:string):LocalMaterial=>({id:id+':download',name:id,download:{songId:id,title:id,revision:'1',bytes:10,downloadedAt:'2026-10-22T00:00:00Z',summary:{audio:'test.wav'}}});
const tick=async()=>{await Promise.resolve();await Promise.resolve();};
function controlled(){
 const requests=new Map<string,{resolve:(row:LocalMaterial)=>void;reject:(e:Error)=>void;signal:AbortSignal;progress:(p:DownloadProgress)=>void}>();
 const transfer=vi.fn<typeof downloadSong>((s,signal,progress)=>new Promise((resolve,reject)=>{
  requests.set(s.id,{resolve,reject,signal,progress});signal.addEventListener('abort',()=>reject(new DOMException('Abort','AbortError')),{once:true});
 }));
 return {requests,transfer,manager:new DownloadManager(transfer)};
}
afterEach(()=>vi.useRealTimers());
it('downloads sequentially, deduplicates active songs and reports actual byte progress',async()=>{
 const {requests,transfer,manager}=controlled(),saved=vi.fn();manager.onSaved(saved);
 manager.enqueue(song('one'));manager.enqueue(song('two'));manager.enqueue(song('one'));
 expect(transfer).toHaveBeenCalledTimes(1);expect(manager.snapshot().map(t=>t.status)).toEqual(['downloading','queued']);
 requests.get('one')!.progress({phase:'下载音频',received:4,total:10});expect(manager.snapshot()[0].received).toBe(4);
 requests.get('one')!.resolve(receipt('one'));await tick();expect(transfer).toHaveBeenCalledTimes(2);
 requests.get('two')!.resolve(receipt('two'));await tick();expect(saved).toHaveBeenCalledTimes(2);
 expect(manager.snapshot().every(t=>t.status==='completed')).toBe(true);
});
it('cancels queued tasks without interrupting the active download',async()=>{
 const {requests,transfer,manager}=controlled();manager.enqueue(song('one'));manager.enqueue(song('two'));
 manager.cancel('two');expect(requests.get('one')!.signal.aborted).toBe(false);
 requests.get('one')!.resolve(receipt('one'));await tick();expect(transfer).toHaveBeenCalledTimes(1);
 expect(manager.snapshot()[1].status).toBe('cancelled');
});
it('cancels the active request, continues the queue and permits an explicit retry',async()=>{
 const {requests,transfer,manager}=controlled();manager.enqueue(song('one'));manager.enqueue(song('two'));
 manager.cancel('one');await tick();expect(manager.snapshot()[0].status).toBe('cancelled');
 expect(requests.get('one')!.signal.aborted).toBe(true);expect(transfer).toHaveBeenCalledTimes(2);
 manager.retry('one');requests.get('two')!.resolve(receipt('two'));await tick();expect(transfer).toHaveBeenCalledTimes(3);
 requests.get('one')!.resolve(receipt('one'));await tick();expect(manager.snapshot().find(t=>t.songId==='one')!.status).toBe('completed');
});
it('retains retry authorization only in memory and keeps private URLs/codes out of public task snapshots',async()=>{
 const {requests,transfer,manager}=controlled(),token='private-code-012345678901234567890123';
 manager.enqueue(song('one'),{origin:'https://media.test',token});
 requests.get('one')!.reject(new Error('Connection failed'));await tick();expect(manager.snapshot()[0].status).toBe('failed');
 expect(JSON.stringify(manager.snapshot())).not.toContain(token);expect(JSON.stringify(manager.snapshot())).not.toContain('media.test');
 manager.retry('one');expect(transfer.mock.calls[1][3]?.token).toBe(token);
 requests.get('one')!.resolve(receipt('one'));await tick();manager.clearFinished();expect(manager.snapshot()).toEqual([]);
});
it('navigation unsubscribe never aborts a task; the app still receives its committed material',async()=>{
 const {requests,manager}=controlled(),view=vi.fn(),saved=vi.fn();
 const leave=manager.subscribe(view);manager.onSaved(saved);manager.enqueue(song('one'));leave();
 const before=view.mock.calls.length;requests.get('one')!.resolve(receipt('one'));await tick();
 expect(requests.get('one')!.signal.aborted).toBe(false);expect(view).toHaveBeenCalledTimes(before);expect(saved).toHaveBeenCalledWith(receipt('one'));
 expect(manager.snapshot()[0].status).toBe('completed');
});
it('timeouts become retryable failures and do not leave the following task stuck',async()=>{
 vi.useFakeTimers();
 const {requests,transfer}=controlled(),manager=new DownloadManager(transfer,20);
 manager.enqueue(song('one'));manager.enqueue(song('two'));await vi.advanceTimersByTimeAsync(21);
 expect(manager.snapshot()[0]).toMatchObject({status:'failed',error:'下载超时，请重试。'});
 expect(requests.has('two')).toBe(true);requests.get('two')!.resolve(receipt('two'));await tick();
 expect(manager.snapshot()[1].status).toBe('completed');
});
it('removes only a song download transaction, retaining unrelated materials and practice settings',async()=>{
 localStorage.setItem('anisong:recents','[{"songId":"remove-test"}]');
 await materialStore.putMany(['audio','lyrics','score','download'].map(kind=>({id:'remove-test:'+kind,name:kind,text:'private'})));
 await materialStore.put({id:'other-song:audio',name:'Keep this'});
 await materialStore.removeDownload('remove-test');
 expect((await materialStore.all()).some(r=>r.id.startsWith('remove-test:'))).toBe(false);
 expect(await materialStore.get('other-song:audio')).toBeDefined();expect(localStorage.getItem('anisong:recents')).toContain('remove-test');
 expect(()=>materialStore.removeDownload('../other-song')).toThrow();
});
