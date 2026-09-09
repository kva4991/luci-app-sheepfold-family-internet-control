/* B60: own Wi-Fi deltas do not leak on failure; unrelated saved deltas are
 * rejected rather than committed/reverted. Real production CLI and CGI run on
 * isolated files. The Python boundary is not libuci, radio or crash recovery. */
import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { createAdminFixture, quote } from './helpers/adminConfigRuntimeFixture.mjs';

function fixture(t) {
  const f = createAdminFixture();
  t.after(() => f.close());
  const pending = join(f.root, 'pending');
  const python = process.env.PYTHON_EXECUTABLE || (process.platform === 'win32' ? 'python' : 'python3');
  mkdirSync(pending);
  f.put('uci', `#!/bin/sh\nexec ${quote(python)} -S ${quote(new URL('./helpers/adminPendingUciModel.py', import.meta.url).pathname)} ${quote(f.configs)} ${quote(pending)} ${quote(join(f.root, 'actions'))} "$@"\n`);
  f.put('logger', '#!/bin/sh\nexit 0\n');
  return { ...f, pending,
    draft(config, changes) { writeFileSync(join(pending, `${config}.json`), JSON.stringify(changes)); },
    deltas(config) { const p = join(pending, `${config}.json`); return existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')) : []; },
  };
}
function request(f, config = 'wireless') {
  const get = f.run();
  assert.equal(get.status, 0, get.stderr || get.error?.message);
  const model = JSON.parse(get.stdout);
  return new URLSearchParams(config === 'wireless' ? {
    expectedWifiRevision: model.wifiRevision, section: 'default_radio0', ssid: 'Requested home',
    password: 'new-synthetic-password', encryption: 'psk2', channel: 'auto', enabled: '1', confirm: '1',
  } : { expectedRevision: model.revision, schemaVersion: '1', simChangeMode: 'all', childWifiMode: 'network_only' }).toString();
}
function action(config) { return config === 'wireless' ? 'wifi-save' : 'notification-settings-save'; }
function endpoint(config) { return config === 'wireless' ? 'wifi/save' : 'notifications/save'; }
function cgi(f, config, body, env) {
  const r = f.cgi(body, { REQUEST_METHOD: 'POST', PATH_INFO: `/api/v1/admin-config/${endpoint(config)}`, ...env });
  assert.equal(r.status, 0, r.stderr || r.error?.message);
  const [headers, json] = r.stdout.split(/\r?\n\r?\n/);
  return { headers, body: JSON.parse(json) };
}
for (const config of ['wireless', 'sheepfold']) {
  test(`${config}: clean delta commits requested settings`, (t) => {
    const f = fixture(t), r = f.run(action(config), request(f, config));
    assert.equal(r.status, 0, r.stderr || r.error?.message);
    assert.equal(JSON.parse(r.stdout).mutation.runtimeApplied, true);
    assert.deepEqual(f.deltas(config), []);
    assert.match(f.actions(), new RegExp(`commit ${config}`));
  });
  test(`${config}: existing unrelated draft is neither committed nor deleted`, (t) => {
    const f = fixture(t), before = f.values(config);
    const draft = [['set', config === 'wireless' ? 'wireless.radio0.country' : 'sheepfold.global.bedtime', 'DE']];
    f.draft(config, draft);
    const r = cgi(f, config, request(f, config));
    assert.match(r.headers, /^Status: 409 /);
    assert.equal(r.body.error, 'config_pending_changes');
    assert.deepEqual(f.values(config), before);
    assert.deepEqual(f.deltas(config), draft);
    assert.equal(f.actions(), '');
  });
  for (const partial of ['0', '1']) {
    test(`${config}: failed pending read (partial=${partial}) stops before writes`, (t) => {
      const f = fixture(t), body = request(f, config), before = f.values(config);
      const r = cgi(f, config, body, { TEST_FAIL_CHANGES: config, TEST_PARTIAL_CHANGES: partial });
      assert.match(r.headers, /^Status: 503 /);
      assert.equal(r.body.error, 'config_read_failed');
      assert.deepEqual(f.values(config), before);
      assert.equal(f.actions(), '');
    });
  }
  for (const kind of ['pending', 'committed']) {
    test(`${config}: concurrent ${kind} edit stops our commit without rolling back the other writer`, (t) => {
      const f = fixture(t), body = request(f, config), before = f.values(config);
      const r = cgi(f, config, body, { TEST_CONCURRENT_CHANGE: kind });
      assert.match(r.headers, /^Status: 409 /);
      assert.equal(r.body.error, kind === 'pending' ? 'config_pending_changes' : 'revision_conflict');
      const key = config === 'wireless' ? 'wireless.radio0.country' : 'sheepfold.global.bedtime';
      const value = config === 'wireless' ? 'DE' : '23:00';
      assert.deepEqual(f.values(config), kind === 'pending' ? before : { ...before, [key]: value });
      assert.deepEqual(f.deltas(config), kind === 'pending' ? [['set', key, value]] : []);
      assert.doesNotMatch(f.actions(), /commit |wifi |revert /);
    });
  }
}
for (const [operation, key] of [['set', 'wireless.default_radio0.encryption'], ['commit', 'wireless']]) {
  test(`Wi-Fi ${operation} failure leaves no new global delta and no stale effective SSID`, (t) => {
    const f = fixture(t), body = request(f), before = f.values('wireless');
    const r = f.run('wifi-save', body, { TEST_FAIL_OPERATION: operation, TEST_FAIL_KEY: key });
    assert.notEqual(r.status, 0);
    assert.deepEqual(f.values('wireless'), before);
    assert.deepEqual(f.deltas('wireless'), [], 'Failed request must not survive as shared pending state');
    const get = f.run();
    assert.equal(get.status, 0, get.stderr);
    assert.equal(JSON.parse(get.stdout).wifiNetworks[0].ssid, before['wireless.default_radio0.ssid']);
    assert.doesNotMatch(f.actions(), /revert /);
    if (operation === 'set') assert.doesNotMatch(f.actions(), /wifi /);
  });
}
test('pending changes in a different package do not block a clean Wi-Fi save', (t) => {
  const f = fixture(t), draft = [['set', 'sheepfold.global.bedtime', '23:00']];
  f.draft('sheepfold', draft);
  const r = f.run('wifi-save', request(f));
  assert.equal(r.status, 0, r.stderr);
  assert.deepEqual(f.deltas('sheepfold'), draft);
  assert.equal(f.values()['sheepfold.global.bedtime'], '21:00');
});
