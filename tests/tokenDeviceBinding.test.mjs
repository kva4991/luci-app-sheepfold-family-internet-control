/*
 * Проверяет, что администраторский Bearer связан не только с постоянным ID и
 * сохранённым MAC, но и с MAC, который сам роутер наблюдает у REMOTE_ADDR.
 * Fault-injection защищает атомарность pairing, а UCI stub проверяет отсутствие
 * лишних ID-commit при авторизации; временные файлы удаляются, роутер не меняется
 * Тест не заменяет проверку ARP/DHCP и задержки на живом роутере и телефоне
 */
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
import { shellTestPath } from '../tools/quality/testEnvironment.mjs';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const packageDir = resolve(repoRoot, 'package/luci-app-sheepfold-family-internet-control');

function readProjectFile(path) {
  return readFileSync(resolve(packageDir, path), 'utf8');
}

function shellPath(path) {
  return shellTestPath(path, { cwd: repoRoot });
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
PAIR_TOKEN_STORED=1
PAIR_RESTORE_SNAPSHOT=${restoreSnapshot ? 1 : 0}
${rollbackHelpers}
pair_transaction_cleanup 6
`, 'utf8');
  chmodSync(testScript, 0o755);

  const result = spawnSync('sh', [shellPath(testScript)], { cwd: repoRoot, encoding: 'utf8' });
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

function runServerBoundAuthentication({ sourceMatches = true, adminPaired = true } = {}) {
  const fixtureRoot = mkdtempSync(join(tmpdir(), 'sheepfold-bound-auth-'));
  const tokenDir = join(fixtureRoot, 'tokens');
  const tokenFile = join(tokenDir, 'knownhash');
  const testScript = join(fixtureRoot, 'authenticate.sh');
  const control = readProjectFile('root/usr/libexec/sheepfold/sheepfold-router-control');
  const authenticateFunction = control.slice(
    control.indexOf('authenticate_token() {'),
    control.indexOf('\n}\n', control.indexOf('authenticate_token() {')) + 3,
  );

  mkdirSync(tokenDir, { recursive: true });
  writeFileSync(tokenFile, [
    'login=SuperParent',
    'device_id=8',
    'mac=F2:D2:99:48:B2:D6',
    'issued_at=100',
    'expires_at=0',
    '',
  ].join('\n'), 'utf8');
  writeFileSync(testScript, `#!/bin/sh
set -eu
TOKEN_STATE_DIR='${shellPath(tokenDir)}'
uci() {
  case "$*" in
    '-q show sheepfold') printf 'sheepfold.admin=administrator\\n' ;;
    '-q get sheepfold.admin.login') printf 'SuperParent\\n' ;;
    *) return 1 ;;
  esac
}
sha256_value() { printf 'knownhash\\n'; }
${readProjectFile('root/usr/libexec/sheepfold/sheepfold-token-common')}
token_device_is_admin_paired() {
  [ '${adminPaired ? 1 : 0}' = 1 ] && [ "$1" = 8 ] && [ "$2" = 'F2:D2:99:48:B2:D6' ]
}
token_request_source_matches() {
  [ '${sourceMatches ? 1 : 0}' = 1 ] && [ "$1" = '192.168.4.201' ] && [ "$2" = 'F2:D2:99:48:B2:D6' ]
}
${authenticateFunction}
authenticate_token 'phoneBearer' '192.168.4.201'
`, 'utf8');
  chmodSync(testScript, 0o755);

  const result = spawnSync('sh', [shellPath(testScript)], { cwd: repoRoot, encoding: 'utf8' });
  rmSync(fixtureRoot, { recursive: true, force: true });
  return result;
}

function runTokenPairLookup({ id = '16', wantedId = '16', admin = '1',
  mac = '02:00:00:00:00:16', legacyIds = '', repairId = '16' } = {}) {
  const fixtureRoot = mkdtempSync(join(tmpdir(), 'sheepfold-token-lookup-'));
  const repairsFile = join(fixtureRoot, 'repairs');
  const common = readProjectFile('root/usr/libexec/sheepfold/sheepfold-token-common')
    .replaceAll('/usr/libexec/sheepfold/sheepfold-device-id ensure', 'ensure_id');
  const fixture = `
set -eu
uci() {
  case "$*" in
    '-q show sheepfold') printf '%s\\n' sheepfold.other=device sheepfold.phone=device ;;
    '-q get sheepfold.other.admin_device') printf 1 ;;
    '-q get sheepfold.other.mac') printf '02:00:00:00:00:01' ;;
    '-q get sheepfold.phone.admin_device') printf '%s' '${admin}' ;;
    '-q get sheepfold.phone.mac') printf '%s' '${mac}' ;;
    '-q get sheepfold.phone.id') printf '%s' '${id}' ;;
    '-q get sheepfold.phone.legacy_ids') printf '%s' '${legacyIds}' ;;
    *) printf 'Unexpected UCI access: %s\\n' "$*" >> '${shellPath(repairsFile)}'; return 1 ;;
  esac
}
ensure_id() {
  printf 'ensure:%s\\n' "$1" >> '${shellPath(repairsFile)}'
  printf '%s' '${repairId}'
}
${common}
token_device_is_admin_paired '${wantedId}' '02:00:00:00:00:16'
`;
  try {
    const result = spawnSync('sh', ['-s'], { input: fixture, cwd: repoRoot, encoding: 'utf8', timeout: 10000 });
    assert.ifError(result.error);
    return { status: result.status, repairs: existsSync(repairsFile) ? readFileSync(repairsFile, 'utf8').trim() : '' };
  } finally {
    rmSync(fixtureRoot, { recursive: true, force: true });
  }
}

describe('Administrator token device binding', () => {
  it('authenticates a stored canonical ID without allocator or UCI writes', () => {
    assert.deepEqual(runTokenPairLookup(), { status: 0, repairs: '' });
    assert.deepEqual(runTokenPairLookup({ wantedId: 'D-0016', legacyIds: 'D-0016' }), { status: 0, repairs: '' });
  });

  it('rejects a different MAC, revoked administrator flag and nonmatching ID without repairs', () => {
    for (const options of [
      { mac: '02:00:00:00:00:17' }, { admin: '0' }, { wantedId: '6' },
      { wantedId: '16x' }, { wantedId: 'D-0016', legacyIds: 'D-0017' },
    ]) {
      assert.deepEqual(runTokenPairLookup(options), { status: 1, repairs: '' });
    }
  });

  it('repairs only the matching administrator record with an invalid or legacy ID', () => {
    for (const id of ['', 'D-0016', '0', '0016', 'invalid']) {
      assert.deepEqual(runTokenPairLookup({ id }), { status: 0, repairs: 'ensure:phone' });
    }
    assert.deepEqual(runTokenPairLookup({ id: '', repairId: '', legacyIds: '16' }), {
      status: 1, repairs: 'ensure:phone',
    });
    assert.deepEqual(runTokenPairLookup({ id: '', admin: '0' }), { status: 1, repairs: '' });
  });

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
    assert.match(randomHelper, /pair_sha256_stdin/);
    const digestHelper = pairCommon.slice(pairCommon.indexOf('pair_sha256_stdin()'), pairCommon.indexOf('pair_sha256()'));
    assert.match(digestHelper, /sha256sum/);
    assert.match(digestHelper, /openssl dgst -sha256/);
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
    const isolatedUci = pairDevice.indexOf('command uci -t "$PAIR_UCI_SAVEDIR" -p "$PAIR_UCI_SAVEDIR"');
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
    assert.doesNotMatch(pairDevice, /command uci -P "\$PAIR_UCI_SAVEDIR"/);
    assert.match(deviceId, /command uci -t "\$SHEEPFOLD_UCI_SAVEDIR" -p "\$SHEEPFOLD_UCI_SAVEDIR"/);
    assert.doesNotMatch(deviceId, /command uci -P "\$SHEEPFOLD_UCI_SAVEDIR"/);
    const commitVerification = pairDevice.indexOf('if ! pair_committed_state_is_valid; then');
    const transactionComplete = pairDevice.indexOf('PAIR_TRANSACTION_ACTIVE=0', finalCommit);
    assert.ok(commitVerification > finalCommit, 'pairing must read back the committed main UCI state');
    assert.ok(transactionComplete > commitVerification, 'token must remain revocable until main UCI read-back succeeds');
    const committedStateCheck = pairDevice.slice(
      pairDevice.indexOf('pair_committed_state_is_valid()'),
      pairDevice.indexOf('\n}\n', pairDevice.indexOf('pair_committed_state_is_valid()')) + 3,
    );
    assert.match(committedStateCheck, /command uci[\s\S]*admin_device/);
    assert.match(committedStateCheck, /command uci[\s\S]*admin_login/);
    assert.match(committedStateCheck, /command uci[\s\S]*\.mac/);
    assert.match(committedStateCheck, /command uci[\s\S]*\.id/);
    assert.match(committedStateCheck, /pair_committed_allowlist_has_mac/);
    assert.match(committedStateCheck, /pairing_code/);
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

  it('resolves bearer identity from server-side token metadata §pairtx1 §authrs1', () => {
    const control = readProjectFile('root/usr/libexec/sheepfold/sheepfold-router-control');
    const cgi = readProjectFile('root/www/cgi-bin/sheepfold-api');
    const apiLegacy = readProjectFile('root/usr/libexec/sheepfold/sheepfold-api-legacy');
    const aiGate = readProjectFile('root/usr/libexec/sheepfold/sheepfold-ai-gate');
    const tokenCommon = readProjectFile('root/usr/libexec/sheepfold/sheepfold-token-common');
    const hardening = readProjectFile('root/usr/libexec/sheepfold/sheepfold-runtime-hardening');

    assert.match(control, /authenticate_token\(\)/);
    assert.match(control, /local bearer client_ip token_file hash now/);
    assert.match(control, /token_load_bound_file "\$token_file"/);
    assert.match(control, /device_id="\$TOKEN_RECORD_DEVICE_ID"/);
    assert.match(control, /mac="\$TOKEN_RECORD_MAC"/);
    assert.match(control, /token_request_source_matches "\$client_ip" "\$mac"/);
    assert.match(control, /authenticate_token "\$\{2:-\}" "\$\{3:-\}"/);
    assert.match(control, /revoke-device-tokens/);
    assert.match(cgi, /authenticate-token "\$bearer" "\$client_ip"/);
    assert.doesNotMatch(cgi, /HTTP_X_SHEEPFOLD_DEVICE_(?:ID|MAC)/);
    assert.match(apiLegacy, /SHEEPFOLD_AUTHENTICATED_ADMIN_LOGIN/);
    assert.match(apiLegacy, /authenticate-token "\$bearer" "\$\{REMOTE_ADDR:-\}"/);
    assert.doesNotMatch(apiLegacy, /HTTP_X_SHEEPFOLD_DEVICE_(?:ID|MAC)/);
    assert.match(tokenCommon, /token_mac_for_ip\(\)/);
    assert.match(tokenCommon, /local wanted_id wanted_mac section device_id/);
    assert.match(tokenCommon, /local file client_device_id client_mac now login/);
    assert.doesNotMatch(tokenCommon, /^\s+(?:section|login)\s+device_id\b/m);
    assert.match(tokenCommon, /\/tmp\/dhcp\.leases/);
    assert.match(tokenCommon, /ip neigh show "\$client_ip"/);
    assert.match(aiGate, /is_admin_request "\$requested_device_id" "\$mac"/);
    assert.match(hardening, /server-side bound-token authentication is missing/);
    assert.match(hardening, /CGI trusts optional client identity headers/);
  });

  it('authenticates without client identity headers and rejects a different network source', () => {
    const accepted = runServerBoundAuthentication();
    assert.equal(accepted.status, 0, accepted.stderr);
    assert.equal(
      accepted.stdout,
      'login=SuperParent\ndevice_id=8\nmac=F2:D2:99:48:B2:D6\n',
    );

    const wrongSource = runServerBoundAuthentication({ sourceMatches: false });
    assert.equal(wrongSource.status, 3, wrongSource.stderr);

    const detachedDevice = runServerBoundAuthentication({ adminPaired: false });
    assert.equal(detachedDevice.status, 4, detachedDevice.stderr);
  });

  it('keeps Android device headers as optional diagnostics rather than authority', () => {
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

    const cgi = readProjectFile('root/www/cgi-bin/sheepfold-api');
    assert.doesNotMatch(cgi, /HTTP_X_SHEEPFOLD_DEVICE_(?:ID|MAC)/);
  });
});
