import { existsSync, mkdtempSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { gunzipSync } from 'node:zlib';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const buildScript = resolve(repoRoot, 'scripts/build-test-ipk.py');
let cachedIpkPath = '';

function buildTestIpk() {
  if (cachedIpkPath) {
    return cachedIpkPath;
  }
  const preparedIpk = process.env.SHEEPFOLD_TEST_IPK || '';
  if (preparedIpk) {
    assert.ok(existsSync(preparedIpk), `SHEEPFOLD_TEST_IPK does not exist: ${preparedIpk}`);
    cachedIpkPath = preparedIpk;
    return cachedIpkPath;
  }
  const testOutDir = mkdtempSync(join(tmpdir(), 'sheepfold-ipk-'));
  const result = spawnSync('python', [buildScript, '--out-dir', testOutDir], {
    cwd: repoRoot,
    encoding: 'utf8',
  });

  assert.equal(result.status, 0, result.error?.message || result.stderr || result.stdout);
  const line = String(result.stdout).trim().split(/\r?\n/).find((entry) => entry.endsWith('.ipk'));
  assert.ok(line, 'build-test-ipk.py must print the generated .ipk path');
  cachedIpkPath = line.trim();
  return cachedIpkPath;
}

function tarEntries(buffer) {
  const entries = new Map();
  for (let offset = 0; offset + 512 <= buffer.length;) {
    const header = buffer.subarray(offset, offset + 512);
    if (header.every((byte) => byte === 0)) break;
    const text = (start, length) => header.subarray(start, start + length)
      .toString('utf8').replace(/\0.*$/s, '').trim();
    const name = text(0, 100);
    const mode = Number.parseInt(text(100, 8) || '0', 8);
    const size = Number.parseInt(text(124, 12) || '0', 8);
    const dataStart = offset + 512;
    entries.set(name, { mode, data: buffer.subarray(dataStart, dataStart + size) });
    offset = dataStart + Math.ceil(size / 512) * 512;
  }
  return entries;
}

function tarMode(ipkPath, memberPath) {
  // Читаем тестовый gzip-tar IPK прямо в Node: так проверка не зависит от
  // разрешения Windows sandbox на запуск вложенного процесса Python.
  const outer = tarEntries(gunzipSync(readFileSync(ipkPath)));
  const dataArchive = outer.get('./data.tar.gz');
  assert.ok(dataArchive, 'IPK does not contain ./data.tar.gz');
  const inner = tarEntries(gunzipSync(dataArchive.data));
  const member = inner.get(memberPath);
  assert.ok(member, `IPK does not contain ${memberPath}`);
  return `0o${(member.mode & 0o777).toString(8)}`;
}

function dataText(ipkPath, memberPath) {
  const outer = tarEntries(gunzipSync(readFileSync(ipkPath)));
  const dataArchive = outer.get('./data.tar.gz');
  assert.ok(dataArchive, 'IPK does not contain ./data.tar.gz');
  const member = tarEntries(gunzipSync(dataArchive.data)).get(memberPath);
  assert.ok(member, `IPK does not contain ${memberPath}`);
  return member.data.toString('utf8');
}

function controlMode(ipkPath, memberPath) {
  const outer = tarEntries(gunzipSync(readFileSync(ipkPath)));
  const controlArchive = outer.get('./control.tar.gz');
  assert.ok(controlArchive, 'IPK does not contain ./control.tar.gz');
  const member = tarEntries(gunzipSync(controlArchive.data)).get(memberPath);
  assert.ok(member, `IPK does not contain control member ${memberPath}`);
  return `0o${(member.mode & 0o777).toString(8)}`;
}

function controlText(ipkPath, memberPath) {
  const outer = tarEntries(gunzipSync(readFileSync(ipkPath)));
  const controlArchive = outer.get('./control.tar.gz');
  assert.ok(controlArchive, 'IPK does not contain ./control.tar.gz');
  const member = tarEntries(gunzipSync(controlArchive.data)).get(memberPath);
  assert.ok(member, `IPK does not contain control member ${memberPath}`);
  return member.data.toString('utf8');
}

describe('test IPK executable permissions', () => {
  it('ships router-control-legacy as executable in data.tar.gz', () => {
    const ipkPath = buildTestIpk();
    const mode = tarMode(
      ipkPath,
      './usr/libexec/sheepfold/sheepfold-router-control-legacy',
    );

    assert.equal(mode, '0o755');
  });

  it('ships the fw4 synchronizer as executable in data.tar.gz', () => {
    const ipkPath = buildTestIpk();
    const mode = tarMode(
      ipkPath,
      './usr/libexec/sheepfold/sheepfold-firewall',
    );

    assert.equal(mode, '0o755');
  });

  it('ships the emergency-site synchronizer as executable in data.tar.gz', () => {
    const ipkPath = buildTestIpk();
    const mode = tarMode(
      ipkPath,
      './usr/libexec/sheepfold/sheepfold-emergency-sites',
    );

    assert.equal(mode, '0o755');
  });

  it('ships the site-list runtime policy as executable in data.tar.gz', () => {
    const ipkPath = buildTestIpk();
    const mode = tarMode(
      ipkPath,
      './usr/libexec/sheepfold/sheepfold-domain-policy',
    );

    assert.equal(mode, '0o755');
  });

  it('ships the schedule evaluator as executable in data.tar.gz', () => {
    const ipkPath = buildTestIpk();
    const mode = tarMode(
      ipkPath,
      './usr/libexec/sheepfold/sheepfold-schedule-evaluator',
    );

    assert.equal(mode, '0o755');
  });

  it('ships the child access request helper as executable in data.tar.gz', () => {
    const ipkPath = buildTestIpk();
    const mode = tarMode(
      ipkPath,
      './usr/libexec/sheepfold/sheepfold-access-request',
    );

    assert.equal(mode, '0o755');
  });

  it('ships the feedback helper as executable in data.tar.gz', () => {
    const ipkPath = buildTestIpk();
    const mode = tarMode(
      ipkPath,
      './usr/libexec/sheepfold/sheepfold-feedback',
    );

    assert.equal(mode, '0o755');
  });

  it('ships the administrator notification queue as executable in data.tar.gz', () => {
    const ipkPath = buildTestIpk();
    const mode = tarMode(
      ipkPath,
      './usr/libexec/sheepfold/sheepfold-admin-notification',
    );

    assert.equal(mode, '0o755');
  });

  it('requires the administrator notification helper in Standard runtime hardening', () => {
    const ipkPath = buildTestIpk();
    const hardening = dataText(
      ipkPath,
      './usr/libexec/sheepfold/sheepfold-runtime-hardening',
    );

    assert.match(hardening, /sheepfold-admin-notification/);
    assert.match(hardening, /sheepfold-domain-policy/);
  });

  it('ships an executable uninstall hook that removes Sheepfold cron jobs', () => {
    const ipkPath = buildTestIpk();
    assert.equal(controlMode(ipkPath, './prerm'), '0o755');
    const buildPy = readFileSync(buildScript, 'utf8');
    const makefile = readFileSync(
      resolve(repoRoot, 'package/luci-app-sheepfold-family-internet-control/Makefile'),
      'utf8',
    );
    assert.match(buildPy, /sheepfold-site-lists cron-remove/);
    assert.match(buildPy, /sheepfold-domain-policy clear/);
    assert.match(makefile, /sheepfold-site-lists cron-remove/);
    assert.match(makefile, /sheepfold-domain-policy clear/);
  });

  it('postinst chmods all libexec helpers after install', () => {
    const buildPy = readFileSync(buildScript, 'utf8');
    const buildSh = readFileSync(resolve(repoRoot, 'scripts/build-test-ipk.sh'), 'utf8');
    const makefile = readFileSync(
      resolve(repoRoot, 'package/luci-app-sheepfold-family-internet-control/Makefile'),
      'utf8',
    );

    assert.match(buildPy, /find \/usr\/libexec\/sheepfold -type f -exec chmod 0755/);
    assert.match(buildSh, /build-test-ipk\.py/);
    assert.match(makefile, /find \/usr\/libexec\/sheepfold -type f -exec chmod 0755/);
  });

  it('keeps the updater config backup until opkg returns control', () => {
    const postinst = controlText(buildTestIpk(), './postinst');
    assert.doesNotMatch(postinst, /rm -f[^\n]*sheepfold-config-before-update/);
  });
});
