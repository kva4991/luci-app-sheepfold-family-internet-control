/*
 * Проверяет, что советник blast radius не пропускает общие API/UCI/firewall
 * границы и не требует полного product suite от одной ADR-правки. Он не доказывает
 * полноту карты для будущих путей: неизвестные файлы специально остаются видимыми. §impact1 §testwhy
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { formatImpact, inspectChanges, parseNameStatus } from '../scripts/inspectChangeImpact.mjs';
import { recommendedCommands } from '../tools/quality/changeImpact.mjs';

describe('change impact advisor §impact1', () => {
  it('maps a shared API change to backend, Android, security and a full run', () => {
    const report = inspectChanges([
      'package/luci-app-sheepfold-family-internet-control/root/www/cgi-bin/sheepfold-api',
    ]);
    assert.deepEqual(report.categories, ['android', 'backendFast', 'security']);
    assert.equal(report.fullTest, true);
    assert.equal(report.risk, 'critical');
    assert.match(formatImpact(report), /npm\.cmd test/);
    assert.ok(recommendedCommands(report).manual.includes('npm.cmd run router:readOnly'));
  });

  it('combines overlapping device frontend and access areas without duplicate categories', () => {
    const report = inspectChanges([
      'package/luci-app-sheepfold-family-internet-control/htdocs/luci-static/resources/sheepfold/features/devices/editor.js',
    ]);
    assert.deepEqual(report.categories, ['access', 'devices', 'luci', 'security']);
    assert.equal(new Set(report.categories).size, report.categories.length);
  });

  it('keeps presentation-only device files out of identity and access tests', () => {
    const report = inspectChanges([
      'package/luci-app-sheepfold-family-internet-control/htdocs/luci-static/resources/sheepfold/features/devices/table.js',
      'package/luci-app-sheepfold-family-internet-control/htdocs/luci-static/resources/sheepfold/features/devices/responsive.css',
    ]);
    assert.deepEqual(report.categories, ['luci']);
    assert.deepEqual(report.areas.map((area) => area.name), ['LuCI frontend', 'Таблица устройств в LuCI']);
  });

  it('narrows a proven release-only Makefile change but keeps an unknown Makefile edit conservative', () => {
    const release = inspectChanges([{
      status: 'M',
      path: 'package/luci-app-sheepfold-family-internet-control/Makefile',
      kind: 'packageReleaseOnly',
    }]);
    assert.deepEqual(release.categories, ['packaging', 'tooling']);
    assert.equal(release.fullTest, true);

    const general = inspectChanges(['package/luci-app-sheepfold-family-internet-control/Makefile']);
    assert.ok(general.categories.includes('security'));
  });

  it('keeps an ADR-only edit lightweight and reports unknown paths explicitly', () => {
    const docs = inspectChanges(['docs/architecture/decisions/0001-product-variants.ru.md']);
    assert.deepEqual(docs.categories, ['tooling']);
    assert.equal(docs.fullTest, false);

    const unknown = inspectChanges(['experimental/unknown.file']);
    assert.deepEqual(unknown.unknown, ['experimental/unknown.file']);
    assert.deepEqual(unknown.categories, []);
    assert.equal(unknown.risk, 'medium');
  });

  it('recognizes repository entry points instead of reporting avoidable unknown paths', () => {
    const report = inspectChanges(['package.json', 'docs/developer-task.ru.md']);
    assert.deepEqual(report.categories, ['tooling']);
    assert.deepEqual(report.unknown, []);
  });

  it('keeps both sides of a rename and runs an edited test directly', () => {
    const parsed = parseNameStatus('R100\0package/app/htdocs/luci-static/resources/features/devices/old.js\0archive/old.js\0M\0tests/changeImpact.test.mjs\0');
    assert.deepEqual(parsed[0], {
      status: 'R',
      previousPath: 'package/app/htdocs/luci-static/resources/features/devices/old.js',
      path: 'archive/old.js',
    });
    const report = inspectChanges(parsed);
    assert.ok(report.areas.some((area) => area.name === 'Устройства и их паспорт'));
    assert.deepEqual(report.directTests, ['changeImpact.test.mjs']);
  });
});
