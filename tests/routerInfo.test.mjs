import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const legacyPath = resolve(
  repoRoot,
  'package/luci-app-sheepfold-family-internet-control/root/usr/libexec/sheepfold/sheepfold-router-control-legacy',
);
const overviewPath = resolve(
  repoRoot,
  'package/luci-app-sheepfold-family-internet-control/htdocs/luci-static/resources/view/sheepfold/overview.js',
);

function readProjectFile(path) {
  return readFileSync(path, 'utf8');
}

function parseKeyValueOutput(text) {
  const values = {};

  String(text || '').split(/\r?\n/).forEach((line) => {
    const index = line.indexOf('=');
    if (index > 0)
      values[line.slice(0, index)] = line.slice(index + 1);
  });

  return values;
}

describe('Router information panel', () => {
  it('collects router-info without failing on missing wireless config', () => {
    const source = readProjectFile(legacyPath);

    assert.match(source, /wifi_radios="\$\(uci -q show wireless/);
    assert.match(source, /\|\| true\)/);
    assert.match(source, /for radio in \$wifi_radios/);
    assert.match(source, /ping_quick_ms/);
    assert.match(source, /ping_ya_ru_ms/);
    assert.match(source, /ping_google_com_ms/);
    assert.match(source, /ping_youtube_com_ms/);
    assert.match(source, /print_kv storage_space/);
  });

  it('parses router-info output for the LuCI information panel', () => {
    const sample = [
      'current_time=10.07.2026 12:00:00 MSK',
      'sheepfold_version=0.1.0-129',
      'internet_status=online',
      'internet_reason=ya.ru отвечает',
      'ping_yandex_ms=14.2',
      'storage_space=/overlay: 12 MB free / 64 MB total (81% used)',
      'wifi_count=1',
      'wifi_1_name=radio0',
      'wifi_1_status=enabled',
    ].join('\n');

    const values = parseKeyValueOutput(sample);

    assert.equal(values.sheepfold_version, '0.1.0-129');
    assert.equal(values.storage_space, '/overlay: 12 MB free / 64 MB total (81% used)');
    assert.equal(values.wifi_count, '1');
  });

  it('renders storage and tolerates empty router-info output in LuCI', () => {
    const source = readProjectFile(overviewPath);

    assert.match(source, /function formatPingMs/);
    assert.match(source, /function routerInfoHasData/);
    assert.match(source, /function loadRouterInformation/);
    assert.match(source, /function routerControlWithTimeout/);
    assert.match(source, /function internetStatusDetails/);
    assert.match(source, /formatInternetProbeLine\('ya\.ru'/);
    assert.match(source, /formatInternetProbeLine\('google\.com'/);
    assert.match(source, /formatInternetProbeLine\('youtube\.com'/);
    assert.match(source, /informationRow\(_\('Router storage'\), infoValue\(values\.storage_space\)\)/);
    assert.match(source, /if \(!routerInfoHasData\(values\)\)/);
    assert.match(source, /routerInfoState\.status = 'error'/);
    assert.match(source, /tab === 'info'/);
  });

  it('does not abort router-info on shell errexit', () => {
    const source = readProjectFile(legacyPath);

    assert.match(source, /router_info\(\)/);
    assert.match(source, /set \+e/);
  });

  it('has OpenWrt system-board fallbacks for model and firmware', () => {
    const source = readProjectFile(legacyPath);

    assert.match(source, /router_board_json\(\)/);
    assert.match(source, /ubus -S call system board/);
    assert.match(source, /router_model_text\(\)/);
    assert.match(source, /router_firmware_description\(\)/);
    assert.match(source, /model="\$\(router_model_text\)"/);
  });

  it('reports Podkop package freshness for the information panel', () => {
    const legacy = readProjectFile(legacyPath);
    const overview = readProjectFile(overviewPath);

    assert.match(legacy, /package_upgradable_any/);
    assert.match(legacy, /print_kv podkop_version_status/);
    assert.match(overview, /function formatInstalledPackageInfo/);
    assert.match(overview, /packageVersionStatusLabel/);
    assert.match(overview, /values\.podkop_version_status/);
  });
});