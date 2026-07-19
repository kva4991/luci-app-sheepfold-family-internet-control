import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(fileURLToPath(new URL('..', import.meta.url)));
const read = (path) => readFileSync(resolve(repoRoot, path), 'utf8');

const androidLog = read('android/app/src/main/java/app/sheepfold/android/diagnostics/DiagnosticLog.kt');
const connection = read('android/app/src/main/java/app/sheepfold/android/router/SecureRouterConnectionManager.kt');
const discovery = read('android/app/src/main/java/app/sheepfold/android/router/LocalRouterDiscovery.kt');
const manifest = read('android/app/src/main/AndroidManifest.xml');
const pairDiagnostics = read('package/luci-app-sheepfold-family-internet-control/root/usr/libexec/sheepfold/sheepfold-pair-diagnostics');
const apiPair = read('package/luci-app-sheepfold-family-internet-control/root/usr/libexec/sheepfold/sheepfold-api-pair');
const pairDevice = read('package/luci-app-sheepfold-family-internet-control/root/usr/libexec/sheepfold/sheepfold-pair-device');

test('debug parent APK writes bounded redacted diagnostics to Downloads', () => {
  assert.match(androidLog, /ApplicationInfo\.FLAG_DEBUGGABLE/);
  assert.match(androidLog, /MediaStore\.Downloads\.EXTERNAL_CONTENT_URI/);
  assert.match(androidLog, /Environment\.DIRECTORY_DOWNLOADS/);
  assert.match(androidLog, /maxBytes = 2L \* 1024L \* 1024L/);
  assert.match(androidLog, /\[qr-redacted\]/);
  assert.match(androidLog, /\[secret\]/);
  assert.match(androidLog, /\[mac\]/);
  assert.match(manifest, /WRITE_EXTERNAL_STORAGE[^>]+maxSdkVersion="28"/);
  assert.match(connection, /pair\.http\.sending/);
  assert.match(connection, /pair\.http\.response/);
  assert.match(discovery, /discovery\.document\.failed/);
  assert.doesNotMatch(connection, /DiagnosticLog\.(?:info|warn|error)\([^\n]+temporaryPassword/);
});

test('router pairing diagnostics are opt-in, bounded, and redact secrets', () => {
  assert.match(pairDiagnostics, /sheepfold\.global\.pairing_diagnostics/);
  assert.match(pairDiagnostics, /pairing-diagnostic\.log/);
  assert.match(pairDiagnostics, /PAIR_DIAGNOSTIC_MAX_BYTES/);
  assert.match(pairDiagnostics, /\[qr-redacted\]/);
  assert.match(pairDiagnostics, /\[secret\]/);
  assert.match(pairDiagnostics, /\[mac\]/);
  assert.match(apiPair, /pair_diag_event api_received/);
  assert.match(apiPair, /pair_diag_event backend_started/);
  assert.match(apiPair, /pair_diag_event backend_finished/);
  assert.match(pairDevice, /PAIR_DIAG_STAGE="commit_uci"/);
  assert.match(pairDevice, /PAIR_DIAG_STAGE="write_response"/);
  assert.doesNotMatch(apiPair, /pair_diag_event[^\n]*\$code/);
  assert.doesNotMatch(pairDevice, /pair_diag_event[^\n]*\$code/);
});
