import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

// User-provided recordings are build inputs, never public repository content.
// Each build states honestly whether its private input was available.
const input = join('private-media', 'haruhikage-crychic.mp3');
const output = join('public', 'private-media');
const available = existsSync(input);
if (!available && process.env.ANISONG_REQUIRE_BUNDLED_AUDIO === '1') {
  throw new Error('Restore private-media/haruhikage-crychic.mp3 before publishing this private Site. See docs/private-audio.md.');
}
const audio = available ? readFileSync(input) : undefined;
if (audio && (audio.length < 1024 || audio.length > 30 * 1024 * 1024)) {
  throw new Error('Private MP3 must be between 1 KB and 30 MB.');
}
const sha256 = audio ? createHash('sha256').update(audio).digest('hex') : '';
const filename = `haruhikage-crychic-${sha256.slice(0, 12)}.mp3`;
rmSync(output, { recursive: true, force: true });
if (audio) {
  mkdirSync(output, { recursive: true });
  writeFileSync(join(output, filename), audio);
}
writeFileSync('apps/web/src/bundled-audio.json', JSON.stringify({
  available,
  src: available ? `private-media/${filename}` : '',
  sha256,
  bytes: audio?.length ?? 0,
}, null, 2) + '\n');
