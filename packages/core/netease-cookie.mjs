const names=new Set(['MUSIC_U','__csrf']);
// Browser Responses filter Set-Cookie. Keep native response credentials in
// process memory beside that exact Response, never in exposed Fetch headers.
const nativeResponseCookies=new WeakMap();
export function neteaseCookie(value=''){
  if(typeof value!=='string'||value.length>8192||/[\r\n]/.test(value))return '';
  const out=new Map();
  for(const part of value.split(';')){
    const at=part.indexOf('=');if(at<0)continue;
    const key=part.slice(0,at).trim(),data=part.slice(at+1).trim();
    if(names.has(key)&&data&&data.length<=4096&&/^[\x21-\x3a\x3c-\x7e]+$/.test(data))out.set(key,data);
  }
  return [...out].map(([key,data])=>key+'='+data).join('; ');
}
function responseCookies(values){
  const parts=[];
  for(const value of values){
    if(typeof value!=='string'||value.length>32768||/[\r\n]/.test(value))continue;
    for(const match of value.matchAll(/(?:^|,\s*)(MUSIC_U|__csrf)=([^;,\s]*)/g))parts.push(match[1]+'='+match[2]);
  }
  return neteaseCookie(parts.join('; '));
}
export function withNativeNeteaseCookies(response,values){
  const cookie=responseCookies(values);
  if(cookie)nativeResponseCookies.set(response,cookie);
  return response;
}
export function neteaseResponseCookie(response){
  if(nativeResponseCookies.has(response))return nativeResponseCookies.get(response);
  const headers=response.headers;
  const values=typeof headers.getSetCookie==='function'?headers.getSetCookie():[];
  if(!values.length)values.push(headers.get('Set-Cookie')??'');
  return responseCookies(values);
}
