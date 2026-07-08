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
const cssPath = resolve(
  repoRoot,
  'package/luci-app-sheepfold-family-internet-control/htdocs/luci-static/resources/sheepfold/sheepfold-personal-groups.css',
);

describe('Интерфейс автоопределения устройств', () => {
  it('показывает доказательства и безопасную команду повторного определения', () => {
    const source = readFileSync(viewPath, 'utf8');

    assert.match(source, /балл автодоверия/);
    assert.match(source, /автоматическое доверие запрещено/);
    assert.match(source, /DHCP-отпечаток/);
    assert.match(source, /mDNS\/DNS-SD/);
    assert.match(source, /device-reclassify/);
    assert.match(source, /manual_device_type/);
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
    assert.match(source, /Онлайн: сейчас \(в последние 15 мин\)/);
    assert.match(source, /Онлайн: был/);
    assert.match(source, /sf-online-badge-row/);
    assert.match(source, /sf-device-presence-modal-status/);
  });

  it('сортирует сначала онлайн, затем IP по возрастанию', () => {
    const source = readFileSync(viewPath, 'utf8');

    assert.match(source, /function sortDeviceRowsByPresence/);
    assert.match(source, /return rightOnline - leftOnline/);
    assert.match(source, /rowIpSortValue\(left\.row\) - rowIpSortValue\(right\.row\)/);
  });

  it('имеет отдельное оформление диагностики и онлайн-статуса', () => {
    const source = readFileSync(cssPath, 'utf8');

    assert.match(source, /\.sf-detection-evidence/);
    assert.match(source, /\.sf-device-reclassify/);
    assert.match(source, /\.sf-online-badge/);
    assert.match(source, /background:\s*#dff3ff/);
    assert.match(source, /color:\s*#111/);
  });
});
