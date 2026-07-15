import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (path) => readFileSync(resolve(repoRoot, path), 'utf8');

const discovery = read('android/app/src/main/java/app/sheepfold/android/router/LocalRouterDiscovery.kt');
const connection = read('android/app/src/main/java/app/sheepfold/android/router/SecureRouterConnectionManager.kt');
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

  it('updates allowlist and blocklist panels without reloading the browser page', () => {
    const addModal = functionBody(overview, 'showManualListDeviceModal', 'showManualDeviceModal');
    const removeAction = functionBody(overview, 'removeDeviceFromAccessList', 'applyAdminDeviceBindings');

    assert.match(addModal, /refreshUserListsWithoutPageReload/);
    assert.doesNotMatch(addModal, /window\.location\.reload/);
    assert.match(removeAction, /refreshUserListsWithoutPageReload/);
    assert.doesNotMatch(removeAction, /window\.location\.reload/);
    assert.match(overview, /data-metric/);
  });

  it('bumps Android and OpenWrt package versions for the fix', () => {
    assert.match(androidBuild, /sheepfoldVersionCode = 35/);
    assert.match(androidBuild, /sheepfoldVersionName = "0\.1\.34"/);
    assert.match(makefile, /PKG_RELEASE:=165/);
  });
});
