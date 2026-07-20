/*
 * Защищает сценарий потери родительской router-сессии. Это статический контракт:
 * он не заменяет проверку настоящего 401 и смены TLS-ключа на тестовом роутере.
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (path) => readFileSync(resolve(repoRoot, path), 'utf8');

const session = read('android/app/src/main/java/app/sheepfold/android/router/RouterSessionRecovery.kt');
const store = read('android/app/src/main/java/app/sheepfold/android/router/SheepfoldConnectionStore.kt');
const client = read('android/app/src/main/java/app/sheepfold/android/router/RouterAdminClient.kt');
const connectionManager = read('android/app/src/main/java/app/sheepfold/android/router/SecureRouterConnectionManager.kt');
const aiClient = read('android/app/src/main/java/app/sheepfold/android/router/AiAssistantClient.kt');
const activity = read('android/app/src/main/java/app/sheepfold/android/MainActivity.kt');
const setup = read('android/app/src/main/java/app/sheepfold/android/ui/setup/SafeRouterSetupScreen.kt');
const api = read('package/luci-app-sheepfold-family-internet-control/root/www/cgi-bin/sheepfold-api');
const legacyApi = read('package/luci-app-sheepfold-family-internet-control/root/usr/libexec/sheepfold/sheepfold-api-legacy');

describe('Android router session recovery §authrs1', () => {
  it('treats only final authorization failures as a lost pairing', () => {
    assert.match(session, /statusCode == 401/);
    assert.match(session, /token_invalid/);
    assert.match(session, /token_expired/);
    assert.match(session, /token_revoked/);
    assert.match(session, /device_unbound/);
    assert.doesNotMatch(session, /statusCode\s*>=\s*500|statusCode\s+in\s+500/);
    assert.doesNotMatch(session, /SocketTimeoutException|UnknownHostException|ConnectException/);
  });

  it('clears only router credentials and persists a one-shot re-pair reason', () => {
    assert.match(store, /fun clearForPairing\(context: Context, reason: RouterPairingLoss\)/);
    assert.match(store, /clearForPairing[\s\S]*clearConnection\(context\)[\s\S]*putString\(pairingLossKey, reason\.name\)/);
    assert.match(store, /fun consumePairingLoss/);
    assert.doesNotMatch(store, /AppProtectionStore|agreement|permission/i);
    assert.doesNotMatch(store, /temporaryPassword|pairingToken|pairing_code/);
  });

  it('opens the pairing choice directly without repeating agreement or protection setup', () => {
    assert.match(activity, /pairingOnly = pairingLoss != null/);
    assert.match(activity, /pairingLoss != null && !unlocked/);
    assert.match(setup, /if \(pairingOnly\) SetupStep\.PAIRING else SetupStep\.AGREEMENT/);
    assert.match(setup, /if \(pairingOnly\) onSetupComplete\(it\) else step = SetupStep\.PROTECTION/);
  });

  it('probes candidate endpoints without a secret and submits a one-time code only once', () => {
    assert.match(connectionManager, /pairingEndpointIsReady\(request, apiUrl\)/);
    assert.match(connectionManager, /val apiUrl = selectedApiUrl[\s\S]*runCatching \{ pair\(request, apiUrl\) \}/);
    assert.ok(
      connectionManager.indexOf('pairingEndpointIsReady(request, apiUrl)') <
        connectionManager.indexOf('runCatching { pair(request, apiUrl) }'),
    );
    assert.match(connectionManager, /После неясного timeout повторять одноразовый секрет нельзя/);
  });

  it('routes admin and AI API failures through the same terminal-session classifier', () => {
    assert.match(client, /RouterSessionFailure\.fromHttp/);
    assert.match(client, /RouterSessionFailure\.fromThrowable/);
    assert.match(client, /RouterSessionEvents\.report/);
    assert.match(aiClient, /RouterSessionFailure\.fromHttp/);
    assert.match(aiClient, /RouterSessionEvents\.report/);
  });

  it('returns a distinct device_unbound code when administrator rights were removed', () => {
    for (const source of [api, legacyApi]) {
      assert.match(source, /token_device_is_admin_paired/);
      assert.match(source, /"error":"device_unbound"/);
      assert.match(source, /401 Unauthorized/);
    }
    assert.match(api, /"error":"invalid_token"/);
    assert.match(api, /"error":"token_revoked"/);
  });

  it('requires explicit re-pairing after a stored TLS identity mismatch', () => {
    assert.match(session, /публичный ключ роутера не совпадает/i);
    assert.match(session, /сертификат роутера не совпадает/i);
    assert.match(session, /TLS_IDENTITY_CHANGED/);
    assert.match(activity, /pairing_tls_identity_changed/);
  });
});
