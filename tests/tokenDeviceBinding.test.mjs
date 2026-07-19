import { spawnSync } from 'node:child_process';
import {
  chmodSync,
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const packageDir = resolve(repoRoot, 'package/luci-app-sheepfold-family-internet-control');

function readProjectFile(path) {
  return readFileSync(resolve(packageDir, path), 'utf8');
}

function shellPath(path) {
  const normalized = path.replaceAll('\\', '/');
  return process.platform === 'win32'
    ? normalized.replace(/^([A-Za-z]):/, (_, drive) => `/${drive.toLowerCase()}`)
    : normalized;
}

function runPairingCleanupFault({ restoreSnapshot }) {
  const fixtureRoot = mkdtempSync(join(tmpdir(), 'sheepfold-pair-transaction-'));
  const transactionDir = join(fixtureRoot, 'transaction');
  const tokenDir = join(fixtureRoot, 'tokens');
  const lockDir = join(fixtureRoot, 'admin.lock');
  const configFile = join(fixtureRoot, 'sheepfold');
  const snapshotFile = join(transactionDir, 'sheepfold.before');
  const tokenFile = join(tokenDir, 'tokenhash');
  const testScript = join(fixtureRoot, 'fault.sh');
  const pairDevice = readProjectFile('root/usr/libexec/sheepfold/sheepfold-pair-device');
  let rollbackHelpers = pairDevice.slice(
    pairDevice.indexOf('pair_restore_snapshot() {'),
    pairDevice.indexOf('\npair_begin_transaction() {'),
  );

  mkdirSync(transactionDir, { recursive: true });
  mkdirSync(tokenDir, { recursive: true });
  mkdirSync(lockDir, { recursive: true });
  writeFileSync(configFile, 'partially-written-config\n', 'utf8');
  writeFileSync(snapshotFile, 'original-config\n', 'utf8');
  writeFileSync(tokenFile, 'temporary-token\n', 'utf8');

  rollbackHelpers = rollbackHelpers
    .replaceAll('/etc/config/.sheepfold.pairing-restore.$$', `${shellPath(fixtureRoot)}/.sheepfold.pairing-restore.$$`)
    .replaceAll('/etc/config/sheepfold', shellPath(configFile));

  writeFileSync(testScript, `#!/bin/sh
set -eu
PAIR_TRANSACTION_DIR='${shellPath(transactionDir)}'
PAIR_CONFIG_SNAPSHOT='${shellPath(snapshotFile)}'
PAIR_TOKEN_DIR='${shellPath(tokenDir)}'
PAIR_TOKEN_HASH='tokenhash'
PAIR_LOCK='${shellPath(lockDir)}'
PAIR_TRANSACTION_ACTIVE=1
PAIR_RESTORE_SNAPSHOT=${restoreSnapshot ? 1 : 0}
${rollbackHelpers}
pair_transaction_cleanup 6
`, 'utf8');
  chmodSync(testScript, 0o755);

  const result = spawnSync('sh', [shellPath(testScript)], { encoding: 'utf8' });
  const state = {
    result,
    config: readFileSync(configFile, 'utf8'),
    tokenExists: existsSync(tokenFile),
    transactionExists: existsSync(transactionDir),
    lockExists: existsSync(lockDir),
  };

  rmSync(fixtureRoot, { recursive: true, force: true });
  return state;
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

  it('generates the pairing token without optional od from full OpenWrt images §pairrng1', () => {
    const pairCommon = readProjectFile('root/usr/libexec/sheepfold/sheepfold-pair-common');
    const randomHelper = pairCommon.slice(
      pairCommon.indexOf('pair_random_hex()'),
      pairCommon.indexOf('\npair_prepare_token()', pairCommon.indexOf('pair_random_hex()')),
    );

    assert.match(randomHelper, /\/dev\/urandom/);
    assert.match(randomHelper, /sha256sum/);
    assert.match(randomHelper, /openssl dgst -sha256/);
    assert.doesNotMatch(randomHelper, /(?:\|\s*od\b|\bod\s+-)/);
    assert.match(pairCommon, /token="\$\(pair_random_hex 40\)"/);
  });

  it('logs a safe reason when the router rejects administrator pairing §pairrng1', () => {
    const pairApi = readProjectFile('root/usr/libexec/sheepfold/sheepfold-api-pair');
    const failureLogger = pairApi.slice(
      pairApi.indexOf('log_pairing_failure()'),
      pairApi.indexOf('\n}\n', pairApi.indexOf('log_pairing_failure()')) + 3,
    );

    assert.match(pairApi, /log_pairing_failure "\$error_code"/);
    assert.match(failureLogger, /token_generation_failed/);
    assert.match(pairApi, /PAIR_LOG_HELPER="\/usr\/libexec\/sheepfold\/sheepfold-log"/);
    assert.match(failureLogger, /"\$PAIR_LOG_HELPER"/);
    assert.doesNotMatch(failureLogger, /\$code|pairing_code|PAIR_TOKEN/);
  });

  it('commits token binding and administrator rights as one isolated transaction §pairtx1', () => {
    const pairDevice = readProjectFile('root/usr/libexec/sheepfold/sheepfold-pair-device');
    const deviceId = readProjectFile('root/usr/libexec/sheepfold/sheepfold-device-id');
    const transactionStart = pairDevice.indexOf('pair_begin_transaction ||');
    const isolatedUci = pairDevice.indexOf('command uci -P "$PAIR_UCI_SAVEDIR"');
    const stagedId = pairDevice.indexOf('ensure-staged "$device_section"');
    const tokenStore = pairDevice.indexOf('if ! pair_store_token; then');
    const adminGrant = pairDevice.indexOf('admin_device=1');
    const codeConsume = pairDevice.indexOf('pairing_code" 2>/dev/null', adminGrant);
    const finalCommit = pairDevice.indexOf('if ! uci -q commit sheepfold; then', adminGrant);

    assert.ok(transactionStart >= 0, 'pairing must create an isolated transaction');
    assert.ok(isolatedUci > transactionStart, 'pairing writes must use the isolated UCI savedir');
    assert.ok(stagedId > isolatedUci, 'device ID must be staged without an early commit');
    assert.ok(tokenStore >= 0, 'pairing must persist a bound token');
    assert.ok(adminGrant > tokenStore, 'administrator rights must be staged only after token storage');
    assert.ok(codeConsume > adminGrant, 'the one-time code must be consumed with the rights grant');
    assert.ok(finalCommit > codeConsume, 'rights and code consumption must share the final UCI commit');
    assert.match(pairDevice, /PAIR_TRANSACTION_ACTIVE/);
    assert.match(pairDevice, /rm -f "\$PAIR_TOKEN_DIR\/\$PAIR_TOKEN_HASH"/);
    assert.match(pairDevice, /PAIR_RESTORE_SNAPSHOT/);
    assert.match(pairDevice, /pair_restore_snapshot/);
    assert.match(deviceId, /ensure-staged/);
    assert.match(deviceId, /SHEEPFOLD_UCI_SAVEDIR/);
    assert.doesNotMatch(
      pairDevice.slice(transactionStart, finalCommit),
      /sheepfold-device-id ensure "/,
      'pairing must not call the early-commit device ID command',
    );
  });

  it('pairTokenStoreFailureRollback removes token and isolated UCI delta §pairtx1', () => {
    const state = runPairingCleanupFault({ restoreSnapshot: false });

    assert.equal(state.result.status, 6, state.result.stderr);
    assert.equal(state.config, 'partially-written-config\n');
    assert.equal(state.tokenExists, false);
    assert.equal(state.transactionExists, false);
    assert.equal(state.lockExists, false);
  });

  it('pairCommitFailureSnapshotRestore restores config and revokes token §pairtx1', () => {
    const state = runPairingCleanupFault({ restoreSnapshot: true });

    assert.equal(state.result.status, 6, state.result.stderr);
    assert.equal(state.config, 'original-config\n');
    assert.equal(state.tokenExists, false);
    assert.equal(state.transactionExists, false);
    assert.equal(state.lockExists, false);
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
