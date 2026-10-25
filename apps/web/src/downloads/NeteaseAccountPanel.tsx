import {useEffect,useRef,useState} from 'react';
import QRCode from 'qrcode';
export type AccountResult={loggedIn?:boolean;nickname?:string;key?:string;url?:string;state?:string;retryAfter?:number;sent?:boolean};
export type AccountClient=(action:string,input:Record<string,string>,signal:AbortSignal)=>Promise<AccountResult>;
type Props={client:AccountClient;disabled:boolean;onBusy:(busy:boolean)=>void;onChanged:()=>void};
const delay=(signal:AbortSignal)=>new Promise<void>((resolve,reject)=>{
  const finish=()=>{clearTimeout(timer);signal.removeEventListener('abort',cancel);resolve();};
  const cancel=()=>{clearTimeout(timer);signal.removeEventListener('abort',cancel);reject(new DOMException('已取消','AbortError'));};
  const timer=setTimeout(finish,2000);signal.addEventListener('abort',cancel,{once:true});if(signal.aborted)cancel();
});
export function NeteaseAccountPanel({client,disabled,onBusy,onChanged}:Props){
  const [account,setAccount]=useState<AccountResult>({loggedIn:false}),[phone,setPhone]=useState(''),[countrycode,setCountrycode]=useState('86'),[captcha,setCaptcha]=useState('');
  const [busy,setBusy]=useState(false),[message,setMessage]=useState(''),[error,setError]=useState(''),[image,setImage]=useState(''),[cooldown,setCooldown]=useState(0);
  const active=useRef<AbortController|null>(null),mounted=useRef(true);
  useEffect(()=>{mounted.current=true;const initial=new AbortController();void client('status',{},initial.signal).then(value=>{if(mounted.current&&!initial.signal.aborted)setAccount(value);}).catch(()=>{});return()=>{mounted.current=false;initial.abort();active.current?.abort();};},[client]);
  useEffect(()=>{if(cooldown<=0)return;const timer=setTimeout(()=>setCooldown(value=>Math.max(0,value-1)),1000);return()=>clearTimeout(timer);},[cooldown]);
  async function run(action:string){
    if(disabled||active.current)return;
    const controller=new AbortController();active.current=controller;setBusy(true);onBusy(true);setError('');setMessage('正在连接网易云…');setImage('');
    try{
      const input={phone,countrycode,captcha};
      let result=await client(action,input,controller.signal);controller.signal.throwIfAborted();
      if(action==='qr-key'){
        if(!result.key||!result.url)throw new Error('二维码未生成，请重试。');
        const key=result.key;const qr=await QRCode.toDataURL(result.url,{width:280,margin:2,errorCorrectionLevel:'M'});controller.signal.throwIfAborted();setImage(qr);setMessage('请用网易云 APP 扫码，并在网易云中确认登录。');
        for(let attempt=0;attempt<150;attempt++){
          await delay(controller.signal);result=await client('qr-check',{key},controller.signal);controller.signal.throwIfAborted();
          if(result.loggedIn)break;
          if(result.state==='expired')throw new Error('二维码已过期，请重新生成。');
          setMessage(result.state==='confirm'?'已扫码，请在网易云 APP 确认登录。':'等待网易云 APP 扫码…');
          if(attempt===149)throw new Error('等待已结束，请重新生成登录二维码。');
        }
      }
      if(!mounted.current)return;
      if(result.loggedIn||action==='logout'){
        setAccount(result);setImage('');setPhone('');setCaptcha('');onChanged();setMessage(result.loggedIn?'网易云已登录，请重新解析歌曲。':'已退出本应用的网易云登录。');
      }else if(action==='captcha'){
        setCooldown(result.retryAfter??60);setMessage('短信已发送，请输入验证码登录。');
      }
    }catch(value){if(mounted.current){setImage('');setMessage('');setError(value instanceof Error&&value.name==='AbortError'?'已取消登录。':value instanceof Error?value.message:'登录未完成，请重试。');}}
    finally{if(active.current===controller){active.current=null;onBusy(false);if(mounted.current)setBusy(false);}}
  }
  return <section className="netease-account" aria-label="网易云账号">
    <div className="netease-account-heading"><strong>网易云账号</strong><span>{account.loggedIn?'已登录 · '+(account.nickname??'网易云用户'):'未登录'}</span>{account.loggedIn&&<button type="button" disabled={busy||disabled} onClick={()=>void run('logout')}>退出登录</button>}</div>
    {!account.loggedIn&&<details><summary>登录网易云账号</summary>
      <p className="helper">登录后按该账号的歌曲权限获取完整音频；试听片段不会导入为完整版。</p>
      <form className="netease-login-form" onSubmit={event=>{event.preventDefault();void run('sms-login');}}>
        <label>国家区号<input aria-label="网易云国家区号" inputMode="numeric" autoComplete="tel-country-code" value={countrycode} maxLength={4} disabled={busy||disabled} onChange={event=>setCountrycode(event.target.value.replace(/\D/g,''))}/></label>
        <label>手机号<input aria-label="网易云手机号" type="tel" autoComplete="tel-national" value={phone} maxLength={15} disabled={busy||disabled} onChange={event=>setPhone(event.target.value.replace(/\D/g,''))}/></label>
        <button type="button" disabled={busy||disabled||cooldown>0||phone.length<6} onClick={()=>void run('captcha')}>{cooldown>0?`${cooldown} 秒后重发`:'发送验证码'}</button>
        <label>短信验证码<input aria-label="网易云短信验证码" inputMode="numeric" autoComplete="one-time-code" value={captcha} maxLength={8} disabled={busy||disabled} onChange={event=>setCaptcha(event.target.value.replace(/\D/g,''))}/></label>
        <button type="submit" disabled={busy||disabled||phone.length<6||captcha.length<4}>验证码登录</button>
      </form>
      <button type="button" disabled={busy||disabled} onClick={()=>void run('qr-key')}>使用网易云 APP 扫码登录</button>
      {image&&<div className="netease-login-qr"><img src={image} width="280" height="280" alt="网易云登录二维码"/><p className="helper">同一部手机可截图，再到网易云“扫一扫”从相册识别；确认后返回本页。</p></div>}
    </details>}
    {busy&&<button type="button" onClick={()=>active.current?.abort()}>取消登录</button>}
    {message&&<p role="status" className="helper">{message}</p>}{error&&<p role="alert" className="error">{error}</p>}
  </section>;
}
