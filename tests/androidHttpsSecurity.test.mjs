import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function readRepoFile(path) {
  return readFileSync(resolve(repoRoot, path), 'utf8');
}

describe('Android HTTPS hardening', () => {
  for (const app of ['android', 'android-child']) {
    it(`disables cleartext traffic in ${app}`, () => {
      const networkConfig = readRepoFile(`${app}/app/src/main/res/xml/network_security_config.xml`);
      const manifest = readRepoFile(`${app}/app/src/main/AndroidManifest.xml`);

      assert.match(networkConfig, /cleartextTrafficPermitted="false"/);
      assert.doesNotMatch(manifest, /usesCleartextTraffic="true"/);
    });
  }

  it('pins admin router HTTPS and avoids HTTP fallback', () => {
    const connectionManager = readRepoFile(
      'android/app/src/main/java/app/sheepfold/android/router/SecureRouterConnectionManager.kt',
    );
    const adminClient = readRepoFile(
      'android/app/src/main/java/app/sheepfold/android/router/RouterAdminClient.kt',
    );
    const routerHttps = readRepoFile(
      'android/app/src/main/java/app/sheepfold/android/router/RouterHttps.kt',
    );

    assert.match(connectionManager, /RouterHttps\.open/);
    assert.match(adminClient, /RouterHttps\.open/);
    assert.match(adminClient, /X-Sheepfold-Device-Id/);
    assert.match(adminClient, /X-Sheepfold-Device-Mac/);
    assert.match(routerHttps, /protocol\.equals\("https"/);
    assert.doesNotMatch(connectionManager, /"http:\/\/\$|mutableListOf\("http:\/\//);
    assert.match(readRepoFile('android/app/src/main/java/app/sheepfold/android/router/RouterTlsPin.kt'), /sha256/i);
  });

  it('keeps child APK on HTTPS-only router URLs', () => {
    const statusRepo = readRepoFile(
      'android-child/app/src/main/java/com/example/sheepfoldchild/data/ClientStatusRepository.kt',
    );
    const aiRepo = readRepoFile(
      'android-child/app/src/main/java/com/example/sheepfoldchild/data/AiRepository.kt',
    );

    assert.match(statusRepo, /Поддерживается только HTTPS/);
    assert.match(aiRepo, /Поддерживается только HTTPS/);
    assert.doesNotMatch(statusRepo, /\+\=\s*"http:\/\/|mutableListOf\("http:\/\//);
    assert.doesNotMatch(aiRepo, /\+\=\s*"http:\/\/|mutableListOf\("http:\/\//);
  });
});