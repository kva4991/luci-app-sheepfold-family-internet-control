import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const viewPath = resolve(
  repoRoot,
  'package/luci-app-sheepfold-family-internet-control/htdocs/luci-static/resources/view/sheepfold/overview-personal.js',
);
const overviewPath = resolve(
  repoRoot,
  'package/luci-app-sheepfold-family-internet-control/htdocs/luci-static/resources/view/sheepfold/overview.js',
);
const detectorPath = resolve(
  repoRoot,
  'package/luci-app-sheepfold-family-internet-control/root/usr/libexec/sheepfold/sheepfold-device-detector',
);
const cssPath = resolve(
  repoRoot,
  'package/luci-app-sheepfold-family-internet-control/htdocs/luci-static/resources/sheepfold/sheepfold-personal-groups.css',
);
const sheepfoldCssPath = resolve(
  repoRoot,
  'package/luci-app-sheepfold-family-internet-control/htdocs/luci-static/resources/sheepfold/sheepfold.css',
);

describe('Интерфейс автоопределения устройств', () => {
  it('показывает диагностику и повторное определение в настройках устройства', () => {
    const source = readFileSync(viewPath, 'utf8');

    assert.match(source, /Уверенность типа/);
    assert.match(source, /Балл автодоверия/);
    assert.match(source, /Источники доказательств/);
    assert.match(source, /Жёсткий запрет/);
    assert.match(source, /Производитель MAC/);
    assert.match(source, /Обнаруженные mDNS-сервисы/);
    assert.match(source, /sf-device-detection-modal/);
    assert.match(source, /device-reclassify/);
    assert.match(source, /manual_device_type/);
    assert.doesNotMatch(
      source,
      /nameCell\.appendChild\(E\('small', \{ 'class': 'sf-detection-evidence'/,
    );
  });

  it('не зависит от фиксированного номера MAC-колонки', () => {
    const source = readFileSync(viewPath, 'utf8');

    assert.match(source, /function macFromDeviceRow/);
    assert.match(source, /match\(\/\(\?:\[0-9A-F\]/);
    assert.doesNotMatch(source, /normalizeMac\(cells\[4\]/);
  });

  it('показывает онлайн-плашку и точное время последнего появления', () => {
    const source = readFileSync(viewPath, 'utf8');

    assert.match(source, /device-presence/);
    assert.match(source, /Online: now \(seen in the last 15 minutes\)/);
    assert.match(source, /Online: last seen %s/);
    assert.match(source, /_\('Online'\)/);
    assert.match(source, /sf-online-badge-row/);
    assert.match(source, /sf-device-presence-modal-status/);
  });

  it('сортирует сначала онлайн, затем IP по возрастанию', () => {
    const source = readFileSync(viewPath, 'utf8');

    assert.match(source, /function sortDeviceRowsByPresence/);
    assert.match(source, /return rightOnline - leftOnline/);
    assert.match(source, /rowIpSortValue\(left\.row\) - rowIpSortValue\(right\.row\)/);
  });

  it('показывает диапазон Wi-Fi значком, а не текстом в скобках', () => {
    const overview = readFileSync(overviewPath, 'utf8');
    const css = readFileSync(sheepfoldCssPath, 'utf8');

    assert.match(overview, /function wifiBandBadge/);
    assert.match(overview, /function wifiNetworkTitle/);
    assert.doesNotMatch(overview, /ssid \+ ' \(' \+ \(band/);
    assert.match(overview, /'sf-wifi-band sf-wifi-band-' \+ kind/);
    assert.match(overview, /wifiNetworkTitle\(network\)/);
    assert.match(css, /\.sf-wifi-band-2g/);
    assert.match(css, /\.sf-wifi-band-5g/);
    assert.match(css, /\.sf-wifi-band svg[\s\S]*width: 28px/);
    assert.match(css, /\.sf-wifi-title-text[\s\S]*color: #000/);
  });

  it('показывает плашку «Новое» только в течение суток после первого обнаружения', () => {
    const overview = readFileSync(overviewPath, 'utf8');
    const detector = readFileSync(detectorPath, 'utf8');

    assert.match(overview, /NEW_DEVICE_BADGE_SECONDS = 86400/);
    assert.match(overview, /function deviceShowsNewBadge/);
    assert.match(overview, /device\.statusBadge \? badge\(device\.statusBadge\)/);
    assert.match(detector, /first_seen_at/);
    assert.match(detector, /backfill_first_seen_at/);
  });

  it('имеет отдельное оформление диагностики и онлайн-статуса', () => {
    const source = readFileSync(cssPath, 'utf8');

    assert.match(source, /\.sf-device-detection-modal/);
    assert.match(source, /\.sf-device-detection-grid/);
    assert.match(source, /\.sf-device-reclassify/);
    assert.match(source, /\.sf-online-badge/);
    assert.match(source, /background:\s*#dff3ff/);
    assert.match(source, /color:\s*#111/);
  });
});
