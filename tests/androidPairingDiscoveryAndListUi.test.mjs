/*
 * Защищает контракт discovery/pairing Android и одинаковую модель выбора устройств
 * в LuCI. Это статическая/модельная проверка без телефона и роутера; она не доказывает
 * реальное HTTPS-сопряжение, которое остаётся live-router Android-сценарием.
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (path) => readFileSync(resolve(repoRoot, path), 'utf8');

const discovery = read('android/app/src/main/java/app/sheepfold/android/router/LocalRouterDiscovery.kt');
const connection = read('android/app/src/main/java/app/sheepfold/android/router/SecureRouterConnectionManager.kt');
const setupScreen = read('android/app/src/main/java/app/sheepfold/android/ui/setup/SafeRouterSetupScreen.kt');
const endpointRecovery = read('android/app/src/main/java/app/sheepfold/android/router/RouterEndpointRecovery.kt');
const adminClient = read('android/app/src/main/java/app/sheepfold/android/router/RouterAdminClient.kt');
const connectionStore = read('android/app/src/main/java/app/sheepfold/android/router/SheepfoldConnectionStore.kt');
const childDiscovery = read('android-child/app/src/main/java/com/example/sheepfoldchild/data/ChildRouterDiscovery.kt');
const childViewModel = read('android-child/app/src/main/java/com/example/sheepfoldchild/viewmodel/ChildStatusViewModel.kt');
const childSetup = read('android-child/app/src/main/java/com/example/sheepfoldchild/ui/SetupScreen.kt');
const childStatusScreen = read('android-child/app/src/main/java/com/example/sheepfoldchild/ui/ChildStatusScreen.kt');
const childStrings = read('android-child/app/src/main/res/values/strings.xml');
const childStatusApi = read('package/luci-app-sheepfold-family-internet-control/root/usr/libexec/sheepfold/sheepfold-api-client-status');
const overview = read('package/luci-app-sheepfold-family-internet-control/htdocs/luci-static/resources/view/sheepfold/overview.js');
const androidBuild = read('android/app/build.gradle.kts');
const childBuild = read('android-child/app/build.gradle.kts');
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
    assert.match(discovery, /isSheepfoldApi\(URL\("\$\{apiUrl\.trimEnd\('\/'\)\}\/ping"\)\)/);
    assert.match(discovery, /httpsPort[\s\S]*appPort[\s\S]*toIntOrNull/);
  });

  it('keeps the live QR camera inside an actual square', () => {
    assert.match(setupScreen, /BoxWithConstraints\(Modifier\.fillMaxWidth\(\)\)/);
    assert.match(setupScreen, /val scannerSize = maxWidth/);
    assert.match(setupScreen, /\.size\(scannerSize\)/);
    assert.match(setupScreen, /PreviewView\.ImplementationMode\.COMPATIBLE/);
  });

  it('auto-discovers the child router for 30 seconds before showing manual input', () => {
    assert.match(childDiscovery, /activeGateway/);
    assert.match(childDiscovery, /TRANSPORT_WIFI/);
    assert.match(childDiscovery, /TRANSPORT_ETHERNET/);
    assert.match(childDiscovery, /\.well-known\/sheepfold\.json/);
    assert.match(childDiscovery, /\/ping/);
    assert.match(childViewModel, /30_000L/);
    assert.match(childViewModel, /ChildSetupState\.ManualEntry/);
    assert.match(childSetup, /if \(isSearching\)/);
    assert.match(childStrings, /Возможно, вы подключились не к той Wi-Fi-сети\?/);
  });

  it('turns QR and pairing failures into actionable messages', () => {
    assert.match(connection, /device_not_resolved/);
    assert.match(connection, /pairing_rejected/);
    assert.match(connection, /equals\("undefined", true\)/);
    assert.match(connection, /friendlyConnectionError/);
    assert.match(connection, /SF2\|/);
    assert.match(connection, /parseSpkiPin/);
    assert.match(connection, /connection\.readTimeout = 20000/);
    assert.match(connection, /"pairing_busy"/);
    assert.doesNotMatch(connection, /Проверьте порт приложения в LuCI/);
    assert.match(overview, /function pairingPayload[\s\S]*SF2\|h=[\s\S]*spki=/);
  });

  it('does not open the main screen until the issued token passes an authenticated router request §pairtx1', () => {
    const manager = read('android/app/src/main/java/app/sheepfold/android/router/SecureRouterConnectionManager.kt');
    const client = read('android/app/src/main/java/app/sheepfold/android/router/RouterAdminClient.kt');
    const api = read('package/luci-app-sheepfold-family-internet-control/root/www/cgi-bin/sheepfold-api');

    assert.match(client, /suspend fun verifyAdministratorAccess\(\)/);
    assert.match(client, /verifyAdministratorAccess\(\)[\s\S]*request\("GET", "\/router-info"\)/);
    assert.match(api, /\/router-info\|\/pair-status\)[\s\S]*require_admin/);
    assert.match(manager, /RouterAdminClient\(connected\)\.verifyAdministratorAccess\(\)/);
    assert.match(manager, /pair\.authorization\.succeeded/);
    assert.match(manager, /не подтвердил привязку телефона к администратору/);
    assert.ok(
      manager.indexOf('verifyAdministratorAccess()') < manager.indexOf('return connected'),
      'the connection must not be returned before administrator access is verified',
    );
  });

  it('uses clear child-facing refresh and access status labels', () => {
    assert.match(childStrings, /Обновить\\nданные/);
    assert.match(childStatusScreen, /stringResource\(R\.string\.btn_refresh\)[\s\S]*textAlign = TextAlign\.Center/);
    assert.match(childStatusApi, /Правила доступа для устройства не определены\./);
    assert.doesNotMatch(childStatusApi, /Для устройства ещё не выбраны правила доступа/);
  });

  it('recovers and stores a changed Sheepfold API port after pairing', () => {
    assert.match(endpointRecovery, /\.well-known\/sheepfold\.json/);
    assert.match(endpointRecovery, /tlsSpkiSha256 = tlsSpki/);
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
    assert.match(overview, /function applySheepfoldAccessRuntime[\s\S]*schedule-sync[\s\S]*site-lists-apply/);
    assert.match(overview, /function saveSheepfoldAccessChanges[\s\S]*applySheepfoldAccessRuntime/);
    assert.match(addModal, /persistDeviceListMembership/);
  });

  it('keeps current Android and OpenWrt release versions synchronized', () => {
    assert.match(androidBuild, /sheepfoldVersionCode = 47/);
    assert.match(androidBuild, /sheepfoldVersionName = "0\.1\.46"/);
    assert.match(childBuild, /sheepfoldChildVersionCode = 12/);
    assert.match(childBuild, /sheepfoldChildVersionName = "1\.11"/);
    const release = Number(makefile.match(/PKG_RELEASE:=(\d+)/)?.[1] || 0);
    assert.ok(release >= 235);
  });
});
