/*
 * B57: неудачный откат не уничтожает последнюю копию и не выдаётся за успешный.
 * Настоящие функции cleanup и HTTP-dispatcher выполняются в BusyBox ash на
 * временных файлах; отказы cp/mv/wifi/UCI вводятся на границах. Никаких настроек
 * хоста. Это не атомарность libuci, отказ питания или доказательство работы радио.
 */
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { createAdminFixture, quote } from './helpers/adminConfigRuntimeFixture.mjs';

function fixture(t) {
  const f = createAdminFixture();
  f.put('logger', '#!/bin/sh\nexit 0\n');
  t.after(() => f.close());
  return f;
}
function copyFault(f, mode) {
  f.put('cp', `#!/bin/sh
src="$2"; dst="$3"
case "$src" in *.before)
 case ${quote(mode)} in
 fail) exit 1 ;;
 partial) printf 'partial-copy' > "$dst"; exit 1 ;;
 corrupt) printf 'partial-copy' > "$dst"; exit 0 ;;
 esac ;;
esac
exec /usr/bin/cp "$@"
`);
}
function moveFault(f) {
  f.put('mv', '#!/bin/sh\nexit 1\n');
}
function recovery(f, kind, mode) {
  const config = join(f.configs, kind === 'wifi' ? 'wireless' : 'sheepfold');
  const tx = join(f.root, 'runtime', 'recovery');
  const snapshot = join(tx, kind === 'wifi' ? 'wireless.before' : 'sheepfold.before');
  mkdirSync(tx, { mode: 0o700 });
  writeFileSync(snapshot, 'old-complete-settings', { mode: 0o600 });
  writeFileSync(config, 'new-complete-settings');
  if (['fail', 'partial', 'corrupt'].includes(mode)) copyFault(f, mode);
  if (mode === 'move') moveFault(f);
  if (mode === 'logger') {
    copyFault(f, 'fail');
    f.put('logger', '#!/bin/sh\nprintf "unexpected-logger-output\\n"\nexit 1\n');
  }
  if (mode === 'wifi') f.put('wifi', '#!/bin/sh\nexit 1\n');
  const variables = kind === 'wifi'
    ? `WIRELESS_CONFIG_FILE=${quote(config)}\nWIFI_TX_DIR=${quote(tx)}\nWIFI_TX_SNAPSHOT=${quote(snapshot)}\nWIFI_TX_RESTORE=1\nWIFI_TX_ACTIVE=0\nWIFI_BIN="$SHEEPFOLD_WIFI_BIN"\nwifi_save_cleanup 5`
    : `CONFIG_FILE=${quote(config)}\nTX_DIR=${quote(tx)}\nTX_SNAPSHOT=${quote(snapshot)}\nTX_RESTORE=1\nTX_ACTIVE=0\ntransaction_cleanup 70`;
  const result = f.shell(`. "$SHEEPFOLD_ADMIN_CONFIG_COMMON"\n. "$SHEEPFOLD_ADMIN_CONFIG_WIFI"\n${variables}`);
  return { result, config, snapshot, tx };
}
for (const kind of ['config', 'wifi']) {
  for (const mode of ['fail', 'partial', 'corrupt', 'move', 'logger']) {
    test(`${kind} rollback ${mode} preserves a complete recovery copy and current file`, (t) => {
      const f = fixture(t), r = recovery(f, kind, mode);
      assert.notEqual(r.result.status, 0, r.result.error?.message);
      assert.equal(existsSync(r.snapshot), true, 'Failed restoration must retain the only backup');
      assert.equal(readFileSync(r.snapshot, 'utf8'), 'old-complete-settings');
      assert.equal(readFileSync(r.config, 'utf8'), 'new-complete-settings', 'Never publish a partial restore');
      assert.equal(statSync(r.tx).mode & 0o777, 0o700);
      assert.equal(r.result.stdout, '');
      assert.equal(r.result.status, 72);
      assert.match(r.result.stderr, /config_rollback_failed/);
    });
  }
  test(`${kind} successful file restoration cleans its temporary directory`, (t) => {
    const f = fixture(t), r = recovery(f, kind, 'normal');
    assert.equal(r.result.status, kind === 'wifi' ? 5 : 70, r.result.stderr);
    assert.equal(readFileSync(r.config, 'utf8'), 'old-complete-settings');
    assert.equal(existsSync(r.tx), false);
    assert.equal(r.result.stdout, '');
  });
}
test('restored Wi-Fi file plus failed restart remains a distinct incomplete recovery', (t) => {
  const f = fixture(t), r = recovery(f, 'wifi', 'wifi');
  assert.equal(r.result.status, 73, r.result.stderr);
  assert.equal(readFileSync(r.config, 'utf8'), 'old-complete-settings');
  assert.equal(existsSync(r.snapshot), true);
  assert.match(r.result.stderr, /wifi_rollback_apply_failed/);
});
function successfulGet(f) {
  const result = f.run();
  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout);
}
function post(f, action, body) {
  const result = f.cgi(new URLSearchParams(body).toString(), {
    REQUEST_METHOD: 'POST', PATH_INFO: `/api/v1/admin-config/${action}` });
  assert.equal(result.status, 0, result.stderr || result.error?.message);
  const [headers, output] = result.stdout.split(/\r?\n\r?\n/);
  return { headers, data: JSON.parse(output) };
}
function backups(f, filename) {
  const dir = join(f.root, 'runtime', 'tx');
  return existsSync(dir) ? readdirSync(dir).map((name) => join(dir, name, filename)).filter(existsSync) : [];
}
test('CGI does not claim restoration after commit and rollback both fail', (t) => {
  const f = fixture(t), before = readFileSync(join(f.configs, 'sheepfold'), 'utf8');
  const revision = successfulGet(f).revision;
  f.put('uci', `#!/bin/sh
python3 -S ${quote(join(f.bin, 'uci-model.py'))} "$@" || exit "$?"
for arg in "$@"; do [ "$arg" != commit ] || exit 1; done
exit 0
`);
  moveFault(f);
  const result = post(f, 'notifications/save', { schemaVersion: '1', expectedRevision: revision,
    simChangeMode: 'all', childWifiMode: 'network_only' });
  assert.match(result.headers, /^Status: 500 Internal Server Error/);
  assert.equal(result.data.error, 'config_rollback_failed');
  assert.doesNotMatch(result.data.message, /restored the previous configuration/);
  const saved = backups(f, 'sheepfold.before');
  assert.equal(saved.length, 1);
  assert.equal(readFileSync(saved[0], 'utf8'), before);
  assert.equal(f.values()['sheepfold.global.sim_change_notifications'], 'all');
});
for (const failCopy of [true, false]) {
  test(`Wi-Fi CGI reports ${failCopy ? 'file rollback' : 'restart after rollback'} failure truthfully`, (t) => {
    const f = fixture(t), before = readFileSync(join(f.configs, 'wireless'), 'utf8');
    const revision = successfulGet(f).wifiRevision;
    f.put('wifi', '#!/bin/sh\nexit 1\n');
    if (failCopy) copyFault(f, 'partial');
    const result = post(f, 'wifi/save', { expectedWifiRevision: revision, section: 'default_radio0',
      ssid: 'New home', password: 'synthetic-password', encryption: 'psk2', channel: 'auto', enabled: '1', confirm: '1' });
    assert.match(result.headers, /^Status: (500|502) /);
    assert.equal(result.data.error, failCopy ? 'config_rollback_failed' : 'wifi_rollback_apply_failed');
    assert.equal(result.data.ok, false);
    const saved = backups(f, 'wireless.before');
    assert.equal(saved.length, 1);
    assert.equal(readFileSync(saved[0], 'utf8'), before);
    assert.equal(f.values('wireless')['wireless.default_radio0.ssid'], failCopy ? 'New home' : 'Test network');
  });
}
