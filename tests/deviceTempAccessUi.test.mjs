import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const overviewPath = resolve(
  repoRoot,
  'package/luci-app-sheepfold-family-internet-control/htdocs/luci-static/resources/view/sheepfold/overview.js',
);

const overview = readFileSync(overviewPath, 'utf8');

describe('Temporary access UI', () => {
  it('grants temporary access through router-control from the device table', () => {
    assert.match(overview, /function grantDeviceTemporaryAccess/);
    assert.match(overview, /device-temp-access/);
    assert.match(overview, /grantDeviceTemporaryAccess\(device, 30\)/);
    assert.doesNotMatch(
      overview,
      /actionButton\(_\('\+30 min'\), 'positive', _\('Temporary access would require confirmation\.'\)\)/,
    );
  });
});