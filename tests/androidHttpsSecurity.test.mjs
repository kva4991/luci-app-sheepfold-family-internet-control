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
    const tlsPin = readRepoFile('android/app/src/main/java/app/sheepfold/android/router/RouterTlsPin.kt');
    const connectionStore = readRepoFile(
      'android/app/src/main/java/app/sheepfold/android/router/SheepfoldConnectionStore.kt',
    );
    const discovery = readRepoFile(
      'package/luci-app-sheepfold-family-internet-control/htdocs/luci-static/resources/sheepfold/features/router/discovery.js',
    );
    const fingerprintHelper = readRepoFile(
      'package/luci-app-sheepfold-family-internet-control/root/usr/libexec/sheepfold/sheepfold-tls-fingerprint',
    );
    const routerControl = readRepoFile(
      'package/luci-app-sheepfold-family-internet-control/root/usr/libexec/sheepfold/sheepfold-router-control',
    );

    assert.match(tlsPin, /certificate\.publicKey\.encoded/);
    assert.match(tlsPin, /normalizedSpki != null && spkiPin != normalizedSpki/);
    assert.match(tlsPin, /normalizedExpected != null && certificatePin != normalizedExpected/);
    assert.match(connectionManager, /value\.startsWith\("SF1\|"\) \|\| value\.startsWith\("SF2\|"\)/);
    assert.match(connectionManager, /required = qrVersion == "SF2"/);
    assert.match(connectionManager, /tlsSpkiSha256 = request\.tlsSpkiSha256/);
    assert.match(connectionManager, /Публичный TLS-ключ роутера не совпал с QR-кодом/);
    assert.match(connectionStore, /routerTlsSpkiSha256/);
    assert.match(discovery, /'SF2\|h='/);
    assert.match(discovery, /function pairingPayload/);
    assert.match(fingerprintHelper, /openssl pkey -pubin/);
    assert.match(fingerprintHelper, /algorithm=sha256-spki/);
    assert.match(routerControl, /tls-public-key-fingerprint/);
  });

  it('resolves a signed QR hostname once and pins a local IP against DNS rebinding', () => {
    const localAddress = readRepoFile(
      'android/app/src/main/java/app/sheepfold/android/router/LocalRouterAddress.kt',
    );
    const connectionManager = readRepoFile(
      'android/app/src/main/java/app/sheepfold/android/router/SecureRouterConnectionManager.kt',
    );
    const routerHttps = readRepoFile(
      'android/app/src/main/java/app/sheepfold/android/router/RouterHttps.kt',
    );
    const endpointRecovery = readRepoFile(
      'android/app/src/main/java/app/sheepfold/android/router/RouterEndpointRecovery.kt',
    );

    assert.match(localAddress, /allowHostname \|\| isIpLiteral\(normalizedHost\)/);
    assert.match(localAddress, /InetAddress\.getAllByName\(normalizedHost\)/);
    assert.match(localAddress, /filter\(::isLocalAddress\)/);
    assert.match(localAddress, /address\.isSiteLocalAddress \|\| address\.isLinkLocalAddress/);
    assert.match(localAddress, /firstByte and 0xfe == 0xfc/);
    assert.match(localAddress, /address\.isLoopbackAddress \|\| address\.isMulticastAddress/);
    assert.match(connectionManager, /allowHostname = !request\.tlsSpkiSha256\.isNullOrBlank\(\)/);
    assert.match(connectionManager, /resolvedUrlHosts\(parsed\.host, allowHostname\)/);
    assert.match(connectionManager, /apiUrl = apiUrl/);
    assert.match(connectionManager, /Для ручного подключения укажите IP-адрес роутера/);
    assert.match(routerHttps, /LocalRouterAddress\.isLocalIpLiteral\(url\.host\)/);
    assert.match(routerHttps, /Выполните сопряжение заново/);
    assert.match(endpointRecovery, /val host = failedUrl\.host/);
    assert.doesNotMatch(endpointRecovery, /getAllByName|resolvedUrlHosts/);
  });

  it('keeps child APK on HTTPS-only router URLs', () => {
    const statusRepo = readRepoFile(
      'android-child/app/src/main/java/com/example/sheepfoldchild/data/ClientStatusRepository.kt',
    );
    const aiRepo = readRepoFile(
      'android-child/app/src/main/java/com/example/sheepfoldchild/data/AiRepository.kt',
    );
    const childHttps = readRepoFile(
      'android-child/app/src/main/java/com/example/sheepfoldchild/data/ChildRouterHttps.kt',
    );
    const childLocalAddress = readRepoFile(
      'android-child/app/src/main/java/com/example/sheepfoldchild/data/ChildLocalRouterAddress.kt',
    );

    assert.match(statusRepo, /Поддерживается только HTTPS/);
    assert.match(aiRepo, /Поддерживается только HTTPS/);
    assert.doesNotMatch(statusRepo, /\+=\s*"http:\/\/|mutableListOf\("http:\/\//);
    assert.doesNotMatch(aiRepo, /\+=\s*"http:\/\/|mutableListOf\("http:\/\//);
    assert.match(statusRepo, /ChildRouterHttps\.open/);
    assert.match(aiRepo, /ChildRouterHttps\.open/);
    assert.match(childHttps, /SHA-256/);
    assert.match(childHttps, /Сертификат роутера изменился/);
    assert.match(childHttps, /commitCapturedPin/);
    assert.match(childHttps, /ChildLocalRouterAddress\.isLocalIpLiteral\(url\.host\)/);
    assert.match(childLocalAddress, /address\.isSiteLocalAddress \|\| address\.isLinkLocalAddress/);
    assert.match(childLocalAddress, /octets\[0\] == 100 && octets\[1\] in 64\.\.127/);
    assert.match(childLocalAddress, /firstByte and 0xfe == 0xfc/);
    assert.doesNotMatch(childLocalAddress, /getAllByName/);
  });
});
