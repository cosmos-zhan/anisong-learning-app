import {beforeEach,afterEach,expect,test,vi} from 'vitest';
import {webcrypto} from 'node:crypto';
import {Capacitor} from '@capacitor/core';
const native=vi.hoisted(()=>({cookie:'',request:vi.fn(),save:vi.fn(),clear:vi.fn()}));
vi.mock('../packages/core/netease-session',()=>({
  getNeteaseSession:async()=>native.cookie,
  saveNeteaseSession:native.save,
  clearNeteaseSession:native.clear,
  neteaseNativeTransport:{request:native.request},
}));
import {deviceNeteaseAccount} from '../packages/core/netease-account-client';
import {nativeNeteaseFetch,deviceResolverCache} from '../packages/core/netease';
import {neteaseResponseCookie} from '../packages/core/netease-cookie.mjs';
const cookie='MUSIC_U=fixture-session; __csrf=fixture-csrf';
const reply=(code=200,withCookie=true)=>({status:200,url:'https://music.163.com/weapi/w/login/cellphone',
  headers:{'Content-Type':'application/json',...(withCookie?{'sEt-CoOkIe':'MUSIC_U=fixture-session; Expires=Wed, 27 Oct 2027 00:00:00 GMT; Path=/; HttpOnly, __csrf=fixture-csrf; Path=/, unrelated=drop; Path=/'}:{})},
  data:btoa(JSON.stringify({code,profile:{nickname:'Fixture'},account:{id:1}}))});
beforeEach(()=>{
  vi.stubGlobal('crypto',webcrypto);vi.spyOn(Capacitor,'isNativePlatform').mockReturnValue(true);
  native.cookie='';deviceResolverCache.clear();native.request.mockReset().mockResolvedValue(reply());
  native.save.mockReset().mockImplementation(async(value:string)=>{native.cookie=value;});
  native.clear.mockReset().mockImplementation(async()=>{native.cookie='';});
});
afterEach(()=>vi.unstubAllGlobals());
test('native login cookies survive a Response without Set-Cookie and are scoped to that exact response',async()=>{
  const response=await nativeNeteaseFetch('https://music.163.com/weapi/w/login/cellphone',{method:'POST'});
  expect(response.headers.has('Set-Cookie')).toBe(false);
  expect(neteaseResponseCookie(response)).toBe(cookie);
  expect(neteaseResponseCookie(new Response('{}'))).toBe('');
  const cdn=await nativeNeteaseFetch('https://m801.music.126.net/file.mp3');
  expect(neteaseResponseCookie(cdn)).toBe('');expect(cdn.headers.has('Set-Cookie')).toBe(false);
});
test('SMS login saves the native credential and reuses it for account status without exposing it in the result',async()=>{
  deviceResolverCache.set('old-account',{value:true});
  const result=await deviceNeteaseAccount('sms-login',{phone:'12345678',captcha:'1234'},new AbortController().signal);
  expect(result).toEqual({loggedIn:true,nickname:'Fixture'});expect(native.save).toHaveBeenCalledWith(cookie);
  expect(deviceResolverCache.size).toBe(0);expect(JSON.stringify(result)).not.toContain('fixture-session');
  expect(await deviceNeteaseAccount('status',{},new AbortController().signal)).toMatchObject({loggedIn:true,nickname:'Fixture'});
  expect(native.request.mock.lastCall?.[0].headers.cookie).toBe(cookie);
});
test('confirmed QR login uses the same native credential channel',async()=>{
  native.request.mockResolvedValue(reply(803));
  expect(await deviceNeteaseAccount('qr-check',{key:'abcdefghijklmnop'},new AbortController().signal)).toMatchObject({loggedIn:true});
  expect(native.save).toHaveBeenCalledWith(cookie);
});
test('a successful JSON code without MUSIC_U and a rejected SMS response do not save a session',async()=>{
  native.request.mockResolvedValue(reply(200,false));
  await expect(deviceNeteaseAccount('sms-login',{phone:'12345678',captcha:'1234'},new AbortController().signal)).rejects.toThrow('完整登录状态');
  native.request.mockResolvedValue(reply(502));
  await expect(deviceNeteaseAccount('sms-login',{phone:'12345678',captcha:'1234'},new AbortController().signal)).rejects.toThrow('验证码');
  expect(native.save).not.toHaveBeenCalled();
});
test('a cancelled native login ignores late credentials and never saves them',async()=>{
  let finish!:(value:ReturnType<typeof reply>)=>void;
  native.request.mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve;}));
  const controller=new AbortController(),pending=deviceNeteaseAccount('sms-login',{phone:'12345678',captcha:'1234'},controller.signal);
  await vi.waitFor(()=>expect(native.request).toHaveBeenCalled());controller.abort();
  await expect(pending).rejects.toMatchObject({name:'AbortError'});finish(reply());await Promise.resolve();
  expect(native.save).not.toHaveBeenCalled();
});
