import assert from 'node:assert/strict';
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { resolve, relative } from 'node:path';
import { describe, it } from 'node:test';

const repo = process.cwd();
const pkg = resolve(repo, 'package/luci-app-sheepfold-family-internet-control');
const resources = resolve(pkg, 'htdocs/luci-static/resources');
const read = (path) => readFileSync(resolve(repo, path), 'utf8');
const originalModules = new Set([
  'sheepfold.core.security.random', 'sheepfold.features.administrators.model',
  'sheepfold.features.administrators.view', 'sheepfold.features.devices.access-lists',
  'sheepfold.features.devices.inventory', 'sheepfold.features.devices.selection',
  'sheepfold.features.devices.table', 'sheepfold.features.devices.types',
  'sheepfold.features.emergency.sites', 'sheepfold.features.groups.model',
  'sheepfold.features.integrations.panel', 'sheepfold.features.logs.panel',
  'sheepfold.features.messenger.settings', 'sheepfold.features.pairing.qr',
  'sheepfold.features.router.info', 'sheepfold.features.router.maintenance',
  'sheepfold.features.schedules.model', 'sheepfold.features.settings.backup',
  'sheepfold.features.settings.draft', 'sheepfold.features.sites.status',
  'sheepfold.features.storage.panel', 'sheepfold.features.wifi.cards',
  'sheepfold.features.wifi.payload', 'sheepfold.i18n',
  'sheepfold.shared.downloads', 'sheepfold.shared.forms',
]);

function walk(path) {
  const result = [];
  for (const name of readdirSync(path)) {
    const entry = resolve(path, name);
    if (statSync(entry).isDirectory()) result.push(...walk(entry));
    else result.push(entry);
  }
  return result;
}

function executableSource(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
}

function requiredPath(name) {
  if (name.startsWith('sheepfold.'))
    return resolve(resources, 'sheepfold', name.slice('sheepfold.'.length).replaceAll('.', '/') + '.js');
  if (name.startsWith('view.'))
    return resolve(resources, name.replaceAll('.', '/') + '.js');
  return null;
}

describe('final overview architecture audit §ovaudit3', () => {
  it('keeps overview.js as the stable four-line bootstrap', () => {
    const overview = read('package/luci-app-sheepfold-family-internet-control/htdocs/luci-static/resources/view/sheepfold/overview.js');
    assert.deepEqual(overview.trimEnd().split(/\r?\n/), [
      "'use strict';",
      "'require sheepfold.features.overview.application as overviewApplication';",
      '',
      'return overviewApplication;',
    ]);
  });

  it('ships every new local require and recognizes only original repository modules as external to the overlay', () => {
    const missing = [];
    for (const file of walk(resources).filter((path) => path.endsWith('.js'))) {
      const source = readFileSync(file, 'utf8');
      for (const match of source.matchAll(/^'require ([^' ]+)(?: as [^']+)?';/gm)) {
        const target = requiredPath(match[1]);
        if (target && !existsSync(target) && !originalModules.has(match[1]))
          missing.push(`${relative(repo, file)} -> ${match[1]}`);
      }
    }
    assert.deepEqual(missing, []);
  });

  it('uses one audited UCI boundary and no argument-bearing uci.save calls', () => {
    const files = walk(resources).filter((path) => path.endsWith('.js'));
    const violations = [];
    for (const file of files) {
      const source = executableSource(readFileSync(file, 'utf8'));
      if (/\b(?:deps\.)?uci\.save\s*\(\s*[^\s)]/.test(source)) violations.push(relative(repo, file));
      if (/ui\.changes\.apply\s*\(/.test(source)) violations.push(relative(repo, file));
    }
    assert.deepEqual(violations, []);
    const persistence = read('package/luci-app-sheepfold-family-internet-control/htdocs/luci-static/resources/sheepfold/core/persistence/uci.js');
    assert.match(persistence, /function mutate\(configs, stage\)/);
    assert.match(persistence, /deps\.uci\.save\(\)/);
    assert.match(persistence, /deps\.uci\.callApply\(timeout, true\)/);
    assert.match(persistence, /deps\.uci\.callConfirm\(\)/);
    assert.doesNotMatch(persistence, /return Promise\.resolve\(deps\.uci\.apply\(\)\)/);
    assert.match(persistence, /uci_concurrent_local_changes/);
    assert.match(persistence, /uci_unapplied_changes/);
  });

  it('keeps presentation and controller owners below the agreed 700-line ceiling', () => {
    const roots = [
      resolve(resources, 'sheepfold/features'),
      resolve(resources, 'sheepfold/core'),
    ];
    const oversized = [];
    for (const root of roots) {
      for (const file of walk(root).filter((path) => path.endsWith('.js'))) {
        const lines = readFileSync(file, 'utf8').split(/\r?\n/).length;
        if (lines > 700) oversized.push(`${relative(repo, file)}:${lines}`);
      }
    }
    assert.deepEqual(oversized, []);
  });

  it('removes all AI-only activity-log identifiers from the Standard device persistence build', () => {
    const source = read('package/luci-app-sheepfold-family-internet-control/htdocs/luci-static/resources/sheepfold/features/devices/persistence.js');
    const standard = source.replace(/\/\* SHEEPFOLD_AI_BEGIN \*\/[\s\S]*?\/\* SHEEPFOLD_AI_END \*\//g, '');
    assert.doesNotMatch(standard, /activityLogEnabled|activity_log_enabled/);
  });

  it('documents the post-audit defects, fixes, rationale and validation limits', () => {
    const doc = read('docs/chatgpt-final-overview-refactoring.ru.md');
    for (const marker of [
      'Повторный аудит', 'Корневая причина', 'Почему предыдущая проверка пропустила',
      'Как исправлено', 'Регрессионная проверка', 'Ограничения доказательств',
      'uci.save()', 'overview-secure.js', 'частично применён',
    ]) assert.match(doc, new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  });
});
