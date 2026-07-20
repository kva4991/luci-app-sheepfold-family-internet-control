import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const packageDir = resolve(repoRoot, 'package/luci-app-sheepfold-family-internet-control');
const overviewPath = resolve(packageDir, 'htdocs/luci-static/resources/view/sheepfold/overview.js');
const wifiCardsPath = resolve(packageDir, 'htdocs/luci-static/resources/sheepfold/features/wifi/cards.js');
const wifiEditorPath = resolve(packageDir, 'htdocs/luci-static/resources/sheepfold/features/wifi/editor.js');
const logPanelPath = resolve(packageDir, 'htdocs/luci-static/resources/sheepfold/features/logs/panel.js');
const routerInfoPath = resolve(packageDir, 'htdocs/luci-static/resources/sheepfold/features/router/info.js');
const deviceTablePath = resolve(packageDir, 'htdocs/luci-static/resources/sheepfold/features/devices/table.js');
const deviceResponsiveCssPath = resolve(packageDir, 'htdocs/luci-static/resources/sheepfold/features/devices/responsive.css');
const cssPath = resolve(packageDir, 'htdocs/luci-static/resources/sheepfold/sheepfold.css');
const logHelperPath = resolve(packageDir, 'root/usr/libexec/sheepfold/sheepfold-log');
const yandexPath = resolve(packageDir, 'root/usr/libexec/sheepfold/sheepfold-yandex-disk');
const poPath = resolve(packageDir, 'po/ru/sheepfold.po');
const makefilePath = resolve(packageDir, 'Makefile');

describe('overview UI release 148', () => {
  it('restores Wi-Fi save flow with wireless UCI and wifi reload', () => {
    const overview = readFileSync(overviewPath, 'utf8');
    const wifiCards = readFileSync(wifiCardsPath, 'utf8');
    const wifiEditor = readFileSync(wifiEditorPath, 'utf8');

    assert.match(overview, /require sheepfold\.features\.wifi\.editor as wifiEditorModel/);
    assert.match(overview, /wifiEditorModel\.create/);
    assert.match(wifiCards, /sectionName: sectionName/);
    assert.match(overview, /saveUciChanges\(\['wireless'\]\)/);
    assert.match(overview, /fs\.exec\('\/sbin\/wifi', \['reload'\]\)/);
    assert.match(overview, /wifiEditor\.saveBar\(\)/);
    assert.match(wifiEditor, /data-wifi-save/);
    assert.match(wifiCards, /enabledInput/);
    assert.match(wifiCards, /current\.enabled !== editor\.original\.enabled/);
    assert.doesNotMatch(wifiCards, /section\.disabled !== '1' &&/);
    assert.match(wifiEditor, /deps\.setOption\(editor\.sectionName, 'disabled', '1'\)/);
    assert.match(wifiEditor, /deps\.unsetOption\(editor\.sectionName, 'disabled'\)/);
    assert.match(wifiEditor, /snapshot\.enabled !== editor\.original\.enabled \|\| radiosToEnable\[editor\.device\]/);
    assert.match(wifiEditor, /Object\.keys\(plan\.radiosToEnable\)/);
    assert.match(wifiEditor, /deps\.unsetOption\(device, 'disabled'\)/);
    assert.doesNotMatch(overview, /function saveWifiNetworksNow/);
  });

  it('adds journal filters for time range, ip, mac, device name and message phrases', () => {
    const overview = readFileSync(overviewPath, 'utf8');
    const logPanel = readFileSync(logPanelPath, 'utf8');
    const routerInfo = readFileSync(routerInfoPath, 'utf8');

    assert.match(overview, /require sheepfold\.features\.logs\.panel as logPanelModel/);
    assert.match(overview, /logPanel\.setText\(results\[2\]\)/);
    assert.match(overview, /return logPanel\.render\(\)/);
    assert.match(logPanel, /function filterControls/);
    assert.match(logPanel, /logModel\.phraseOptions\(\)/);
    assert.match(logPanel, /'type': 'datetime-local'/);
    assert.match(logPanel, /No log entries match the current filters/);
    assert.match(overview, /function supplementGroupedDevicesFromUci/);
    assert.match(routerInfo, /function spinner/);
    assert.doesNotMatch(overview, /function routerInfoLoadingSpinner/);
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

  it('contains the wide router information table inside the mobile panel', () => {
    const css = readFileSync(cssPath, 'utf8');

    // Широкие Wi-Fi-колонки прокручиваются внутри таблицы, но строка 760px не
    // должна растягивать весь документ LuCI на узком экране телефона.
    assert.match(css, /\.sf-info-body\s*\{[\s\S]*grid-template-columns: minmax\(0, 1fr\);[\s\S]*min-width: 0;[\s\S]*max-width: 100%;/);
    assert.match(css, /\.sf-info-body > \*,[\s\S]*\.sf-info-grid > \*[\s\S]*min-width: 0;[\s\S]*max-width: 100%;/);
    assert.match(css, /\.sf-info-table\s*\{[\s\S]*min-width: 0;[\s\S]*max-width: 100%;/);
    assert.match(css, /@media \(max-width: 900px\)[\s\S]*\.sf-info-table\s*\{[\s\S]*overflow-x: auto;[\s\S]*\.sf-info-table-row\s*\{[\s\S]*min-width: 760px;/);
  });

  it('keeps user-list tabs and every device field reachable on a phone', () => {
    const css = readFileSync(deviceResponsiveCssPath, 'utf8');
    const table = readFileSync(deviceTablePath, 'utf8');
    const overview = readFileSync(overviewPath, 'utf8');

    assert.match(css, /@media \(max-width: 640px\)[\s\S]*\.sf-tabs\s*\{[\s\S]*grid-template-columns: repeat\(2, minmax\(0, 1fr\)\);[\s\S]*overflow-x: visible;/);
    assert.match(css, /\.sf-tab\s*\{[\s\S]*overflow-wrap: break-word;[\s\S]*word-break: normal;/);
    assert.match(css, /\.sf-device-row\.sf-device-head\s*\{[\s\S]*display: none;/);
    assert.match(css, /\.sf-device-row:not\(\.sf-device-head\)[\s\S]*grid-template-columns: 44px minmax\(0, 1fr\) 44px;/);
    assert.match(css, /content: attr\(data-label\)/);
    for (const label of ['IP address', 'MAC address', 'Group', 'Status', 'Actions']) {
      assert.match(overview, new RegExp(`'data-label': _\\('${label}'\\)`));
    }
    assert.match(table, /L\.resource\('sheepfold\/features\/devices\/responsive\.css'\)[\s\S]*encodeURIComponent\(assetVersion\)/);
    assert.match(overview, /deviceTableModel\.stylesheet\(assetVersion\)/);
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
    assert.ok(release >= 240);
  });
});
