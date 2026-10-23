// Portable private media host, Node 24+. Reuses the Worker's authorization boundary.
import { createServer } from 'node:http';
import { open } from 'node:fs/promises';
import { constants, readFileSync } from 'node:fs';
import { dirname, extname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { Readable } from 'node:stream';
import worker from './worker.ts';

const types = { '.json': 'application/json; charset=utf-8', '.mp3': 'audio/mpeg', '.m4a': 'audio/mp4', '.wav': 'audio/wav', '.ogg': 'audio/ogg', '.flac': 'audio/flac', '.aac': 'audio/aac', '.lrc': 'text/plain; charset=utf-8', '.mxl': 'application/vnd.recordare.musicxml', '.musicxml': 'application/vnd.recordare.musicxml+xml', '.xml': 'application/xml' };

export function fileAssets(directory) {
  const root = resolve(directory);
  return { async fetch(request) {
    let name;
    try { name = decodeURIComponent(new URL(request.url).pathname.slice(1)); } catch { return new Response(null, { status: 404 }); }
    if (!name || name.includes('/') || name.includes('\\') || name.includes('\0') || ['.', '..'].includes(name)) return new Response(null, { status: 404 });
    let file;
    try {
      file = await open(resolve(root, name), constants.O_RDONLY | constants.O_NOFOLLOW);
      const stat = await file.stat();
      if (!stat.isFile()) { await file.close(); return new Response(null, { status: 404 }); }
      const length = stat.size;
      const headers = new Headers({ 'Content-Type': types[extname(name).toLowerCase()] || 'application/octet-stream', 'Content-Length': String(length), 'Accept-Ranges': 'bytes' });
      let start = 0, end = length - 1, status = 200;
      const range = request.headers.get('Range');
      if (range) {
        const match = /^bytes=(\d*)-(\d*)$/.exec(range);
        if (match && (match[1] || match[2])) {
          if (!match[1]) start = Math.max(0, length - Number(match[2]));
          else { start = Number(match[1]); if (match[2]) end = Math.min(end, Number(match[2])); }
        }
        if (!match || !(match[1] || match[2]) || !Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start > end || start >= length) {
          await file.close(); return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${length}` } });
        }
        status = 206; headers.set('Content-Range', `bytes ${start}-${end}/${length}`); headers.set('Content-Length', String(end - start + 1));
      }
      if (request.method === 'HEAD' || !length) { await file.close(); return new Response(null, { status, headers }); }
      const body = Readable.toWeb(file.createReadStream({ start, end, autoClose: true }));
      file = undefined;
      return new Response(body, { status, headers });
    } catch {
      await file?.close().catch(() => {});
      return new Response(null, { status: 404 });
    }
  } };
}

export function createMediaServer({ assetsDirectory, token, allowedOrigins = '' }) {
  const env = { MEDIA_TOKEN: token, ALLOWED_ORIGINS: allowedOrigins, ASSETS: fileAssets(assetsDirectory) };
  return createServer({ requestTimeout: 30_000, headersTimeout: 10_000, maxHeaderSize: 16_384 }, async (incoming, outgoing) => {
    try {
      // A fixed internal origin avoids trusting Host or forwarded headers for CORS.
      const request = new Request('http://private-media.invalid' + incoming.url, { method: incoming.method, headers: incoming.headers });
      const response = await worker.fetch(request, env);
      outgoing.writeHead(response.status, Object.fromEntries(response.headers));
      if (!response.body) return outgoing.end();
      const stream = Readable.fromWeb(response.body);
      outgoing.on('close', () => stream.destroy());
      stream.on('error', () => outgoing.destroy());
      stream.pipe(outgoing);
    } catch { if (!outgoing.headersSent) outgoing.writeHead(500, { 'Cache-Control': 'private, no-store' }); outgoing.end(); }
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const here = dirname(fileURLToPath(import.meta.url));
  const token = process.env.MEDIA_TOKEN_FILE ? readFileSync(process.env.MEDIA_TOKEN_FILE, 'utf8').trim() : process.env.MEDIA_TOKEN;
  if (!token || !/^[A-Za-z0-9_-]{32,128}$/.test(token)) throw new Error('Set MEDIA_TOKEN_FILE or MEDIA_TOKEN before starting the private service.');
  const server = createMediaServer({ assetsDirectory: process.env.MEDIA_ASSETS_DIR || resolve(here, 'assets'), token, allowedOrigins: process.env.ALLOWED_ORIGINS || 'https://localhost' });
  server.listen(Number(process.env.PORT || 8787), process.env.HOST || '127.0.0.1', () => console.log('Private media service ready; use an HTTPS reverse proxy for App access.'));
  for (const signal of ['SIGTERM', 'SIGINT']) process.once(signal, () => { server.close(); server.closeIdleConnections(); });
}
