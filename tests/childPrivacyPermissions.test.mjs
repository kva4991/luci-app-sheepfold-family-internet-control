/*
 * Protects the child-app privacy and just-in-time permission contract. This is a
 * static cross-layer test: it verifies the router projection, Kotlin model and
 * UI policy, but does not click a real Android permission dialog or prove a
 * physical phone's OEM behavior. §b5wkq2e §simchg1 §childwifi1 §testwhy
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

const read = (path) => readFileSync(path, 'utf8');
const statusApi = read('package/luci-app-sheepfold-family-internet-control/root/usr/libexec/sheepfold/sheepfold-api-client-status');
const model = read('android-child/app/src/main/java/com/example/sheepfoldchild/data/ClientStatusResponse.kt');
const productStatus = read('android-child/app/src/main/java/com/example/sheepfoldchild/data/ProductStatus.kt');
const repository = read('android-child/app/src/main/java/com/example/sheepfoldchild/data/ClientStatusRepository.kt');
const aiRepository = read('android-child/app/src/main/java/com/example/sheepfoldchild/data/AiRepository.kt');
const mainActivity = read('android-child/app/src/main/java/com/example/sheepfoldchild/MainActivity.kt');
const permissionPolicy = read('android-child/app/src/main/java/com/example/sheepfoldchild/permissions/ChildPermissionPolicy.kt');
const permissionBanner = read('android-child/app/src/main/java/com/example/sheepfoldchild/ui/ChildPermissionBanner.kt');
const wifiCollector = read('android-child/app/src/main/java/com/example/sheepfoldchild/data/WifiNetworkSnapshotCollector.kt');
const accessScreen = read('android-child/app/src/main/java/com/example/sheepfoldchild/ui/AccessInfoScreen.kt');
const statusScreen = read('android-child/app/src/main/java/com/example/sheepfoldchild/ui/ChildStatusScreen.kt');
const viewModel = read('android-child/app/src/main/java/com/example/sheepfoldchild/viewmodel/ChildStatusViewModel.kt');
const build = read('android-child/app/build.gradle.kts');

function outputSection(source) {
  const start = source.indexOf('header_json "200 OK"');
  assert.ok(start >= 0, 'child status output section must exist');
  return source.slice(start);
}

describe('Child API privacy and permission policy', () => {
  it('publishes API v3 without rule names, access mode, schedule conflicts or personal-group names', () => {
    const output = outputSection(statusApi);
    assert.match(output, /"apiVersion":"3"/);
    assert.doesNotMatch(output, /"accessMode"|"scheduleConflict"|"personalGroupName"/);
    assert.match(output, /"internetState"/);
    assert.match(output, /"nextAccessChangeTime"/);
    assert.match(output, /if \[ "\$internet_state" = enabled \][\s\S]*"message":null/);
    assert.match(statusApi, /Роутер пока не определил текущий доступ для этого устройства\./);
    assert.doesNotMatch(model, /\baccessMode\b|\bscheduleConflict\b/);
    assert.doesNotMatch(productStatus, /personalGroupName/);
    assert.doesNotMatch(accessScreen, /status\.accessMode|access_mode_label/);
  });

  it('keeps child AI context on the same minimized public fields', () => {
    const context = aiRepository.slice(aiRepository.indexOf('private fun buildClientContext'));
    assert.match(context, /status\.internetState/);
    assert.match(context, /status\.nextAccessChangeTime/);
    assert.doesNotMatch(context, /accessMode|scheduleConflict|personalGroupName/);
    assert.match(context, /status\.internetState != "enabled"/);
  });

  it('requests sensitive permissions only after a router-supplied feature policy', () => {
    assert.doesNotMatch(mainActivity, /LaunchedEffect\(Unit\)[\s\S]*RequestMultiplePermissions/);
    assert.match(mainActivity, /ChildPermissionBanner\([\s\S]*status = viewModel\.latestStatus/);
    assert.match(permissionPolicy, /if \(status == null\) return emptyList\(\)/);
    assert.match(permissionPolicy, /status\.simChangeReporting/);
    assert.match(permissionPolicy, /status\.wifiNetworkReporting/);
    assert.match(permissionPolicy, /status\.wifiLocationReporting/);
    assert.match(permissionPolicy, /READ_PHONE_STATE/);
    assert.match(permissionPolicy, /READ_PHONE_NUMBERS/);
    assert.match(permissionPolicy, /NEARBY_WIFI_DEVICES/);
    assert.match(permissionPolicy, /ACCESS_FINE_LOCATION/);
    assert.match(permissionBanner, /launcher\.launch\(request\.permissions\.toTypedArray\(\)\)/);
    assert.match(permissionBanner, /permission_later/);
    assert.match(wifiCollector, /SDK_INT >= Build\.VERSION_CODES\.TIRAMISU[\s\S]*NEARBY_WIFI_DEVICES/);
    assert.match(wifiCollector, /includeLocation && !hasPermission\(context, Manifest\.permission\.ACCESS_FINE_LOCATION\)/);
    assert.match(wifiCollector, /else if \(!hasPermission\(context, Manifest\.permission\.ACCESS_FINE_LOCATION\)\)/);
    assert.match(repository, /if \(data\?\.simChangeReporting == true\)[\s\S]*reportSimSnapshot/);
    assert.doesNotMatch(repository, /runCatching \{ reportSimSnapshot\(baseUrl\) \}\s*\n\s*val wifiEnabled/);
    assert.match(repository, /val result = fetchFrom\(candidate\)[\s\S]*if \(result\.isSuccess\) saveSelectedBaseUrl\(candidate\)/);
    assert.doesNotMatch(repository, /onSuccess \{ saveSelectedBaseUrl\(candidate\) \}/);
  });

  it('distinguishes an unavailable router from disabled internet and clears stale current status', () => {
    assert.match(viewModel, /data class RouterUnavailable/);
    assert.match(viewModel, /latestStatus = null[\s\S]*ChildUiState\.RouterUnavailable/);
    assert.match(viewModel, /ConnectException|NoRouteToHostException|SocketTimeoutException/);
    assert.match(statusScreen, /ChildUiState\.RouterUnavailable/);
    assert.match(statusScreen, /router_unavailable_title/);
    assert.match(viewModel, /R\.string\.router_unavailable_body/);
    assert.match(statusScreen, /RouterUnavailableCard\([\s\S]*message = state\.message/);
  });

  it('targets Android 9+ and fails child release signing closed without external secrets', () => {
    assert.match(build, /minSdk = 28/);
    assert.match(build, /SHEEPFOLD_CHILD_ANDROID_KEYSTORE/);
    assert.match(build, /SHEEPFOLD_CHILD_ANDROID_KEY_ALIAS/);
    assert.match(build, /SHEEPFOLD_CHILD_ANDROID_STORE_PASSWORD/);
    assert.match(build, /SHEEPFOLD_CHILD_ANDROID_KEY_PASSWORD/);
    assert.match(build, /verifyChildReleaseSigning/);
    assert.match(build, /assembleRelease/);
  });
});
