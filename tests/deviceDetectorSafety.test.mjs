import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
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

function functionBody(source, name, nextName) {
  const start = source.indexOf(`${name}() {`);
  const end = source.indexOf(`\n${nextName}() {`, start);

  assert.notEqual(start, -1, `Не найдена функция ${name}`);
  assert.notEqual(end, -1, `Не найден конец функции ${name}`);
  return source.slice(start, end);
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

  it('не повторяет автоназначение для уже закреплённого типа', () => {
    const source = readFileSync(detectorPath, 'utf8');
    const lockedBody = functionBody(source, 'write_locked_device_observation', 'write_detection');
    const assignmentCalls = source.match(/assign_no_restrictions_if_allowed\s+"\$section"/g) || [];

    assert.doesNotMatch(lockedBody, /assign_no_restrictions_if_allowed/);
    assert.equal(assignmentCalls.length, 1, 'Автоназначение должно вызываться только после нового определения');
    assert.doesNotMatch(source, /revoke_unsafe_auto_assignment/);
  });
});
