/**
 * Назначение: проверяет реальную совместимость Node signer и OpenWrt shell verifier.
 * Вход: временная Ed25519-пара, строгий manifest и заведомо изменённый endpoint.
 * Выход: оригинал принят openssl pkeyutl, изменённый manifest отклонён.
 * Ограничение: сеть/GitHub и сохранение UCI проверяются на живом тестовом роутере.
 */

import assert from 'node:assert/strict';
import { generateKeyPairSync, sign } from 'node:crypto';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { relative, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

const root = resolve(import.meta.dirname, '..');
const helper = resolve(
  root,
  'package/luci-app-sheepfold-family-internet-control/root/usr/libexec/sheepfold/' +
    'sheepfold-support-endpoint-discovery',
);

function shellPath(path) {
  return path.replace(/\\/g, '/').replace(
    /^([A-Za-z]):/,
    (_, drive) => `/${drive.toLowerCase()}`,
  );
}

function createManifest() {
  const { privateKey, publicKey } = generateKeyPairSync('ed25519');
  const endpoint = 'https://203.0.113.20:9443/v1/reports';
  const payload = Buffer.from(
    `sheepfold-support-endpoint-v1\nsequence=12\nendpoint=${endpoint}\n`,
    'ascii',
  );
  const signature = sign(null, payload, privateKey).toString('base64url');
  const publicKeyValue = publicKey.export({ format: 'der', type: 'spki' }).toString('base64url');
  return {
    endpoint,
    publicKeyValue,
    manifest: `${payload.toString('ascii')}signature=${signature}\n`,
  };
}

test('supportEndpointDiscovery verifies Node Ed25519 and rejects a changed endpoint', () => {
  const testRoot = mkdtempSync(resolve(root, '.build/support-endpoint-discovery-'));
  try {
    const signed = createManifest();
    const manifestFile = resolve(testRoot, 'manifest.txt');
    const changedFile = resolve(testRoot, 'manifest-changed.txt');
    const runtimeDir = resolve(testRoot, 'runtime');
    mkdirSync(runtimeDir, { recursive: true });
    writeFileSync(manifestFile, signed.manifest, 'ascii');
    writeFileSync(changedFile, signed.manifest.replace('203.0.113.20', '203.0.113.21'), 'ascii');
    const environment = {
      ...process.env,
      SHEEPFOLD_SUPPORT_RUNTIME_DIR: shellPath(relative(root, runtimeDir)),
    };
    const accepted = spawnSync(
      'bash',
      [
        shellPath(relative(root, helper)),
        'verify-file',
        shellPath(relative(root, manifestFile)),
        signed.publicKeyValue,
      ],
      { cwd: root, env: environment, encoding: 'utf8' },
    );
    assert.equal(accepted.error, undefined, accepted.error?.message);
    assert.equal(accepted.status, 0, accepted.stderr);
    assert.match(accepted.stdout, new RegExp(`endpoint=${signed.endpoint.replaceAll('.', '\\.')}\\nsequence=12`));

    const rejected = spawnSync(
      'bash',
      [
        shellPath(relative(root, helper)),
        'verify-file',
        shellPath(relative(root, changedFile)),
        signed.publicKeyValue,
      ],
      { cwd: root, env: environment, encoding: 'utf8' },
    );
    assert.equal(rejected.error, undefined, rejected.error?.message);
    assert.notEqual(rejected.status, 0);
    assert.match(rejected.stderr, /error=manifest_signature/);
  } finally {
    rmSync(testRoot, { recursive: true, force: true });
  }
});
