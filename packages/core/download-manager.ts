import { downloadSong, type DownloadProgress, type RemoteSong, type SourceAccess } from './downloads';
import type { LocalMaterial } from './app-state';
export type DownloadStatus = 'queued'|'downloading'|'cancelling'|'completed'|'failed'|'cancelled';
export interface DownloadTask extends DownloadProgress {
  songId:string; title:string; revision:string; status:DownloadStatus; error?:string;
}
type Transfer = typeof downloadSong;
const running = (status:DownloadStatus) => ['queued','downloading','cancelling'].includes(status);
/** One app-scoped queue. Navigation never owns or aborts a download. Secrets stay in memory. */
export class DownloadManager {
  private state:DownloadTask[]=[];
  private listeners=new Set<()=>void>();
  private saved=new Set<(row:LocalMaterial)=>void>();
  private sources=new Map<string,{song:RemoteSong;access?:SourceAccess}>();
  private active?:{id:string;controller:AbortController};
  constructor(private transfer:Transfer=downloadSong,private timeoutMs=120000){}
  snapshot=()=>this.state;
  subscribe=(fn:()=>void)=>{this.listeners.add(fn);return()=>{this.listeners.delete(fn);};};
  onSaved=(fn:(row:LocalMaterial)=>void)=>{this.saved.add(fn);return()=>{this.saved.delete(fn);};};
  private notify(){for(const listener of this.listeners)listener();}
  private patch(id:string,value:Partial<DownloadTask>){this.state=this.state.map(row=>row.songId===id?{...row,...value}:row);this.notify();}
  enqueue(song:RemoteSong,access?:SourceAccess){
    if(this.state.some(t=>t.songId===song.id&&running(t.status)))return;
    // A new enqueue explicitly refreshes the source and authorization for this task.
    this.sources.set(song.id,{song,access});
    const row:DownloadTask={songId:song.id,title:song.title,revision:song.revision,status:'queued',phase:'等待下载',received:0,total:song.audio.bytes+(song.lyrics?.bytes??0)+(song.score?.bytes??0)};
    this.state=[...this.state.filter(t=>t.songId!==song.id),row];this.notify();void this.pump();
  }
  cancel(id:string){
    const task=this.state.find(t=>t.songId===id);if(!task||!running(task.status))return;
    if(this.active?.id===id){this.patch(id,{status:'cancelling',phase:'正在取消'});this.active.controller.abort();}
    else this.patch(id,{status:'cancelled',phase:'已取消'});
  }
  cancelAll(){for(const task of this.state)this.cancel(task.songId);}
  retry(id:string){
    if(this.active?.id===id)return;
    const task=this.state.find(t=>t.songId===id),source=this.sources.get(id);
    if(task&&['failed','cancelled'].includes(task.status)&&source)this.enqueue(source.song,source.access);
  }
  clearFinished(){
    for(const task of this.state)if(!running(task.status))this.sources.delete(task.songId);
    this.state=this.state.filter(t=>running(t.status));this.notify();
  }
  private async pump(){
    if(this.active)return;
    const task=this.state.find(t=>t.status==='queued');if(!task)return;
    const source=this.sources.get(task.songId);if(!source)return;
    const controller=new AbortController();this.active={id:task.songId,controller};
    this.patch(task.songId,{status:'downloading',phase:'连接素材源',error:undefined});
    const timer=setTimeout(()=>controller.abort(new Error('下载超时，请重试。')),this.timeoutMs);
    try{
      const row=await this.transfer(source.song,controller.signal,progress=>{
        if(!controller.signal.aborted)this.patch(task.songId,progress);
      },source.access);
      if(controller.signal.aborted)throw new DOMException('已取消','AbortError');
      this.patch(task.songId,{status:'completed',phase:'已保存到本机',received:task.total});
      this.sources.delete(task.songId);
      for(const fn of this.saved){try{fn(row);}catch{/* The file transaction already committed. */}}
    }catch(error){
      const timeout=controller.signal.aborted&&controller.signal.reason instanceof Error&&controller.signal.reason.name!=='AbortError';
      const cancelled=controller.signal.aborted&&!timeout;
      const message=timeout?controller.signal.reason.message:error instanceof TypeError?'网络连接失败，请检查网络与素材源权限。':error instanceof DOMException&&error.name==='QuotaExceededError'?'本机空间不足，请清理空间后重试。':error instanceof Error?error.message:'下载失败，请重试。';
      this.patch(task.songId,{status:cancelled?'cancelled':'failed',phase:cancelled?'已取消':'下载失败',error:cancelled?undefined:message});
    }finally{clearTimeout(timer);this.active=undefined;void this.pump();}
  }
}
export const downloadManager=new DownloadManager();
