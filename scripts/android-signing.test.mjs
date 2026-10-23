import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { X509Certificate } from 'node:crypto';
import { requireReleaseSigner, restoreSigner } from './android-signing.mjs';

test('a release cannot use an ephemeral or different certificate', () => {
  const policy = { signerSha256: 'a'.repeat(64) };
  requireReleaseSigner({ signing: 'repository-secret', signerSha256: policy.signerSha256 }, policy);
  assert.throws(() => requireReleaseSigner({ signing: 'ephemeral-debug', signerSha256: policy.signerSha256 }, policy), /Release blocked/);
  assert.throws(() => requireReleaseSigner({ signing: 'repository-secret', signerSha256: 'b'.repeat(64) }, policy), /differs/);
});
test('missing signing Secret fails before touching an existing key on release branches', () => {
  assert.throws(() => restoreSigner({ encoded: '', required: true, destination: '/unused' }), /Fixed signing is required/);
  assert.equal(restoreSigner({ encoded: '', required: false, destination: '/unused' }), 'ephemeral-debug');
});
test('restoration checks the real certificate and preserves the existing key on mismatch', () => {
  const dir = mkdtempSync(join(tmpdir(), 'anisong-signer-test-'));
  try {
    const source = join(dir, 'source.keystore'), destination = join(dir, 'restored.keystore');
    const generated = spawnSync('keytool', ['-genkeypair', '-keystore', source, '-storepass', 'android', '-keypass', 'android', '-alias', 'androiddebugkey', '-dname', 'CN=Anisong CI test', '-keyalg', 'RSA', '-validity', '1'], { stdio: 'ignore' });
    assert.equal(generated.status, 0);
    const cert = spawnSync('keytool', ['-exportcert', '-keystore', source, '-storepass', 'android', '-alias', 'androiddebugkey']);
    const expected = new X509Certificate(cert.stdout).fingerprint256.replaceAll(':', '').toLowerCase();
    const bytes = readFileSync(source), encoded = bytes.toString('base64');
    assert.equal(restoreSigner({ encoded, required: true, expected, destination }), 'repository-secret');
    assert.deepEqual(readFileSync(destination), bytes);
    assert.throws(() => restoreSigner({ encoded, required: true, expected: '0'.repeat(64), destination }), /differs/);
    assert.deepEqual(readFileSync(destination), bytes);
    assert(!existsSync(destination + '.restore-' + process.pid));
    // Exercise the CLI boundary: later Gradle steps must use this exact verified file.
    mkdirSync(join(dir, '.github'));
    writeFileSync(join(dir, '.github/android-preview.json'), JSON.stringify({ signerSha256: expected }));
    const githubEnv = join(dir, 'github-env');
    const cli = spawnSync(process.execPath, [resolve('scripts/android-signing.mjs')], {
      cwd: dir, encoding: 'utf8',
      env: { ...process.env, DEBUG_KEYSTORE: encoded, REQUIRE_FIXED_SIGNING: 'true', ANISONG_DEBUG_KEYSTORE: destination, GITHUB_ENV: githubEnv },
    });
    assert.equal(cli.status, 0, cli.stderr);
    assert.equal(readFileSync(githubEnv, 'utf8'), `PREVIEW_SIGNING=repository-secret\nANISONG_DEBUG_KEYSTORE=${destination}\n`);
    assert.deepEqual(readFileSync(destination), bytes);
    assert(!cli.stdout.includes(encoded));
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
