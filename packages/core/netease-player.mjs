import {neteaseCookie} from './netease-cookie.mjs';
// WeAPI transport uses the public web protocol (AES-CBC twice, then RSA).
// Protocol constants are also documented by the MIT-licensed
// NeteaseCloudMusicApiEnhanced/api-enhanced util/crypto.js. The request format
// follows the music-lib version verified with an actual complete MP3 download.
const modulus=BigInt('0x00e0b509f6259df8642dbc35662901477df22677ec152b5ff68ace615bb7b725152b3ab17a876aea8a5aa76d2e417629ec4ee341f56135fccf695280104e0312ecbda92557c93870114af6c9d05c4f7f0c3685b7a46bee255932575cce10b424d813cfe4875d3e82047b97ddef52741d546b8e289dc6935b3ece0462db0a22b8e7');
const text=new TextEncoder();
const base64=bytes=>{let binary='';for(const value of new Uint8Array(bytes))binary+=String.fromCharCode(value);return btoa(binary);};
async function aes(value,key,engine){const imported=await engine.subtle.importKey('raw',text.encode(key),'AES-CBC',false,['encrypt']);return base64(await engine.subtle.encrypt({name:'AES-CBC',iv:text.encode('0102030405060708')},imported,text.encode(value)));}
export async function encodeWeapi(value,engine=crypto){
  const alphabet='abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  const secret=Array.from(engine.getRandomValues(new Uint8Array(16)),value=>alphabet[value%alphabet.length]).join('');
  const params=await aes(await aes(JSON.stringify(value),'0CoJUm6Qyw8W8jud',engine),secret,engine);
  let number=BigInt('0x'+Array.from(text.encode([...secret].reverse().join('')),v=>v.toString(16).padStart(2,'0')).join('')),exponent=65537n,result=1n;
  while(exponent){if(exponent&1n)result=result*number%modulus;number=number*number%modulus;exponent>>=1n;}
  return new URLSearchParams({params,encSecKey:result.toString(16).padStart(256,'0')}).toString();
}
export async function neteasePlayerRequest(id,signal,cookie=''){
  cookie=neteaseCookie(cookie);
  if(!/^[1-9]\d{0,15}$/.test(id))throw new Error('网易云歌曲 ID 无效。');
  const random=crypto.getRandomValues(new Uint8Array(2));
  // Match music-lib's anonymous compatibility headers; never forward a visitor
  // ChatGPT/Sites token or media-service upload credential to NetEase.
  // Only an explicitly supplied, filtered NetEase account session may be attached.
  const compatibleIp=`58.14.${random[0]%254+1}.${random[1]%254+1}`;
  return {url:'https://music.163.com/weapi/song/enhance/player/url',init:{method:'POST',redirect:'manual',signal,
    headers:{'Content-Type':'application/x-www-form-urlencoded',Referer:'http://music.163.com/','User-Agent':'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',...(!cookie?{'X-Forwarded-For':compatibleIp,'X-Real-IP':compatibleIp}:{}),...(cookie?{Cookie:cookie}:{})},
    body:await encodeWeapi({br:320000,ids:[id],...(cookie?{csrf_token:cookie.split('; ').find(part=>part.startsWith('__csrf='))?.slice(7)??''}:{})})}};
}
// NetEase's Linux client protocol, also described in Enhanced's linuxapi
// implementation. Independent CBC blocks provide ECB with WebCrypto only.
export async function neteaseLinuxPlayerRequest(id,signal,arrayIds=false,cookie=''){
  cookie=neteaseCookie(cookie);
  if(!/^[1-9]\d{0,15}$/.test(id))throw new Error('网易云歌曲 ID 无效。');
  const value={method:'POST',url:'https://music.163.com/api/song/enhance/player/url',params:{ids:arrayIds?[id]:JSON.stringify([id]),br:320000}};
  const plain=text.encode(JSON.stringify(value)),padding=16-plain.length%16,bytes=new Uint8Array(plain.length+padding);bytes.set(plain);bytes.fill(padding,plain.length);
  const key=await crypto.subtle.importKey('raw',text.encode('rFgB&h#%2?^eDg:Q'),'AES-CBC',false,['encrypt']);let encrypted='';
  for(let at=0;at<bytes.length;at+=16){const block=new Uint8Array(await crypto.subtle.encrypt({name:'AES-CBC',iv:new Uint8Array(16)},key,bytes.slice(at,at+16)));encrypted+=Array.from(block.slice(0,16),v=>v.toString(16).padStart(2,'0')).join('');}
  return {url:'https://music.163.com/api/linux/forward',init:{method:'POST',redirect:'manual',signal,headers:{'Content-Type':'application/x-www-form-urlencoded','Referer':'https://music.163.com/','User-Agent':'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/60.0.3112.90 Safari/537.36',...(cookie?{Cookie:cookie}:{})},body:new URLSearchParams({eparams:encrypted.toUpperCase()}).toString()}};
}
