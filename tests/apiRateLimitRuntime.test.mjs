/*
 * Проверяет реальную RAM-квоту: гонку чтения/записи, часы, отказы хранилища и
 * CGI-ответ до защищённого dispatch. Файлы и fault-tools изолированы в .build,
 * удаляются в finally; параллельные дети завершаются. Не доказывает throughput
 * OpenWrt, внутренний pairing-attempt limiter или поведение физического телефона.
 * Native Windows не доказывает flock-конкуренцию, symlink и Unix mode; эти
 * отдельные сценарии выполняются полностью в Linux CI.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { chmodSync, readdirSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createRateFixture, rateFlockAvailable, rateNow, rateClient, rateShellPath, quote } from './helpers/apiRateLimitFixture.mjs';
import { parseCgi } from './helpers/routerRuntimeFixture.mjs';

const withFixture = (body) => {
  const f = createRateFixture();
  try { return body(f); } finally { f.close(); }
};
const successful = (result) => { assert.ifError(result.error); assert.equal(result.status, 0, result.stderr); };

describe('API rate counter executes one transaction', () => {
  it('keeps exactly the configured sequential allowance', () => withFixture((f) => {
    for (let index = 0; index < 3; index++) successful(f.check());
    assert.equal(f.check().status, 1);
    assert.equal(f.state(), `3\t${rateNow}\n`);
  }));
  it('counts simultaneous reads without issuing two copies of the last slot', { skip: !rateFlockAvailable }, async () => {
    const f = createRateFixture();
    try {
      f.seed(0);
      const results = await f.concurrent();
      assert.deepEqual(results.map((r) => r.status).sort(), [0, 1], JSON.stringify(results));
      assert.equal(f.state(), `1\t${rateNow}\n`);
    } finally { f.close(); }
  });
  it('keeps separate clients and route buckets independent', () => withFixture((f) => {
    f.seed(3);
    assert.equal(f.check().status, 1);
    successful(f.check(3, 60, {}, 'pair', '192.168.7.21'));
    successful(f.check(3, 60, {}, 'discovery'));
  }));
  it('resets only the requested bucket and permits a new QR attempt', () => withFixture((f) => {
    f.seed(3); f.seed(3, rateNow, 'pair_extra'); f.seed(3, rateNow, 'feedback');
    successful(f.run('sheepfold-api-rate-limit', ['reset-bucket', 'pair']));
    assert.equal(f.state(), '');
    assert.notEqual(f.state('feedback'), '');
    assert.notEqual(f.state('pair_extra'), '');
    successful(f.check());
  }));
  it('rejects an invalid bucket instead of selecting a different prefix', () => withFixture((f) => {
    f.seed(3);
    assert.equal(f.run('sheepfold-api-rate-limit', ['reset-bucket', 'pa/ir']).status, 2);
    assert.notEqual(f.state(), '');
  }));
  it('retains private permissions on counter files', () => withFixture((f) => {
    successful(f.check());
    const result = f.run('sheepfold-api-rate-limit', ['check', 'pair', rateClient, '3', '60']);
    successful(result);
    if (process.platform !== 'win32') {
      assert.equal(statSync(f.statePath()).mode & 0o777, 0o600);
      assert.equal(statSync(f.rateDir).mode & 0o777, 0o700);
    }
  }));
  it('preserves the existing explicit zero-limit CLI switch', () => withFixture((f) => {
    successful(f.check(0));
    assert.equal(f.state(), '');
  }));
  it('does not follow a symlink to a counter outside the state directory',
    { skip: process.platform === 'win32' }, () => withFixture((f) => {
    const target = join(f.root, 'unrelated');
    writeFileSync(target, `0\t${rateNow}\n`);
    symlinkSync(target, f.statePath());
    assert.equal(f.check().status, 2);
    assert.equal(f.state(), `0\t${rateNow}\n`);
  }));
  it('supports IPv6 client keys without removing a neighboring bucket', () => withFixture((f) => {
    successful(f.check(1, 60, {}, 'pair', 'fd00::11'));
    assert.equal(f.check(1, 60, {}, 'pair', 'fd00::11').status, 1);
    successful(f.run('sheepfold-api-rate-limit', ['reset-bucket', 'pair']));
    assert.equal(f.state('pair', 'fd00::11'), '');
  }));
  it('retains the lock inode after a bucket reset', () => withFixture((f) => {
    successful(f.check());
    const lock = join(f.rateDir, '.pair.lock');
    const inode = statSync(lock).ino;
    successful(f.run('sheepfold-api-rate-limit', ['reset-bucket', 'pair']));
    assert.equal(statSync(lock).ino, inode);
    successful(f.check());
    assert.equal(statSync(lock).ino, inode);
  }));

});

describe('API quota clock and Retry-After', () => {
  it('opens a new fixed window exactly at the boundary', () => withFixture((f) => {
    f.seed(3);
    assert.equal(f.check(3, 60, { TEST_NOW: String(rateNow + 59) }).status, 1);
    successful(f.check(3, 60, { TEST_NOW: String(rateNow + 60) }));
    assert.equal(f.state(), `1\t${rateNow + 60}\n`);
  }));
  it('rebases a counter when router time moves backwards', () => withFixture((f) => {
    f.seed(3, rateNow + 86400);
    successful(f.check());
    assert.equal(f.state(), `1\t${rateNow}\n`);
  }));
  it('returns remaining seconds rather than a fixed minute', () => withFixture((f) => {
    f.seed(3);
    const result = f.check(3, 3600, { TEST_NOW: String(rateNow + 5) });
    assert.equal(result.status, 1);
    assert.equal(result.stdout, '3595\n');
  }));
  it('keeps the clock failure distinct from a quota violation', () => withFixture((f) => {
    f.put('date', '#!/bin/sh\nprintf 1700000000\nexit 7\n');
    assert.equal(f.check().status, 2);
    assert.equal(f.state(), '');
  }));
  for (const value of ['bad-clock', '17000000000000000000000000']) {
    it(`rejects unusable time ${value}`, () => withFixture((f) => {
      assert.equal(f.check(3, 60, { TEST_NOW: value }).status, 2);
      assert.equal(f.state(), '');
    }));
  }
  it('normalizes leading zeroes before shell arithmetic', () => withFixture((f) => {
    f.seed('008');
    successful(f.check('0010', '0060'));
    assert.equal(f.state(), `9\t${rateNow}\n`);
  }));
  for (const args of [['invalid', 60], [3, 0], [3, 'invalid']]) {
    it(`does not silently disable malformed limits ${args.join('/')}`, () => withFixture((f) => {
      assert.equal(f.check(...args).status, 2);
      assert.equal(f.state(), '');
    }));
  }
});

describe('API limiter storage faults are not an allowance', () => {
  it('refuses an unavailable runtime directory', () => withFixture((f) => {
    rmSync(f.rateDir, { recursive: true });
    f.put('mkdir', '#!/bin/sh\nexit 7\n');
    assert.equal(f.check().status, 2);
  }));
  it('does not reset a counter after a reader fails', () => withFixture((f) => {
    f.seed(3);
    for (const tool of ['head', 'awk']) f.put(tool, `#!/bin/sh
for arg do [ "$arg" != ${quote(rateShellPath(f.statePath()))} ] || exit 7; done
exec /usr/bin/${tool} "$@"\n`);
    assert.equal(f.check().status, 2);
    assert.equal(f.state(), `3\t${rateNow}\n`);
  }));
  it('discards plausible partial output from a failed reader', () => withFixture((f) => {
    f.seed(3);
    for (const tool of ['head', 'awk']) f.put(tool, `#!/bin/sh
for arg do
 if [ "$arg" = ${quote(rateShellPath(f.statePath()))} ]; then printf '0\\t1700000000\\n'; exit 7; fi
done
exec /usr/bin/${tool} "$@"\n`);
    assert.equal(f.check().status, 2);
    assert.equal(f.state(), `3\t${rateNow}\n`);
  }));
  for (const content of ['', 'broken\n', '1\t1700000000\nextra\n', '1\t1700000000\t2\n']) {
    it(`rejects corrupt state ${JSON.stringify(content)}`, () => withFixture((f) => {
      writeFileSync(f.statePath(), content);
      assert.equal(f.check().status, 2);
      assert.equal(f.state(), content);
    }));
  }
  it('does not grant an unrecorded request after publication failure', () => withFixture((f) => {
    f.seed(1); f.put('mv', '#!/bin/sh\nexit 7\n');
    assert.equal(f.check().status, 2);
    assert.equal(f.state(), `1\t${rateNow}\n`);
    assert.equal(readdirSync(f.rateDir).filter((name) => name.startsWith('.state.')).length, 0);
  }));
  it('rejects failure to secure storage permissions', () => withFixture((f) => {
    f.put('chmod', '#!/bin/sh\nexit 7\n');
    assert.equal(f.check().status, 2);
    assert.equal(f.state(), '');
  }));
  it('does not proceed without a working lock', () => withFixture((f) => {
    f.put('flock', '#!/bin/sh\nexit 7\n');
    assert.equal(f.check().status, 2);
    assert.equal(f.state(), '');
  }));
  it('does not consume quota if creation of the replacement fails', () => withFixture((f) => {
    f.seed(1);
    f.put('mktemp', '#!/bin/sh\nexit 7\n');
    assert.equal(f.check().status, 2);
    assert.equal(f.state(), `1\t${rateNow}\n`);
  }));
  it('propagates reset deletion failure while retaining the record', () => withFixture((f) => {
    f.seed(3);
    f.put('rm', '#!/bin/sh\nexit 7\n');
    assert.equal(f.run('sheepfold-api-rate-limit', ['reset-bucket', 'pair']).status, 2);
    assert.equal(f.state(), `3\t${rateNow}\n`);
  }));

});

describe('CGI distinguishes quota exhaustion from limiter outage', () => {
  it('dispatches a healthy discovery request with one JSON response', () => withFixture((f) => {
    const result = f.request();
    assert.equal(parseCgi(result).status, 200);
    assert.equal((result.stdout.match(/Status:/g) || []).length, 1);
    assert.equal(f.actions(), 'dispatch\n');
  }));
  it('reports the remaining hour-long quota in Retry-After', () => withFixture((f) => {
    f.seed(3, rateNow, 'support_report');
    const result = f.request({ PATH_INFO: '/support-report', REQUEST_METHOD: 'POST', TEST_NOW: String(rateNow + 5) });
    const response = parseCgi(result);
    assert.equal(response.status, 429);
    assert.match(response.header, /Retry-After: 3595\r?$/m);
    assert.equal(f.actions(), '');
  }));
  it('reports 503 and no protected dispatch after limiter failure', () => withFixture((f) => {
    f.put('sheepfold-api-rate-limit', '#!/bin/sh\nprintf "unexpected stdout\\n"\nexit 2\n');
    const response = parseCgi(f.request());
    assert.equal(response.status, 503);
    assert.equal(response.body.error, 'rate_limit_unavailable');
    assert.equal(f.actions(), '');
  }));
  for (const mode of ['missing', 'not executable']) it(`does not bypass ${mode} limiter`,
    { skip: process.platform === 'win32' && mode === 'not executable' }, () => withFixture((f) => {
    const path = join(f.bin, 'sheepfold-api-rate-limit');
    if (mode === 'missing') rmSync(path); else chmodSync(path, 0o600);
    const response = parseCgi(f.request());
    assert.equal(response.status, 503);
    assert.equal(response.body.error, 'rate_limit_unavailable');
    assert.equal(f.actions(), '');
  }));
  it('contains unexpected helper output before HTTP headers', () => withFixture((f) => {
    f.put('sheepfold-api-rate-limit', '#!/bin/sh\nprintf "injected-output\\n"\nexit 0\n');
    const result = f.request();
    assert.equal(parseCgi(result).status, 200);
    assert.doesNotMatch(result.stdout, /injected-output/);
  }));
  it('does not accept an invalid retry header from a helper', () => withFixture((f) => {
    f.put('sheepfold-api-rate-limit', '#!/bin/sh\nprintf "30\\r\\nX-Test: unsafe\\n"\nexit 1\n');
    const result = f.request({ PATH_INFO: '/feedback', REQUEST_METHOD: 'POST' });
    assert.equal(parseCgi(result).status, 429);
    assert.match(result.stdout, /Retry-After: 3600/);
    assert.doesNotMatch(result.stdout, /X-Test/);
    assert.equal(f.actions(), '');
  }));
  it('recovers after storage is restored without changing credentials', () => withFixture((f) => {
    f.put('mkdir', '#!/bin/sh\nexit 7\n');
    assert.equal(parseCgi(f.request()).status, 503);
    rmSync(join(f.bin, 'mkdir'));
    assert.equal(parseCgi(f.request()).status, 200);
    assert.equal(f.actions(), 'dispatch\n');
  }));
});
