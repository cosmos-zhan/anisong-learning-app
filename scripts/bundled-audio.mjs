import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

// User-provided recordings are build inputs, never public repository content.
// Each build states honestly whether its private input was available.
const input = join('private-media', 'haruhikage-crychic.mp3');
const output = join('public', 'private-media');
const available = existsSync(input);
const lyricsInput = join('private-media', 'haruhikage-crychic.lrc');
const lyricsAvailable = available && existsSync(lyricsInput);
const mxlInput=join('private-media','haruhikage-crychic.mxl');
const scoreIsMxl=existsSync(mxlInput);
const scoreInput=scoreIsMxl?mxlInput:join('private-media','haruhikage-crychic.musicxml');
const scoreAvailable=existsSync(scoreInput);
if (!available && process.env.ANISONG_REQUIRE_BUNDLED_AUDIO === '1') {
  throw new Error('Restore private-media/haruhikage-crychic.mp3 before publishing this private Site. See docs/private-audio.md.');
}
if (!lyricsAvailable && process.env.ANISONG_REQUIRE_BUNDLED_LYRICS === '1') {
  throw new Error('Restore private MP3 and private-media/haruhikage-crychic.lrc before publishing. See docs/private-audio.md.');
}
if (!scoreAvailable && process.env.ANISONG_REQUIRE_BUNDLED_SCORE === '1') throw new Error('Restore private-media/haruhikage-crychic.musicxml before private publication.');
const audio = available ? readFileSync(input) : undefined;
if (audio && (audio.length < 1024 || audio.length > 30 * 1024 * 1024)) {
  throw new Error('Private MP3 must be between 1 KB and 30 MB.');
}
const sha256 = audio ? createHash('sha256').update(audio).digest('hex') : '';
const filename = `haruhikage-crychic-${sha256.slice(0, 12)}.mp3`;
rmSync(output, { recursive: true, force: true });
if(audio||scoreAvailable)mkdirSync(output,{recursive:true});
if (audio) {
  mkdirSync(output, { recursive: true });
  writeFileSync(join(output, filename), audio);
}
let lyrics = null;
if (lyricsAvailable) {
  const content = readFileSync(lyricsInput);
  if (!content.length || content.length > 128 * 1024) throw new Error('Private LRC must be between 1 byte and 128 KB.');
  new TextDecoder('utf-8', { fatal: true }).decode(content);
  const hash = createHash('sha256').update(content).digest('hex');
  const name = `haruhikage-crychic-${hash.slice(0, 12)}.lrc`;
  writeFileSync(join(output, name), content);
  lyrics = { src: `private-media/${name}`, sha256: hash, bytes: content.length };
}
let score=null;
if(scoreAvailable){
 const content=readFileSync(scoreInput);if(!content.length||content.length>(scoreIsMxl?4:8)*1024*1024)throw new Error('Private score exceeds its size limit.');
 if(!scoreIsMxl)new TextDecoder('utf-8',{fatal:true}).decode(content);
 const hash=createHash('sha256').update(content).digest('hex');const name=`haruhikage-crychic-${hash.slice(0,12)}.${scoreIsMxl?'mxl':'musicxml'}`;
 writeFileSync(join(output,name),content);score={src:`private-media/${name}`,sha256:hash,bytes:content.length,...(scoreIsMxl?{preferredPartId:'P2',preferredTrackId:'1:1'}:{})};
}
if (available) {
 const entry = value => value ? {url:value.src.split('/').at(-1),name:value.src.split('/').at(-1),bytes:value.bytes,sha256:value.sha256} : undefined;
 writeFileSync(join(output,'catalog.json'),JSON.stringify({schema:1,title:'私人练习素材',songs:[{id:'haruhikage-crychic',title:'春日影',revision:[sha256,lyrics?.sha256,score?.sha256].filter(Boolean).map(h=>h.slice(0,12)).join('-'),audio:entry({src:filename,bytes:audio.length,sha256}),...(lyrics?{lyrics:entry(lyrics)}:{}),...(score?{score:entry(score)}:{})}]},null,2)+'\n');
}
writeFileSync('apps/web/src/bundled-audio.json', JSON.stringify({
  available,
  catalog: available ? 'private-media/catalog.json' : null,
  src: available ? `private-media/${filename}` : '',
  sha256,
  bytes: audio?.length ?? 0,
  lyrics,
  score,
}, null, 2) + '\n');
