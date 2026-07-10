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

describe('Router information panel', () => {
  it('has OpenWrt system-board fallbacks for model and firmware', () => {
    const source = readProjectFile('root/usr/libexec/sheepfold/sheepfold-router-control-legacy');

    assert.match(source, /router_board_json\(\)/);
    assert.match(source, /ubus -S call system board/);
    assert.match(source, /router_model_text\(\)/);
    assert.match(source, /router_firmware_description\(\)/);
    assert.match(source, /router_model\s+"\$model"/);
  });

  it('does not render an empty router-info command as all unknown values', () => {
    const source = readProjectFile('htdocs/luci-static/resources/view/sheepfold/overview.js');

    assert.match(source, /Object\.keys\(values\)\.length/);
    assert.match(source, /Router information command returned empty output/);
  });
});
