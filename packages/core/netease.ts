import {Capacitor} from '@capacitor/core';
import {neteaseApi} from './netease-api.mjs';
import {saveSongMaterials,type DownloadProgress,type RemoteAsset,type RemoteSong} from './downloads';
import {materialStore,type LocalMaterial} from './app-state';
import {getNeteaseSession,neteaseNativeTransport} from './netease-session';
import {withNativeNeteaseCookies} from './netease-cookie.mjs';
import {audioFormats,type NeteaseAudioFormat} from './netease-audio.mjs';
export interface NeteaseAudioDiagnostic {
  source:string;quality:string;stage:'address'|'audio';reason:string;http?:number;code?:number;format?:string;
}
export interface NeteaseParsed {
  song:{id:string;title:string;artists:string;duration:number;url:string};
  audio:{status:'available'|'unavailable';message:string;bytes?:number;format?:NeteaseAudioFormat;diagnostics?:NeteaseAudioDiagnostic[]};
  lyrics:{lrc:string;lines:{start:number;text:string;romaji?:string;translation?:string}[];counts:{original:number;romaji:number;translation:number};warnings:string[]};
}
export const deviceResolverCache=new Map();
const abort=(signal:AbortSignal)=>{if(signal.aborted)throw new DOMException('已取消','AbortError');};
// This adapter talks to NetEase from the device. It has no upload endpoint,
// management credential or remote catalogue write operation.
export const nativeNeteaseFetch:typeof fetch=async(input,init)=>{
  if(!Capacitor.isNativePlatform())return fetch(input,init);
  const url=new URL(typeof input==='string'?input:input instanceof URL?input.href:input.url);
  const keyEndpoint=url.hostname==='interface.music.163.com'&&url.pathname==='/api/bsr/sk/get'&&!url.search;
  const playerEndpoint=url.hostname==='interface3.music.163.com'&&url.pathname==='/xeapi/song/enhance/player/url/v1'&&!url.search;
  if(url.protocol!=='https:'||url.username||url.password||url.port||!(keyEndpoint||playerEndpoint||['music.163.com','y.music.163.com','163cn.tv'].includes(url.hostname)||/^(?:[a-z0-9-]+\.)*music\.126\.net$/.test(url.hostname)))throw new Error('网易云返回了不支持的下载来源。');
  const signal=init?.signal;if(signal?.aborted)throw new DOMException('已取消','AbortError');
  const headers:Record<string,string>={};new Headers(init?.headers).forEach((value,key)=>{headers[key]=value;});
  if(headers.authorization||headers['oai-sites-authorization'])throw new Error('网易云导入不接受管理凭据。');
  const session=await getNeteaseSession();
  if(signal?.aborted)throw new DOMException('已取消','AbortError');
  if((keyEndpoint||playerEndpoint)&&(init?.method??'GET')!=='POST')throw new Error('客户端接口仅支持 POST。');
  const deviceId=headers['x-deviceid']??'';
  const clientCookie=session+'; os=android; appver=9.5.61; deviceId='+deviceId;
  if(playerEndpoint&&(!session||!/^[a-f0-9]{32}$/.test(deviceId)||headers['x-music-u']!==session.split('; ').find(x=>x.startsWith('MUSIC_U='))?.slice(8)||headers.cookie!==clientCookie))throw new Error('客户端请求未使用本机网易云登录状态。');
  if(keyEndpoint&&!/^deviceId=[a-f0-9]{32}$/.test(headers.cookie??''))throw new Error('客户端密钥请求不接受账号凭据。');
  if(headers.cookie&&!keyEndpoint&&!playerEndpoint&&(url.hostname!=='music.163.com'||headers.cookie!==session))throw new Error('网易云导入不接受外部凭据。');
  if(!playerEndpoint&&Object.keys(headers).some(name=>name.startsWith('x-')&&!['x-forwarded-for','x-real-ip'].includes(name)))throw new Error('客户端凭据仅可发送到网易云播放接口。');
  if(url.hostname==='music.163.com'&&session)headers.cookie=session;
  const prefix=(init as RequestInit&{anisongPrefixBytes?:number}|undefined)?.anisongPrefixBytes;
  if(prefix!==undefined&&(prefix!==4096||init?.method&&init.method!=='GET'||!/^([a-z0-9-]+\.)*music\.126\.net$/.test(url.hostname)))throw new Error('音频预检大小无效。');
  return new Promise<Response>((resolve,reject)=>{
    const cancelled=()=>reject(new DOMException('已取消','AbortError'));
    signal?.addEventListener('abort',cancelled,{once:true});
    void neteaseNativeTransport.request({url:url.href,method:init?.method??'GET',headers,data:init?.body as string|undefined,...prefix?{maxResponseBytes:4096 as const}:{},responseType:'arraybuffer',disableRedirects:true,connectTimeout:15000,readTimeout:30000}).then(result=>{
      if(signal?.aborted)return;
      const responseHeaders=new Headers(),cookies:string[]=[];let body:Uint8Array;
      for(const [name,value] of Object.entries(result.headers??{})){
        if(name.toLowerCase()==='set-cookie'){
          if(url.hostname==='music.163.com')cookies.push(value);
        }else responseHeaders.set(name,value);
      }
      if(typeof result.data==='object')body=new TextEncoder().encode(JSON.stringify(result.data));
      else{
        const value=String(result.data??'');if(value.length>40*1024*1024)throw new Error('返回的文件超过大小限制。');
        const binary=atob(value);body=Uint8Array.from(binary,char=>char.charCodeAt(0));
      }
      const response=new Response(body.buffer as ArrayBuffer,{status:result.status,headers:responseHeaders});
      resolve(withNativeNeteaseCookies(response,cookies));
    }).catch(reject).finally(()=>signal?.removeEventListener('abort',cancelled));
  });
};
async function readResponse(response:Response):Promise<NeteaseParsed>{
  const data=await response.json() as NeteaseParsed&{error?:string};
  if(!response.ok)throw new Error(data.error??'网易云导入未完成。');return data;
}
const internal=(path:string,signal:AbortSignal,body?:object)=>new Request('https://anisong-device.invalid/api/netease/'+path,{method:body?'POST':'GET',headers:{'X-Anisong-Upload':'1','Content-Type':'application/json'},body:body?JSON.stringify(body):undefined,signal});
export async function parseNetease(input:string,signal:AbortSignal,fetcher:typeof fetch=nativeNeteaseFetch):Promise<NeteaseParsed>{
  abort(signal);return readResponse(await neteaseApi(internal('parse',signal,{input}),fetcher,{cookie:await getNeteaseSession(),cache:fetcher===nativeNeteaseFetch?deviceResolverCache:undefined}));
}
async function duration(blob:Blob,signal:AbortSignal):Promise<number>{
  abort(signal);return new Promise((resolve,reject)=>{
    const audio=new Audio(),url=URL.createObjectURL(blob);let done=false;
    const finish=(error?:Error)=>{if(done)return;done=true;clearTimeout(timer);signal.removeEventListener('abort',cancel);const seconds=audio.duration;audio.removeAttribute('src');audio.load();URL.revokeObjectURL(url);if(error)reject(error);else resolve(seconds);};
    const cancel=()=>finish(new DOMException('已取消','AbortError'));
    const timer=setTimeout(()=>finish(new Error('音频时长读取超时，请重新下载。')),15000);
    audio.onloadedmetadata=()=>Number.isFinite(audio.duration)&&audio.duration>0?finish():finish(new Error('无法读取音频时长。'));
    audio.onerror=()=>finish(new Error('下载的音频无法播放。'));signal.addEventListener('abort',cancel,{once:true});
    audio.preload='metadata';audio.src=url;audio.load();if(signal.aborted)cancel();
  });
}
export async function importNetease(parsed:NeteaseParsed,signal:AbortSignal,progress:(value:DownloadProgress)=>void,
  options:{fetcher?:typeof fetch;measureDuration?:typeof duration}={}):Promise<LocalMaterial>{
  abort(signal);if(parsed.audio.status!=='available')throw new Error(parsed.audio.message);
  const fetcher=options.fetcher??nativeNeteaseFetch;
  progress({phase:'获取网易云音频',received:0,total:parsed.audio.bytes??0});
  const response=await neteaseApi(internal('audio?id='+parsed.song.id,signal),fetcher,{cookie:await getNeteaseSession(),cache:fetcher===nativeNeteaseFetch?deviceResolverCache:undefined});
  if(!response.ok){const d=await response.json() as {error?:string};throw new Error(d.error??'音频下载失败。');}
  const format=response.headers.get('X-Anisong-Audio-Format') as NeteaseAudioFormat;
  if(!Object.hasOwn(audioFormats,format))throw new Error('下载的音频格式未能确认，未导入。');
  const data=new Uint8Array(await response.arrayBuffer());abort(signal);
  const seconds=await(options.measureDuration??duration)(new Blob([data],{type:audioFormats[format].mime}),signal);abort(signal);
  if(parsed.song.duration>0&&Math.abs(seconds-parsed.song.duration)>Math.max(3,parsed.song.duration*.02))throw new Error('音频时长与原曲不符，未导入可能不完整的文件。');
  const id='netease-'+parsed.song.id,previous=await materialStore.all();abort(signal);
  const assets=new Map<string,Uint8Array>();
  const name=parsed.song.title.replace(/[\\/:*?"<>|]/g,'_').slice(0,100)||'网易云歌曲';
  async function asset(bytes:Uint8Array,filename:string):Promise<RemoteAsset>{
    const hash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes.buffer as ArrayBuffer))].map(v=>v.toString(16).padStart(2,'0')).join('');
    const url='https://music.163.com/song?id='+parsed.song.id+'&asset='+hash;assets.set(url,bytes);return{url,name:filename,bytes:bytes.length,sha256:hash};
  }
  const audio=await asset(data,name+'.'+audioFormats[format].extension);
  const song:RemoteSong={id,title:[parsed.song.title,parsed.song.artists].filter(Boolean).join(' · ').slice(0,120),revision:audio.sha256.slice(0,16),audio};
  const oldLyrics=previous.find(row=>row.id===id+':lyrics')?.text;
  const lyrics=parsed.lyrics.lrc||oldLyrics;if(lyrics)song.lyrics=await asset(new TextEncoder().encode(lyrics),name+'.lrc');
  const oldScore=previous.find(row=>row.id===id+':score');
  if(oldScore?.text)song.score=await asset(new TextEncoder().encode(oldScore.text),oldScore.name.replace(/\.(mxl|xml|musicxml)$/i,'')+'.musicxml');
  song.revision+='/'+(song.lyrics?.sha256.slice(0,16)??'no-lyrics');
  abort(signal);
  return saveSongMaterials(song,signal,progress,async(asset,report)=>{abort(signal);const bytes=assets.get(asset.url);if(!bytes)throw new Error('本地导入资料不完整。');report(bytes.length);return bytes;});
}
