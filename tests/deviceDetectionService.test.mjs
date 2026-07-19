import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const servicePath = resolve(
  repoRoot,
  'package/luci-app-sheepfold-family-internet-control/root/usr/libexec/sheepfold/sheepfold-service',
);
const detectorPath = resolve(
  repoRoot,
  'package/luci-app-sheepfold-family-internet-control/root/usr/libexec/sheepfold/sheepfold-device-detector',
);

describe('Фоновое автообнаружение устройств', () => {
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
/*
 * Проверяет жизненный цикл фонового детектора без запуска OpenWrt: переход
 * offline→online, задержку события, стартовый проход и суточную страховочную
 * сверку. Статический анализ не доказывает, что конкретный драйвер hostapd
 * сообщает клиентов; это проверяется отдельным тестом на живом роутере.
 */
