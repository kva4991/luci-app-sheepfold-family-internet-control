/*
 * Защищает границу вкладки журнала после выноса DOM из overview.js. Тест
 * проверяет делегирование опасных действий, но реальную запись fs и скачивание
 * файла дополнительно проверяет браузерный проход на тестовом роутере.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { readOverviewApplication } from '../tools/quality/overviewApplicationSource.mjs';

const root = 'package/luci-app-sheepfold-family-internet-control/htdocs/luci-static/resources/';
const overview = readOverviewApplication(root + 'view/sheepfold/overview.js');
const panel = readFileSync(root + 'sheepfold/features/logs/panel.js', 'utf8');
const shell = readFileSync(root + 'sheepfold/features/page/shell.js', 'utf8');

describe('Log panel module §frontmod', () => {
  it('owns log presentation state without receiving UCI or filesystem access', () => {
    assert.match(overview, /require sheepfold\.features\.logs\.panel as logPanelModel/);
    assert.match(overview, /var logPanel = logPanelModel\.create/);
    assert.match(shell, /deps\.logPanel\.setText\(values\[1\]\)/);
    assert.match(shell, /this\.renderPanel\('logs', deps\.logPanel\.render\(\)\)/);
    assert.doesNotMatch(overview, /var logViewFilters|function renderLogRows|function showLogExportModal/);

    assert.match(panel, /var filters = emptyFilters\(\)/);
    assert.match(panel, /logModel\.filterView\(entries, filters\)/);
    assert.match(panel, /visibleEntries\.slice\(\)\.reverse\(\)/);
    assert.doesNotMatch(panel, /\bfs\.|\buci\.|routerBackend|routerControl/);
  });

  it('delegates clear and download while keeping masking in the log model', () => {
    const clearCall = panel.indexOf('return deps.clear()');
    const localClear = panel.indexOf('entries = []', clearCall);

    assert.ok(clearCall >= 0 && localClear > clearCall);
    assert.match(panel, /deps\.download\([\s\S]*logModel\.maskedExport\(exportedEntries\)/);
    assert.match(panel, /logModel\.byPeriod\(entries, period/);
    assert.match(panel, /button\.disabled = true/);
    assert.match(panel, /button\.disabled = false/);
  });

  it('keeps all parent-facing filters and reset behavior', () => {
    assert.match(panel, /_\('IP address'\)/);
    assert.match(panel, /_\('MAC address'\)/);
    assert.match(panel, /_\('Device name'\)/);
    assert.match(panel, /_\('Message type'\)/);
    assert.match(panel, /'type': 'datetime-local'/);
    assert.match(panel, /filters = emptyFilters\(\)/);
    assert.match(panel, /_\('Reset filters'\)/);
  });
});
