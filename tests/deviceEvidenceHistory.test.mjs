/*
 * Проверяет компактную историю доказательств паспорта устройства: ровно три
 * обезличенных снимка и запись только при изменении классификационного hash.
 * Это статический контракт; износ flash и реальную UCI-ротацию подтверждает
 * отдельный тест на OpenWrt-стенде. §detlife1
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const detector = readFileSync(resolve(
  repoRoot,
  'package/luci-app-sheepfold-family-internet-control/root/usr/libexec/sheepfold/sheepfold-device-detector',
), 'utf8');

function functionBody(name, nextName) {
  const start = detector.indexOf(`${name}() {`);
  const end = detector.indexOf(`\n${nextName}() {`, start);
  assert.notEqual(start, -1, `Не найдена функция ${name}`);
  assert.notEqual(end, -1, `Не найден конец функции ${name}`);
  return detector.slice(start, end);
}

describe('device evidence history', () => {
  it('rotates exactly three bounded snapshots', () => {
    const append = functionBody('append_detection_snapshot', 'remember_detection_history');

    assert.match(append, /detection_snapshot_1/);
    assert.match(append, /detection_snapshot_2/);
    assert.match(append, /detection_snapshot_3/);
    assert.doesNotMatch(append, /detection_snapshot_4/);
    assert.match(detector, /cut -c1-160/);
  });

  it('stores categories and a short hash, never raw identity material', () => {
    const remember = functionBody('remember_detection_history', 'write_detection');

    assert.match(remember, /old_fingerprint/);
    assert.match(remember, /old_evidence/);
    assert.match(remember, /old_competing/);
    assert.doesNotMatch(remember, /identity_keys|serial|uuid|mdns_profile|ssdp_profile|wsd_profile/i);
    assert.match(detector, /printf '%s' "\$fingerprint" \| cut -c1-16/);
    assert.match(remember, /wifi_profile/);
  });

  it('does not rotate history when the classification fingerprint is unchanged', () => {
    const remember = functionBody('remember_detection_history', 'write_detection');

    assert.match(remember, /\[ -z "\$old_fingerprint" \] \|\| \[ "\$old_fingerprint" != "\$new_fingerprint" \]/);
    const append = functionBody('append_detection_snapshot', 'remember_detection_history');
    assert.match(append, /current_fingerprint/);
    assert.match(append, /\[ "\$current_fingerprint" != "\$fingerprint_short" \]/);
  });
});
