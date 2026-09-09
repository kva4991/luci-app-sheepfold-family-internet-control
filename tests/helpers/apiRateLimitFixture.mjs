/*
 * Запускает настоящий ограничитель и CGI с локальными путями и синтетическими
 * часами. Барьер чтения детерминированно воспроизводит конкурирующие запросы.
 * Меняются только удаляемые .build-fixtures; firewall, сеть и реальные токены
 * не используются. Это не нагрузочная проверка uhttpd/OpenWrt или Android.
 * Без host flock последовательные сценарии получают только test-stub; реальная
 * конкуренция, symlink и Unix mode остаются обязательной Linux-проверкой.
 */
import { spawn, spawnSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { shellTestPath } from '../../tools/quality/testEnvironment.mjs';

const repoRoot = resolve(import.meta.dirname, '../..');
const sourceRoot = process.env.SHEEPFOLD_RATE_TEST_SOURCE || repoRoot;
const packageRoot = join(sourceRoot, 'package/luci-app-sheepfold-family-internet-control/root');
export const rateNow = 1700000000;
export const rateClient = '192.168.7.20';
export const quote = (value) => `'${String(value).replaceAll("'", "'\\''")}'`;
const useBusybox = spawnSync('busybox', ['ash', '-c', 'true']).status === 0;
export const rateFlockAvailable = spawnSync('sh', ['-c', 'command -v flock >/dev/null 2>&1']).status === 0;
const pathDelimiter = process.platform === 'win32' ? ';' : ':';
export const rateShellPath = (value) => shellTestPath(value, { cwd: repoRoot });

export function createRateFixture() {
  const parent = join(repoRoot, '.build/test-fixtures');
  mkdirSync(parent, { recursive: true });
  const root = mkdtempSync(join(parent, 'api-rate-'));
  const bin = join(root, 'bin');
  const runtime = join(root, 'runtime');
  const rateDir = join(runtime, 'api-rate-limit');
  const actionsPath = join(root, 'actions');
  for (const dir of [bin, rateDir]) mkdirSync(dir, { recursive: true });
  writeFileSync(actionsPath, '');
  const put = (name, body) => {
    const path = join(bin, name);
    writeFileSync(path, body); chmodSync(path, 0o755);
  };
  // BusyBox applet availability differs by build: flock remains the installed
  // util-linux tool here, just as the router package has an explicit +flock.
  if (process.env.SHEEPFOLD_RATE_TEST_BUSYBOX_TOOLS === '1') {
    if (!useBusybox) throw new Error('BusyBox is required for this explicit repeat');
    for (const tool of ['awk', 'cat', 'chmod', 'head', 'mkdir', 'mktemp', 'mv', 'rm', 'tr']) {
      put(tool, `#!/bin/sh\nexec /usr/bin/busybox ${tool} "$@"\n`);
    }
  }
  const relocate = (text) => text.replaceAll('/usr/libexec/sheepfold', rateShellPath(bin))
    .replaceAll('/tmp/sheepfold', rateShellPath(runtime));
  for (const name of ['sheepfold-api-rate-limit', 'sheepfold-lock-common']) {
    put(name, relocate(readFileSync(join(packageRoot, 'usr/libexec/sheepfold', name), 'utf8')));
  }
  put('test-rate-cgi', relocate(readFileSync(join(packageRoot, 'www/cgi-bin/sheepfold-api'), 'utf8')));
  put('sheepfold-token-common', '# Rate boundary only; authentication is independently tested.\n');
  put('sheepfold-home-network', '#!/bin/sh\nexit 0\n');
  put('date', '#!/bin/sh\nprintf "%s\\n" "${TEST_NOW:-1700000000}"\n');
  if (!rateFlockAvailable) put('flock', '#!/bin/sh\nexit 0\n');
  put('sheepfold-router-control', '#!/bin/sh\nprintf "login=Parent\\ndevice_id=1\\nmac=02:00:00:00:00:11\\n"\n');
  put('sheepfold-api-legacy', `#!/bin/sh\nprintf 'dispatch\\n' >> ${quote(rateShellPath(actionsPath))}
printf 'Status: 200 OK\\r\\nContent-Type: application/json\\r\\n\\r\\n{"ok":true}\\n'\n`);
  const environment = (extra = {}) => ({ ...process.env, PATH: `${bin}${pathDelimiter}${process.env.PATH}`,
    TEST_NOW: String(rateNow), REQUEST_METHOD: 'GET', PATH_INFO: '/ping', REMOTE_ADDR: rateClient,
    CONTENT_LENGTH: '0', HTTP_AUTHORIZATION: 'Bearer synthetic-not-real', ...extra });
  const invocation = (name, args) => ({ command: useBusybox ? 'busybox' : 'sh',
    args: [...(useBusybox ? ['ash'] : []), '-c',
      'PATH="$1:$PATH"; export PATH; shift; exec "$@"', 'sheepfold-rate-fixture',
      rateShellPath(bin), rateShellPath(join(bin, name)), ...args] });
  function run(name, args = [], extra = {}) {
    const invocationValue = invocation(name, args);
    return spawnSync(invocationValue.command, invocationValue.args, { env: environment(extra),
      encoding: 'utf8', timeout: 12000, cwd: repoRoot });
  }
  function start(args, extra = {}) {
    const call = invocation('sheepfold-api-rate-limit', args);
    const child = spawn(call.command, call.args, { env: environment(extra), cwd: repoRoot });
    let stdout = '', stderr = '';
    child.stdout.on('data', (data) => { stdout += data; });
    child.stderr.on('data', (data) => { stderr += data; });
    const done = new Promise((resolveResult, reject) => {
      child.on('error', reject);
      child.on('close', (status, signal) => resolveResult({ status, signal, stdout, stderr }));
    });
    return { child, done };
  }
  const statePath = (bucket = 'pair', client = rateClient) => join(rateDir, `${bucket}_${client}`);
  const seed = (count, time = rateNow, bucket = 'pair', client = rateClient) =>
    writeFileSync(statePath(bucket, client), `${count}\t${time}\n`);
  async function concurrent(args = ['check', 'pair', rateClient, '1', '60']) {
    // Both the historical head reader and the new whole-record awk reader are
    // blocked AFTER taking their snapshot, never before acquiring the real lock.
    const barrier = join(root, 'barrier');
    const shellBarrier = rateShellPath(barrier);
    const shellRateDir = rateShellPath(rateDir);
    mkdirSync(barrier);
    for (const tool of ['head', 'awk']) put(tool, `#!/bin/sh
for arg do
  case "$arg" in ${quote(shellRateDir)}/*)
    /usr/bin/${tool} "$@" > ${quote(shellBarrier)}/snapshot.$$
    code=$?
    : > ${quote(shellBarrier)}/ready.$$
    while [ ! -f ${quote(shellBarrier)}/release ]; do /bin/sleep 0.01; done
    /bin/cat ${quote(shellBarrier)}/snapshot.$$
    exit "$code" ;;
  esac
done
exec /usr/bin/${tool} "$@"\n`);
    const processes = [start(args), start(args)];
    try {
      const deadline = Date.now() + 3000;
      while (!readdirSync(barrier).some((name) => name.startsWith('ready.'))) {
        assertBeforeDeadline(deadline); await delay(10);
      }
      // Old code reaches two readers; fixed code serializes them. Release both
      // cases without requiring a second reader that the fix correctly excludes.
      const secondDeadline = Date.now() + 250;
      while (readdirSync(barrier).filter((name) => name.startsWith('ready.')).length < 2 && Date.now() < secondDeadline) await delay(10);
      writeFileSync(join(barrier, 'release'), '');
      return await Promise.all(processes.map((entry) => entry.done));
    } finally {
      writeFileSync(join(barrier, 'release'), '');
      for (const entry of processes) if (entry.child.exitCode === null) entry.child.kill('SIGKILL');
      await Promise.allSettled(processes.map((entry) => entry.done));
    }
  }
  return { root, bin, runtime, rateDir, put, run, start, seed, statePath, concurrent,
    check: (limit = 3, window = 60, extra = {}, bucket = 'pair', client = rateClient) =>
      run('sheepfold-api-rate-limit', ['check', bucket, client, String(limit), String(window)], extra),
    request: (extra = {}) => run('test-rate-cgi', [], extra),
    actions: () => readFileSync(actionsPath, 'utf8'),
    state: (bucket = 'pair', client = rateClient) => existsSync(statePath(bucket, client)) ? readFileSync(statePath(bucket, client), 'utf8') : '',
    close: () => rmSync(root, { recursive: true, force: true }) };
}
function assertBeforeDeadline(deadline) {
  if (Date.now() >= deadline) throw new Error('Reader barrier was not reached');
}
