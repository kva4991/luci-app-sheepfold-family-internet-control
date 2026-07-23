/*
 * Protects the parent Android app's local-authentication and widget-command boundary.
 * This is a static contract test: it verifies the intended lifecycle, backoff, signing,
 * and PendingIntent wiring, but does not replace Android instrumentation or a physical phone.
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (path) => readFileSync(resolve(root, path), 'utf8');

const protection = read('android/app/src/main/java/app/sheepfold/android/security/AppProtectionStore.kt');
const unlock = read('android/app/src/main/java/app/sheepfold/android/ui/security/AppUnlockScreen.kt');
const main = read('android/app/src/main/java/app/sheepfold/android/MainActivity.kt');
const setup = read('android/app/src/main/java/app/sheepfold/android/ui/setup/SafeRouterSetupScreen.kt');
const operations = read('android/app/src/main/java/app/sheepfold/android/ui/main/OperationalMainScreen.kt');
const widgets = read('android/app/src/main/java/app/sheepfold/android/widget/InternetWidgets.kt');
const manifest = read('android/app/src/main/AndroidManifest.xml');
const build = read('android/app/build.gradle.kts');
const gitignore = read('.gitignore');

function between(source, start, end) {
  const from = source.indexOf(start);
  const to = source.indexOf(end, from + start.length);
  assert.ok(from >= 0 && to > from, `missing block ${start}`);
  return source.slice(from, to);
}

describe('parent Android local protection', () => {
  it('uses one honest biometric mode while migrating old Face/Fingerprint choices', () => {
    assert.match(protection, /PASSWORD,[\s\S]*PIN,[\s\S]*BIOMETRIC,[\s\S]*NONE/);
    assert.match(protection, /"FACE", "FINGERPRINT" -> AppProtectionMode\.BIOMETRIC/);
    assert.match(setup, /AppProtectionMode\.BIOMETRIC/);
    assert.doesNotMatch(setup, /AppProtectionMode\.(?:FACE|FINGERPRINT)/);
    assert.match(unlock, /mode == AppProtectionMode\.BIOMETRIC/);
  });

  it('locks after a configurable background delay and ignores configuration recreation', () => {
    assert.match(protection, /DEFAULT_RELOCK_DELAY_SECONDS = 60/);
    assert.match(protection, /listOf\(0, 60, 300, 900\)/);
    assert.match(main, /override fun onStop\(\)[\s\S]*!isChangingConfigurations/);
    assert.match(main, /SystemClock\.elapsedRealtime\(\)/);
    assert.match(main, /elapsed >= delayMillis/);
    assert.match(operations, /settings_relock_immediate/);
    assert.match(operations, /settings_lock_now/);
  });

  it('adds escalating secret backoff after five failures without permanent lockout', () => {
    assert.match(protection, /FIRST_BACKOFF_FAILURE = 5/);
    assert.match(protection, /FIRST_BACKOFF_SECONDS = 30L/);
    assert.match(protection, /MAX_BACKOFF_SECONDS = 300L/);
    assert.match(protection, /failures - FIRST_BACKOFF_FAILURE/);
    assert.match(protection, /now < started/);
    assert.match(unlock, /unlock_retry_after_seconds/);
    assert.match(unlock, /remainingBackoffSeconds/);
  });

  it('requires protected in-app confirmation before disabling internet from widgets by default', () => {
    const receiver = between(widgets, 'class SheepfoldWidgetActionReceiver', 'object SheepfoldWidgetRenderer');
    assert.match(protection, /ALLOW_INSTANT_WIDGET_DISABLE/);
    assert.match(protection, /getBoolean\(ALLOW_INSTANT_WIDGET_DISABLE, false\)/);
    assert.match(widgets, /PendingIntent\.getActivity/);
    assert.match(widgets, /ACTION_CONFIRM_INTERNET_DISABLE/);
    assert.match(receiver, /blocked && !AppProtectionStore\.allowInstantWidgetDisable/);
    assert.match(main, /pendingWidgetCommand == WidgetCommand\.DISABLE_INTERNET/);
    assert.match(main, /forceLockToken \+= 1/);
    assert.match(main, /widget_disable_confirmation_title/);
    assert.match(operations, /settings_widget_disable_warning_body/);
    assert.match(manifest, /android:launchMode="singleTop"/);
  });

  it('keeps enabling internet as the quick recovery action', () => {
    assert.match(widgets, /widgetEnableButton, directActionIntent\(context, false/);
    assert.match(widgets, /if \(blockedButton\) disablePendingIntent[\s\S]*else directActionIntent\(context, false/);
  });

  it('requires external release-signing secrets and ignores local keystores', () => {
    for (const variable of [
      'SHEEPFOLD_ANDROID_KEYSTORE',
      'SHEEPFOLD_ANDROID_KEY_ALIAS',
      'SHEEPFOLD_ANDROID_STORE_PASSWORD',
      'SHEEPFOLD_ANDROID_KEY_PASSWORD',
    ]) assert.match(build, new RegExp(variable));
    assert.match(build, /verifyReleaseSigning/);
    assert.match(build, /assembleRelease/);
    assert.match(build, /bundleRelease/);
    assert.match(gitignore, /\*\.jks/);
    assert.match(gitignore, /\*\.keystore/);
    assert.doesNotMatch(build, /storePassword\s*=\s*"[^"]+"/);
  });
});
