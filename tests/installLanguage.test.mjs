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

describe('Install language sync', () => {
  it('maps install.language to both sheepfold.global.language and luci.main.lang', () => {
    const helper = readProjectFile('root/usr/libexec/sheepfold/sheepfold-default-groups');
    const makefile = readProjectFile('Makefile');
    const installer = readFileSync(resolve(repoRoot, 'install.sh'), 'utf8');

    assert.match(helper, /sync_luci_main_lang/);
    assert.match(helper, /uci -q set luci\.main\.lang="\$lang"/);
    assert.match(helper, /luci_language_synced='1'/);
    assert.match(makefile, /luci_language_synced/);
    assert.match(makefile, /luci\.main\.lang/);
    assert.match(installer, /install\.language/);
    assert.match(installer, /luci\.main\.lang="\$\{APP_LANGUAGE\}"/);
  });
});