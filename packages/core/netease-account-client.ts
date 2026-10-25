import {neteaseAccountRequest,readNeteaseAccount,accountSummary} from './netease-account.mjs';
import {getNeteaseSession,saveNeteaseSession,clearNeteaseSession} from './netease-session';
import {nativeNeteaseFetch,deviceResolverCache} from './netease';
export type NeteaseAccountResult={loggedIn?:boolean;nickname?:string;userId?:string;key?:string;url?:string;state?:string;sent?:boolean;retryAfter?:number};
export type NeteaseAccountClient=(action:string,input:Record<string,string>,signal:AbortSignal)=>Promise<NeteaseAccountResult>;
export const deviceNeteaseAccount:NeteaseAccountClient=async(action,input,signal)=>{
  if(action==='logout'){await clearNeteaseSession();deviceResolverCache.clear();return {loggedIn:false};}
  const current=await getNeteaseSession();
  if(action==='status'&&!current)return {loggedIn:false};
  signal.throwIfAborted();
  const request=await neteaseAccountRequest(action,input,signal,current);
  const {data,cookie}=await readNeteaseAccount(await nativeNeteaseFetch(request.url,request.init));
  signal.throwIfAborted();
  if(action==='status')return accountSummary(data);
  if(action==='qr-key'){
    const key=data.unikey??(data.data as {unikey?:string}|undefined)?.unikey;
    if(data.code!==200||typeof key!=='string'||!/^[A-Za-z0-9_-]{12,160}$/.test(key))throw new Error('网易云没有生成二维码，请稍后重试。');
    return {key,url:'https://music.163.com/login?codekey='+key};
  }
  if(action==='captcha'){
    if(data.code!==200)throw new Error('网易云未发送验证码，请在官方 APP 检查账号或完成安全验证后重试。');
    return {sent:true,retryAfter:60};
  }
  if(action==='qr-check'&&data.code!==803){
    const states:Record<number,string>={800:'expired',801:'waiting',802:'confirm'};
    const state=states[Number(data.code)];if(!state)throw new Error('网易云暂时无法确认扫码状态。');return {state};
  }
  if(action==='sms-login'&&data.code!==200)throw new Error('验证码无效或网易云要求额外验证，请在官方 APP 检查后重试。');
  if(!cookie.includes('MUSIC_U='))throw new Error('网易云未返回完整登录状态，请重试。');
  await saveNeteaseSession(cookie);deviceResolverCache.clear();
  const profile=data.profile as {nickname?:string}|undefined;
  return {loggedIn:true,nickname:String(profile?.nickname??data.nickname??'网易云用户').slice(0,80)};
};
