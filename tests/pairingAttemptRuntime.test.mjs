/*
 * Реальный CGI pairing и файлы квоты в удаляемом каталоге. Backend привязки,
 * UCI, часы и отказы заменены синтетическими зависимостями. Два процесса
 * проверяют конкурентный доступ; это не нагрузочный тест uhttpd/роутера.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync, rmSync, symlinkSync } from 'node:fs';
import { join } from 'node:path';
import { setTimeout as pause } from 'node:timers/promises';
import { createPairingFixture, testCode, shellQuote, shellPath } from './helpers/pairingRuntimeFixture.mjs';
import { installExecutable } from './helpers/controlRuntimeFixture.mjs';
import { runtimeRoot, testMac, testIp, parseCgi } from './helpers/routerRuntimeFixture.mjs';

const body = `login=Parent&code=${encodeURIComponent(testCode)}`;
const identity = testMac.replaceAll(':', '');
const now = 1700000000;
function fixture(limit = 2) {
  const f = createPairingFixture();
  const values = f.values();
  Object.assign(values, { 'sheepfold.pairing_global': 'pairing',
    'sheepfold.pairing_global.max_attempts': String(limit),
    'sheepfold.pairing_global.attempt_window_seconds': '600' });
  writeFileSync(f.configFile, JSON.stringify(values));
  for (const name of ['sheepfold-pair-attempt-common', 'sheepfold-pair-activate']) {
    if (existsSync(join(runtimeRoot, name)))
      installExecutable(f, name, f.relocate(readFileSync(join(runtimeRoot, name), 'utf8')));
  }
  const dir = join(f.runtime, 'pair-attempts');
  mkdirSync(dir, { recursive: true });
  const state = join(dir, identity);
  const calls = join(f.root, 'attempt-backend-calls');
  const gate = join(f.root, 'release-backend');
  writeFileSync(calls, '');
  installExecutable(f, 'sheepfold-api-rate-limit', '#!/bin/sh\nexit 0\n');
  installExecutable(f, 'sheepfold-router-control', `#!/bin/sh
printf 'call\\n' >> ${shellQuote(shellPath(calls))}
if [ "\${TEST_PAIR_GATE:-0}" = 1 ]; then
  while [ ! -e ${shellQuote(shellPath(gate))} ]; do sleep 0.02; done
fi
case "\${TEST_PAIR_STATUS:-3}" in
  0) printf 'paired=1\\nadmin_login=Parent\\nadmin_name=Parent\\ndevice_id=1\\ndevice_name=Synthetic\\nmac=${testMac}\\nip=${testIp}\\ntoken=synthetic-pairing-token\\n' ;;
  *) printf 'Synthetic pairing failure\\n'; exit "\${TEST_PAIR_STATUS:-3}" ;;
esac
`);
  const callCount = () => readFileSync(calls, 'utf8').trim().split('\n').filter(Boolean).length;
  const request = (status = 3, env = {}) => f.request(body, { TEST_PAIR_STATUS: String(status), ...env });
  const concurrent = (env = {}) => {
    const child = spawn('busybox', ['ash', join(f.bin, 'sheepfold-api-pair')], { cwd: f.root,
      env: { ...process.env, PATH: `${f.bin}:${process.env.PATH}`, REMOTE_ADDR: testIp,
        REQUEST_METHOD: 'POST', CONTENT_LENGTH: String(Buffer.byteLength(body)),
        HTTP_X_SHEEPFOLD_CLIENT: 'android-admin-v1', TEST_PAIR_STATUS: '3', ...env } });
    let stdout = '', stderr = '';
    child.stdout.on('data', (data) => { stdout += data; });
    child.stderr.on('data', (data) => { stderr += data; });
    child.stdin.end(body);
    const done = new Promise((resolve, reject) => {
      child.on('error', reject);
      child.on('close', (status, signal) => resolve({ status, signal, stdout, stderr }));
    });
    return { child, done };
  };
  return { ...f, dir, state, calls, gate, callCount, request, concurrent };
}
function response(result, expected) {
  const parsed = parseCgi(result);
  assert.equal(parsed.status, expected, result.stdout + result.stderr);
  assert.equal((result.stdout.match(/^Status:/gm) || []).length, 1);
  return parsed;
}
async function waitFor(check) {
  for (let i = 0; i < 150; i += 1) { if (check()) return; await pause(20); }
  throw new Error('fixture barrier timeout');
}

describe('Pairing attempt accounting and failure boundaries', () => {
  it('allows the configured failures and rejects the next attempt before backend', () => {
    const f = fixture();
    try {
      response(f.request(), 403); response(f.request(), 403);
      assert.equal(response(f.request(), 429).body.error, 'rate_limited');
      assert.equal(f.callCount(), 2);
    } finally { f.close(); }
  });
  it('allows one backend call, not two, when parallel attempts share the final slot', async () => {
    const f = fixture(1); const running = [];
    try {
      const first = f.concurrent({ TEST_PAIR_GATE: '1' }); running.push(first);
      await waitFor(() => f.callCount() >= 1);
      const second = f.concurrent(); running.push(second);
      await pause(200);
      writeFileSync(f.gate, 'release');
      const outputs = await Promise.all(running.map((entry) => entry.done));
      assert.deepEqual(outputs.map((entry) => parseCgi(entry).status).sort(), [403, 429]);
      assert.equal(f.callCount(), 1);
    } finally {
      writeFileSync(f.gate, 'release');
      for (const { child } of running) if (child.exitCode === null) child.kill('SIGTERM');
      await Promise.all(running.map((entry) => entry.done)); f.close();
    }
  });
  for (const status of [2, 3]) it(`counts verified credential rejection ${status}`, () => {
    const f = fixture(1);
    try { response(f.request(status), 403); response(f.request(status), 429); assert.equal(f.callCount(), 1); }
    finally { f.close(); }
  });
  for (const [status, http] of [[4, 409], [5, 403], [6, 500], [7, 409]]) {
    it(`does not spend a failed-code slot on backend status ${status}`, () => {
      const f = fixture(1);
      try { response(f.request(status), http); response(f.request(status), http); assert.equal(f.callCount(), 2); }
      finally { f.close(); }
    });
  }
  for (const status of [1, 126, 127]) it(`does not call an unexpected backend exit ${status} a wrong code`, () => {
    const f = fixture(1);
    try {
      assert.equal(response(f.request(status), 503).body.error, 'pairing_backend_unavailable');
      response(f.request(3), 403); assert.equal(f.callCount(), 2);
    } finally { f.close(); }
  });
  for (const value of ['broken\n', `${now}\n`, `${now} -1\n`, `${now} 0 junk\n`,
    `${now} 0\nextra\n`, '99999999999999999999999999 0\n', '']) {
    it(`rejects malformed attempt state ${JSON.stringify(value)} before backend`, () => {
      const f = fixture();
      try {
        writeFileSync(f.state, value);
        assert.equal(response(f.request(), 503).body.error, 'pairing_attempts_unavailable');
        assert.equal(f.callCount(), 0); assert.equal(readFileSync(f.state, 'utf8'), value);
      } finally { f.close(); }
    });
  }
  it('rejects a directory at the counter path before backend', () => {
    const f = fixture();
    try { mkdirSync(f.state); response(f.request(), 503); assert.equal(f.callCount(), 0); }
    finally { f.close(); }
  });
  it('rejects a symlink counter without changing its target', () => {
    const f = fixture(); const outside = join(f.root, 'keep-state');
    try {
      writeFileSync(outside, `${now} 0\n`); symlinkSync(outside, f.state);
      response(f.request(), 503); assert.equal(f.callCount(), 0);
      assert.equal(readFileSync(outside, 'utf8'), `${now} 0\n`);
    } finally { f.close(); }
  });
  it('does not execute backend when reserving an attempt cannot be published', () => {
    const f = fixture();
    try {
      writeFileSync(f.state, `${now} 0\n`);
      installExecutable(f, 'mv', '#!/bin/sh\nexit 1\n');
      response(f.request(), 503); assert.equal(f.callCount(), 0);
      assert.equal(readFileSync(f.state, 'utf8'), `${now} 0\n`);
    } finally { f.close(); }
  });
  it('returns a single unavailable response when the clock fails', () => {
    const f = fixture();
    try {
      installExecutable(f, 'date', '#!/bin/sh\nexit 1\n');
      response(f.request(), 503); assert.equal(f.callCount(), 0);
    } finally { f.close(); }
  });
  it('normalizes a decimal counter with leading zeros', () => {
    const f = fixture(10);
    try {
      writeFileSync(f.state, `00${now} 008\n`);
      response(f.request(), 403); assert.equal(readFileSync(f.state, 'utf8'), `${now} 9\n`);
    } finally { f.close(); }
  });
  it('keeps successful pairing and clears the old failure count', () => {
    const f = fixture();
    try {
      writeFileSync(f.state, `${now} 1\n`);
      assert.equal(response(f.request(0), 200).body.paired, true);
      assert.equal(existsSync(f.state), false);
    } finally { f.close(); }
  });
  it('does not pollute the response with diagnostic stdout', () => {
    const f = fixture();
    try {
      installExecutable(f, 'sheepfold-log', '#!/bin/sh\nprintf "noisy diagnostic\\n"\nexit 1\n');
      const result = f.request(); response(result, 403);
      assert.equal(result.stdout.includes('noisy diagnostic'), false);
    } finally { f.close(); }
  });
  it('still returns the pairing failure when both journal channels fail', () => {
    const f = fixture();
    try {
      rmSync(join(f.bin, 'sheepfold-log'));
      installExecutable(f, 'logger', '#!/bin/sh\nexit 1\n');
      response(f.request(), 403);
    } finally { f.close(); }
  });
  it('synchronizes a fresh QR reset with an in-flight failed attempt', async () => {
    const f = fixture(); let request;
    try {
      request = f.concurrent({ TEST_PAIR_GATE: '1' });
      await waitFor(() => f.callCount() >= 1);
      const child = spawn('busybox', ['ash', join(f.bin, 'sheepfold-pair-activate'), 'Parent', 'Next+Code', '', '600'],
        { env: { ...process.env, PATH: `${f.bin}:${process.env.PATH}` } });
      let stdout = '', stderr = '';
      child.stdout.on('data', (data) => { stdout += data; }); child.stderr.on('data', (data) => { stderr += data; });
      const done = new Promise((resolve) => child.on('close', (status) => resolve({ status, stdout, stderr })));
      await pause(350); writeFileSync(f.gate, 'release');
      const result = await done; response(await request.done, 403);
      assert.equal(result.status, 0, result.stdout + result.stderr);
      assert.equal(f.values()['sheepfold.admin.pairing_code'], 'Next+Code');
      assert.equal(existsSync(f.state), false, 'old request must not recreate counter after fresh QR');
    } finally {
      writeFileSync(f.gate, 'release'); if (request) await request.done; f.close();
    }
  });
  for (const tool of ['chmod', 'mktemp']) it(`rejects ${tool} failure before checking credentials`, () => {
    const f = fixture();
    try {
      installExecutable(f, tool, '#!/bin/sh\nexit 1\n');
      response(f.request(), 503); assert.equal(f.callCount(), 0);
    } finally { f.close(); }
  });
  it('discards even a valid-looking counter from a failing reader', () => {
    const f = fixture();
    try {
      writeFileSync(f.state, `${now} 0\n`);
      installExecutable(f, 'awk', `#!/bin/sh
case "$*" in
  *${shellQuote(shellPath(f.state))}*) printf '${now} 0\\n'; exit 1 ;;
esac
exec /usr/bin/awk "$@"
`);
      response(f.request(), 503); assert.equal(f.callCount(), 0);
    } finally { f.close(); }
  });
  it('keeps a reserved slot if refund fails, rather than allowing repeated unchecked attempts', () => {
    const f = fixture(1);
    try {
      installExecutable(f, 'mv', `#!/bin/sh
[ ! -s ${shellQuote(shellPath(f.calls))} ] || exit 1
exec /bin/mv "$@"
`);
      response(f.request(6), 503);
      assert.equal(readFileSync(f.state, 'utf8'), `${now} 1\n`);
      response(f.request(3), 429); assert.equal(f.callCount(), 1);
    } finally { f.close(); }
  });
  it('returns the already-issued token even if clearing attempts fails', () => {
    const f = fixture(1);
    try {
      installExecutable(f, 'rm', '#!/bin/sh\nexit 1\n');
      const result = f.request(0);
      assert.equal(response(result, 200).body.token, 'synthetic-pairing-token');
      assert.equal(readFileSync(f.state, 'utf8'), `${now} 1\n`);
      assert.match(result.stderr, /counter cleanup failed/);
    } finally { f.close(); }
  });
  it('keeps the quota lock out of the invoked backend process', () => {
    const f = fixture();
    try {
      const path = join(f.bin, 'sheepfold-router-control');
      writeFileSync(path, readFileSync(path, 'utf8').replace('#!/bin/sh\n',
        '#!/bin/sh\n[ ! -e /proc/self/fd/9 ] || { printf "inherited-quota-lock\\n"; exit 127; }\n'));
      response(f.request(3), 403);
    } finally { f.close(); }
  });
  it('releases the lock after killed CGI but does not refund an unclassified attempt', async () => {
    const f = fixture(1); let running;
    try {
      running = f.concurrent({ TEST_PAIR_GATE: '1' });
      await waitFor(() => f.callCount() >= 1);
      running.child.kill('SIGKILL');
      writeFileSync(f.gate, 'release');
      await running.done;
      response(f.request(3), 429); assert.equal(f.callCount(), 1);
    } finally {
      writeFileSync(f.gate, 'release'); if (running) await running.done; f.close();
    }
  });
  it('returns unavailable, not quota-exhausted, when another pairing holds the lock', async () => {
    const f = fixture(10); let running;
    try {
      running = f.concurrent({ TEST_PAIR_GATE: '1' });
      await waitFor(() => f.callCount() >= 1);
      const second = f.concurrent();
      const result = await second.done;
      assert.equal(response(result, 503).body.error, 'pairing_attempts_unavailable');
      assert.equal(f.callCount(), 1);
    } finally {
      writeFileSync(f.gate, 'release'); if (running) await running.done; f.close();
    }
  });
  for (const start of [now - 600, now + 500]) it(`starts a new window after boundary or backwards clock (${start})`, () => {
    const f = fixture(1);
    try {
      writeFileSync(f.state, `${start} 1\n`); response(f.request(), 403);
      assert.equal(readFileSync(f.state, 'utf8'), `${now} 1\n`);
    } finally { f.close(); }
  });
  it('does not report fresh limits when a reset fails after storing a new QR', () => {
    const f = fixture();
    try {
      writeFileSync(f.state, `${now} 1\n`);
      installExecutable(f, 'rm', '#!/bin/sh\nexit 1\n');
      const result = f.run('sheepfold-pair-activate', ['Parent', 'Next+Code', '', '600']);
      assert.notEqual(result.status, 0); assert.equal(result.stdout.includes('activated=1'), false);
      assert.equal(f.values()['sheepfold.admin.pairing_code'], 'Next+Code');
    } finally { f.close(); }
  });

});
