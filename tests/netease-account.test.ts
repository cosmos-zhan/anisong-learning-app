import {beforeEach,afterEach,expect,test,vi} from 'vitest';
import {webcrypto} from 'node:crypto';
import {neteaseCookie,neteaseAccountRequest,readNeteaseAccount} from '../packages/core/netease-account.mjs';
import {neteaseApi} from '../packages/core/netease-api.mjs';
beforeEach(()=>vi.stubGlobal('crypto',webcrypto));
afterEach(()=>vi.unstubAllGlobals());
const json=(data:unknown,headers:Record<string,string>={})=>new Response(JSON.stringify(data),{headers:{'Content-Type':'application/json',...headers}});
const request=(path='/api/netease/parse')=>new Request('https://device.test'+path,{method:path.includes('/audio')?'GET':'POST',headers:{'X-Anisong-Upload':'1'},...!path.includes('/audio')?{body:JSON.stringify({input:'2097485072'})}:{}});
test('only NetEase session cookies survive, and malformed credential values are rejected',()=>{
  expect(neteaseCookie('MUSIC_U=account-session; Authorization=private; __csrf=csrf-value; OAI-Sites-Authorization=secret')).toBe('MUSIC_U=account-session; __csrf=csrf-value');
  expect(neteaseCookie('MUSIC_U=a\r\nX-Header: private')).toBe('');
});
test('account requests use pinned HTTPS endpoints and never forward other service credentials',async()=>{
  const call=await neteaseAccountRequest('qr-key',{},undefined,'MUSIC_U=session; __csrf=csrf; private=secret');
  expect(call.url).toBe('https://music.163.com/weapi/login/qrcode/unikey');expect(call.init.method).toBe('POST');expect(call.init.redirect).toBe('manual');
  const headers=new Headers(call.init.headers);expect(headers.get('Cookie')).toBe('MUSIC_U=session; __csrf=csrf');expect(headers.has('Authorization')).toBe(false);
  await expect(neteaseAccountRequest('qr-check',{key:'https://evil.test'})).rejects.toThrow();
  await expect(neteaseAccountRequest('sms-login',{phone:'12345678',captcha:'<secret>'})).rejects.toThrow();
});
test('login reads the complete NetEase Set-Cookie response without accepting unrelated cookies',async()=>{
  const result=await readNeteaseAccount(json({code:803},{'Set-Cookie':'MUSIC_U=session; Path=/; HttpOnly, __csrf=csrf; Path=/, unrelated=private; Path=/'}));
  expect(result.cookie).toBe('MUSIC_U=session; __csrf=csrf');
});
test('a logged-in account can import an upstream-authorized full paid-class track while trials are rejected',async()=>{
  const bytes=new Uint8Array(3000);bytes.set([73,68,51]);let trial=false;const destinations:{url:string;cookie:string|null}[]=[];
  const fetcher:typeof fetch=async(input,options)=>{
    const url=String(input),headers=new Headers(options?.headers);destinations.push({url,cookie:headers.get('Cookie')});
    if(url.includes('/api/song/detail'))return json({songs:[{id:2097485072,name:'影色舞',duration:209453,fee:1}]});
    if(url.includes('/api/song/lyric'))return json({lrc:{lyric:'[00:01]テスト'}});
    if(url.includes('/weapi/song/'))return json({data:[{id:2097485072,url:'https://m801.music.126.net/song.mp3',size:bytes.length,type:'mp3',fee:1,code:200,freeTrialInfo:trial?{start:0,end:30}:null}]});
    expect(headers.has('Cookie')).toBe(false);return new Response(bytes,{headers:{'Content-Length':String(bytes.length),'Content-Type':'audio/mpeg'}});
  };
  const anonymous=await(await neteaseApi(request(),fetcher)).json();expect(anonymous.audio.needsLogin).toBe(true);expect(destinations.some(x=>x.url.includes('/weapi/song/'))).toBe(false);
  const options={cookie:'MUSIC_U=authorized; __csrf=csrf'};
  const full=await(await neteaseApi(request(),fetcher,options)).json();expect(full.audio.status).toBe('available');expect(JSON.stringify(full)).not.toContain('authorized');
  expect(destinations.filter(x=>new URL(x.url).hostname==='music.163.com').slice(-3).every(x=>x.cookie===options.cookie)).toBe(true);
  trial=true;const preview=await(await neteaseApi(request(),fetcher,options)).json();expect(preview.audio.status).toBe('unavailable');expect(preview.audio.message).toContain('试听');
});
test('parse-to-download caching removes duplicate lookups and stays isolated across account sessions',async()=>{
  const cache=new Map<string,unknown>(),bytes=new Uint8Array(3000);bytes.set([73,68,51]);let metadata=0,player=0;
  const fetcher:typeof fetch=async(input)=>{
    const url=String(input);
    if(url.includes('/api/song/detail')){metadata++;return json({songs:[{id:2097485072,name:'Test',duration:209453,fee:0}]});}
    if(url.includes('/api/song/lyric'))return json({});
    if(url.includes('/weapi/song/')){player++;return json({data:[{id:2097485072,url:'https://m801.music.126.net/song.mp3',size:3000,type:'mp3',fee:0}]});}
    return new Response(bytes,{headers:{'Content-Length':'3000'}});
  };
  await neteaseApi(request(),fetcher,{cache});await neteaseApi(request('/api/netease/audio?id=2097485072'),fetcher,{cache});expect(metadata).toBe(1);expect(player).toBe(1);
  await neteaseApi(request(),fetcher,{cache,cookie:'MUSIC_U=other-account'});expect(metadata).toBe(2);expect(player).toBe(2);
});
