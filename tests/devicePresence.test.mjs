/*
 * Проверяет, какие router-side сигналы считаются фактическим присутствием,
 * и что дешёвые Wi-Fi capabilities не превращаются в идентификатор личности.
 * Реальные ubus/hostapd ответы конкретной модели проверяются на OpenWrt-стенде.
 */
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
    assert.match(source, /\*,arp,\*\|\*,neighbor,\*\)/);
    assert.match(source, /refresh_from_dhcp_signals/);
    assert.match(source, /current_from_neighbor/);
    assert.match(source, /current_from_arp/);
    assert.match(source, /current_from_wifi/);
    assert.match(source, /current_from_recent_dhcp/);
    assert.match(source, /collect_wan_interfaces/);
    assert.match(source, /REACHABLE\|STALE\|DELAY\|PROBE\|PERMANENT/);
    assert.doesNotMatch(source, /current_from_static/);
  });

  it('собирает возможности Wi-Fi одним штатным hostapd-снимком', () => {
    const source = readFileSync(presencePath, 'utf8');

    assert.match(source, /wifi-capabilities/);
    assert.match(source, /ubus -S call "\$object" get_clients/);
    assert.match(source, /json_get_var ht ht/);
    assert.match(source, /json_get_var vht vht/);
    assert.match(source, /json_get_var he he/);
    assert.match(source, /json_get_var he he 2>\/dev\/null \|\| he=0/);
    assert.match(source, /json_get_var rx_rate rx 2>\/dev\/null \|\| rx_rate=0/);
    assert.match(source, /json_select rate/);
    assert.match(source, /generation=legacy/);
    assert.match(source, /wifi_capabilities_snapshot/);
  });

  it('доступен через существующий защищённый router-control', () => {
    const control = readFileSync(controlPath, 'utf8');
    const service = readFileSync(servicePath, 'utf8');

    assert.match(control, /device-presence\)/);
    assert.match(control, /exec "\$DEVICE_PRESENCE"/);
    assert.match(service, /"\$PRESENCE" refresh/);
  });
});
