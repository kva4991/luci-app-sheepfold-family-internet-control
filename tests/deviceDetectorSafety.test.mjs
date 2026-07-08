import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const detectorPath = resolve(
  repoRoot,
  'package/luci-app-sheepfold-family-internet-control/root/usr/libexec/sheepfold/sheepfold-device-detector',
);

function classify(name, ports = '') {
  const result = spawnSync('sh', [detectorPath, 'classify', name, ports], {
    encoding: 'utf8',
  });

  assert.equal(result.status, 0, result.stderr || `Не удалось классифицировать ${name}`);
  const [type, confidence, targetGroup, reason] = result.stdout.trimEnd().split('\t');

  return {
    type,
    confidence: Number(confidence),
    targetGroup,
    reason,
  };
}

describe('Безопасное автоназначение устройств', () => {
  it('никогда не добавляет OpenWrt-роутер в группу без ограничений', () => {
    const device = classify('OpenWrt');

    assert.equal(device.type, 'network');
    assert.equal(device.targetGroup, '');
    assert.ok(device.confidence >= 90);
  });

  it('сетевой маркер старше ложного инженерного маркера', () => {
    const device = classify('OpenWrt alarm controller', '22,53,80,443');

    assert.equal(device.type, 'network');
    assert.equal(device.targetGroup, '');
  });

  it('разрешает автоматическую группу для умной колонки', () => {
    const device = classify('Yandex Station');

    assert.equal(device.type, 'speaker');
    assert.equal(device.targetGroup, 'Без ограничений');
  });

  it('разрешает автоматическую группу для умной лампы', () => {
    const device = classify('Yeelight lamp');

    assert.equal(device.type, 'smart_home');
    assert.equal(device.targetGroup, 'Без ограничений');
  });
});
