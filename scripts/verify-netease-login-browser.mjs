import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {build} from 'vite';
import {chromium} from 'playwright-core';

// Exercise the real account client and native Fetch adapter inside Chromium.
// Only the Android plugin is a fixture; no real account, SMS or provider request.
const nativeMock=`
export const Capacitor={isNativePlatform:()=>true};
export const registerPlugin=()=>({
 read:async()=>({cookie:globalThis.__neteaseLoginFixture.cookie}),
 write:async({cookie})=>{const f=globalThis.__neteaseLoginFixture;f.cookie=cookie;f.writes++;},
 clear:async()=>{globalThis.__neteaseLoginFixture.cookie='';},
 request:async(options)=>{
  const f=globalThis.__neteaseLoginFixture;
  f.providerOnly&&=new URL(options.url).hostname==='music.163.com';
  if(options.url.endsWith('/account/get'))f.statusCookie=options.headers.cookie===f.cookie&&!!f.cookie;
  const code=options.url.includes('/qrcode/client/login')?803:200;
  return {status:200,url:options.url,
   headers:{'Content-Type':'application/json',...(f.missing?{}:{'Set-Cookie':'MUSIC_U=browser-fixture-session; Path=/; HttpOnly, __csrf=fixture-csrf; Path=/'})},
   data:btoa(JSON.stringify({code,profile:{nickname:'Browser fixture'},account:{id:1}}))};
 }
});`;
const output=await build({configFile:false,logLevel:'error',plugins:[{
 name:'netease-native-login-fixture',
 resolveId(id){if(id==='@capacitor/core')return '\0netease-native-login-fixture';},
 load(id){if(id==='\0netease-native-login-fixture')return nativeMock;},
}],build:{write:false,target:'es2022',lib:{entry:resolve('packages/core/netease-account-client.ts'),name:'NeteaseLoginCheck',formats:['iife']}}});
const code=(Array.isArray(output)?output[0]:output).output.find(row=>row.type==='chunk').code;
const browser=await chromium.launch({executablePath:process.env.BROWSER_EXECUTABLE_PATH||undefined,args:['--no-sandbox','--disable-dev-shm-usage']});
try{
 const context=await browser.newContext();
 await context.route('**/*',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><title>Native NetEase login regression</title>'}));
 const page=await context.newPage();await page.goto('https://netease-login.test/');
 await page.evaluate(()=>{globalThis.__neteaseLoginFixture={cookie:'',writes:0,providerOnly:true,statusCookie:false,missing:false};});
 await page.addScriptTag({content:code});
 const result=await page.evaluate(async()=>{
  const fixture=globalThis.__neteaseLoginFixture,client=globalThis.NeteaseLoginCheck.deviceNeteaseAccount;
  const legacy=new Response('{}',{headers:{'Set-Cookie':'MUSIC_U=browser-fixture-session; Path=/; HttpOnly'}});
  const legacyFiltered=!legacy.headers.has('Set-Cookie');
  const sms=await client('sms-login',{phone:'12345678',captcha:'1234'},new AbortController().signal);
  const saved=fixture.cookie==='MUSIC_U=browser-fixture-session; __csrf=fixture-csrf';
  const status=await client('status',{},new AbortController().signal);
  await client('logout',{},new AbortController().signal);
  const qr=await client('qr-check',{key:'abcdefghijklmnop'},new AbortController().signal);
  await client('logout',{},new AbortController().signal);fixture.missing=true;
  let missingRejected=false;try{await client('sms-login',{phone:'12345678',captcha:'1234'},new AbortController().signal);}catch{missingRejected=true;}
  return {legacyResponseFiltersCookie:legacyFiltered,smsLogin:sms.loggedIn===true,qrLogin:qr.loggedIn===true,
   savedNativeSession:saved,statusAfterSave:status.loggedIn===true&&fixture.statusCookie,missingSessionRejected:missingRejected,
   sessionWrites:fixture.writes,onlyProviderRequests:fixture.providerOnly,
   noBrowserCookie:document.cookie==='',noLocalStorage:localStorage.length===0,
   noCredentialInResult:!JSON.stringify([sms,status,qr]).includes('browser-fixture-session')};
 });
 assert.equal(result.legacyResponseFiltersCookie,true,'Chromium must reproduce the original filtered header');
 for(const [name,value]of Object.entries(result))if(name!=='sessionWrites')assert.equal(value,true,name);
 assert.equal(result.sessionWrites,2,'Only valid SMS and confirmed QR may persist a session');
 const directory=resolve(process.env.BROWSER_RESULTS_DIR||'test-results/piano-browser');mkdirSync(directory,{recursive:true});
 writeFileSync(resolve(directory,'netease-native-login.json'),JSON.stringify(result,null,2)+'\n');
 console.log(JSON.stringify({check:'netease-native-login-browser',...result}));
 await context.close();
}finally{await browser.close();}
