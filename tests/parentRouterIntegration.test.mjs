// Проверяет, что отдельный физический стенд остаётся безопасным: он обновляет только
// debug APK Sheepfold, не очищает телефон и действительно проверяет связь с роутером.
// Успех статического теста не доказывает работу USB, Wi-Fi, Android runtime или QR.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

const standRoot = join(process.cwd(), 'tools', 'android-testing', 'parent-router-integration');
const runner = readFileSync(join(standRoot, 'runParentRouterIntegration.ps1'), 'utf8');
const readme = readFileSync(join(standRoot, 'README.ru.md'), 'utf8');
const phoneTest = readFileSync(join(process.cwd(), 'android/app/src/androidTest/java/app/sheepfold/android/router/ParentRouterIntegrationTest.kt'), 'utf8');

test('parent-router stand updates only project debug APKs', () => {
  assert.match(runner, /install', '-r', '-t'/);
  assert.doesNotMatch(runner, /Arguments\s+@\([^\n]*['"]uninstall['"]|Arguments\s+@\([^\n]*['"]pm['"],\s*['"]clear['"]|factory reset|Arguments\s+@\([^\n]*['"]emu['"],\s*['"]kill['"]/i);
  assert.match(runner, /app\.sheepfold\.android/);
  assert.match(runner, /app\.sheepfold\.android\.test/);
});

test('parent-router stand verifies phone reachability and Sheepfold discovery', () => {
  assert.match(runner, /shell', 'ping'/);
  assert.match(runner, /shell', 'ip', 'route'/);
  assert.doesNotMatch(runner, /curl\.exe|Invoke-WebRequest|Get-RouterHttpStatus/);
  assert.match(phoneTest, /LocalRouterDiscovery\.discover\(context\)/);
  assert.match(phoneTest, /assertEquals\(routerIp, URL\(discovery\.apiUrl\)\.host\)/);
  for (const path of ['/client-status', '/router-info', '/api/v1/admin-config', '/devices', '/notifications', '/access-requests']) {
    assert.ok(phoneTest.includes(`"${path}"`));
  }
  assert.match(phoneTest, /401, request\(path\)\.first/);
  assert.match(phoneTest, /checkNoSecrets\(json\)/);
  assert.match(phoneTest, /assertThrows\(SSLException::class\.java\)/);
  assert.match(phoneTest, /200, request\(path, connection\)\.first/);
  assert.match(phoneTest, /requirePairing/);
  assert.match(phoneTest, /GET \$path timed out after/);
  assert.match(runner, /am', 'instrument'/);
  assert.match(runner, /SupportReportCryptoTest,app\.sheepfold\.android\.relay\.MessageRelayAndroidTest/);
  assert.match(runner, /ParentRouterIntegrationTest'/);
  assert.match(runner, /MainActivity/);
});

test('stand bounds adb commands and reports assumption skips', () => {
  assert.match(runner, /ReadToEndAsync\(\)/);
  assert.match(runner, /WaitForExit\(\$TimeoutSeconds \* 1000\)/);
  assert.match(runner, /\$process\.Kill\(\)/);
  assert.doesNotMatch(runner, /'kill-server'|'am', 'start', '-W'/);
  assert.match(runner, /INSTRUMENTATION_STATUS_CODE: -\(3\|4\)/);
  assert.match(runner, /\$RequirePairing -and \$skipped -gt 0/);
  assert.match(runner, /--pid=\$pidText/);
});

test('stand documentation states destructive operations are forbidden', () => {
  assert.match(runner, /не удаляет приложения или данные/i);
  assert.match(readme, /не вызывает `uninstall`/i);
  assert.match(readme, /одноразовым кодом/i);
});

test('paired management reads exercise the production panel loader without mutations', () => {
  const panelTest = phoneTest.split('fun pairedPanelsUseProductionClient()')[1].split('private fun request(')[0];
  assert.match(panelTest, /RouterPanelLoader\(RouterAdminClient\(connection\)\)/);
  for (const panel of ['control', 'devices', 'groups', 'schedules', 'administrators', 'wifi', 'notifications', 'logs', 'info']) {
    assert.ok(panelTest.includes(`"${panel}"`));
  }
  assert.match(panelTest, /requirePairing/);
  assert.match(panelTest, /after\?\.bearerToken == connection\.bearerToken/);
  assert.doesNotMatch(panelTest, /saveGroup|saveSchedule|clearLog|setWifiEnabled|setGlobalBlocked|grantTemporaryAccess/);
});
