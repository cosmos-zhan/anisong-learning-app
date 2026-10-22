import {readFileSync,writeFileSync,mkdirSync,existsSync,readdirSync,chmodSync,cpSync,rmSync} from 'node:fs';
import {resolve,dirname,join,relative,isAbsolute,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomBytes} from 'node:crypto';
import {spawnSync} from 'node:child_process';
// Creates a PRIVATE upload folder. Does not log credentials, upload, or change Git.
const [input,destination,...origins]=process.argv.slice(2);
if(!input||!destination) throw new Error('Usage: node scripts/prepare-private-media-service.mjs SOURCE.json PRIVATE_OUTPUT_DIRECTORY [ALLOWED_HTTPS_ORIGIN ...]');
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..'),out=resolve(destination);
const within=relative(root,out);
if(!within||(!(within==='..'||within.startsWith('..'+sep))&&!isAbsolute(within))) {
 const ignored=spawnSync('git',['check-ignore',out],{cwd:root,encoding:'utf8'});
 if(ignored.status!==0) throw new Error('Output inside the repository must be Git-ignored; use private-media/service-upload.');
}
const allowed=['https://localhost',...origins].map(value=>{
 const url=new URL(value);if(url.protocol!=='https:'||url.origin!==value||url.username||url.password)throw new Error('Allow exact HTTPS origins only.');return value;
});
if(existsSync(out)&&readdirSync(out).length) throw new Error('Use an empty private output directory to avoid stale assets.');
mkdirSync(out,{recursive:true,mode:0o700});chmodSync(out,0o700);
try {
 const generated=spawnSync(process.execPath,[join(root,'scripts/create-media-catalog.mjs'),resolve(input),join(out,'assets')],{encoding:'utf8'});
 if(generated.status!==0) throw new Error('Cannot generate the media catalog. Check input paths and format.');
 const catalog=JSON.parse(readFileSync(join(out,'assets/catalog.json'),'utf8'));
 if(!catalog.songs?.length||catalog.songs.length>100)throw new Error('Catalog needs 1–100 songs.');
 const ids=new Set();
 for(const song of catalog.songs){
  if(!/^[a-z0-9][a-z0-9-]{0,79}$/.test(song.id)||ids.has(song.id)||typeof song.title!=='string'||!song.title.trim()||song.title.length>120||typeof song.revision!=='string'||!song.revision||song.revision.length>80||!song.audio)throw new Error('Invalid or duplicate song metadata.');
  ids.add(song.id);
  for(const key of ['audio','lyrics','score']) if(song[key]) {
   const asset=song[key],limit=key==='audio'?25*1024*1024:key==='lyrics'?128*1024:4*1024*1024;
   if(!asset.bytes||asset.bytes>limit||asset.name.length>160||!/^[a-f0-9]{16}-[^/]+\.(?:mp3|m4a|wav|ogg|flac|aac|lrc|mxl|musicxml|xml)$/i.test(asset.url))throw new Error('Unsupported asset name, type or size (Worker audio limit 25 MiB).');
  }
 }
 if(readFileSync(join(out,'assets/catalog.json')).length>512*1024)throw new Error('Catalog exceeds 512 KiB.');
 cpSync(join(root,'services/media-source/worker.ts'),join(out,'worker.ts'));
 const config=JSON.parse(readFileSync(join(root,'services/media-source/wrangler.jsonc'),'utf8'));
 delete config.$schema;config.assets.directory='./assets';config.vars.ALLOWED_ORIGINS=[...new Set(allowed)].join(',');
 writeFileSync(join(out,'wrangler.jsonc'),JSON.stringify(config,null,2)+'\n');
 const token=randomBytes(32).toString('base64url');
 writeFileSync(join(out,'ACCESS-CODE.txt'),token+'\n',{mode:0o600});
 writeFileSync(join(out,'.dev.vars'),'MEDIA_TOKEN='+token+'\n',{mode:0o600});
 writeFileSync(join(out,'README.txt'),'PRIVATE PACKAGE — contains personal media and a local access code. Never upload this folder to GitHub or a public file service.\n\nDeploy only after account authorization:\n1. cd to this folder.\n2. npx wrangler@4 login\n3. npx wrangler@4 secret put MEDIA_TOKEN < ACCESS-CODE.txt\n4. npx wrangler@4 deploy\n5. Verify unauthorized catalog/file requests return 401 and allowed-Origin authenticated downloads work. Missing Secret must return 503.\n6. Paste the actual /catalog.json URL and ACCESS-CODE.txt value separately into App > online materials.\n\nNo R2 bucket is required. Assets are always guarded by run_worker_first. Rotate access using secret put and update the private code; changing a code does not delete downloaded local media. Never pass a Cloudflare API token into the App.\n');
 console.log('Private media deployment folder prepared. No upload performed. Keep its access code private.');
} catch(error) {rmSync(out,{recursive:true,force:true});throw error;}
