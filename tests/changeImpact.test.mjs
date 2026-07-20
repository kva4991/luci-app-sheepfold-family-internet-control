/*
 * Проверяет, что советник blast radius не пропускает общие API/UCI/firewall
 * границы и не требует полного product suite от одной ADR-правки. Он не доказывает
 * полноту карты для будущих путей: неизвестные файлы специально остаются видимыми. §impact1 §testwhy
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { formatImpact, inspectChanges } from '../scripts/inspectChangeImpact.mjs';

describe('change impact advisor §impact1', () => {
  it('maps a shared API change to backend, Android, security and a full run', () => {
    const report = inspectChanges([
      'package/luci-app-sheepfold-family-internet-control/root/www/cgi-bin/sheepfold-api',
    ]);
    assert.deepEqual(report.categories, ['android', 'backendFast', 'security']);
    assert.equal(report.fullTest, true);
    assert.match(formatImpact(report), /npm\.cmd test/);
  });

  it('combines overlapping device frontend and access areas without duplicate categories', () => {
    const report = inspectChanges([
      'package/luci-app-sheepfold-family-internet-control/htdocs/luci-static/resources/sheepfold/features/devices/editor.js',
    ]);
    assert.deepEqual(report.categories, ['access', 'devices', 'luci', 'security']);
    assert.equal(new Set(report.categories).size, report.categories.length);
  });

  it('keeps an ADR-only edit lightweight and reports unknown paths explicitly', () => {
    const docs = inspectChanges(['docs/architecture/decisions/0001-product-variants.ru.md']);
    assert.deepEqual(docs.categories, ['tooling']);
    assert.equal(docs.fullTest, false);

    const unknown = inspectChanges(['experimental/unknown.file']);
    assert.deepEqual(unknown.unknown, ['experimental/unknown.file']);
    assert.deepEqual(unknown.categories, []);
  });

  it('recognizes repository entry points instead of reporting avoidable unknown paths', () => {
    const report = inspectChanges(['package.json', 'docs/developer-task.ru.md']);
    assert.deepEqual(report.categories, ['tooling']);
    assert.deepEqual(report.unknown, []);
  });
});
