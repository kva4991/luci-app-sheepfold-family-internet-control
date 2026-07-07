import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const packageDir = resolve(repoRoot, 'package/luci-app-sheepfold-family-internet-control');
const overviewPath = resolve(
  packageDir,
  'htdocs/luci-static/resources/view/sheepfold/overview.js',
);
const makefilePath = resolve(packageDir, 'Makefile');
const defaultConfigPath = resolve(packageDir, 'root/etc/config/sheepfold');
const buildPyPath = resolve(repoRoot, 'scripts/build-test-ipk.py');
const buildShPath = resolve(repoRoot, 'scripts/build-test-ipk.sh');

function readProjectFile(path) {
  return readFileSync(path, 'utf8');
}

function makeVariable(source, name) {
  const match = source.match(new RegExp(`^${name}:=([^\\r\\n]+)`, 'm'));
  assert.ok(match, `В Makefile нет переменной ${name}`);
  return match[1].trim();
}

describe('LuCI asset versioning', () => {
  it('loads Sheepfold CSS with the UCI asset version', () => {
    const source = readProjectFile(overviewPath);

    assert.match(
      source,
      /var\s+assetVersion\s*=\s*safeUciGet\(\s*['"]sheepfold['"]\s*,\s*['"]global['"]\s*,\s*['"]ui_asset_version['"]/,
      'overview.js должен брать assetVersion из sheepfold.global.ui_asset_version',
    );
    assert.match(
      source,
      /L\.resource\(\s*['"]sheepfold\/sheepfold\.css['"]\s*\)\s*\+\s*['"]\?v=['"]\s*\+\s*encodeURIComponent\(assetVersion\)/,
      'CSS URL должен получать ?v=<assetVersion> через encodeURIComponent',
    );
  });

  it('does not reintroduce hardcoded per-file asset versions', () => {
    const source = readProjectFile(overviewPath);

    assert.doesNotMatch(
      source,
      /assetVersion\s*=\s*['"]\d+\.\d+\.\d+-\d+['"]/,
      'Нельзя возвращать захардкоженный assetVersion вроде 0.1.0-79',
    );
  });

  it('keeps package release and default UCI asset version in sync', () => {
    const makefile = readProjectFile(makefilePath);
    const defaultConfig = readProjectFile(defaultConfigPath);
    const version = makeVariable(makefile, 'PKG_VERSION');
    const release = makeVariable(makefile, 'PKG_RELEASE');
    const expectedAssetVersion = `${version}-${release}`;

    assert.match(
      makefile,
      /SHEEPFOLD_UI_ASSET_VERSION:=\$\(PKG_VERSION\)-\$\(PKG_RELEASE\)/,
      'SHEEPFOLD_UI_ASSET_VERSION должен выводиться из PKG_VERSION-PKG_RELEASE',
    );
    assert.match(
      makefile,
      /uci -q set sheepfold\.global\.ui_asset_version='\$\(SHEEPFOLD_UI_ASSET_VERSION\)'/,
      'postinst должен записывать ui_asset_version в UCI при установке/обновлении',
    );
    assert.match(
      defaultConfig,
      new RegExp(`option\\s+ui_asset_version\\s+'${expectedAssetVersion.replaceAll('.', '\\.')}'`),
      'root/etc/config/sheepfold должен содержать текущий PKG_VERSION-PKG_RELEASE',
    );
  });

  it('keeps local test IPK builders writing the same UCI asset version', () => {
    const buildPy = readProjectFile(buildPyPath);
    const buildSh = readProjectFile(buildShPath);

    assert.match(
      buildPy,
      /uci -q set sheepfold\.global\.ui_asset_version='\{version\}-\{release\}'/,
      'Python-сборщик тестового IPK должен писать ui_asset_version из version-release',
    );
    assert.match(
      buildSh,
      /uci -q set sheepfold\.global\.ui_asset_version='\$\{PKG_VERSION\}-\$\{PKG_RELEASE\}'/,
      'Shell-сборщик тестового IPK должен писать ui_asset_version из PKG_VERSION-PKG_RELEASE',
    );
  });
});
