import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, symlinkSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import { createMediaServer } from './server.mjs';

test('real HTTP service guards direct files, enforces CORS, streams ranges, and rejects symlinks', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'anisong-media-http-'));
  const token = 'ci-fixture-private-access-code-0123456789', origin = 'https://localhost';
  const file = '0123456789abcdef-test.wav';
  writeFileSync(join(directory, file), '0123456789');
  writeFileSync(join(directory, 'catalog.json'), '{"songs":[]}');
  symlinkSync(join(directory, 'catalog.json'), join(directory, '0123456789abcdef-link.wav'));
  const server = createMediaServer({ assetsDirectory: directory, token, allowedOrigins: origin });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const base = `http://127.0.0.1:${server.address().port}`, headers = { Authorization: `Bearer ${token}`, Origin: origin };
  try {
    for (const path of ['/catalog.json', '/' + file]) assert.equal((await fetch(base + path)).status, 401);
    assert.equal((await fetch(base + '/catalog.json', { headers: { ...headers, Origin: 'https://untrusted.test' } })).status, 403);
    const preflight = await fetch(base + '/catalog.json', { method: 'OPTIONS', headers: { Origin: origin, 'Access-Control-Request-Method': 'GET', 'Access-Control-Request-Headers': 'authorization,range' } });
    assert.equal(preflight.status, 204); assert.equal(preflight.headers.get('Access-Control-Allow-Origin'), origin);
    const response = await fetch(base + '/' + file, { headers });
    assert.equal(await response.text(), '0123456789'); assert.equal(response.headers.get('Cache-Control'), 'private, no-store');
    for (const [range, expected] of [['bytes=2-5', '2345'], ['bytes=-3', '789'], ['bytes=8-', '89']]) {
      const part = await fetch(base + '/' + file, { headers: { ...headers, Range: range } });
      assert.equal(part.status, 206); assert.equal(await part.text(), expected);
    }
    for (const range of ['bytes=20-', 'bytes=-0', 'bytes=5-2', 'bytes=0-1,4-5']) assert.equal((await fetch(base + '/' + file, { headers: { ...headers, Range: range } })).status, 416);
    const head = await fetch(base + '/' + file, { method: 'HEAD', headers }); assert.equal(head.headers.get('Content-Length'), '10'); assert.equal(await head.text(), '');
    assert.equal((await fetch(base + '/0123456789abcdef-link.wav', { headers })).status, 404);
    assert.equal((await fetch(base + '/0123456789abcdef-%2fetc%2fpasswd.wav', { headers })).status, 404);
    assert.equal((await fetch(base + '/catalog.json?token=bad', { headers })).status, 400);
  } finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); rmSync(directory, { recursive: true, force: true }); }
});
