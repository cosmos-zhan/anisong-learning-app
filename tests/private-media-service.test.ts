import {readFileSync,mkdtempSync,rmSync,existsSync,readdirSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {spawnSync} from 'node:child_process';
import {webcrypto} from 'node:crypto';
import {afterEach,beforeEach,it,expect,vi} from 'vitest';
import worker,{type MediaEnv} from '../services/media-source/worker';
const token='test-private-source-01234567890123456789';
const origin='https://localhost';
const address='https://media.test/catalog.json';
let env:MediaEnv;
beforeEach(()=>{vi.stubGlobal('crypto',webcrypto);env={MEDIA_TOKEN:token,ALLOWED_ORIGINS:origin,ASSETS:{fetch:vi.fn(async()=>new Response('private content',{headers:{'Content-Type':'application/json','Cache-Control':'public,max-age=31536000'}}))}};});
afterEach(()=>vi.unstubAllGlobals());
const request=(headers:Record<string,string>={},method='GET',url=address)=>new Request(url,{method,headers});
it('guards catalog, direct assets and unknown paths; missing secret fails closed',async()=>{
 for(const path of ['/catalog.json','/0123456789abcdef-private.mp3','/anything']){
  expect((await worker.fetch(request({},'GET','https://media.test'+path),env)).status).toBe(401);
  expect((await worker.fetch(request({},'GET','https://media.test'+path),{...env,MEDIA_TOKEN:undefined})).status).toBe(503);
 }
 expect((await worker.fetch(request({Authorization:'Bearer '+'x'.repeat(43)}),env)).status).toBe(401);
 expect(env.ASSETS.fetch).not.toHaveBeenCalled();
 const config=JSON.parse(readFileSync(resolve('services/media-source/wrangler.jsonc'),'utf8'));
 expect(config.assets.run_worker_first).toBe(true);
 expect(config.assets.not_found_handling).toBe('none');
 expect(config.preview_urls).toBe(false);
});
it('allows only listed browser origins and read-only preflight with Authorization',async()=>{
 const ok=await worker.fetch(request({Origin:origin,'Access-Control-Request-Method':'GET','Access-Control-Request-Headers':'authorization,range'},'OPTIONS'),env);
 expect(ok.status).toBe(204);expect(ok.headers.get('Access-Control-Allow-Origin')).toBe(origin);
 for(const headers of ([{Origin:'https://bad.test','Access-Control-Request-Method':'GET'},{Origin:origin,'Access-Control-Request-Method':'POST'},{Origin:origin,'Access-Control-Request-Method':'GET','Access-Control-Request-Headers':'x-custom'}] as Record<string,string>[]))
  expect((await worker.fetch(request(headers,'OPTIONS'),env)).status).toBe(403);
 expect((await worker.fetch(request({Origin:'https://bad.test',Authorization:`Bearer ${token}`}),env)).status).toBe(403);
 expect(env.ASSETS.fetch).not.toHaveBeenCalled();
});
it('streams authenticated assets without public caching, credential forwarding or URL tokens',async()=>{
 const response=await worker.fetch(request({Origin:origin,Authorization:`Bearer ${token}`,Range:'bytes=0-10'}),env);
 expect(response.status).toBe(200);expect(await response.text()).toBe('private content');
 expect(response.headers.get('Access-Control-Allow-Origin')).toBe(origin);
 expect(response.headers.get('Cache-Control')).toBe('private, no-store');
 const forwarded=vi.mocked(env.ASSETS.fetch).mock.calls[0][0];
 expect(forwarded.headers.get('Authorization')).toBeNull();expect(forwarded.headers.get('Range')).toBe('bytes=0-10');
 expect((await worker.fetch(request({Authorization:`Bearer ${token}`},'GET',address+'?token=abc'),env)).status).toBe(400);
 expect((await worker.fetch(request({Authorization:`Bearer ${token}`},'POST'),env)).status).toBe(405);
});
it('supports HEAD and never forwards an asset redirect to the browser',async()=>{
 expect(await (await worker.fetch(request({Authorization:`Bearer ${token}`},'HEAD'),env)).text()).toBe('');
 env.ASSETS.fetch=vi.fn(async()=>new Response(null,{status:302,headers:{Location:'https://elsewhere.test'}}));
 const response=await worker.fetch(request({Authorization:`Bearer ${token}`}),env);
 expect(response.status).toBe(502);expect(response.headers.has('Location')).toBe(false);
});
it('packages a deployable private source with code outside assets; rejects a non-ignored repository destination',()=>{
 const temp=mkdtempSync(join(tmpdir(),'anisong-private-service-'));
 try{
  // Only CC0 fixture media are used here; the generated token never enters snapshots/logs.
  const source=join(temp,'source.json'),output=join(temp,'upload');
  writeFileSync(source,JSON.stringify({title:'CC0',songs:[{id:'demo',title:'CC0',revision:'1',audio:resolve('public/demo/demo.wav'),lyrics:resolve('public/demo/demo.lrc'),score:resolve('public/demo/piano-demo.musicxml')}]}));
  const run=spawnSync(process.execPath,['scripts/prepare-private-media-service.mjs',source,output,origin],{encoding:'utf8'});
  expect(run.status,run.stderr).toBe(0);
  expect(readFileSync(join(output,'ACCESS-CODE.txt'),'utf8').trim()).toMatch(/^[A-Za-z0-9_-]{43}$/);
  expect(readdirSync(join(output,'assets'))).toHaveLength(4);
  expect(existsSync(join(output,'assets/ACCESS-CODE.txt'))).toBe(false);
  const config=JSON.parse(readFileSync(join(output,'wrangler.jsonc'),'utf8'));
  expect(config.assets).toMatchObject({directory:'./assets',run_worker_first:true});
  expect(config.vars.ALLOWED_ORIGINS).toBe(origin);
  const refused=spawnSync(process.execPath,['scripts/prepare-private-media-service.mjs',source,resolve('public/unsafe-private-upload')],{encoding:'utf8'});
  expect(refused.status).not.toBe(0);expect(existsSync(resolve('public/unsafe-private-upload'))).toBe(false);
 }finally{rmSync(temp,{recursive:true,force:true});}
});
