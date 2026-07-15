import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const packageDir = resolve(repoRoot, 'package/luci-app-sheepfold-family-internet-control');

function readProjectFile(path) {
  return readFileSync(resolve(packageDir, path), 'utf8');
}

describe('Administrator token device binding', () => {
  it('stores login, device_id and mac when pairing succeeds', () => {
    const pairCommon = readProjectFile('root/usr/libexec/sheepfold/sheepfold-pair-common');
    const pairDevice = readProjectFile('root/usr/libexec/sheepfold/sheepfold-pair-device');
    const tokenCommon = readProjectFile('root/usr/libexec/sheepfold/sheepfold-token-common');

    assert.match(pairCommon, /token_write_bound_file/);
    assert.match(pairCommon, /PAIR_TOKEN_LOGIN/);
    assert.match(pairCommon, /ip neigh show "\$ip"/);
    assert.match(pairDevice, /PAIR_TOKEN_DEVICE_ID="\$device_id"/);
    assert.match(pairDevice, /PAIR_TOKEN_MAC="\$device_mac"/);
    assert.match(tokenCommon, /token_device_is_admin_paired/);
    assert.match(tokenCommon, /device_id=/);
    assert.match(tokenCommon, /mac=/);
  });

  it('checks bearer tokens together with device identity', () => {
    const control = readProjectFile('root/usr/libexec/sheepfold/sheepfold-router-control');
    const cgi = readProjectFile('root/www/cgi-bin/sheepfold-api');
    const apiLegacy = readProjectFile('root/usr/libexec/sheepfold/sheepfold-api-legacy');
    const aiGate = readProjectFile('root/usr/libexec/sheepfold/sheepfold-ai-gate');

    assert.match(control, /check_token "\$\{2:-\}" "\$\{3:-\}" "\$\{4:-\}"/);
    assert.match(control, /revoke-device-tokens/);
    assert.match(cgi, /HTTP_X_SHEEPFOLD_DEVICE_ID/);
    assert.match(cgi, /check-token "\$bearer" "\$client_device_id" "\$client_device_mac"/);
    assert.match(apiLegacy, /HTTP_X_SHEEPFOLD_DEVICE_MAC/);
    assert.match(apiLegacy, /check-token "\$bearer" "\$client_device_id" "\$client_device_mac"/);
    assert.match(aiGate, /is_admin_request "\$requested_device_id" "\$mac"/);
  });

  it('requires Android admin client to send bound device headers', () => {
    const adminClient = readProjectFile(
      '../../android/app/src/main/java/app/sheepfold/android/router/RouterAdminClient.kt',
    );
    const aiClient = readProjectFile(
      '../../android/app/src/main/java/app/sheepfold/android/router/AiAssistantClient.kt',
    );
    const store = readProjectFile(
      '../../android/app/src/main/java/app/sheepfold/android/router/SheepfoldConnectionStore.kt',
    );

    assert.match(adminClient, /X-Sheepfold-Device-Id/);
    assert.match(adminClient, /X-Sheepfold-Device-Mac/);
    assert.match(aiClient, /X-Sheepfold-Device-Mac/);
    assert.match(store, /administratorDeviceMac/);
    assert.match(store, /deviceMacKey/);
  });
});
