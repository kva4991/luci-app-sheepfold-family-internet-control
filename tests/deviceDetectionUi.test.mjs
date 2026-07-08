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

  it('имеет отдельное оформление диагностической строки и кнопки', () => {
    const source = readFileSync(cssPath, 'utf8');

    assert.match(source, /\.sf-detection-evidence/);
    assert.match(source, /\.sf-device-reclassify/);
  });
});
