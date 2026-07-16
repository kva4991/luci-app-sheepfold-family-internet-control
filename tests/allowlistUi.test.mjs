import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const packageDir = resolve(repoRoot, 'package/luci-app-sheepfold-family-internet-control');

function readProjectFile(relativePath) {
  return readFileSync(resolve(packageDir, relativePath), 'utf8');
}

describe('Allowlist and administrator UI guards', () => {
  it('persists allowlist membership through UCI with list mac reset', () => {
    const overview = readProjectFile('htdocs/luci-static/resources/view/sheepfold/overview.js');
    const accessLists = readProjectFile('htdocs/luci-static/resources/sheepfold/features/devices/access-lists.js');

    assert.match(overview, /function persistDeviceListMembership/);
    assert.match(overview, /function updateMacList/);
    assert.match(overview, /require sheepfold\.features\.devices\.access-lists as deviceAccessLists/);
    assert.match(overview, /deviceAccessLists\.updatedValues/);
    assert.match(overview, /deviceAccessLists\.conflictingList/);
    assert.match(overview, /uci\.unset\('sheepfold', sectionName, 'mac'\)/);
    assert.match(overview, /uci\.set\('sheepfold', sectionName, 'mac', values\)/);
    assert.match(accessLists, /function updatedValues/);
    assert.match(accessLists, /function conflictingList/);
    assert.doesNotMatch(
      overview,
      /updateMacList\(isAllowlist \? 'blocklist' : 'allowlist', mac, false\)/,
      'LuCI must reject a conflicting list choice instead of silently moving the device',
    );
    assert.match(overview, /showManualListDeviceModal[\s\S]*?modalActions\(\)[\s\S]*?selector\.node[\s\S]*?modalActions\(\)/);
    assert.match(overview, /persistDeviceListMembership\(selectedDevices, targetStatus\)/);
  });

  it('keeps administrator bind-devices action in secure overview', () => {
    const overview = readProjectFile('htdocs/luci-static/resources/view/sheepfold/overview.js');
    const secure = readProjectFile('htdocs/luci-static/resources/view/sheepfold/overview-secure.js');

    assert.match(overview, /iconButton\(_\('Bind devices'\)/);
    assert.doesNotMatch(secure, /buttons\[1\]\.remove\(\)/);
  });
});
