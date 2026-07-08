import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const presencePath = resolve(
  repoRoot,
  'package/luci-app-sheepfold-family-internet-control/root/usr/libexec/sheepfold/sheepfold-device-presence',
);
const controlPath = resolve(
  repoRoot,
  'package/luci-app-sheepfold-family-internet-control/root/usr/libexec/sheepfold/sheepfold-router-control',
);
const servicePath = resolve(
  repoRoot,
  'package/luci-app-sheepfold-family-internet-control/root/usr/libexec/sheepfold/sheepfold-service',
);

describe('Статус присутствия устройств', () => {
  it('использует пятнадцатиминутное окно и хранит данные только в RAM', () => {
    const source = readFileSync(presencePath, 'utf8');

    assert.match(source, /ONLINE_WINDOW_SECONDS=900/);
    assert.match(source, /PRESENCE_DIR="\/tmp\/sheepfold\/device-presence"/);
    assert.doesNotMatch(source, /\/etc\/sheepfold\/device-presence/);
  });

  it('не принимает одну статическую DHCP-запись за присутствие', () => {
    const source = readFileSync(presencePath, 'utf8');

    assert.match(source, /case ",\$sources," in/);
    assert.match(source, /\*,arp,\*\)/);
    assert.match(source, /refresh_from_dhcp_signals/);
    assert.match(source, /refresh_from_arp/);
  });

  it('доступен через существующий защищённый router-control', () => {
    const control = readFileSync(controlPath, 'utf8');
    const service = readFileSync(servicePath, 'utf8');

    assert.match(control, /device-presence\)/);
    assert.match(control, /exec "\$DEVICE_PRESENCE"/);
    assert.match(service, /"\$PRESENCE" refresh/);
  });
});
