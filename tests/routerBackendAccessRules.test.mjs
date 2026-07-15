import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const routerControlPath = resolve(
  repoRoot,
  'package/luci-app-sheepfold-family-internet-control/root/usr/libexec/sheepfold/sheepfold-router-control-legacy',
);
const routerControl = readFileSync(routerControlPath, 'utf8');

describe('Router backend access rules', () => {
  it('does not let temporary access override blocklist state', () => {
    assert.match(routerControl, /device_temp_access\(\)/);
    assert.match(routerControl, /list_has_mac blocklist "\$device_mac"/);
    assert.match(routerControl, /status"[\s\S]*= "blocked"/);
    assert.match(routerControl, /Temporary access cannot override blocklist/);
  });

  it('does not let WPS allowlist mode add blocklisted devices', () => {
    assert.match(routerControl, /wps_allowlist_window\(\)/);
    assert.match(routerControl, /list_has_mac blocklist "\$mac" \|\| device_has_blocked_status "\$mac"[\s\S]*continue[\s\S]*add_mac_to_allowlist "\$mac"/);
    assert.match(routerControl, /WPS-окно не добавило устройство из чёрного списка/);
  });
});
