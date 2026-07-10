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
  it('отслеживает весь файл DHCP-аренд, а не только последнюю строку', () => {
    const source = readFileSync(servicePath, 'utf8');

    assert.match(source, /cksum "\$LEASES_FILE"/);
    assert.doesNotMatch(source, /sed -n '\$p' "\$LEASES_FILE"/);
  });

  it('разделяет быстрые DHCP-события и полный контрольный проход', () => {
    const service = readFileSync(servicePath, 'utf8');
    const detector = readFileSync(detectorPath, 'utf8');

    assert.match(service, /SCAN_SCOPE=changed/);
    assert.match(service, /run_detector scan "\$SCAN_SCOPE"/);
    assert.match(detector, /\[ "\$scan_scope" = "changed" \] && effective_mode="reduced"/);
    assert.match(detector, /scan_devices "\$\{2:-full\}"/);
  });
});
