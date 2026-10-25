import {encodeWeapi} from './netease-player.mjs';

const ROOT='https://music.163.com';
import {neteaseCookie,neteaseResponseCookie} from './netease-cookie.mjs';
export {neteaseCookie,neteaseResponseCookie} from './netease-cookie.mjs';
export async function neteaseAccountRequest(action,input={},signal,cookie=''){
  let path,data;
  switch(action){
    case 'qr-key':path='/api/login/qrcode/unikey';data={type:3};break;
    case 'qr-check':
      if(typeof input.key!=='string'||!/^[A-Za-z0-9_-]{12,160}$/.test(input.key))throw new Error('登录二维码已失效，请重新生成。');
      path='/api/login/qrcode/client/login';data={key:input.key,type:3};break;
    case 'status':path='/api/w/nuser/account/get';data={};break;
    case 'captcha':case 'sms-login':{
      const phone=String(input.phone??'').trim(),countrycode=String(input.countrycode??'86');
      if(!/^\d{6,15}$/.test(phone)||!/^\d{1,4}$/.test(countrycode))throw new Error('请输入正确的手机号和国家区号。');
      if(action==='captcha'){path='/api/sms/captcha/sent';data={ctcode:countrycode,secrete:'music_middleuser_pclogin',cellphone:phone};}
      else{
        const captcha=String(input.captcha??'');if(!/^\d{4,8}$/.test(captcha))throw new Error('请输入短信验证码。');
        path='/api/w/login/cellphone';data={type:'1',https:'true',phone,countrycode,captcha,remember:'true',secureCaptcha:''};
      }break;
    }
    default:throw new Error('不支持此登录操作。');
  }
  const session=neteaseCookie(cookie),csrf=session.split('; ').find(x=>x.startsWith('__csrf='))?.slice(7)??'';
  return {url:ROOT+path.replace('/api/','/weapi/'),init:{method:'POST',redirect:'manual',signal,
    headers:{'Content-Type':'application/x-www-form-urlencoded',Referer:ROOT+'/',Accept:'application/json',
      'User-Agent':'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',...(session?{Cookie:session}:{})},
    body:await encodeWeapi({...data,csrf_token:csrf})}};
}
export async function readNeteaseAccount(response){
  if(!response.ok)throw new Error('网易云登录服务暂不可用，请稍后重试。');
  if(Number(response.headers.get('Content-Length')??0)>256*1024)throw new Error('登录响应过大。');
  const reader=response.body?.getReader(),chunks=[];let size=0;
  if(reader)try{for(;;){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>256*1024){await reader.cancel();throw new Error('登录响应过大。');}chunks.push(value);}}finally{reader.releaseLock();}
  const bytes=new Uint8Array(size);let at=0;for(const part of chunks){bytes.set(part,at);at+=part.length;}
  let data;try{data=JSON.parse(new TextDecoder().decode(bytes));}catch{throw new Error('网易云未返回可读取的登录状态。');}
  return {data,cookie:neteaseResponseCookie(response)};
}
export function accountSummary(data){
  const value=data?.data??data,profile=value?.profile,account=value?.account;
  if(value?.code!==200||!profile||!account)return {loggedIn:false};
  return {loggedIn:true,nickname:String(profile.nickname??'网易云用户').slice(0,80),userId:String(account.id??profile.userId??'')};
}
