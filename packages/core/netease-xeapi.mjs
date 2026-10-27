// Current NetEase client protocol, documented by API Enhanced util/crypto.js.
// These public protocol constants are not account credentials or DRM keys.
import {neteaseCookie} from './netease-cookie.mjs';
const text=new TextEncoder(),decode=new TextDecoder();
const staticKey=Uint8Array.from('ab1d5a430f6bb04a3f01e81ddd72bd916d5ce591248ac128714806d7f8fb1b84'.match(/../g),x=>parseInt(x,16));
const signKey='mUHCwVNWJbunMqAHf5MImuirT6plvs6VSFW62MGHstFQxhBGdEoIhLItH3djc4+FB/OKty3+lL2rGeoFBpVe5g==';
const ua='NeteaseMusic/9.5.61.260802021928(9005061);Dalvik/2.1.0 (Linux; U; Android 12; HBN-AL00 Build/cd737a2.0)';
const concat=(...parts)=>{const out=new Uint8Array(parts.reduce((n,x)=>n+x.length,0));let at=0;for(const part of parts){out.set(part,at);at+=part.length;}return out;};
const base64=value=>{let s='';for(const x of new Uint8Array(value))s+=String.fromCharCode(x);return btoa(s);};
const unbase64=value=>Uint8Array.from(atob(value),x=>x.charCodeAt(0));
const random=size=>crypto.getRandomValues(new Uint8Array(size));
async function hmac(key,value){const imported=await crypto.subtle.importKey('raw',typeof key==='string'?text.encode(key):key,{name:'HMAC',hash:'SHA-256'},false,['sign']);return new Uint8Array(await crypto.subtle.sign('HMAC',imported,value));}
async function sign(timestamp,nonce){return base64(await hmac(signKey,text.encode(String(timestamp)+nonce)));}
async function ecbEncrypt(key,plain){
 const padding=16-plain.length%16,bytes=new Uint8Array(plain.length+padding);bytes.set(plain);bytes.fill(padding,plain.length);
 const imported=await crypto.subtle.importKey('raw',key,'AES-CBC',false,['encrypt']);
 return concat(...await Promise.all(Array.from({length:bytes.length/16},async(_,i)=>new Uint8Array(await crypto.subtle.encrypt({name:'AES-CBC',iv:new Uint8Array(16)},imported,bytes.subarray(i*16,i*16+16))).slice(0,16))));
}
async function ecbDecrypt(key,body){
 if(!body.length||body.length%16)throw Error('client-protocol-ciphertext');
 const imported=await crypto.subtle.importKey('raw',key,'AES-CBC',false,['encrypt','decrypt']);
 // Append a known CBC padding block, decrypt once, then undo CBC chaining.
 const tail=new Uint8Array(await crypto.subtle.encrypt({name:'AES-CBC',iv:body.slice(-16)},imported,new Uint8Array()));
 const plain=new Uint8Array(await crypto.subtle.decrypt({name:'AES-CBC',iv:new Uint8Array(16)},imported,concat(body,tail)));
 for(let i=16;i<plain.length;i++)plain[i]^=body[i-16];
 const padding=plain.at(-1);if(padding<1||padding>16||!plain.slice(-padding).every(x=>x===padding))throw Error('client-protocol-padding');return plain.slice(0,-padding);
}
async function read(response){
 if(!response.ok)throw Error('client-protocol-http');
 const reader=response.body?.getReader();if(!reader)throw Error('client-protocol-empty');const chunks=[];let size=0;
 try{for(;;){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>1024*1024)throw Error('client-protocol-size');chunks.push(value);}}
 finally{void reader.cancel().catch(()=>{});reader.releaseLock();}return concat(...chunks);
}
export async function neteaseXeapiPlayer(id,level,signal,cookie,fetcher=fetch,onStage=()=>{}){
 if(!/^[1-9]\d{0,15}$/.test(id)||!Number.isSafeInteger(Number(id))||!['standard','exhigh'].includes(level))throw Error('client-protocol-input');
 cookie=neteaseCookie(cookie);if(!cookie.includes('MUSIC_U='))throw Error('client-protocol-session');signal.throwIfAborted();
 const deviceId=Array.from(random(16),x=>x.toString(16).padStart(2,'0')).join(''),nonce=Array.from(random(16),x=>String(x%10)).join(''),timestamp=String(Date.now());
 const registration=new URLSearchParams({appVersion:'9.5.61',currentKeyVersion:'',deviceId,nonce,os:'android',requestType:'active',signature:await sign(timestamp,nonce),t1:'',t2:'',timestamp,uid:''});
 onStage({protocolStage:'key-request'});
 const keyResponse=await fetcher('https://interface.music.163.com/api/bsr/sk/get',{method:'POST',redirect:'manual',signal,headers:{'Content-Type':'application/x-www-form-urlencoded','User-Agent':ua,Cookie:'deviceId='+deviceId},body:registration.toString()});
 onStage({protocolStage:'key-validation',keyHttp:keyResponse.status});
 const keyData=JSON.parse(decode.decode(await read(keyResponse)));
 if(keyData.code!==200||!keyData.data?.encryptedData||typeof keyData.data?.signature!=='string')throw Error('client-key-unavailable');
 const expected=await sign(keyData.data.timestamp,nonce);let difference=expected.length^keyData.data.signature.length;for(let i=0;i<expected.length;i++)difference|=expected.charCodeAt(i)^(keyData.data.signature.charCodeAt(i)||0);if(difference)throw Error('client-key-signature');
 onStage({protocolStage:'key-decode'});
 const key=JSON.parse(decode.decode(await ecbDecrypt(staticKey,unbase64(keyData.data.encryptedData))));
 const peerBytes=unbase64(key.publicKey??'');if(!key.sk||!key.version||peerBytes.length!==32)throw Error('client-key-invalid');
 onStage({protocolStage:'request-encryption'});
 const dynamicKey=random(16),pair=await crypto.subtle.generateKey({name:'X25519'},true,['deriveBits']);
 const ephemeral=new Uint8Array(await crypto.subtle.exportKey('raw',pair.publicKey));
 const peer=await crypto.subtle.importKey('raw',peerBytes,{name:'X25519'},false,[]);
 const shared=new Uint8Array(await crypto.subtle.deriveBits({name:'X25519',public:peer},pair.privateKey,256));
 const prk=await hmac(new Uint8Array(32),shared),aesKey=(await hmac(prk,concat(ephemeral,new Uint8Array([1])))).slice(0,16);
 const iv=random(12),imported=await crypto.subtle.importKey('raw',aesKey,'AES-GCM',false,['encrypt']);
 const sealed=new Uint8Array(await crypto.subtle.encrypt({name:'AES-GCM',iv},imported,text.encode(base64(dynamicKey)+'|android|'+key.sk)));
 onStage({protocolStage:'envelope-encryption'});
 const content=new URLSearchParams({ids:'['+id+']',level,encodeType:'flac'}).toString();
 const inner=await ecbEncrypt(staticKey,text.encode(JSON.stringify({content,queryString:'e_r=true'}))),mask=random(16),xored=inner.map((x,i)=>x^mask[i&15]),rotation=(mask[0]&15)%xored.length;
 const body=new URLSearchParams({C:base64(await ecbEncrypt(dynamicKey,concat(mask,xored.subarray(rotation),xored.subarray(0,rotation)))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,''),S:base64(concat(ephemeral,iv,sealed)),R:base64(await ecbEncrypt(staticKey,text.encode(key.version+'|')))}).toString();
 const musicU=cookie.split('; ').find(x=>x.startsWith('MUSIC_U='))?.slice(8);signal.throwIfAborted();
 onStage({protocolStage:'player-request'});
 const response=await fetcher('https://interface3.music.163.com/xeapi/song/enhance/player/url/v1',{method:'POST',redirect:'manual',signal,headers:{'Content-Type':'application/x-www-form-urlencoded;charset=utf-8','User-Agent':ua,'X-Client-Enc-State':'ENCRYPTED','x-aeapi':'true','x-deviceid':deviceId,'x-sdeviceid':deviceId,'x-os':'android','x-osver':'16','x-appver':'9.5.61','x-buildver':timestamp.slice(0,10),'x-music-u':musicU,Cookie:cookie+'; os=android; appver=9.5.61; deviceId='+deviceId},body});
 onStage({protocolStage:'player-decode',playerHttp:response.status});
 const raw=await read(response);let data;
 try{data=JSON.parse(decode.decode(raw));}catch{
  let plain=await ecbDecrypt(text.encode('e82ckenh8dichen8'),raw);
  if(plain[0]===31&&plain[1]===139)plain=await read(new Response(new Response(plain).body.pipeThrough(new DecompressionStream('gzip'))));
  data=JSON.parse(decode.decode(plain));
 }
 signal.throwIfAborted();return new Response(JSON.stringify(data),{status:response.status,headers:{'Content-Type':'application/json',...(response.headers.get('Date')?{Date:response.headers.get('Date')}:{})}});
}
