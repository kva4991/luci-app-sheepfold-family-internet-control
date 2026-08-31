/*
 * Проверяет lifecycle фонового детектора: статические триггеры и настоящий shell
 * обработчика очереди на fixtures. Нет сети, UCI и запуска detector; временные
 * файлы удаляются. Это не проверка hostapd/роуминга на роутере. §detload §testwhy
 */
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { applyTestEnvironment, shellTestPath } from '../tools/quality/testEnvironment.mjs';
import { tmpdir } from 'node:os';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
applyTestEnvironment(repoRoot);
const servicePath = resolve(
  repoRoot,
  'package/luci-app-sheepfold-family-internet-control/root/usr/libexec/sheepfold/sheepfold-service',
);
const detectorPath = resolve(
  repoRoot,
  'package/luci-app-sheepfold-family-internet-control/root/usr/libexec/sheepfold/sheepfold-device-detector',
);

describe('Фоновое автообнаружение устройств', () => {
  it('ограничивает число попыток очереди даже при ошибках detector и сохраняет retry', () => {
    const source = readFileSync(servicePath, 'utf8');
    const start = source.indexOf('process_pending_connections() {');
    const end = source.indexOf('\nrefresh_adguard_client_policy() {', start);
    assert.ok(start >= 0 && end > start);
    const directory = mkdtempSync(resolve(tmpdir(), 'detectorQueue-'));
    try {
      const queue = resolve(directory, 'queue.tsv');
      const calls = resolve(directory, 'calls.txt');
      const macs = ['02:00:00:00:00:01', '02:00:00:00:00:02', '02:00:00:00:00:03'];
      for (const outcome of [0, 1]) {
        writeFileSync(queue, macs.map(mac => `90\t${mac}\n`).join(''));
        writeFileSync(calls, '');
        const script = `${source.slice(start, end)}
          PENDING_CONNECTIONS_FILE="$1"
          calls="$2"
          uci() { printf 2; }
          normalize_mac() { printf '%s' "$1"; }
          valid_mac() { return 0; }
          online_state_has_mac() { return 0; }
          run_detector() { printf '%s\\n' "$3" >> "$calls"; return ${outcome}; }
          process_pending_connections 100
          printf '%s' "$EVENT_SCAN_RAN"`;
        const result = spawnSync('sh', ['-s', '--', ...[queue, calls].map(path => shellTestPath(path, { cwd: repoRoot }))], {
          cwd: repoRoot, input: script, encoding: 'utf8', timeout: 5_000,
        });
        assert.ifError(result.error);
        assert.equal(result.status, 0, result.stderr);
        assert.deepEqual(readFileSync(calls, 'utf8').trim().split('\n'), macs.slice(0, 2));
        assert.equal(result.stdout, outcome === 0 ? '1' : '0');
        const retries = outcome === 0 ? '' : macs.slice(0, 2).map(mac => `160\t${mac}\n`).join('');
        assert.equal(readFileSync(queue, 'utf8'), `${retries}105\t${macs[2]}\n`);
      }
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it('реагирует на подтверждённый переход устройства в online, а не на любое изменение файла аренд', () => {
    const source = readFileSync(servicePath, 'utf8');

    assert.match(source, /"\$PRESENCE" current/);
    assert.match(source, /ONLINE_STATE_FILE/);
    assert.match(source, /queue_connection_scan/);
    assert.match(source, /run_detector scan event "\$mac"/);
    assert.match(source, /detector_connection_delay_seconds[^\n]*printf 20/);
	assert.match(source, /detector_offline_grace_seconds[^\n]*printf 90/);
	assert.match(source, /OFFLINE_PENDING_FILE/);
	assert.match(source, /now - offline_since/);
    assert.doesNotMatch(source, /sheepfold_state_hash_file "\$LEASES_FILE"/);
  });

  it('выполняет стартовую и суточную сверку только для online-устройств', () => {
    const service = readFileSync(servicePath, 'utf8');
    const detector = readFileSync(detectorPath, 'utf8');

    assert.match(service, /detector_interval_seconds[^\n]*printf 86400/);
    assert.match(service, /run_detector scan startup/);
    assert.match(service, /run_detector scan daily/);
    assert.match(detector, /sources_confirm_online "\$sources" \|\| continue/);
    assert.match(detector, /run_scan_locked "\$\{2:-full\}"/);
  });
});
