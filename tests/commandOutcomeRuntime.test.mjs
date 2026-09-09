/*
 * Проверяет итог настоящих CLI-команд при сбое журналирования, UCI и wifi.
 * Действия системных зависимостей записываются в удаляемую .build fixture.
 * Не запускает настоящее радио, не меняет системный UCI и не проверяет трафик.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { copyFileSync, existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createControlFixture, installExecutable, installNftModel } from './helpers/controlRuntimeFixture.mjs';
import { testMac } from './helpers/routerRuntimeFixture.mjs';

const quote = (value) => `'${String(value).replaceAll("'", "'\\''")}'`;

function logModel(fixture, code = 0) {
  const events = join(fixture.root, 'events');
  writeFileSync(events, '');
  installExecutable(fixture, 'sheepfold-log', `#!/bin/sh\nprintf '%s\\n' "$*" >> ${quote(fixture.shellPath(events))}\nexit ${code}\n`);
  return () => readFileSync(events, 'utf8');
}
function wifiModel(fixture, reloadCode, fallbackCode) {
  const log = join(fixture.root, 'wifi-calls');
  writeFileSync(log, '');
  installExecutable(fixture, 'wifi', `#!/bin/sh
printf '%s\\n' "\${1:-default}" >> ${quote(fixture.shellPath(log))}
[ "\${1:-}" != reload ] || exit ${reloadCode}
exit ${fallbackCode}
`);
  return () => readFileSync(log, 'utf8').trim().split('\n').filter(Boolean);
}
function uciFailure(fixture, failure, partial = '') {
  copyFileSync(join(fixture.bin, 'uci'), join(fixture.bin, 'uci-good'));
  installExecutable(fixture, 'uci', `#!/bin/sh
if [ "$*" = ${quote(failure)} ]; then
  printf '%s' ${quote(partial)}
  exit 1
fi
exec ${quote(fixture.shellPath(join(fixture.bin, 'uci-good')))} "$@"
`);
}
const radio = { 'wireless.radio0': 'wifi-device', 'wireless.radio0.disabled': '0' };

describe('Applied operations survive nonessential logging failures', () => {
  for (const [command, args, statusKey, expected] of [
    ['global-block-on', [], 'sheepfold.global.block_on_boot', '1'],
    ['device-allow', [testMac], 'sheepfold.child.status', 'allow'],
    ['device-block', [testMac], 'sheepfold.child.status', 'blocked'],
    ['device-temp-access', [testMac, '5'], 'sheepfold.child.status', 'temp_access'],
  ]) {
    it(`preserves a successful ${command} response even when its event logger fails`, () => {
      const f = createControlFixture();
      const nft = installNftModel(f);
      logModel(f, 1);
      try {
        const result = f.run('sheepfold-router-control-legacy', [command, ...args]);
        assert.equal(result.status, 0, result.stderr);
        assert.match(result.stdout, /^OK$/m);
        assert.equal(f.values()[statusKey], expected);
        assert.equal(nft.attempts(), 1);
        assert.notEqual(f.batch(), '');
        if (command === 'device-temp-access') {
          assert.match(result.stdout, /^minutes=5$/m);
          assert.equal(f.values()['sheepfold.child.temp_access_until'], '1700000300');
        }
      } finally { f.close(); }
    });
  }
  it('does not stop expired access cleanup before commit and firewall apply when logging fails', () => {
    const f = createControlFixture({
      'sheepfold.child.status': 'temp_access', 'sheepfold.child.temp_access_until': '1699999999',
      'sheepfold.child.temp_access_previous_status': 'restricted', 'sheepfold.child.temp_access_allowlist_added': '0',
    });
    const nft = installNftModel(f);
    logModel(f, 1);
    try {
      const result = f.run('sheepfold-router-control-legacy', ['expire-temp-access']);
      assert.equal(result.status, 0, result.stderr);
      assert.match(result.stdout, /^OK$/m);
      assert.equal(nft.attempts(), 1);
      assert.match(f.batch(), /add element inet fw4 sheepfold_restricted_macs/);
      assert.equal(f.values()['sheepfold.child.status'], 'restricted');
      assert.ok(f.writes().lastIndexOf('commit sheepfold') > f.writes().indexOf('set sheepfold.child.status=restricted'));
    } finally { f.close(); }
  });
  it('still returns a complete response when both the event logger and syslog fallback fail', () => {
    const f = createControlFixture();
    installNftModel(f); logModel(f, 1);
    installExecutable(f, 'logger', '#!/bin/sh\nexit 1\n');
    try {
      const result = f.run('sheepfold-router-control-legacy', ['global-block-on']);
      assert.equal(result.status, 0, result.stderr);
      assert.match(result.stdout, /^OK$/m);
      assert.match(result.stderr, /log/i);
    } finally { f.close(); }
  });
  it('does not fail an applied command when no event helper exists and syslog is unavailable', () => {
    const f = createControlFixture();
    installNftModel(f);
    rmSync(join(f.bin, 'sheepfold-log'));
    installExecutable(f, 'logger', '#!/bin/sh\nexit 1\n');
    try {
      const result = f.run('sheepfold-router-control-legacy', ['global-block-off']);
      assert.equal(result.status, 0, result.stderr);
      assert.match(result.stdout, /^OK$/m);
    } finally { f.close(); }
  });
  it('does not turn a firewall failure into success or write a successful action event', () => {
    const f = createControlFixture();
    const nft = installNftModel(f); nft.fail();
    const events = logModel(f, 1);
    try {
      const result = f.run('sheepfold-router-control-legacy', ['global-block-on']);
      assert.notEqual(result.status, 0);
      assert.doesNotMatch(result.stdout, /^OK$/m);
      assert.equal(events(), '');
    } finally { f.close(); }
  });
  for (const code of [0, 1]) {
    it(`keeps event-helper stdout out of the machine response when it exits ${code}`, () => {
      const f = createControlFixture();
      installNftModel(f);
      installExecutable(f, 'sheepfold-log', `#!/bin/sh\nprintf 'unexpected helper output\n'\nexit ${code}\n`);
      try {
        const result = f.run('sheepfold-router-control-legacy', ['global-block-off']);
        assert.equal(result.status, 0, result.stderr);
        assert.equal(result.stdout, 'OK\n');
      } finally { f.close(); }
    });
  }

});

describe('Wireless commands report what was actually applied', () => {
  for (const command of ['wifi-enable', 'wifi-disable']) {
    it(`rejects ${command} when both reload attempts fail`, () => {
      const f = createControlFixture(radio);
      const calls = wifiModel(f, 1, 1);
      const events = logModel(f);
      try {
        assert.notEqual(f.run('sheepfold-router-control-legacy', [command]).status, 0);
        assert.deepEqual(calls(), ['reload', 'default']);
        assert.equal(events(), '');
      } finally { f.close(); }
    });
  }
  for (const [reload, fallback, callsExpected] of [[0, 1, ['reload']], [1, 0, ['reload', 'default']]]) {
    it(`allows a successful ${reload === 0 ? 'primary reload' : 'fallback'} and records the action`, () => {
      const f = createControlFixture(radio);
      const calls = wifiModel(f, reload, fallback);
      const events = logModel(f);
      try {
        const result = f.run('sheepfold-router-control-legacy', ['wifi-disable']);
        assert.equal(result.status, 0, result.stderr);
        assert.deepEqual(calls(), callsExpected);
        assert.match(events(), /Wi-Fi отключён/);
        assert.equal(f.values()['wireless.radio0.disabled'], '1');
      } finally { f.close(); }
    });
  }
  it('does not apply or acknowledge a partial failed wireless configuration read', () => {
    const f = createControlFixture(radio);
    const calls = wifiModel(f, 0, 0);
    const events = logModel(f);
    try {
      uciFailure(f, '-q show wireless', 'wireless.radio0=wifi-device\n');
      assert.notEqual(f.run('sheepfold-router-control-legacy', ['wifi-disable']).status, 0);
      assert.deepEqual(calls(), []);
      assert.equal(f.writes(), '');
      assert.equal(events(), '');
    } finally { f.close(); }
  });
  for (const failure of ['-q set wireless.radio0.disabled=1', '-q commit wireless']) {
    it(`does not reload wireless after ${failure} fails`, () => {
      const f = createControlFixture(radio);
      const calls = wifiModel(f, 0, 0);
      const events = logModel(f);
      try {
        uciFailure(f, failure);
        assert.notEqual(f.run('sheepfold-router-control-legacy', ['wifi-disable']).status, 0);
        assert.deepEqual(calls(), []);
        assert.equal(events(), '');
      } finally { f.close(); }
    });
  }
  it('does not stamp an automatic action as completed after failed reloads, and retries in the same minute', () => {
    const f = createControlFixture({ ...radio,
      'sheepfold.global.wifi_auto_disable_mode': 'time', 'sheepfold.global.wifi_auto_disable_time': '23:00',
    });
    const events = logModel(f);
    installExecutable(f, 'date', '#!/bin/sh\ncase "$1" in +%H:%M) printf 23:00;; +%Y-%m-%d) printf 2026-09-08;; +%s) printf 1700000000;; *) exit 1;; esac\n');
    try {
      wifiModel(f, 1, 1);
      const first = f.run('sheepfold-router-control-legacy', ['wifi-automation-tick']);
      assert.notEqual(first.status, 0);
      assert.ok(!existsSync(join(f.runtime, 'wifi-automation-last-action')));
      assert.equal(events(), '');
      const calls = wifiModel(f, 0, 0);
      const retry = f.run('sheepfold-router-control-legacy', ['wifi-automation-tick']);
      assert.equal(retry.status, 0, retry.stderr);
      assert.deepEqual(calls(), ['reload']);
      assert.equal(readFileSync(join(f.runtime, 'wifi-automation-last-action'), 'utf8'), '2026-09-08 disable 23:00');
    } finally { f.close(); }
  });
});
