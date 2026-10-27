import {test,beforeEach,afterEach,vi} from 'vitest';
import {webcrypto} from 'node:crypto';
beforeEach(()=>vi.stubGlobal('crypto',webcrypto));
afterEach(()=>vi.unstubAllGlobals());
import assert from 'node:assert/strict';
import {Buffer} from 'node:buffer';
import {createCipheriv,createDecipheriv,createHmac,createPublicKey,diffieHellman,generateKeyPairSync} from 'node:crypto';
import {gzipSync} from 'node:zlib';
import {neteaseXeapiPlayer} from '../packages/core/netease-xeapi.mjs';
import {neteaseApi} from '../packages/core/netease-api.mjs';
const staticKey=Buffer.from('ab1d5a430f6bb04a3f01e81ddd72bd916d5ce591248ac128714806d7f8fb1b84','hex');
const signKey='mUHCwVNWJbunMqAHf5MImuirT6plvs6VSFW62MGHstFQxhBGdEoIhLItH3djc4+FB/OKty3+lL2rGeoFBpVe5g==';
const aes=(key,body,decrypt=false)=>{const cipher=(decrypt?createDecipheriv:createCipheriv)(`aes-${key.length*8}-ecb`,key,null);return Buffer.concat([cipher.update(body),cipher.final()]);};
function provider(data){
 const server=generateKeyPairSync('x25519'),calls=[];
 const fetcher=async(url,options)=>{
  calls.push(url);assert.equal(options.redirect,'manual');const body=new URLSearchParams(options.body),headers=new Headers(options.headers);
  if(calls.length===1){
   assert.equal(url,'https://interface.music.163.com/api/bsr/sk/get');assert(!headers.get('Cookie').includes('fixture-session'));
   const timestamp='1234',signature=createHmac('sha256',signKey).update(timestamp+body.get('nonce')).digest('base64');
   return Response.json({code:200,data:{timestamp,signature,encryptedData:aes(staticKey,Buffer.from(JSON.stringify({publicKey:Buffer.from(server.publicKey.export({format:'der',type:'spki'})).subarray(-32).toString('base64'),version:'fixture-v1',sk:'fixture-sk'}))).toString('base64')}});
  }
  assert.equal(url,'https://interface3.music.163.com/xeapi/song/enhance/player/url/v1');assert.equal(headers.get('x-music-u'),'fixture-session');
  const sealed=Buffer.from(body.get('S'),'base64'),ephemeral=sealed.subarray(0,32);
  const shared=diffieHellman({privateKey:server.privateKey,publicKey:createPublicKey({key:Buffer.concat([Buffer.from('302a300506032b656e032100','hex'),ephemeral]),format:'der',type:'spki'})});
  const prk=createHmac('sha256',Buffer.alloc(32)).update(shared).digest(),aesKey=createHmac('sha256',prk).update(Buffer.concat([ephemeral,Buffer.from([1])])).digest().subarray(0,16);
  const cipher=createDecipheriv('aes-128-gcm',aesKey,sealed.subarray(32,44));cipher.setAuthTag(sealed.subarray(-16));
  const [dynamicKey,os,sk]=Buffer.concat([cipher.update(sealed.subarray(44,-16)),cipher.final()]).toString().split('|');assert.equal(os,'android');assert.equal(sk,'fixture-sk');
  const middle=aes(Buffer.from(dynamicKey,'base64'),Buffer.from(body.get('C'),'base64url'),true),random=middle.subarray(0,16),rotated=middle.subarray(16),rot=(random[0]&15)%rotated.length;
  const xored=rot?Buffer.concat([rotated.subarray(-rot),rotated.subarray(0,-rot)]):rotated;
  const plain=JSON.parse(aes(staticKey,Buffer.from(xored.map((x,i)=>x^random[i&15])),true).toString());
  assert.equal(plain.queryString,'e_r=true');const content=new URLSearchParams(plain.content);assert.equal(content.get('ids'),'[2097485072]');assert.equal(content.get('level'),'exhigh');
  assert.equal(aes(staticKey,Buffer.from(body.get('R'),'base64'),true).toString(),'fixture-v1|');
  return new Response(aes(Buffer.from('e82ckenh8dichen8'),gzipSync(Buffer.from(JSON.stringify(data)))));

 };return {fetcher,calls};
}
test('current client protocol completes a signed key exchange, protects the session and decodes a compressed provider response',async()=>{
 const data={code:200,data:[{id:2097485072,code:200,type:'m4a',url:'https://m7.music.126.net/test.m4a'}]},fixture=provider(data);
 const response=await neteaseXeapiPlayer('2097485072','exhigh',AbortSignal.timeout(1000),'MUSIC_U=fixture-session',fixture.fetcher);
 assert.deepEqual(await response.json(),data);assert.equal(fixture.calls.length,2);
});
test('parse and full transfer select the current protocol, bound the ordinary GET probe and reuse the checked address',async()=>{
 const bytes=new Uint8Array(1000);bytes.set([73,68,51]);
 const fixture=provider({code:200,data:[{id:2097485072,code:200,type:'mp3',size:1000,url:'https://m7.music.126.net/test.mp3'}]});
 const fetcher=async(url,options)=>{
  if(String(url).includes('/api/song/detail/'))return Response.json({songs:[{id:2097485072,name:'Fixture',duration:2000,fee:1}]});
  if(String(url).includes('/api/song/lyric'))return Response.json({lrc:{lyric:'[00:00]Fixture'}});
  if(new URL(url).hostname.endsWith('music.126.net')){
   const headers=new Headers(options.headers);assert.equal(headers.has('Cookie'),false);assert.equal(headers.has('Referer'),false);assert.equal(headers.has('Range'),false);
   return new Response(bytes,{headers:{'Content-Length':'1000'}});
  }
  return fixture.fetcher(url,options);
 };
 const config={cookie:'MUSIC_U=fixture-session',cache:new Map()};
 const request=(audio=false)=>new Request('https://device.test/api/netease/'+(audio?'audio?id=2097485072':'parse'),{method:audio?'GET':'POST',headers:{'X-Anisong-Upload':'1'},...audio?{}:{body:JSON.stringify({input:'2097485072'})}});
 const parsed=await(await neteaseApi(request(),fetcher,config)).json();assert.equal(parsed.audio.status,'available');assert.equal(parsed.audio.source,'player-xeapi');assert.equal(parsed.audio.format,'mp3');
 const response=await neteaseApi(request(true),fetcher,config);assert.equal(response.status,200);assert.deepEqual(new Uint8Array(await response.arrayBuffer()),bytes);assert.equal(fixture.calls.length,2);
 assert(!JSON.stringify(parsed).includes('fixture-session'));assert(!JSON.stringify(parsed).includes('test.mp3'));
});
test('a key exchange with an invalid response signature stops before sending the account session',async()=>{
 let count=0;
 await assert.rejects(()=>neteaseXeapiPlayer('2097485072','exhigh',AbortSignal.timeout(1000),'MUSIC_U=fixture-session',async()=>{count++;return Response.json({code:200,data:{timestamp:'1',signature:'invalid',encryptedData:'invalid'}});}),/client-key-signature/);
 assert.equal(count,1);
});
