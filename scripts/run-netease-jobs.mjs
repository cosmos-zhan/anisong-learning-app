// Content preparation for Anisong. No media, login cookie or upload secret is
// committed or uploaded as an Actions artifact. GitHub OIDC authenticates each call.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdtemp,writeFile,rm,readFile,appendFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {neteaseCookie} from '../packages/core/netease-cookie.mjs';
import {neteasePlayerRequest} from '../packages/core/netease-player.mjs';
const SOURCE='https://anisong-media-source.woolly-mochi-2205.chatgpt.site';
const run=promisify(execFile),LIMIT=25*1024*1024;
let identity=null;
async function token(){
 if(identity&&identity.expiresAt>Date.now())return identity.value;
 const url=new URL(process.env.ACTIONS_ID_TOKEN_REQUEST_URL);url.searchParams.set('audience',SOURCE);
 const response=await fetch(url,{headers:{Authorization:'Bearer '+process.env.ACTIONS_ID_TOKEN_REQUEST_TOKEN},redirect:'error',signal:AbortSignal.timeout(15000)});
 assert(response.ok,'无法取得工作流身份');const data=await response.json();assert(typeof data.value==='string');identity={value:data.value,expiresAt:Date.now()+180000};return data.value;
}
async function call(path,{method='POST',body,headers={}}={}){
 const response=await fetch(SOURCE+path,{method,body,headers:{Authorization:'Bearer '+await token(),...headers},redirect:'error',signal:AbortSignal.timeout(120000)});
 if(!response.ok){let message='素材准备服务请求失败';try{message=(await response.json()).error??message;}catch{}throw new Error(message+' ('+response.status+')');}return response;
}
async function bounded(response){
 assert(response.ok,'网易云音频下载失败');assert(Number(response.headers.get('Content-Length')??0)<=LIMIT,'音频超过 25 MiB');
 const parts=[];let size=0;for await(const part of response.body){size+=part.length;assert(size<=LIMIT,'音频超过 25 MiB');parts.push(part);}return Buffer.concat(parts);
}
async function prepare(job){
 assert(/^[1-9]\d{0,15}$/.test(job.song.id));
 const cookie=neteaseCookie(job.cookie??''),loggedIn=cookie.includes('MUSIC_U=');
 const detail=await fetch(`https://music.163.com/api/song/detail/?id=${job.song.id}&ids=%5B${job.song.id}%5D`,{headers:cookie?{Cookie:cookie}:{},redirect:'error',signal:AbortSignal.timeout(15000)});
 assert(detail.ok,'网易云歌曲信息暂不可用');const song=(await detail.json()).songs?.find(row=>String(row.id)===job.song.id);
 assert(song&&(song.fee===0||loggedIn),'请先登录具有此曲完整版权限的网易云账号');
 const request=await neteasePlayerRequest(job.song.id,AbortSignal.timeout(30000),cookie);const response=await fetch(request.url,request.init);assert(response.ok,'网易云音频接口暂不可用');
 const track=(await response.json()).data?.find(row=>String(row.id)===job.song.id);
 assert(track?.url&&String(track.type??track.encodeType).toLowerCase()==='mp3'&&!track.freeTrialInfo&&!track.freeTimeTrialPrivilege?.resConsumable&&(loggedIn||!(track.fee>0)),'网易云当前没有提供完整 MP3，请稍后重试或补选本地音频');
 assert(track.size>1000&&track.size<=LIMIT,'音频大小不符合要求');
 let url=new URL(track.url),audio;
 for(let hop=0;hop<5;hop++){
  assert(!url.username&&!url.password&&!url.port&&/^(?:[a-z0-9-]+\.)*music\.126\.net$/.test(url.hostname),'音频来源不符合要求');url.protocol='https:';
  audio=await fetch(url,{headers:{Referer:'https://music.163.com/'},redirect:'manual',signal:AbortSignal.timeout(90000)});
  if(audio.status<300||audio.status>=400)break;await audio.body?.cancel();url=new URL(audio.headers.get('Location')??'',url);audio=null;
 }
 assert(audio,'音频跳转次数过多');const bytes=await bounded(audio);assert.equal(bytes.length,track.size,'MP3 下载不完整');
 const directory=await mkdtemp(join(tmpdir(),'anisong-netease-'));
 try{
  const file=join(directory,'song.mp3');await writeFile(file,bytes,{mode:0o600});
  const info=JSON.parse((await run('ffprobe',['-v','error','-show_entries','stream=codec_name','-show_entries','format=duration','-of','json',file],{timeout:30000})).stdout);
  assert(info.streams.some(stream=>stream.codec_name==='mp3'),'不是 MP3 音频');const duration=Number(info.format.duration);
  assert(duration>0&&Math.abs(duration-job.song.duration)<=Math.max(3,job.song.duration*.02),'音频时长不符，未保存可能不完整的文件');
  await run('ffmpeg',['-v','error','-i',file,'-f','null','-'],{timeout:60000});
  const sha256=createHash('sha256').update(bytes).digest('hex');
  await call(`/api/netease-runner/jobs/${job.id}/audio`,{method:'PUT',body:await readFile(file),headers:{'Content-Type':'audio/mpeg','X-Anisong-Lease':job.lease,'X-Content-SHA256':sha256,'X-Audio-Duration':String(duration)}});
  console.log(JSON.stringify({check:'netease-material-prepared',jobId:job.id,bytes:bytes.length,sha256,duration,fullDecode:true}));
 }finally{await rm(directory,{recursive:true,force:true});}
}
if(process.argv.includes('--pending')){
 const result=await(await call('/api/netease-runner/pending',{method:'GET'})).json();
 if(process.env.GITHUB_OUTPUT)await appendFile(process.env.GITHUB_OUTPUT,`pending=${result.pending===true}\n`);
 console.log(JSON.stringify({check:'netease-preparation-pending',pending:result.pending===true}));
}else{
let count=0;const batchStart=Date.now();let idleUntil=0;
while(count<8&&Date.now()-batchStart<5*60000){
 const response=await call('/api/netease-runner/next');
 if(response.status===204){
  if(!count||Date.now()>=idleUntil)break;
  await new Promise(resolve=>setTimeout(resolve,2000));continue;
 }
 const {job}=await response.json();count++;idleUntil=Date.now()+90000;
 try{await prepare(job);}catch(error){
  const message=String(error.message??'素材获取失败').replace(/https?:\/\/\S+/g,'[service]').slice(0,180);
  await call(`/api/netease-runner/jobs/${job.id}/failed`,{body:JSON.stringify({error:message}),headers:{'Content-Type':'application/json','X-Anisong-Lease':job.lease}});
  console.error(JSON.stringify({check:'netease-material-failed',jobId:job.id,error:message}));process.exitCode=1;
 }
 idleUntil=Date.now()+90000;
}
console.log(JSON.stringify({check:'netease-preparation-queue',processed:count,batchMs:Date.now()-batchStart}));

}
