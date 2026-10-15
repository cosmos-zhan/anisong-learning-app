import type { PianoSession, Score } from './types';
export interface SavedScore {id:string;songId:string;xml:string;format:Score['format'];title:string;savedAt:string}
const open = () => new Promise<IDBDatabase>((resolve,reject)=>{
 const request=indexedDB.open('anisong-scores',1);
 request.onupgradeneeded=()=>request.result.createObjectStore('scores',{keyPath:'id'});
 request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);
});
async function transaction<T>(mode:IDBTransactionMode,operation:(store:IDBObjectStore)=>IDBRequest<T>):Promise<T>{
 const db=await open();try{return await new Promise<T>((resolve,reject)=>{
  const tx=db.transaction('scores',mode),request=operation(tx.objectStore('scores'));let value:T;
  request.onsuccess=()=>{value=request.result;};tx.oncomplete=()=>resolve(value);tx.onabort=()=>reject(tx.error??request.error);tx.onerror=()=>reject(tx.error??request.error);
 });}finally{db.close();}
}
export const scoreStore={
 put:(score:SavedScore)=>transaction('readwrite',store=>store.put(score)),
 get:(id:string)=>transaction<SavedScore|undefined>('readonly',store=>store.get(id)),
 all:()=>transaction<SavedScore[]>('readonly',store=>store.getAll()),
};
export function readSession(scoreId:string):PianoSession|undefined {
 try{const s=JSON.parse(localStorage.getItem(`anisong:piano:${scoreId}`)??'null');
  if(!s||!['listen','wait','free'].includes(s.mode)||!['none','name','solfege'].includes(s.labels)||!s.range||typeof s.partId!=='string'||typeof s.trackId!=='string'||typeof s.loop!=='boolean')return;
  return s;
 }catch{return;}
}
export function saveSession(scoreId:string,session:PianoSession){localStorage.setItem(`anisong:piano:${scoreId}`,JSON.stringify(session));}
