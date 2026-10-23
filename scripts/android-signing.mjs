import assert from 'node:assert/strict';
import { X509Certificate } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { appendFileSync, chmodSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export function requireReleaseSigner(info, policy) {
  assert.equal(info.signing, 'repository-secret', 'Release blocked: configure ANDROID_DEBUG_KEYSTORE_BASE64; temporary signing keys cannot be published.');
  assert.match(policy.signerSha256, /^[a-f0-9]{64}$/);
  assert.equal(info.signerSha256, policy.signerSha256, 'Release blocked: APK signer differs from the recovered fixed signing certificate.');
}

export function restoreSigner({ encoded, required, expected, destination }) {
  if (!encoded) {
    assert(!required, 'Fixed signing is required for release branches. Configure ANDROID_DEBUG_KEYSTORE_BASE64 before rebuilding.');
    return 'ephemeral-debug';
  }
  assert(encoded.length <= 1024 * 1024 && /^[A-Za-z0-9+/]+={0,2}$/.test(encoded.trim()), 'Invalid signing Secret encoding.');
  const key = Buffer.from(encoded.trim(), 'base64');
  assert.equal(key.toString('base64'), encoded.trim(), 'Invalid signing Secret encoding.');
  mkdirSync(dirname(destination), { recursive: true, mode: 0o700 });
  const temporary = destination + '.restore-' + process.pid;
  try {
    writeFileSync(temporary, key, { mode: 0o600, flag: 'wx' });
    const cert = spawnSync('keytool', ['-exportcert', '-alias', 'androiddebugkey', '-keystore', temporary, '-storepass', 'android'], { maxBuffer: 1024 * 1024 });
    assert.equal(cert.status, 0, 'Signing Secret is not the expected Android debug keystore.');
    const fingerprint = new X509Certificate(cert.stdout).fingerprint256.replaceAll(':', '').toLowerCase();
    requireReleaseSigner({ signing: 'repository-secret', signerSha256: fingerprint }, { signerSha256: expected });
    renameSync(temporary, destination);
    chmodSync(destination, 0o600);
    return 'repository-secret';
  } finally {
    key.fill(0);
    rmSync(temporary, { force: true });
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const policy = JSON.parse(readFileSync('.github/android-preview.json', 'utf8'));
  const destination = resolve(process.env.ANISONG_DEBUG_KEYSTORE || resolve(homedir(), '.android/debug.keystore'));
  assert(!/[\r\n]/.test(destination), 'Invalid signing key path.');
  const signing = restoreSigner({ encoded: process.env.DEBUG_KEYSTORE || '', required: process.env.REQUIRE_FIXED_SIGNING === 'true', expected: policy.signerSha256, destination });
  if (process.env.GITHUB_ENV) {
    appendFileSync(process.env.GITHUB_ENV, `PREVIEW_SIGNING=${signing}\n`);
    if (signing === 'repository-secret') appendFileSync(process.env.GITHUB_ENV, `ANISONG_DEBUG_KEYSTORE=${destination}\n`);
  }
  console.log(signing === 'repository-secret' ? 'Recovered fixed signer verified and restored.' : 'Non-release build: temporary signer allowed.');
}
