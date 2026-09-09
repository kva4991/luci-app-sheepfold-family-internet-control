/* B58/B59: never own an existing PID directory, and prepare a verified snapshot
 * before mutation. Real shell handlers; synthetic copy/permission failures only. */
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { createAdminFixture, quote } from './helpers/adminConfigRuntimeFixture.mjs';

function fixture(t) {
  const f = createAdminFixture();
  f.put('logger', '#!/bin/sh\nexit 0\n');
  t.after(() => f.close());
  return f;
}
function body(f, kind) {
  const r = f.run();
  assert.equal(r.status, 0, r.stderr || r.error?.message);
  const data = JSON.parse(r.stdout);
  return new URLSearchParams(kind === 'wifi' ? {
    expectedWifiRevision: data.wifiRevision, section: 'default_radio0', ssid: 'Requested home',
    password: 'synthetic-password', encryption: 'psk2', channel: 'auto', enabled: '1', confirm: '1',
  } : { expectedRevision: data.revision, schemaVersion: '1', simChangeMode: 'all', childWifiMode: 'network_only' }).toString();
}
function action(kind) { return kind === 'wifi' ? 'wifi-save' : 'notification-settings-save'; }
function installPidCollision(f, kind) {
  f.put('original-admin', readFileSync(join(f.bin, 'sheepfold-api-admin-config'), 'utf8'));
  f.put('sheepfold-api-admin-config', `#!/bin/sh
set -eu
old="$SHEEPFOLD_ADMIN_CONFIG_TX_ROOT/${kind}.$$"
mkdir -p "$old"
printf 'only recovery copy' > "$old/original.before"
printf '%s' "$old" > ${quote(join(f.root, 'old-directory'))}
exec ${quote(join(f.bin, 'original-admin'))} "$@"
`);
}
function fault(f, mode) {
  const root = join(f.root, 'runtime/tx');
  if (mode === 'chmod') {
    f.put('chmod', `#!/bin/sh\n[ "$2" != ${quote(root)} ] || exit 1\nexec /bin/chmod "$@"\n`);
  } else if (mode === 'allocate') {
    f.put('mktemp', '#!/bin/sh\nexit 1\n');
  } else {
    f.put('cp', `#!/bin/sh
src="$2"; dst="$3"
case "$dst" in *.before)
  case ${quote(mode)} in
    fail) exit 1 ;;
    partial) printf 'incomplete-copy' > "$dst"; exit 1 ;;
    corrupt) printf 'incomplete-copy' > "$dst"; exit 0 ;;
    changed) /bin/cp "$@" || exit "$?"; printf 'changed-in-flight' >> "$src"; exit 0 ;;
  esac ;;
esac
exec /bin/cp "$@"
`);
  }
}
for (const kind of ['tx', 'wifi']) {
  test(`${kind}: an old PID-named recovery directory survives a new request`, (t) => {
    const f = fixture(t), request = body(f, kind);
    installPidCollision(f, kind);
    const r = f.run(action(kind), request);
    const old = readFileSync(join(f.root, 'old-directory'), 'utf8');
    assert.equal(existsSync(join(old, 'original.before')), true, 'Do not remove someone else\'s recovery directory');
    assert.equal(readFileSync(join(old, 'original.before'), 'utf8'), 'only recovery copy');
    assert.equal(r.status, 0, r.stderr || r.error?.message);
  });
  for (const mode of ['fail', 'partial', 'corrupt', 'changed', 'chmod', 'allocate']) {
    test(`${kind}: preparation ${mode} stops before UCI writes and radio reload`, (t) => {
      const f = fixture(t), request = body(f, kind), config = kind === 'wifi' ? 'wireless' : 'sheepfold';
      const before = readFileSync(join(f.configs, config), 'utf8');
      fault(f, mode);
      const r = f.run(action(kind), request);
      assert.equal(r.status, 70, r.stderr || r.error?.message);
      assert.match(r.stderr, /^config_snapshot_failed\n$/);
      assert.equal(r.stdout, '');
      assert.equal(f.actions(), '');
      assert.equal(readFileSync(join(f.configs, config), 'utf8'), before + (mode === 'changed' ? 'changed-in-flight' : ''));
    });
  }
  test(`${kind}: snapshot preparation failure is 503, not success or claimed rollback`, (t) => {
    const f = fixture(t), request = body(f, kind);
    fault(f, 'corrupt');
    const r = f.cgi(request, { REQUEST_METHOD: 'POST', PATH_INFO: `/api/v1/admin-config/${kind === 'wifi' ? 'wifi/save' : 'notifications/save'}` });
    assert.equal(r.status, 0, r.stderr || r.error?.message);
    const [headers, json] = r.stdout.split(/\r?\n\r?\n/);
    assert.match(headers, /^Status: 503 /);
    const data = JSON.parse(json);
    assert.equal(data.error, 'config_snapshot_failed');
    assert.doesNotMatch(data.message, /restored/);
    assert.equal(f.actions(), '');
  });
  test(`${kind}: normal operation cleans only its fresh transaction directory`, (t) => {
    const f = fixture(t), r = f.run(action(kind), body(f, kind));
    assert.equal(r.status, 0, r.stderr || r.error?.message);
    const root = join(f.root, 'runtime/tx');
    assert.deepEqual(readdirSync(root), []);
    assert.equal(statSync(root).mode & 0o777, 0o700);
  });
}
