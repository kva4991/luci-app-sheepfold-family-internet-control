import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const packageDir = resolve(repoRoot, 'package/luci-app-sheepfold-family-internet-control');

function readProjectFile(path) {
  return readFileSync(resolve(packageDir, path), 'utf8');
}

describe('Personal group watermark', () => {
  it('loads the personal group wrapper from the LuCI menu', () => {
    const menu = JSON.parse(readProjectFile(
      'root/usr/share/luci/menu.d/luci-app-sheepfold-family-internet-control.json',
    ));

    assert.equal(
      menu['admin/services/sheepfold'].action.path,
      'sheepfold/overview-personal',
    );
  });

  it('patches overview through the secure wrapper and versions the watermark stylesheet', () => {
    const source = readProjectFile(
      'htdocs/luci-static/resources/view/sheepfold/overview-personal.js',
    );

    assert.match(source, /require view\.sheepfold\.overview-secure as secureOverview/);
    assert.match(source, /require view\.sheepfold\.overview as overview/);
    assert.match(source, /var renderGroups = overview\.renderGroups/);
    assert.match(source, /overview\.renderGroups = function\(/);
    assert.match(source, /return view\.extend\(/);
    assert.doesNotMatch(source, /BaseView\.extend\(/);
    assert.match(source, /section\.personal === '1'/);
    assert.match(source, /sheepfold-personal-groups\.css/);
    assert.match(source, /ui_asset_version/);
    assert.match(source, /sf-group-person-watermark/);
  });

  it('marks the default child group as personal but not the unrestricted group', () => {
    const config = readProjectFile('root/usr/share/sheepfold/sheepfold.uci.defaults');
    const unrestricted = config.match(
      /config group 'no_restrictions'([\s\S]*?)(?=\nconfig |$)/,
    );
    const child = config.match(
      /config group 'child_1'([\s\S]*?)(?=\nconfig |$)/,
    );

    assert.ok(unrestricted);
    assert.ok(child);
    assert.match(unrestricted[1], /option personal '0'/);
    assert.match(child[1], /option personal '1'/);
  });
});
