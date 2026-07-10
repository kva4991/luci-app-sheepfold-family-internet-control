import { spawnSync } from 'node:child_process';
import {
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const detectorPath = resolve(
  repoRoot,
  'package/luci-app-sheepfold-family-internet-control/root/usr/libexec/sheepfold/sheepfold-device-detector',
);
const classifierPath = resolve(
  repoRoot,
  'package/luci-app-sheepfold-family-internet-control/root/usr/libexec/sheepfold/sheepfold-device-classifier',
);
const reclassifyPath = resolve(
  repoRoot,
  'package/luci-app-sheepfold-family-internet-control/root/usr/libexec/sheepfold/sheepfold-device-reclassify',
);
const temporaryDirectories = [];

afterEach(() => {
  while (temporaryDirectories.length > 0) {
    rmSync(temporaryDirectories.pop(), { recursive: true, force: true });
  }
});

function createSignal(fields) {
  const directory = mkdtempSync(join(tmpdir(), 'sheepfold-signals-'));
  const file = join(directory, 'device.dhcp');
  const content = Object.entries(fields)
    .map(([key, value]) => `${key}\t${value}`)
    .join('\n');

  temporaryDirectories.push(directory);
  writeFileSync(file, `${content}\n`, 'utf8');
  return file;
}

function classify({
  name,
  ports = '',
  staticName = '',
  signalFile = '',
  mac = '00:11:22:33:44:55',
  mdnsServices = '',
}) {
  const result = spawnSync(
    'sh',
    [classifierPath, name, ports, staticName, signalFile, mac, mdnsServices],
    { encoding: 'utf8' },
  );

  assert.equal(result.status, 0, result.stderr || `Не удалось классифицировать ${name}`);
  const [
    type,
    confidence,
    targetGroup,
    reason,
    autoScore,
    evidence,
    evidenceCount,
    hardDeny,
    policyVersion,
    ouiVendor,
  ] = result.stdout.trimEnd().split('\t');

  return {
    type,
    confidence: Number(confidence),
    targetGroup,
    reason,
    autoScore: Number(autoScore),
    evidence: evidence ? evidence.split(',') : [],
    evidenceCount: Number(evidenceCount),
    hardDeny: hardDeny === '1',
    policyVersion,
    ouiVendor,
  };
}

function isAutoAssignable(device, threshold = 80) {
  return !device.hardDeny
    && device.targetGroup === 'Без ограничений'
    && device.autoScore >= threshold
    && device.evidenceCount >= 2;
}

function functionBody(source, name, nextName) {
  const start = source.indexOf(`${name}() {`);
  const end = source.indexOf(`\n${nextName}() {`, start);

  assert.notEqual(start, -1, `Не найдена функция ${name}`);
  assert.notEqual(end, -1, `Не найден конец функции ${name}`);
  return source.slice(start, end);
}

describe('Безопасное автоназначение устройств', () => {
  it('никогда не доверяет OpenWrt-роутеру автоматически', () => {
    const device = classify({ name: 'OpenWrt' });

    assert.equal(device.type, 'network');
    assert.equal(device.targetGroup, '');
    assert.ok(device.confidence >= 90);
    assert.equal(device.autoScore, 0);
    assert.equal(device.hardDeny, true);
    assert.equal(isAutoAssignable(device), false);
  });

  it('сетевой маркер старше ложного инженерного маркера', () => {
    const device = classify({
      name: 'OpenWrt alarm controller',
      ports: '22,53,80,443',
    });

    assert.equal(device.type, 'network');
    assert.equal(device.hardDeny, true);
    assert.equal(isAutoAssignable(device), false);
  });

  it('сетевой DHCP-признак не превращается в сервер из-за открытого порта', () => {
    const signalFile = createSignal({
      vendor_class: 'OpenWrt router',
      requested_options: '1,3,6,15,51',
    });
    const device = classify({
      name: 'alarm controller',
      ports: '8123',
      signalFile,
    });

    assert.equal(device.type, 'network');
    assert.equal(device.hardDeny, true);
    assert.equal(isAutoAssignable(device), false);
  });

  it('не доверяет умной колонке только по hostname', () => {
    const device = classify({ name: 'Yandex Station' });

    assert.equal(device.type, 'speaker');
    assert.equal(device.evidenceCount, 1);
    assert.equal(device.autoScore, 50);
    assert.equal(isAutoAssignable(device), false);
  });

  it('разрешает колонку после независимого DHCP-подтверждения', () => {
    const signalFile = createSignal({
      vendor_class: 'Yandex Station IoT',
      requested_options: '1,3,6,15,51',
    });
    const device = classify({ name: 'Yandex Station', signalFile });

    assert.equal(device.type, 'speaker');
    assert.deepEqual(device.evidence.sort(), ['dhcp', 'name']);
    assert.ok(device.autoScore >= 80);
    assert.equal(isAutoAssignable(device), true);
  });

  it('считает mDNS аудиосервис независимым подтверждением колонки', () => {
    const device = classify({
      name: 'Yandex Station',
      mdnsServices: '_googlecast._tcp,_raop._tcp',
    });

    assert.equal(device.type, 'speaker');
    assert.deepEqual(device.evidence.sort(), ['mdns', 'name']);
    assert.equal(isAutoAssignable(device), true);
  });

  it('не доверяет Chromecast только по медиасервису', () => {
    const device = classify({
      name: 'unknown-device',
      mdnsServices: '_googlecast._tcp',
    });

    assert.equal(device.type, 'tv');
    assert.equal(device.hardDeny, true);
    assert.equal(isAutoAssignable(device), false);
  });

  it('один mDNS-признак принтера не даёт доверие, но и не включает жёсткий запрет', () => {
    const device = classify({
      name: 'office-device',
      mdnsServices: '_ipp._tcp,_printer._tcp',
    });

    assert.equal(device.type, 'printer');
    assert.equal(device.hardDeny, false);
    assert.equal(device.evidenceCount, 1);
    assert.equal(isAutoAssignable(device), false);
  });

  it('два независимых принтерных признака разрешают безопасное автодоверие', () => {
    const device = classify({
      name: 'Office printer',
      ports: '631,9100',
      mdnsServices: '_ipp._tcp,_printer._tcp',
    });

    assert.equal(device.type, 'printer');
    assert.equal(device.hardDeny, false);
    assert.ok(device.evidenceCount >= 2);
    assert.equal(isAutoAssignable(device), true);
  });

  it('считает статическое имя владельца независимым подтверждением лампы', () => {
    const device = classify({
      name: 'Yeelight lamp',
      staticName: 'Yeelight kitchen lamp',
    });

    assert.equal(device.type, 'smart_home');
    assert.deepEqual(device.evidence.sort(), ['name', 'owner_configured']);
    assert.equal(isAutoAssignable(device), true);
  });

  it('DHCP-профиль компьютера запрещает доверие поддельному имени лампы', () => {
    const signalFile = createSignal({
      vendor_class: 'MSFT 5.0',
      requested_options: '1,3,6,15,31,33,43,44,46,47,119,121,249,252',
    });
    const device = classify({ name: 'Yeelight lamp', signalFile });

    assert.equal(device.type, 'smart_home');
    assert.equal(device.hardDeny, true);
    assert.equal(isAutoAssignable(device), false);
  });

  it('не использует метку источника arp как имя устройства', () => {
    const source = readFileSync(detectorPath, 'utf8');

    assert.match(source, /\$3 == "0x2"/);
    assert.match(source, /print \$4 "\\t" \$1 "\\t\*\\tarp"/);
    assert.match(source, /is_reserved_device_name/);
    assert.match(source, /\$3 !~ \/[\^]\(arp\|dhcp\|static\)/);
  });

  it('повторяет автоназначение для закреплённого типа, если группа ещё не назначена', () => {
    const source = readFileSync(detectorPath, 'utf8');
    const lockedBody = functionBody(source, 'write_locked_device_observation', 'write_detection');
    const assignmentCalls = source.match(/assign_no_restrictions_if_allowed\s+"\$section"/g) || [];

    assert.match(lockedBody, /assign_no_restrictions_if_allowed/);
    assert.equal(assignmentCalls.length, 2, 'Автоназначение должно вызываться и после закреплённого определения');
    assert.match(source, /device_group_unassigned/);
    assert.doesNotMatch(source, /revoke_unsafe_auto_assignment/);
  });

  it('повторное определение снимает ручную фиксацию, но не меняет группу и списки доступа', () => {
    const source = readFileSync(reclassifyPath, 'utf8');

    assert.match(source, /manual_device_type=0/);
    assert.match(source, /delete[^\n]*\.device_type/);
    assert.doesNotMatch(source, /delete[^\n]*\.group/);
    assert.doesNotMatch(source, /delete[^\n]*(allowlist|blocklist)/);
  });
});
