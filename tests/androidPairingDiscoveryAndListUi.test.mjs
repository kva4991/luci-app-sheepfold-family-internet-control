import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (path) => readFileSync(resolve(repoRoot, path), 'utf8');

const discovery = read('android/app/src/main/java/app/sheepfold/android/router/LocalRouterDiscovery.kt');
const connection = read('android/app/src/main/java/app/sheepfold/android/router/SecureRouterConnectionManager.kt');
const endpointRecovery = read('android/app/src/main/java/app/sheepfold/android/router/RouterEndpointRecovery.kt');
const adminClient = read('android/app/src/main/java/app/sheepfold/android/router/RouterAdminClient.kt');
const connectionStore = read('android/app/src/main/java/app/sheepfold/android/router/SheepfoldConnectionStore.kt');
const overview = read('package/luci-app-sheepfold-family-internet-control/htdocs/luci-static/resources/view/sheepfold/overview.js');
const androidBuild = read('android/app/build.gradle.kts');
const makefile = read('package/luci-app-sheepfold-family-internet-control/Makefile');

function functionBody(source, name, nextName) {
  const start = source.indexOf(`function ${name}`);
  const end = source.indexOf(`function ${nextName}`, start + 1);
  assert.ok(start >= 0 && end > start, `${name} function boundaries must exist`);
  return source.slice(start, end);
}

describe('Android pairing discovery and access-list UI', () => {
  it('discovers the configured API port through standard router HTTPS', () => {
    const standardHttps = discovery.indexOf('https://$host/.well-known/sheepfold.json');
    const defaultApiPort = discovery.indexOf('https://$host:5201/.well-known/sheepfold.json');

    assert.ok(standardHttps >= 0 && standardHttps < defaultApiPort);
    assert.match(discovery, /if \(!isSheepfoldApi\(URL\(apiUrl\)\)\) continue/);
    assert.match(discovery, /httpsPort[\s\S]*appPort[\s\S]*toIntOrNull/);
  });

  it('turns QR and pairing failures into actionable messages', () => {
    assert.match(connection, /device_not_resolved/);
    assert.match(connection, /pairing_rejected/);
    assert.match(connection, /equals\("undefined", true\)/);
    assert.match(connection, /friendlyConnectionError/);
  });

  it('recovers and stores a changed Sheepfold API port after pairing', () => {
    assert.match(endpointRecovery, /\.well-known\/sheepfold\.json/);
    assert.match(endpointRecovery, /RouterHttps\.open\(url, tlsPin, allowTrustOnFirstUse = false\)/);
    assert.match(endpointRecovery, /it in 1\.\.65535/);
    assert.match(endpointRecovery, /SheepfoldConnectionStore\.updateApiUrl/);
    assert.match(connectionStore, /fun updateApiUrl/);
    assert.match(adminClient, /endpointCanBeRecovered/);
    assert.match(adminClient, /RouterEndpointRecovery\.discoverAndStore/);
    assert.doesNotMatch(adminClient, /SocketTimeoutException/);
  });

  it('updates allowlist and blocklist panels without reloading the browser page', () => {
    const addModal = functionBody(overview, 'showManualListDeviceModal', 'showManualDeviceModal');
    const removeAction = functionBody(overview, 'removeDeviceFromAccessList', 'applyAdminDeviceBindings');

    assert.match(addModal, /refreshUserListsWithoutPageReload/);
    assert.doesNotMatch(addModal, /window\.location\.reload/);
    assert.match(removeAction, /refreshUserListsWithoutPageReload/);
    assert.doesNotMatch(removeAction, /window\.location\.reload/);
    assert.match(overview, /data-metric/);
    assert.match(overview, /function saveSheepfoldAccessChanges[\s\S]*schedule-sync/);
    assert.match(addModal, /persistDeviceListMembership/);
  });

  it('bumps Android and OpenWrt package versions for the fix', () => {
    assert.match(androidBuild, /sheepfoldVersionCode = 40/);
    assert.match(androidBuild, /sheepfoldVersionName = "0\.1\.39"/);
    const release = Number(makefile.match(/PKG_RELEASE:=(\d+)/)?.[1] || 0);
    assert.ok(release >= 178);
  });
});
