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
const scoreInput=join('private-media','haruhikage-crychic.musicxml');
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
 const content=readFileSync(scoreInput);if(!content.length||content.length>2*1024*1024)throw new Error('Private score must be between 1 byte and 2 MB.');
 new TextDecoder('utf-8',{fatal:true}).decode(content);
 const hash=createHash('sha256').update(content).digest('hex');const name=`haruhikage-crychic-${hash.slice(0,12)}.musicxml`;
 writeFileSync(join(output,name),content);score={src:`private-media/${name}`,sha256:hash,bytes:content.length};
}
writeFileSync('apps/web/src/bundled-audio.json', JSON.stringify({
  available,
  src: available ? `private-media/${filename}` : '',
  sha256,
  bytes: audio?.length ?? 0,
  lyrics,
  score,
}, null, 2) + '\n');
