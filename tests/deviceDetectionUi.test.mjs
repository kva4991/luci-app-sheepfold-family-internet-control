import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

// Проверяет пользовательский контракт диагностики: родитель видит адрес и
// противоречия, но не внутренние положительные веса классификатора. Тест не
// заменяет визуальную проверку модального окна в настоящем LuCI. §devident1
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
  it('показывает IP, противоречия и повторное определение без внутренних баллов', () => {
    const source = readFileSync(viewPath, 'utf8');

    assert.match(source, /IP-адрес/);
    assert.match(source, /Уверенность типа/);
    assert.match(source, /Противоречащие признаки/);
    assert.doesNotMatch(source, /Балл автодоверия/);
    assert.doesNotMatch(source, /Источники доказательств/);
    assert.doesNotMatch(source, /Жёсткий запрет/);
    assert.doesNotMatch(source, /Обнаруженные mDNS-сервисы/);
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
    assert.match(overview, /wifiNetworkTitle\(network, powerControl\)/);
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

  it('показывает режим реакции на подмену и не предлагает переклассификацию чёрного списка устройств', () => {
    const overview = readFileSync(overviewPath, 'utf8');
    const personal = readFileSync(viewPath, 'utf8');

    assert.match(overview, /Device monitoring and setup/);
    assert.match(overview, /device_monitoring_mode/);
    assert.match(overview, /Automatic \(recommended\)/);
    assert.match(personal, /deviceIsBlocklisted/);
    assert.match(personal, /isBlocklisted \? null : E\('button'/);
    assert.match(personal, /_\('Trust current connection'\)/);
  });

  it('показывает одинаковый индикатор устойчивой идентификации во всех списках устройств', () => {
	const overview = readFileSync(overviewPath, 'utf8');
	const inventory = readFileSync(resolve(
		repoRoot,
		'package/luci-app-sheepfold-family-internet-control/htdocs/luci-static/resources/sheepfold/features/devices/inventory.js',
	), 'utf8');
	const icons = readFileSync(resolve(
		repoRoot,
		'package/luci-app-sheepfold-family-internet-control/htdocs/luci-static/resources/sheepfold/shared/icons.js',
	), 'utf8');
	const selection = readFileSync(resolve(
		repoRoot,
		'package/luci-app-sheepfold-family-internet-control/htdocs/luci-static/resources/sheepfold/features/devices/selection.js',
	), 'utf8');
	const groups = readFileSync(resolve(
		repoRoot,
		'package/luci-app-sheepfold-family-internet-control/htdocs/luci-static/resources/sheepfold/features/groups/view.js',
	), 'utf8');

	assert.match(inventory, /identityProtectionLevel/);
	assert.match(inventory, /upnp_uuid/);
	assert.match(inventory, /mdns_serial/);
	assert.match(icons, /function deviceIdentity/);
	assert.match(overview, /deviceIdentityIcon\(device\)/);
	assert.match(selection, /identityIcon\(device\)/);
	assert.match(groups, /identityIcon\(device\)/);
  });
});
/*
 * Проверяет видимые объяснения auto-detection, presence и ручные действия LuCI.
 * Тест анализирует исходники без браузера и потому не заменяет скриншот/клик-прогон
 * модалки на реальном LuCI после установки пакета.
 */
