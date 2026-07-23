import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readOverviewApplication } from '../tools/quality/overviewApplicationSource.mjs';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const packageDir = resolve(repoRoot, 'package/luci-app-sheepfold-family-internet-control');

function readProjectFile(relativePath) {
  return readFileSync(resolve(packageDir, relativePath), 'utf8');
}

describe('Allowlist and administrator UI guards', () => {
  it('persists allowlist membership through backend without reloading LuCI', () => {
    const overview = readOverviewApplication(resolve(packageDir, 'htdocs/luci-static/resources/view/sheepfold/overview.js'));
    const accessLists = readProjectFile('htdocs/luci-static/resources/sheepfold/features/devices/access-lists.js');
    const controller = readProjectFile('htdocs/luci-static/resources/sheepfold/features/devices/controller.js');
    const persistence = readProjectFile('htdocs/luci-static/resources/sheepfold/features/devices/persistence.js');
    const membershipBody = controller.match(
      /function persistMembership[\s\S]*?\n\t}\n\n\tfunction batchFailureMessage/,
    )?.[0] || '';

    assert.match(controller, /function persistMembership/);
    assert.match(persistence, /function updateMacList/);
    assert.match(overview, /require sheepfold\.features\.devices\.access-lists as deviceAccessLists/);
    assert.match(persistence, /accessLists\.updatedValues/);
    assert.match(controller, /accessLists\.conflictingList/);
    assert.match(persistence, /persistence\.replaceList\('sheepfold', sectionName, 'mac', values\)/);
    assert.match(accessLists, /function updatedValues/);
    assert.match(accessLists, /function conflictingList/);
    assert.doesNotMatch(
      controller,
      /updateMacList\(isAllowlist \? 'blocklist' : 'allowlist', mac, false\)/,
      'LuCI must reject a conflicting list choice instead of silently moving the device',
    );
    assert.match(controller, /showManualList[\s\S]*?actions\(\)[\s\S]*?selector\.node[\s\S]*?actions\(\)/);
    assert.match(controller, /persistMembership\(selected, targetStatus/);
    assert.match(membershipBody, /setBackendStatus\(entry\.device, targetStatus\)/);
    assert.match(membershipBody, /deps\.persistence\.applyRuntime/);
    assert.match(membershipBody, /reload\(\)/);
    assert.doesNotMatch(membershipBody, /ui\.changes\.apply|uci\.apply|window\.location\.reload/);
    assert.match(overview, /persistence\.reload/);
    const manualDeviceBody = controller.match(
      /function showManualDevice[\s\S]*?\n\t}\n\n\tfunction grantTemporaryAccess/,
    )?.[0] || '';
    assert.match(manualDeviceBody, /setBackendStatus\(device, 'restricted'\)\.then\(reload\)/);
    assert.match(manualDeviceBody, /refreshViews/);
    assert.doesNotMatch(manualDeviceBody, /window\.location\.reload/);
  });

  it('keeps administrator bind-devices action in secure overview', () => {
    const overview = readOverviewApplication(resolve(packageDir, 'htdocs/luci-static/resources/view/sheepfold/overview.js'));
    const secure = readProjectFile('htdocs/luci-static/resources/view/sheepfold/overview-secure.js');

    assert.match(overview, /iconButton\(_\('Bind devices'\)/);
    assert.doesNotMatch(secure, /buttons\[1\]\.remove\(\)/);
  });
});
