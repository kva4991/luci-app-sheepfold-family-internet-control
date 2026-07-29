import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

// Проверяет пользовательский контракт диагностики: родитель видит адрес и
// противоречия, но не внутренние положительные веса классификатора. Тест не
// заменяет визуальную проверку модального окна в настоящем LuCI. §devident1
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const detectionDetailsPath = resolve(
  repoRoot,
  'package/luci-app-sheepfold-family-internet-control/htdocs/luci-static/resources/sheepfold/features/devices/detection-details.js',
);
const presencePath = resolve(
  repoRoot,
  'package/luci-app-sheepfold-family-internet-control/htdocs/luci-static/resources/sheepfold/features/devices/presence.js',
);
const generalSettingsPath = resolve(
  repoRoot,
  'package/luci-app-sheepfold-family-internet-control/htdocs/luci-static/resources/sheepfold/features/settings/general.js',
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
    const source = readFileSync(detectionDetailsPath, 'utf8');

    assert.match(source, /_\('IP address'\)/);
    assert.match(source, /_\('Type confidence'\)/);
    assert.match(source, /_\('Contradicting evidence'\)/);
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
    const source = readFileSync(detectionDetailsPath, 'utf8');

    assert.match(source, /function macFromRow/);
    assert.match(source, /match\(\/\(\?:\[0-9A-F\]/);
    assert.doesNotMatch(source, /normalizeMac\(cells\[4\]/);
  });

  it('показывает онлайн-плашку и точное время последнего появления', () => {
    const source = [
      readFileSync(presencePath, 'utf8'),
      readFileSync(detectionDetailsPath, 'utf8'),
    ].join('\n');

    assert.match(source, /device-presence/);
    assert.match(source, /Online: now \(seen in the last 15 minutes\)/);
    assert.match(source, /Online: last seen %s/);
    assert.match(source, /_\('Online'\)/);
    assert.match(source, /sf-online-badge-row/);
    assert.match(source, /sf-device-presence-modal-status/);
  });

  it('сортирует сначала онлайн, затем IP по возрастанию', () => {
    const source = readFileSync(presencePath, 'utf8');

    assert.match(source, /function sortRows/);
    assert.match(source, /return rightOnline - leftOnline/);
    assert.match(source, /rowIpSortValue\(left\.row\) - rowIpSortValue\(right\.row\)/);
  });

  it('показывает диапазон Wi-Fi значком, а не текстом в скобках', () => {
    const wifiController = readFileSync(resolve(
      repoRoot,
      'package/luci-app-sheepfold-family-internet-control/htdocs/luci-static/resources/sheepfold/features/wifi/controller.js',
    ), 'utf8');
    const css = readFileSync(sheepfoldCssPath, 'utf8');

    assert.match(wifiController, /function bandBadge/);
    assert.match(wifiController, /function title\(network, powerControl\)/);
    assert.doesNotMatch(wifiController, /ssid \+ ' \(' \+ \(band/);
    assert.match(wifiController, /'sf-wifi-band sf-wifi-band-' \+ kind/);
    assert.match(wifiController, /title: title/);
    assert.match(css, /\.sf-wifi-band-2g/);
    assert.match(css, /\.sf-wifi-band-5g/);
    assert.match(css, /\.sf-wifi-band svg[\s\S]*width: 28px/);
    assert.match(css, /\.sf-wifi-title-text[\s\S]*color: #000/);
  });

  it('показывает плашку «Новое» только в течение суток после первого обнаружения', () => {
    const deviceController = readFileSync(resolve(
      repoRoot,
      'package/luci-app-sheepfold-family-internet-control/htdocs/luci-static/resources/sheepfold/features/devices/controller.js',
    ), 'utf8');
    const detector = readFileSync(detectorPath, 'utf8');

    assert.match(deviceController, /NEW_DEVICE_BADGE_SECONDS = 86400/);
    assert.match(deviceController, /function statusBadge/);
    assert.match(deviceController, /device\.statusBadge \? badge\(device\.statusBadge\)/);
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
    const generalSettings = readFileSync(generalSettingsPath, 'utf8');
    const details = readFileSync(detectionDetailsPath, 'utf8');

    assert.match(generalSettings, /Device monitoring and setup/);
    assert.match(generalSettings, /device_monitoring_mode/);
    assert.match(generalSettings, /Automatic \(recommended\)/);
    assert.match(details, /function isBlocklisted/);
    assert.match(details, /reclassifyButton = blocklisted \? null : E\('button'/);
    assert.match(details, /_\('Trust current connection'\)/);
  });

  it('показывает одинаковый индикатор устойчивой идентификации во всех списках устройств', () => {
	const details = readFileSync(detectionDetailsPath, 'utf8');
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
	const environment = readFileSync(resolve(
		repoRoot,
		'package/luci-app-sheepfold-family-internet-control/htdocs/luci-static/resources/sheepfold/features/overview/environment.js',
	), 'utf8');

	assert.match(inventory, /identityProtectionLevel/);
	assert.match(inventory, /function effectiveDeviceType/);
	assert.match(details, /deps\.inventory\.effectiveDeviceType/);
	assert.match(inventory, /upnp_uuid/);
	assert.match(inventory, /mdns_serial/);
	assert.match(icons, /function deviceIdentity/);
	assert.match(environment, /function identityIcon\(device\)/);
	assert.match(environment, /icons\.deviceIdentity\(protectedIdentity, title\)/);
	assert.match(selection, /identityIcon\(device\)/);
	assert.match(groups, /identityIcon\(device\)/);
  });
});
/*
 * Проверяет видимые объяснения auto-detection, presence и ручные действия LuCI.
 * Тест анализирует исходники без браузера и потому не заменяет скриншот/клик-прогон
 * модалки на реальном LuCI после установки пакета.
 */
