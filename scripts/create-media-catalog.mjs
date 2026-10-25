import {readFileSync,writeFileSync,mkdirSync,copyFileSync} from 'node:fs';
import {resolve,basename,join} from 'node:path';
import {createHash} from 'node:crypto';
// Inputs may be private. Output is never added to Git automatically.
const [configPath,outputPath]=process.argv.slice(2);
if(!configPath||!outputPath)throw new Error('Usage: node scripts/create-media-catalog.mjs SOURCE.json OUTPUT_DIRECTORY');
const config=JSON.parse(readFileSync(configPath,'utf8')),out=resolve(outputPath);
mkdirSync(out,{recursive:true});
const songs=config.songs.map(song=>{
 const row={id:song.id,title:song.title,revision:song.revision};
 for(const key of ['audio','lyrics','score'])if(song[key]){
  const path=resolve(song[key]),data=readFileSync(path),hash=createHash('sha256').update(data).digest('hex');
  const original=basename(path),name=`${hash.slice(0,16)}-${original}`;
  copyFileSync(path,join(out,name));row[key]={url:name,name:original,bytes:data.length,sha256:hash};
 }
 return row;
});
writeFileSync(join(out,'catalog.json'),JSON.stringify({schema:1,title:config.title,songs},null,2)+'\n');
console.log('Media source created; publish the directory to your authorized HTTPS host.');
