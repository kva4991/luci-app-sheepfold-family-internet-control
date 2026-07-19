import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const packageDir = resolve(repoRoot, 'package/luci-app-sheepfold-family-internet-control');
const overviewPath = resolve(packageDir, 'htdocs/luci-static/resources/view/sheepfold/overview.js');
const wifiCardsPath = resolve(packageDir, 'htdocs/luci-static/resources/sheepfold/features/wifi/cards.js');
const logPanelPath = resolve(packageDir, 'htdocs/luci-static/resources/sheepfold/features/logs/panel.js');
const cssPath = resolve(packageDir, 'htdocs/luci-static/resources/sheepfold/sheepfold.css');
const logHelperPath = resolve(packageDir, 'root/usr/libexec/sheepfold/sheepfold-log');
const yandexPath = resolve(packageDir, 'root/usr/libexec/sheepfold/sheepfold-yandex-disk');
const poPath = resolve(packageDir, 'po/ru/sheepfold.po');
const makefilePath = resolve(packageDir, 'Makefile');

describe('overview UI release 148', () => {
  it('restores Wi-Fi save flow with wireless UCI and wifi reload', () => {
    const overview = readFileSync(overviewPath, 'utf8');
    const wifiCards = readFileSync(wifiCardsPath, 'utf8');

    assert.match(overview, /function saveWifiNetworksNow/);
    assert.match(overview, /function wifiSaveBar/);
    assert.match(wifiCards, /sectionName: sectionName/);
    assert.match(overview, /saveUciChanges\(\['wireless'\]\)/);
    assert.match(overview, /fs\.exec\('\/sbin\/wifi', \['reload'\]\)/);
    assert.match(overview, /wifiSaveBar\(\)/);
    assert.match(overview, /data-wifi-save/);
    assert.match(wifiCards, /enabledInput/);
    assert.match(wifiCards, /current\.enabled !== editor\.original\.enabled/);
    assert.doesNotMatch(wifiCards, /section\.disabled !== '1' &&/);
    assert.match(overview, /uci\.set\('wireless', editor\.sectionName, 'disabled', '1'\)/);
    assert.match(overview, /uci\.unset\('wireless', editor\.sectionName, 'disabled'\)/);
    assert.match(overview, /snapshot\.enabled !== editor\.original\.enabled \|\| radiosToEnable\[editor\.device\]/);
    assert.match(overview, /Object\.keys\(radiosToEnable\)/);
    assert.match(overview, /uci\.unset\('wireless', device, 'disabled'\)/);
  });

  it('adds journal filters for time range, ip, mac, device name and message phrases', () => {
    const overview = readFileSync(overviewPath, 'utf8');
    const logPanel = readFileSync(logPanelPath, 'utf8');

    assert.match(overview, /require sheepfold\.features\.logs\.panel as logPanelModel/);
    assert.match(overview, /logPanel\.setText\(results\[2\]\)/);
    assert.match(overview, /return logPanel\.render\(\)/);
    assert.match(logPanel, /function filterControls/);
    assert.match(logPanel, /logModel\.phraseOptions\(\)/);
    assert.match(logPanel, /'type': 'datetime-local'/);
    assert.match(logPanel, /No log entries match the current filters/);
    assert.match(overview, /function supplementGroupedDevicesFromUci/);
    assert.match(overview, /function routerInfoLoadingSpinner/);
  });

  it('mirrors journal writes to USB and schedules Yandex push from sheepfold-log', () => {
    const logHelper = readFileSync(logHelperPath, 'utf8');
    const yandex = readFileSync(yandexPath, 'utf8');

    assert.match(logHelper, /mirror_to_usb/);
    assert.match(logHelper, /USB_LOG_DIR/);
    assert.match(logHelper, /schedule_yandex_push/);
    assert.match(logHelper, /CLOUD_PUSH_INTERVAL=300/);
    assert.match(logHelper, /schedule_google_push/);
    assert.match(logHelper, /push-events/);
    assert.match(yandex, /cmd_push_events/);
    assert.match(yandex, /push-events/);
  });

  it('separates tabs from panels and aligns update button width', () => {
    const css = readFileSync(cssPath, 'utf8');
    const overview = readFileSync(overviewPath, 'utf8');
    const separatorAt = overview.indexOf("'class': 'sf-settings-tabs-separator'");
    const topSaveAt = overview.indexOf('settingsSaveBar(true)', separatorAt);
    const firstPanelAt = overview.indexOf("this.renderSettingsPanel('info'", topSaveAt);

    assert.doesNotMatch(css, /border-bottom: 4px solid #000/);
    assert.match(css, /\.sf-settings-tabs-separator[\s\S]*height: 4px/);
    assert.ok(separatorAt >= 0 && separatorAt < topSaveAt && topSaveAt < firstPanelAt);
    assert.match(css, /\.sf-settings-save-bar-top[\s\S]*width: 100%/);
    assert.match(css, /\.sf-log-toolbar-row/);
    assert.match(css, /\.sf-spinner/);
    assert.match(css, /\.sf-action-stack > \.sf-update-row/);
    assert.match(css, /\.sf-update-row \.sf-action[\s\S]*width: 100%/);
    assert.match(css, /\.sf-log-filters/);
  });

  it('keeps current settings labels and package release in sync', () => {
    const overview = readFileSync(overviewPath, 'utf8');
    const po = readFileSync(poPath, 'utf8');
    const makefile = readFileSync(makefilePath, 'utf8');

    assert.match(overview, /Site list update from allowlist and blocklist sources/);
    assert.match(overview, /Application HTTPS port/);
    assert.match(po, /msgid "Application HTTPS port"/);
    assert.match(po, /msgstr "HTTPS-порт приложения"/);
    assert.match(po, /msgid "Site list update from allowlist and blocklist sources"/);
    assert.match(po, /msgstr "Обновление списков сайтов из белых и чёрных списков"/);
    const release = Number(makefile.match(/PKG_RELEASE:=(\d+)/)?.[1] || 0);
    assert.ok(release >= 172);
  });
});
