/*
 * Статически защищает ручной Android-стенд: явный запуск, ограниченные имена AVD,
 * обязательное подтверждение очистки физического телефона и наличие smoke-тестов
 * обоих APK. Сам тест не запускает SDK, эмулятор, телефон или роутер и поэтому не
 * доказывает Android lifecycle, аппаратные функции и живое сопряжение.
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (path) => readFileSync(resolve(repoRoot, path), 'utf8');
const packageJson = JSON.parse(read('package.json'));

describe('manual Android test lab §andlab1', () => {
  it('publishes explicit camelCase commands outside the ordinary test suite', () => {
    assert.match(packageJson.scripts['androidLab:setup'], /setupAndroidTestLab\.ps1/);
    assert.match(packageJson.scripts['androidLab:doctor'], /-Profile doctor/);
    assert.match(packageJson.scripts['androidLab:smoke'], /-Profile emulatorSmoke/);
    assert.match(packageJson.scripts['androidLab:full'], /-Profile emulatorFull/);
    assert.match(packageJson.scripts['androidLab:physical'], /-Profile physicalSmoke/);
    assert.doesNotMatch(packageJson.scripts.test, /androidLab/);
  });

  it('uses only dedicated API 28 and API 35 AVDs and makes downloads explicit', () => {
    const common = read('tools/android-testing/androidLabCommon.ps1');
    const setup = read('tools/android-testing/setupAndroidTestLab.ps1');

    assert.match(common, /28\s*=\s*'SheepfoldLabApi28'/);
    assert.match(common, /35\s*=\s*'SheepfoldLabApi35'/);
    assert.match(common, /system-images;android-\$ApiLevel;default;x86_64/);
    assert.match(setup, /\[switch\]\$Install/);
    assert.match(setup, /\[switch\]\$AcceptAndroidLicenses/);
    assert.match(setup, /if \(\$Install\)/);
    assert.match(setup, /-RecreateAvds/);
    assert.match(setup, /\$RecreateAvds -and -not \$Install/);
    assert.match(setup, /AVD не удаляются/);
  });

  it('requires an exact physical serial and explicit consent before app data reset', () => {
    const runner = read('tools/android-testing/runAndroidTestLab.ps1');

    assert.match(runner, /\[switch\]\$ConfirmResetTestApps/);
    assert.match(runner, /если \(-not \$ConfirmResetTestApps\)|if \(-not \$ConfirmResetTestApps\)/i);
    assert.match(runner, /-DeviceSerial/);
    assert.ok(runner.includes("'^[A-Za-z0-9._:-]+$'"));
    assert.match(runner, /adb devices -l/);
    assert.match(runner, /выделенный тестовый телефон/);
    assert.match(runner, /'uninstall', \$AppSpec\.ApplicationId/);
    assert.doesNotMatch(runner, /adb\s+(?:reboot|root)|fastboot|factory-reset|wipe userdata/i);
    assert.doesNotMatch(runner, /router:|wifi\s+(?:down|off)|wps-button/i);
  });

  it('runs emulators sequentially and keeps diagnostics outside source files', () => {
    const common = read('tools/android-testing/androidLabCommon.ps1');
    const runner = read('tools/android-testing/runAndroidTestLab.ps1');

    assert.match(runner, /emulatorSmoke/);
    assert.match(runner, /emulatorFull/);
    assert.match(runner, /foreach \(\$apiLevel in \$apiLevels\)/);
    assert.match(runner, /finally[\s\S]*Stop-AndroidLabEmulator/);
    assert.match(runner, /app\.sheepfold\.android\/\.MainActivity/);
    assert.match(runner, /app\.sheepfold\.child\/com\.example\.sheepfoldchild\.MainActivity/);
    assert.match(runner, /'am', 'start', '-W', '-n', \$AppSpec\.LaunchComponent/);
    assert.doesNotMatch(runner, /shell', 'monkey'/);
    assert.match(runner, /INSTRUMENTATION_CODE: -1/);
    assert.ok(runner.includes('OK \\([1-9][0-9]* tests?\\)'));
    assert.ok(runner.includes('tests?\\)\\r?$'));
    assert.match(runner, /FAILURES!!!\|INSTRUMENTATION_FAILED/);
    assert.match(common, /SHEEPFOLD_SCRIPT_SCRATCH_ROOT/);
    assert.match(common, /previousErrorAction/);
    assert.match(common, /код[а-яё ]+процесс|коду процесса/i);
    assert.match(common, /TrimEnd\(\[char\[\]\]@\(\[char\]13\)\)/);
    assert.match(common, /function Invoke-AndroidLabCommandWithRetry/);
    assert.match(common, /\[int\]\$MaxAttempts = 5/);
    assert.match(common, /Documents?['"]?\)\)?,?\s*'pesochnica'|MyDocuments[\s\S]*pesochnica/);
    assert.match(common, /logcat/);
    assert.match(common, /screencap/);
    assert.match(common, /uiautomator/);
  });

  it('configures AndroidJUnitRunner and a first-launch test for both APKs', () => {
    const parentBuild = read('android/app/build.gradle.kts');
    const childBuild = read('android-child/app/build.gradle.kts');
    const childCatalog = read('android-child/gradle/libs.versions.toml');
    const parentTest = read('android/app/src/androidTest/java/app/sheepfold/android/parentFirstLaunchSmokeTest.kt');
    const childTest = read('android-child/app/src/androidTest/java/com/example/sheepfoldchild/childFirstLaunchSmokeTest.kt');

    for (const buildFile of [parentBuild, childBuild]) {
      assert.match(buildFile, /testInstrumentationRunner\s*=\s*"androidx\.test\.runner\.AndroidJUnitRunner"/);
    }
    assert.match(parentBuild, /ui-test-junit4/);
    assert.match(parentBuild, /ui-test-manifest/);
    assert.match(childBuild, /libs\.androidx\.ui\.test\.junit4/);
    assert.match(childBuild, /libs\.androidx\.ui\.test\.manifest/);
    assert.match(childCatalog, /androidx\.compose\.ui:ui-test-junit4/);
    assert.match(childCatalog, /androidx\.compose\.ui:ui-test-manifest/);
    assert.match(parentTest, /cleanInstallRequiresAgreement/);
    assert.match(childTest, /cleanInstallStartsAutomaticDiscovery/);
  });

  it('documents the manual policy and emulator hardware limits', () => {
    const docs = read('docs/android-test-lab.ru.md');

    assert.match(docs, /только по явной команде/i);
    assert.match(docs, /10\.0\.2\.2/);
    assert.match(docs, /случайн(?:ый|ого).*MAC|private MAC|приватн/i);
    assert.match(docs, /SIM/);
    assert.match(docs, /камера/i);
    assert.match(docs, /физическ(?:ий|ом) телефон/i);
  });
});
