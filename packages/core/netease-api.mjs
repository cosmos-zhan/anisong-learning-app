import {mergeNeteaseLyrics} from './netease-lyrics.mjs';
import {neteasePlayerRequest,neteaseLinuxPlayerRequest,neteaseAudioRequest} from './netease-player.mjs';
import {audioFormats,detectAudioFormat} from './netease-audio.mjs';
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
function audioFailure(status){
  return status===403?'音频文件访问被拒绝（HTTP 403）。文件服务器未允许本次请求，不能据此判断会员权限。':`音频文件请求失败（HTTP ${status}），请稍后重试。`;
}
async function audioResponse(url,fetcher,signal,probe=false){
  for(let hop=0;hop<5;hop++){
    const response=await fetcher(url.href,{redirect:'manual',signal,headers:{Referer:ROOT+'/',...(probe?{Range:'bytes=0-4095'}:{})}});
    if(response.status>=300&&response.status<400){
      await response.body?.cancel();let target;
      try{target=cdnUrl(new URL(response.headers.get('Location')??'',url).href);}catch{}
      if(!target)throw Object.assign(new ImportError('音频地址跳转到非音频来源，未下载。',502),{diagnostic:{stage:'audio',reason:'redirect',http:response.status}});
      url=target;continue;
    }
    if(!response.ok){await response.body?.cancel();throw Object.assign(new ImportError(audioFailure(response.status),422),{diagnostic:{stage:'audio',reason:'http',http:response.status}});}
    return response;
  }
  throw Object.assign(new ImportError('音频地址跳转次数过多。',502),{diagnostic:{stage:'audio',reason:'redirect'}});
}
function unavailable(diagnostics,loggedIn){
  const file=diagnostics.find(row=>row.stage==='audio'&&row.reason==='http');
  const trial=diagnostics.some(row=>row.reason==='trial');
  const format=diagnostics.find(row=>row.reason==='format');
  const size=diagnostics.some(row=>row.reason==='size');
  const address=diagnostics.find(row=>row.stage==='address'&&(row.http||row.code)&&row.reason!=='empty');
  let message=file?audioFailure(file.http):trial?'网易云接口只返回了试听，尚未取得完整版；请在官方 APP 确认此曲的账号权限。':
    format?`网易云返回了暂不支持的音频格式（${format.format??'未知'}），未导入。`:
    size?'可获取的音频超过 25 MiB，请选择符合限制的本地音频。':
    diagnostics.some(row=>row.reason==='invalid-audio')?'网易云返回的文件不是可识别的 MP3 / FLAC / M4A / AAC，未导入。':
    diagnostics.some(row=>row.reason==='invalid-response')?'网易云音频地址接口返回了无法读取的响应，请稍后重试。':
    address?`网易云音频地址接口失败（${address.http?'HTTP '+address.http:'返回码 '+address.code}），请稍后重试。`:
    diagnostics.some(row=>row.reason==='timeout')?'获取音频地址或检查文件超时，请重试。':
    diagnostics.some(row=>row.reason==='network')?'连接网易云音频服务失败，请检查网络后重试。':
    '网易云接口未返回可导入的完整音频地址，请稍后重试或选择本地音频。';
  return {status:'unavailable',message,diagnostics,...trial&&!loggedIn?{needsLogin:true}:{}};
}
async function audioLocation(song,fetcher,signal,options={}){
  const cookie=neteaseCookie(options.cookie),loggedIn=cookie.includes('MUSIC_U=');
  if(song.fee!==0&&!loggedIn)return {status:'unavailable',needsLogin:true,message:'这首歌需要账号权限，请先登录网易云；账号需具有这首歌的完整版权限。',diagnostics:[]};
  const diagnostics=[];
  const modern=(kind,level)=>({source:kind+'-v1',quality:level,request:signal=>neteaseAudioRequest(song.id,kind,level,signal,cookie)});
  const legacy={source:'player-legacy',quality:'exhigh',request:signal=>neteasePlayerRequest(song.id,signal,cookie)};
  // Do not select an address until its actual file response has been checked.
  // Failed or overlarge high-quality candidates can fall back to standard audio.
  const groups=loggedIn?[[modern('download','exhigh')],[modern('player','exhigh'),legacy],
    [modern('download','lossless'),modern('player','lossless'),modern('download','standard')]]:
    [[legacy],[modern('player','exhigh'),modern('download','standard')]];
  if(options.edge&&!loggedIn)groups[0].push({source:'player-linux',quality:'exhigh',request:signal=>neteaseLinuxPlayerRequest(song.id,signal,false,cookie)});
  for(const candidates of groups){
    signal.throwIfAborted();
    const group=new AbortController();
    const deadline=AbortSignal.any([signal,group.signal,AbortSignal.timeout(options.edge?1200:6000)]);
    try{
      const result=await Promise.any(candidates.map(async candidate=>{
        let stage='address';const base={source:candidate.source,quality:candidate.quality};
        const fail=(reason,extra={})=>{throw Object.assign(new Error('Audio candidate unavailable'),{diagnostic:{...base,stage,reason,...extra}});};
        try{
          const request=await candidate.request(deadline),response=await fetcher(request.url,request.init);
          if(!response.ok){await response.body?.cancel();fail('http',{http:response.status});}
          let data;try{data=JSON.parse(new TextDecoder().decode(await limited(response,1024*1024)));}catch{fail('invalid-response');}
          const rows=Array.isArray(data?.data)?data.data:[data?.data];
          const track=rows.find(row=>row&&String(row.id)===song.id);
          if(data?.code&&Number(data.code)!==200)fail('provider',{code:Number(data.code)||0});
          if(track?.freeTrialInfo||track?.freeTimeTrialPrivilege?.resConsumable||(!loggedIn&&track?.fee>0))fail('trial');
          if(!track?.url)fail('empty',{...(Number.isFinite(track?.code)?{code:track.code}:{})});
          if(track.code&&Number(track.code)!==200)fail('provider',{code:Number(track.code)||0});
          const url=cdnUrl(track.url);if(!url)fail('source');
          const declared=String(track.type??track.encodeType??'').toLowerCase();
          if(declared&&!['mp3','flac','m4a','mp4','aac'].includes(declared))fail('format',{format:['ncm','ncmx','ogg','wav'].includes(declared)?declared:'未知'});
          if(track.size>LIMIT)fail('size');
          stage='audio';
          const audio=await audioResponse(url,fetcher,deadline,true),bytes=await limited(audio,4096,{prefix:true});
          const format=detectAudioFormat(bytes);if(!format)fail('invalid-audio');
          if(declared&&format!==(declared==='mp4'?'m4a':declared))fail('invalid-audio');
          const length=Number(audio.headers.get('Content-Range')?.split('/')[1]??audio.headers.get('Content-Length')??0);
          if(length>LIMIT)fail('size');
          const success={...base,stage,reason:'available',http:audio.status,format};
          return {status:'available',message:`${audioFormats[format].label} 文件响应检查通过，导入时将检查完整时长。`,url:url.href,bytes:length||track.size||null,format,source:candidate.source,quality:candidate.quality,diagnostics:[...diagnostics,success]};
        }catch(error){
          if(signal.aborted||group.signal.aborted)throw error;
          const diagnostic=error.diagnostic?{...base,...error.diagnostic}:{...base,stage,reason:deadline.aborted?'timeout':'network'};
          diagnostics.push(diagnostic);throw error;
        }
      }));
      return result;
    }catch{signal.throwIfAborted();}finally{group.abort();}
  }
  return unavailable(diagnostics,loggedIn);
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
  const cached=(id,kind,operation,ttl)=>memo(options.cache,scope+':v2:'+id+':'+kind,operation,ttl);
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
      try{
        const response=await audioResponse(new URL(audio.url),fetcher,signal),bytes=await limited(response,LIMIT);
        const format=detectAudioFormat(bytes);
        if(!format||format!==audio.format)throw new ImportError('下载的文件与已检查的音频格式不符，未导入。',422);
        if(audio.bytes&&bytes.length!==audio.bytes)throw new ImportError('音频下载不完整，请重新导入。',502);
        return new Response(bytes,{headers:{'Content-Type':audioFormats[format].mime,'X-Anisong-Audio-Format':format,'Content-Length':String(bytes.length),'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
      }catch(error){options.cache?.delete(scope+':v2:'+id+':audio');throw error;}
    }
    return json({error:'不支持此解析操作。'},405);
  }catch(error){
    if(!(error instanceof ImportError)&&!signal.aborted)console.error('Anisong NetEase connection failed',{phase,name:error?.name??'Error',message:String(error?.message??'unknown').replace(/https?:\/\/\S+/g,'[upstream]').slice(0,200)});
    return json({error:signal.aborted?'解析超时或已取消，请重试。':error instanceof ImportError?error.message:'网易云暂时无法连接，请稍后重试。'},signal.aborted?408:error instanceof ImportError?error.status:502);
  }
}
