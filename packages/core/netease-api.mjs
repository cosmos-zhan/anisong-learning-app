import {mergeNeteaseLyrics} from './netease-lyrics.mjs';
import {neteasePlayerRequest,neteaseLinuxPlayerRequest} from './netease-player.mjs';
import {neteaseCookie} from './netease-account.mjs';
const ROOT='https://music.163.com',LIMIT=25*1024*1024;
const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
class ImportError extends Error{constructor(message,status=400){super(message);this.status=status;}}
const validId=value=>/^[1-9]\d{0,15}$/.test(value)&&Number.isSafeInteger(Number(value));
function songUrl(value){
  let url;try{url=new URL(value);}catch{throw new ImportError('请粘贴网易云歌曲链接、分享文字或歌曲 ID。');}
  if(url.protocol!=='https:'&&url.protocol!=='http:'||url.username||url.password||url.port)throw new ImportError('歌曲链接格式无效。');
  if(!['music.163.com','y.music.163.com','163cn.tv'].includes(url.hostname))throw new ImportError('目前只支持网易云歌曲链接。');
  url.protocol='https:';
  return url;
}
function idFromUrl(url){
  const route=url.hash.startsWith('#/')?new URL(url.hash.slice(1),ROOT):url;
  if(!/^\/(?:m\/)?song\/?$/.test(route.pathname))return null;
  const id=route.searchParams.get('id');return id&&validId(id)?id:null;
}
function cdnUrl(value){
  let url;try{url=new URL(value);}catch{return null;}
  if(!['http:','https:'].includes(url.protocol)||url.username||url.password||url.port)return null;
  if(!/^(?:[a-z0-9-]+\.)*music\.126\.net$/.test(url.hostname))return null;
  url.protocol='https:';return url;
}
async function limited(response,max,{prefix=false}={}){
  if(!prefix&&Number(response.headers.get('Content-Length'))>max){await response.body?.cancel();throw new ImportError('服务响应或音频文件过大。',413);}
  if(!response.body)return new Uint8Array();
  const reader=response.body.getReader(),chunks=[];let size=0;
  try{for(;;){const {value,done}=await reader.read();if(done)break;
    if(prefix){const part=value.subarray(0,max-size);chunks.push(part);size+=part.length;if(size>=max){await reader.cancel();break;}}
    else{size+=value.length;if(size>max){await reader.cancel();throw new ImportError('音频必须不超过 25 MiB。',413);}chunks.push(value);}
  }}catch(error){await reader.cancel().catch(()=>{});throw error;}finally{reader.releaseLock();}
  const data=new Uint8Array(size);let at=0;for(const chunk of chunks){data.set(chunk,at);at+=chunk.length;}return data;
}
async function requestJson(path,fetcher,signal,cookie=''){
  const response=await fetcher(ROOT+path,{headers:{Accept:'application/json',Referer:ROOT+'/',...(cookie?{Cookie:cookie}:{})},redirect:'manual',signal});
  if(!response.ok)throw new ImportError('网易云接口暂时不可用，请稍后重试。',502);
  const bytes=await limited(response,1024*1024);
  try{return JSON.parse(new TextDecoder().decode(bytes));}catch{throw new ImportError('网易云返回了无法读取的响应，请稍后重试。',502);}
}
export async function resolveSongId(input,fetcher=fetch,signal){
  if(typeof input!=='string'||input.length>2048)throw new ImportError('请粘贴一条歌曲链接或歌曲 ID。');
  const text=input.trim();if(validId(text))return text;
  const match=text.match(/https?:\/\/[^\s<>"“”]+/i);if(!match)throw new ImportError('分享文字中没有找到网易云歌曲链接。');
  let url=songUrl(match[0].replace(/[）)》」』，。；;]+$/u,''));
  for(let hop=0;hop<5;hop++){
    const id=idFromUrl(url);if(id)return id;
    if(url.hostname!=='163cn.tv')throw new ImportError('请使用单首歌曲链接，不支持歌单或专辑链接。');
    if(!/^\/[a-zA-Z0-9]+\/?$/.test(url.pathname))throw new ImportError('网易云短链接格式无效。');
    const response=await fetcher(url.href,{redirect:'manual',signal});await response.body?.cancel();
    const location=response.headers.get('Location');
    if(response.status<300||response.status>=400||!location)throw new ImportError('网易云短链接未能展开，请在网易云中复制歌曲 ID 或完整链接重试。',502);
    url=songUrl(new URL(location,url).href);
  }
  throw new ImportError('网易云短链接跳转次数过多。',502);
}
async function detail(id,fetcher,signal,cookie=''){
  const data=await requestJson(`/api/song/detail/?id=${id}&ids=%5B${id}%5D`,fetcher,signal,cookie);
  const song=data.songs?.find(row=>String(row.id)===id);
  if(!song||typeof song.name!=='string')throw new ImportError('未找到这首歌曲，请检查链接。',404);
  return {id,title:song.name.slice(0,120),artists:(song.artists??song.ar??[]).map(row=>String(row.name??'')).filter(Boolean).join(' / ').slice(0,120),duration:(song.duration??song.dt??0)/1000,fee:song.fee};
}
const isMp3=bytes=>{
  if(bytes.length<3)return false;
  if(bytes[0]===73&&bytes[1]===68&&bytes[2]===51)return true;
  // A real MPEG audio frame header (not HTML/JSON or a renamed AAC/FLAC).
  for(let i=0;i<Math.min(bytes.length-3,1024);i++)if(bytes[i]===255&&(bytes[i+1]&224)===224&&(bytes[i+1]&6)!==0&&(bytes[i+2]&240)!==0&&(bytes[i+2]&240)!==240&&(bytes[i+2]&12)!==12)return true;
  return false;
};
async function audioResponse(url,fetcher,signal,probe=false){
  for(let hop=0;hop<5;hop++){
    const response=await fetcher(url.href,{redirect:'manual',signal,headers:{Referer:ROOT+'/',...(probe?{Range:'bytes=0-4095'}:{})}});
    if(response.status>=300&&response.status<400){await response.body?.cancel();const target=cdnUrl(new URL(response.headers.get('Location')??'',url).href);if(!target)throw new ImportError('网易云未提供可获取的完整 MP3，请补选本地音频。',502);url=target;continue;}
    if(!response.ok){await response.body?.cancel();throw new ImportError('网易云当前没有提供可获取的完整 MP3，请选择本地音频。',422);}
    return response;
  }
  throw new ImportError('音频地址跳转次数过多。',502);
}
async function audioLocation(song,fetcher,signal,options={}){
  const cookie=neteaseCookie(options.cookie),loggedIn=cookie.includes('MUSIC_U=');
  if(song.fee!==0&&!loggedIn)return {status:'unavailable',needsLogin:true,message:'这首歌需要账号权限，请先登录网易云；账号需具有这首歌的完整版权限。'};
  const group=new AbortController(),deadline=AbortSignal.any([signal,group.signal,AbortSignal.timeout(options.edge?4000:15000)]);
  const requests=[await neteasePlayerRequest(song.id,deadline,cookie)];
  if(options.edge)requests.push(await neteaseLinuxPlayerRequest(song.id,deadline,false,cookie));
  let track;
  try{
    track=await Promise.any(requests.map(async request=>{
      const response=await fetcher(request.url,request.init);
      if(!response.ok){await response.body?.cancel();throw new Error('upstream');}
      const data=JSON.parse(new TextDecoder().decode(await limited(response,1024*1024)));
      const value=data?.data?.find(row=>String(row.id)===song.id);
      if(!value?.url||value.freeTrialInfo||value.freeTimeTrialPrivilege?.resConsumable||(!loggedIn&&value.fee>0))throw Object.assign(new Error('unavailable'),{track:value});
      return value;
    }));
  }catch(error){track=error.errors?.map(value=>value.track).find(Boolean);}
  finally{group.abort();}
  signal.throwIfAborted();
  if(track?.freeTrialInfo||track?.freeTimeTrialPrivilege?.resConsumable||(!loggedIn&&track?.fee>0))return {status:'unavailable',message:loggedIn?'网易云当前仅提供试听，当前账号没有取得此曲完整版权限。':'网易云当前仅提供试听，请登录具有此曲完整版权限的账号。',needsLogin:!loggedIn};
  let url=track?.url?cdnUrl(track.url):null;
  if(track?.url&&(!url||String(track.type??track.encodeType).toLowerCase()!=='mp3'))return {status:'unavailable',message:'网易云没有返回可导入的 MP3 文件，请选择本地音频。'};
  if(track?.size>LIMIT)return {status:'unavailable',message:'网易云 MP3 超过 25 MiB，请选择符合大小限制的本地音频。'};
  if(!url&&options.edge)return {status:'unavailable',message:'直连未取得完整 MP3，将检查私人素材准备结果。'};
  if(!url)url=new URL(`${ROOT}/song/media/outer/url?id=${song.id}.mp3`);
  const response=await audioResponse(url,fetcher,signal,true),bytes=await limited(response,4096,{prefix:true});
  if(!isMp3(bytes))return {status:'unavailable',message:'网易云当前未返回完整 MP3，请补选本地完整音频。'};
  const length=Number(response.headers.get('Content-Range')?.split('/')[1]??response.headers.get('Content-Length')??0);
  if(length>LIMIT)return {status:'unavailable',message:'网易云 MP3 超过 25 MiB，请选择符合大小限制的本地音频。'};
  return {status:'available',message:'MP3 地址与文件头检查通过，导入时将检查完整时长。',url:url.href,bytes:length||track?.size||null};
}
async function memo(cache,key,operation,ttl=120000){
  const now=Date.now(),old=cache?.get(key);
  if(old&&old.expiresAt>now)return old.value;
  const value=await operation();
  if(cache){if(cache.size>=80)cache.delete(cache.keys().next().value);cache.set(key,{expiresAt:now+(value?.status==='unavailable'?5000:ttl),value});}
  return value;
}
// Owner-private Sites authentication is the access boundary, as with uploadProxy.
// Outbound hosts are pinned. Only filtered NetEase account cookies reach music.163.com; no Site or uploader credential reaches NetEase.
export async function neteaseApi(request,fetcher=fetch,options={}){
  const url=new URL(request.url),origin=request.headers.get('Origin');
  if(origin&&origin!==url.origin||request.headers.get('X-Anisong-Upload')!=='1')return json({error:'请在私人上传台中解析歌曲。'},403);
  const cookie=neteaseCookie(options.cookie),scope=cookie?Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(cookie))),v=>v.toString(16).padStart(2,'0')).join(''):'anonymous';
  const cached=(id,kind,operation,ttl)=>memo(options.cache,scope+':'+id+':'+kind,operation,ttl);
  const location=(song)=>cached(song.id,'audio',()=>audioLocation(song,fetcher,signal,{...options,cookie}));
  const signal=AbortSignal.any([request.signal,AbortSignal.timeout(url.pathname==='/api/netease/audio'?90000:25000)]);
  let phase='input';
  try{
    if(url.pathname==='/api/netease/parse'&&request.method==='POST'&&!url.search){
      let body;try{body=JSON.parse(new TextDecoder().decode(await limited(request,4096)));}catch{throw new ImportError('歌曲链接请求无效。');}
      phase='short-link';const id=await resolveSongId(body.input,fetcher,signal);phase='song-and-lyrics';
      const [song,lyricResult]=await Promise.all([cached(id,'detail',()=>detail(id,fetcher,signal,cookie)),cached(id,'lyrics',()=>requestJson(`/api/song/lyric?id=${id}&lv=-1&kv=-1&tv=-1&rv=-1`,fetcher,signal,cookie)).then(data=>({data})).catch(()=>({data:null}))]);
      const lyrics=mergeNeteaseLyrics(lyricResult.data);
      if(!lyricResult.data)lyrics.warnings.unshift('歌词接口暂时不可用，可稍后重新解析。');
      phase='audio';const prepared=options.prepared?await options.prepared(song):null;
      const audio=prepared??await location(song).catch(error=>{if(request.signal.aborted)throw error;return {status:'unavailable',message:error instanceof ImportError?error.message:'音频接口暂时不可用，请稍后重试或选择本地音频。'};});
      const {url:internal,...audioInfo}=audio;void internal;
      return json({song:{id:song.id,title:song.title,artists:song.artists,duration:song.duration,url:`${ROOT}/song?id=${id}`},lyrics,audio:{...audioInfo,eligible:(song.fee===0||cookie.includes('MUSIC_U='))&&song.duration>0}});
    }
    if(url.pathname==='/api/netease/audio'&&request.method==='GET'&&[...url.searchParams.keys()].join(',')==='id'&&validId(url.searchParams.get('id')??'')){
      const id=url.searchParams.get('id'),song=await cached(id,'detail',()=>detail(id,fetcher,signal,cookie)),audio=await location(song);
      if(audio.status!=='available')throw new ImportError(audio.message,422);
      const response=await audioResponse(new URL(audio.url),fetcher,signal),bytes=await limited(response,LIMIT);
      if(!isMp3(bytes))throw new ImportError('返回的文件不是 MP3，请补选本地音频。',422);
      if(audio.bytes&&bytes.length!==audio.bytes)throw new ImportError('MP3 下载不完整，请重新导入。',502);
      return new Response(bytes,{headers:{'Content-Type':'audio/mpeg','Content-Length':String(bytes.length),'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
    }
    return json({error:'不支持此解析操作。'},405);
  }catch(error){
    if(!(error instanceof ImportError)&&!signal.aborted)console.error('Anisong NetEase connection failed',{phase,name:error?.name??'Error',message:String(error?.message??'unknown').replace(/https?:\/\/\S+/g,'[upstream]').slice(0,200)});
    return json({error:signal.aborted?'解析超时或已取消，请重试。':error instanceof ImportError?error.message:'网易云暂时无法连接，请稍后重试。'},signal.aborted?408:error instanceof ImportError?error.status:502);
  }
}
