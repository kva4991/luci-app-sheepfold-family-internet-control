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
const routerFacade = readFileSync(resolve(
  repoRoot,
  'package/luci-app-sheepfold-family-internet-control/root/usr/libexec/sheepfold/sheepfold-router-control',
), 'utf8');
const routerFrontend = readFileSync(resolve(
  repoRoot,
  'package/luci-app-sheepfold-family-internet-control/htdocs/luci-static/resources/sheepfold/core/backend/router.js',
), 'utf8');
const clientStatus = readFileSync(
  resolve(repoRoot, 'package/luci-app-sheepfold-family-internet-control/root/usr/libexec/sheepfold/sheepfold-client-status-effective'),
  'utf8',
);

function shellFunction(name, nextName) {
  const start = routerControl.indexOf(`${name}() {`);
  const end = routerControl.indexOf(`${nextName}() {`, start);

  return routerControl.slice(start, end);
}

describe('Router backend access rules', () => {
  it('attributes LuCI writes explicitly without relabeling API commands', () => {
    assert.match(routerFrontend, /\['--luci'\]\.concat/);
    assert.match(routerFacade, /SHEEPFOLD_ACTION_ACTOR='LuCI \(Изменено на роутере\)'/);
    assert.match(routerControl, /message="\${SHEEPFOLD_ACTION_ACTOR}: \$message"/);
    assert.doesNotMatch(routerControl, /log_event "LuCI \(Изменено на роутере\):/);
  });

  it('does not let temporary access override blocklist state', () => {
    assert.match(routerControl, /device_temp_access\(\)/);
    assert.match(routerControl, /list_has_mac blocklist "\$device_mac"/);
    assert.match(routerControl, /status"[\s\S]*= "blocked"/);
    assert.match(routerControl, /Temporary access cannot override blocklist/);
  });

  it('does not replace permanent unrestricted access with a temporary status', () => {
    const temporary = shellFunction('device_temp_access', 'expire_temp_access');

    assert.match(temporary, /admin_device/);
    assert.match(temporary, /current_status" = allow/);
    assert.match(temporary, /list_has_mac allowlist "\$device_mac"/);
    assert.match(temporary, /device_group" = "\$no_restrictions_name"/);
    assert.match(temporary, /Device already has unrestricted access/);
    assert.ok(
      temporary.indexOf('Device already has unrestricted access') < temporary.indexOf('status=temp_access'),
      'permanent exemptions must be rejected before status=temp_access is written',
    );
  });

  it('cancels temporary state when a parent makes a permanent access decision', () => {
    const allow = shellFunction('device_allow', 'device_block');
    const block = shellFunction('device_block', 'device_temp_access');
    const update = shellFunction('set_device_status', 'led_apply');

    assert.match(routerControl, /cancel_temp_access\(\)/);
    assert.match(allow, /cancel_temp_access "\$device_section" "\$device_mac"/);
    assert.match(block, /cancel_temp_access "\$device_section" "\$device_mac"/);
    assert.match(update, /cancel_temp_access "\$device_section" "\$device_mac"/);
    assert.match(routerControl, /temp_access_allowlist_added[\s\S]*added=0/);
  });

  it('does not let WPS allowlist mode add blocklisted devices', () => {
    const wpsWindow = shellFunction('wps_allowlist_window', 'wps_handle_action');

    assert.match(wpsWindow, /list_has_mac blocklist "\$mac" \|\| device_has_blocked_status "\$mac"[\s\S]*continue[\s\S]*add_mac_to_allowlist "\$mac"/);
    assert.match(wpsWindow, /WPS-окно не добавило устройство из чёрного списка/);
    assert.match(wpsWindow, /uci -q commit sheepfold[\s\S]*sync_firewall/);
  });

  it('rejects opposite access-list membership without silently moving the device §lstxcl1', () => {
    const allow = shellFunction('device_allow', 'device_block');
    const block = shellFunction('device_block', 'device_temp_access');

    assert.match(allow, /list_has_mac blocklist "\$device_mac"/);
    assert.match(block, /list_has_mac allowlist "\$device_mac"/);
    assert.doesNotMatch(allow, /remove_mac_from_list blocklist/);
    assert.doesNotMatch(block, /remove_mac_from_list allowlist/);
  });

  it('reports the configured policy for newly detected devices', () => {
    assert.match(clientStatus, /new_device_policy/);
    assert.match(clientStatus, /new_device_policy" = restrict[\s\S]*status=restricted[\s\S]*reason=new_device_policy/);
    assert.match(clientStatus, /status=allow[\s\S]*reason=new_device_policy_allow/);
  });
});
