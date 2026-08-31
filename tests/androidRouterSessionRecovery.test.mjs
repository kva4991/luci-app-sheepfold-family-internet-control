/*
 * Защищает сценарий потери родительской router-сессии и безопасную диагностику
 * Статический контракт не меняет состояние приложения и не заменяет проверку
 * настоящего 401 и смены TLS-ключа на тестовом роутере
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
const request = read(
  'android/app/src/main/java/app/sheepfold/android/router/RouterConnectionRequest.kt',
);
const pairingSession = read(
  'android/app/src/main/java/app/sheepfold/android/router/PairingSessionToken.kt',
);
const setup = read('android/app/src/main/java/app/sheepfold/android/ui/setup/SafeRouterSetupScreen.kt');
const api = read('package/luci-app-sheepfold-family-internet-control/root/www/cgi-bin/sheepfold-api');
const legacyApi = read('package/luci-app-sheepfold-family-internet-control/root/usr/libexec/sheepfold/sheepfold-api-legacy');
const routerControl = read('package/luci-app-sheepfold-family-internet-control/root/usr/libexec/sheepfold/sheepfold-router-control');

describe('Android router session recovery §authrs1', () => {
  it('reports slow reads clearly without exposing headers or response data in diagnostics', () => {
    const screen = read('android/app/src/main/java/app/sheepfold/android/ui/main/OperationalMainScreen.kt');
    assert.match(screen, /error is SocketTimeoutException\) context\.getString\(R\.string\.router_refresh_timeout\)/);
    for (const locale of ['values', 'values-en']) {
      assert.match(read(`android/app/src/main/res/${locale}/strings.xml`), /name="router_refresh_timeout"/);
    }
    const diagnostics = client.match(/DiagnosticLog\.(?:info|warn)\("router\.request\.[^\n]*(?:\n\s*"[^\n]*)?/g) || [];
    assert.equal(diagnostics.length, 3);
    assert.ok(client.includes('"router.request.failed"'));
    assert.ok(client.includes('"errorType" to error.javaClass.simpleName'));
    assert.doesNotMatch(diagnostics.join('\n'), /bearerToken|deviceMac|responseBody|serverMessage|error\.message/);
  });
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
    assert.match(setup, /if \(pairingOnly\) \{\s*onSetupComplete\(connected\)/);
    assert.match(setup, /else \{\s*step = SetupStep\.PROTECTION/);
  });

  it('owns a single pairing attempt outside a replaceable Compose screen', () => {
    const model = read('android/app/src/main/java/app/sheepfold/android/ui/setup/RouterSetupViewModel.kt');
    assert.match(activity, /by viewModels<RouterSetupViewModel>\(\)/);
    assert.match(setup, /rememberSaveable\(pairingOnly\)/);
    assert.match(setup, /setupModel\.connect\(request\)/);
    assert.doesNotMatch(setup, /manager\.connect\(/);
    assert.match(model, /viewModelScope\.launch/);
    assert.match(model, /if \(busy \|\| connected != null\) return/);
    assert.match(model, /catch \(cancelled: CancellationException\) \{\s*throw cancelled/);
    assert.doesNotMatch(model, /SavedStateHandle|Bundle\s*\(/);
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
      assert.match(source, /authenticate-token/);
      assert.match(source, /"error":"device_unbound"/);
      assert.match(source, /401 Unauthorized/);
    }
    assert.match(routerControl, /token_device_is_admin_paired "\$device_id" "\$mac"/);
    assert.match(api, /"error":"invalid_token"/);
    assert.doesNotMatch(api, /HTTP_X_SHEEPFOLD_DEVICE_(?:ID|MAC)/);
  });

  it('requires explicit re-pairing after a stored TLS identity mismatch', () => {
    assert.match(session, /публичный ключ роутера не совпадает/i);
    assert.match(session, /сертификат роутера не совпадает/i);
    assert.match(session, /TLS_IDENTITY_CHANGED/);
    assert.match(activity, /pairing_tls_identity_changed/);
  });

  it('keeps session secrets attached to the same connection instance after app re-entry', () => {
    assert.match(pairingSession, /WeakHashMap<RouterConnectionRequest, PairingSessionData>/);
    assert.match(request, /\bclass RouterConnectionRequest\(/);
    assert.doesNotMatch(request, /\bdata class RouterConnectionRequest\(/);
    assert.match(activity, /val storedConnection = remember \{ SheepfoldConnectionStore\.read\(context\) \}/);
    assert.match(activity, /SheepfoldConnectionStore\.hasConnection\(storedConnection\)/);
    assert.equal(
      (activity.match(/SheepfoldConnectionStore\.read\(context\)/g) || []).length,
      1,
      'root navigation must not create two structurally equal session objects',
    );
    assert.match(store, /fun hasConnection\(request: RouterConnectionRequest\?\)/);
  });
});
