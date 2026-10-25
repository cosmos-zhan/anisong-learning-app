import {Capacitor,registerPlugin} from '@capacitor/core';
import {neteaseCookie} from './netease-account.mjs';
import type {HttpOptions,HttpResponse} from '@capacitor/core';
const plugin=registerPlugin<{read:()=>Promise<{cookie:string}>;write:(options:{cookie:string})=>Promise<void>;clear:()=>Promise<void>;request:(options:HttpOptions)=>Promise<HttpResponse>}>('AnisongNeteaseSession');
export const neteaseNativeTransport={request:(options:HttpOptions)=>plugin.request(options)};
let current:string|undefined;
let generation=0;
export async function getNeteaseSession():Promise<string>{
  if(!Capacitor.isNativePlatform())return '';
  if(current!==undefined)return current;
  const version=generation;
  let value='';try{value=neteaseCookie((await plugin.read()).cookie);}catch{value='';}
  if(version!==generation)return getNeteaseSession();
  current=value;return value;
}
export async function saveNeteaseSession(value:string){
  const cookie=neteaseCookie(value);
  if(!cookie.split('; ').some(part=>part.startsWith('MUSIC_U=')))throw new Error('网易云没有返回完整登录凭据，请重试。');
  await plugin.write({cookie});generation++;current=cookie;
}
export async function clearNeteaseSession(){
  await plugin.clear();generation++;current='';
}
