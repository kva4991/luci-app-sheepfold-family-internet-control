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

test('parent-router stand updates only project debug APKs', () => {
  assert.match(runner, /install', '-r', '-t'/);
  assert.doesNotMatch(runner, /Arguments\s+@\([^\n]*['"]uninstall['"]|Arguments\s+@\([^\n]*['"]pm['"],\s*['"]clear['"]|factory reset|Arguments\s+@\([^\n]*['"]emu['"],\s*['"]kill['"]/i);
  assert.match(runner, /app\.sheepfold\.android/);
  assert.match(runner, /app\.sheepfold\.android\.test/);
});

test('parent-router stand verifies phone reachability and Sheepfold discovery', () => {
  assert.match(runner, /shell', 'ping'/);
  assert.match(runner, /shell', 'ip', 'route'/);
  assert.match(runner, /\.well-known\/sheepfold\.json/);
  assert.match(runner, /service -ne 'sheepfold'/);
  assert.match(runner, /apiPing\.service.*sheepfold|apiPing\.app.*sheepfold/);
  assert.match(runner, /am', 'instrument'/);
  assert.match(runner, /SupportReportCryptoTest,app\.sheepfold\.android\.relay\.MessageRelayAndroidTest/);
  assert.match(runner, /MainActivity/);
});

test('stand documentation states destructive operations are forbidden', () => {
  assert.match(runner, /не удаляет приложения или данные/i);
  assert.match(readme, /не вызывает `uninstall`/i);
  assert.match(readme, /одноразовым кодом/i);
});
