import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readOverviewApplication } from '../tools/quality/overviewApplicationSource.mjs';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const overviewPath = resolve(
  repoRoot,
  'package/luci-app-sheepfold-family-internet-control/htdocs/luci-static/resources/view/sheepfold/overview.js',
);
const routerControlPath = resolve(
  repoRoot,
  'package/luci-app-sheepfold-family-internet-control/root/usr/libexec/sheepfold/sheepfold-router-control-legacy',
);
const servicePath = resolve(
  repoRoot,
  'package/luci-app-sheepfold-family-internet-control/root/usr/libexec/sheepfold/sheepfold-service',
);
const telegramBotPath = resolve(
  repoRoot,
  'package/luci-app-sheepfold-family-internet-control/root/usr/libexec/sheepfold/sheepfold-telegram-bot',
);

const overview = readOverviewApplication(overviewPath);
const deviceController = readFileSync(resolve(
  repoRoot,
  'package/luci-app-sheepfold-family-internet-control/htdocs/luci-static/resources/sheepfold/features/devices/controller.js',
), 'utf8');
const routerControl = readFileSync(routerControlPath, 'utf8');
const service = readFileSync(servicePath, 'utf8');
const telegramBot = readFileSync(telegramBotPath, 'utf8');

describe('Temporary access UI', () => {
  it('grants temporary access through router-control from the device table', () => {
    assert.match(overview, /require sheepfold\.features\.devices\.controller as deviceControllerModel/);
    assert.match(deviceController, /function grantTemporaryAccess\(device, minutes, button\)/);
    assert.match(deviceController, /device-temp-access/);
    assert.match(deviceController, /grantTemporaryAccess\(device, 30, event\.currentTarget\)/);
    assert.doesNotMatch(
      deviceController,
      /actionButton\(_\('\+30 min'\), 'positive', _\('Temporary access would require confirmation\.'\)\)/,
    );
  });

  it('keeps temporary access temporary in the router backend', () => {
    assert.match(routerControl, /function\s+device_temp_access|device_temp_access\(\)/);
    assert.match(routerControl, /list_has_mac blocklist "\$device_mac"[\s\S]*status"[\s\S]*= "blocked"[\s\S]*Temporary access cannot override blocklist/);
    assert.match(routerControl, /temp_access_until=\$expires_at/);
    assert.match(routerControl, /temp_access_previous_status=\$previous_status/);
    assert.match(routerControl, /temp_access_allowlist_added=0/);
    const tempFunction = routerControl.slice(
      routerControl.indexOf('device_temp_access() {'),
      routerControl.indexOf('expire_temp_access() {'),
    );
    assert.doesNotMatch(tempFunction, /add_mac_to_list allowlist/);
    assert.match(routerControl, /expire_temp_access\(\)/);
    assert.match(routerControl, /remove_mac_from_list allowlist "\$mac"/);
    assert.match(routerControl, /delete "sheepfold\.\$section\.temp_access_until"/);
    assert.match(routerControl, /Временный доступ завершён для устройства/);
    assert.match(routerControl, /expire-temp-access\)/);
    assert.match(service, /"\$ROUTER_CONTROL" expire-temp-access/);
  });

  it('routes Telegram grant-time through the same temporary access backend', () => {
    assert.match(telegramBot, /"\$ROUTER_CONTROL" device-temp-access "\$mac" "\$minutes"/);
    assert.doesNotMatch(telegramBot, /temporary_access_until/);
    assert.doesNotMatch(telegramBot, /temporary_access_minutes/);
  });
});
