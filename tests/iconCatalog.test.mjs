import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { relative, resolve } from 'node:path';
import { describe, it } from 'node:test';
import {
  checkGenerated,
  generatedOutputs,
  repoRoot,
  validateCatalog,
} from '../scripts/generateIconCatalog.mjs';

/* Каталог является границей владения собственной графикой Sheepfold. Тест
 * запрещает тихо вернуть SVG-пути и псевдоиконки в отдельные экраны. §iconcat1 */
const luciResources = resolve(
  repoRoot,
  'package/luci-app-sheepfold-family-internet-control/htdocs/luci-static/resources',
);
const androidSources = [
  resolve(repoRoot, 'android/app/src/main/java'),
  resolve(repoRoot, 'android-child/app/src/main/java'),
];

function projectFiles(root, extensions) {
  return readdirSync(root).flatMap((name) => {
    const path = resolve(root, name);

    if (statSync(path).isDirectory()) return projectFiles(path, extensions);
    return extensions.some((extension) => path.endsWith(extension)) ? [path] : [];
  });
}

function combinedSource(paths) {
  return paths.map((path) => readFileSync(path, 'utf8')).join('\n');
}

function normalizedPath(path) {
  return path.replaceAll('\\', '/');
}

function staticIconReferences(source) {
  const expressions = [
    /(?:sharedIcons|deps\.icons)\.named\('([^']+)'\)/g,
    /deps\.icon\('([^']+)'\)/g,
    /iconName:\s*'([^']+)'/g,
    /iconButton\([^\n]*?,\s*'([^']+)'/g,
    /sharedIcons\.button\([^\n]*?,\s*'([^']+)'/g,
  ];

  return expressions.flatMap((expression) => (
    [...source.matchAll(expression)].map((match) => match[1])
  ));
}

describe('Единый каталог значков Sheepfold', () => {
  it('имеет уникальные английские имена и реальные места использования', () => {
    const catalog = validateCatalog();
    const names = [
      ...catalog.icons.map((icon) => icon.name),
      ...(catalog.brandAssets || []).map((asset) => asset.name),
    ];

    assert.equal(new Set(names).size, names.length);
    names.forEach((name) => assert.match(name, /^[a-z][A-Za-z0-9]*$/));
  });

  it('держит LuCI, Android и визуальную страницу синхронными с catalog.json', () => {
    assert.doesNotThrow(() => checkGenerated());

    const { icons, outputs } = generatedOutputs();
    const html = readFileSync(resolve(repoRoot, 'icons/catalog.html'), 'utf8');
    const attributes = readFileSync(resolve(repoRoot, '.gitattributes'), 'utf8');

    assert.match(attributes, /^\*\.html text eol=lf$/m);
    assert.match(html, /Каталог значков Sheepfold/);
    assert.match(html, /class="icon-row"/);
    assert.match(html, /Слева показан значок, справа/);
    assert.match(html, /stroke-width="1\.25"/);
    assert.equal(outputs.size >= 5, true);
    assert.equal(icons.some((icon) => icon.name === 'actionSend'), true);
  });

  it('различает компьютер, телевизор, приставку и три сетевых типа', () => {
    const catalog = validateCatalog();
    const icons = Object.fromEntries(catalog.icons.map((icon) => [icon.name, icon]));
    const deviceTypes = readFileSync(
      resolve(
        repoRoot,
        'package/luci-app-sheepfold-family-internet-control/htdocs/luci-static/resources/sheepfold/features/devices/types.js',
      ),
      'utf8',
    );

    assert.ok(icons.deviceTypeComputer.paths.some((path) => path.includes('M19 5h4v14')));
    assert.ok(icons.deviceTypeTelevision.paths.some((path) => path === 'M8 2l4 4 4-4'));
    assert.ok(icons.deviceTypeTelevision.paths.some((path) => path === 'M3 6h18v10H3z'));
    assert.ok(icons.deviceTypeGameConsole.paths.some((path) => path === 'M5.5 13h4'));
    assert.ok(icons.deviceTypeSmartDevice.paths.some((path) => path.includes('M7 5h10')));
    assert.ok(icons.deviceTypeSmartDevice.paths.some((path) => path === 'M12 8v8'));
    assert.ok(icons.deviceTypeSmartHome.paths.some((path) => path === 'M3 11l9-8 9 8'));
    assert.ok(icons.deviceTypeSmartHome.thinPaths.some((path) => path === 'M12 9v9'));
    assert.equal(icons.deviceTypeSmartHome.paths.includes('M9 20v-6h6v6'), false);
    assert.ok(icons.deviceTypeRobotVacuum.paths.some((path) => path.includes('M12 3a9 9')));
    assert.ok(icons.deviceTypeRobotVacuum.thinPaths.some((path) => path === 'M9 5v7a3 3 0 0 0 6 0V5'));
    assert.ok(icons.deviceTypeRobotVacuum.paths.some((path) => path === 'M9 20v2h6v-2'));
    assert.equal(icons.deviceTypeSmartWatch.paths.length, 1);
    assert.equal(icons.deviceTypeSmartWatch.thinPaths.length, 2);
    assert.equal(icons.deviceTypeEngineering.paths.length, 3);
    assert.equal(icons.deviceTypeEngineering.thinPaths.length, 3);
    assert.ok(icons.deviceTypeNetwork);
    assert.equal(icons.deviceTypeNetwork.paths.length, 5);
    assert.equal(icons.deviceTypeNetwork.thinPaths.length, 5);
    assert.ok(icons.deviceTypeRouter);
    assert.ok(icons.deviceTypeNetworkSwitch);
    assert.notDeepEqual(icons.deviceTypeNetwork.paths, icons.deviceTypeRouter.paths);
    assert.notDeepEqual(icons.deviceTypeRouter.paths, icons.deviceTypeNetworkSwitch.paths);
    assert.equal(icons.deviceTypeNetworkSwitch.paths.length, 1);
    assert.ok(icons.deviceTypeNetworkSwitch.thinPaths.length > 4);
    assert.match(deviceTypes, /\['network', _\('Network device'\), 'deviceTypeNetwork'\]/);
    assert.match(deviceTypes, /\['router', _\('Router or access point'\), 'deviceTypeRouter'\]/);
    assert.match(deviceTypes, /\['network_switch', _\('Network switch'\), 'deviceTypeNetworkSwitch'\]/);
    assert.doesNotMatch(deviceTypes, /playstation\|ps4\|ps5\|xbox\|switch\|console/);
  });

  it('не допускает неизвестные статические имена значков в LuCI', () => {
    const { icons } = generatedOutputs();
    const knownNames = new Set(icons.map((icon) => icon.name));
    const files = projectFiles(luciResources, ['.js']).filter((path) => (
      !normalizedPath(path).endsWith('shared/icon-registry.js')
    ));
    const source = combinedSource(files);
    const unknownNames = staticIconReferences(source).filter((name) => !knownNames.has(name));

    assert.deepEqual(
      [...new Set(unknownNames)],
      [],
      `Неизвестные имена значков: ${[...new Set(unknownNames)].join(', ')}`,
    );
  });

  it('не хранит собственную SVG-геометрию и символы действий в feature-экранах', () => {
    const luciFiles = projectFiles(luciResources, ['.js']).filter((path) => (
      !normalizedPath(path).endsWith('shared/icons.js') &&
      !normalizedPath(path).endsWith('shared/icon-registry.js')
    ));
    const luciSource = combinedSource(luciFiles);
    const androidSource = combinedSource(androidSources.flatMap((root) => projectFiles(root, ['.kt'])));

    assert.doesNotMatch(luciSource, /createElementNS\([^)]*['"]svg['"]/);
    assert.doesNotMatch(luciSource, /[⚙⧉↻×]/);
    assert.doesNotMatch(androidSource, /[⚙⧉↻×]/);
    assert.doesNotMatch(androidSource, /androidx\.compose\.material\.icons/);
  });

  it('помогает найти источник любого сгенерированного файла', () => {
    const { outputs } = generatedOutputs();
    const generatedPaths = [...outputs.keys()].map((path) => relative(repoRoot, path).replaceAll('\\', '/'));

    assert.ok(generatedPaths.includes(
      'package/luci-app-sheepfold-family-internet-control/htdocs/luci-static/resources/sheepfold/shared/icon-registry.js',
    ));
    assert.ok(generatedPaths.includes('android/app/src/main/res/drawable/ic_refresh.xml'));
    assert.ok(generatedPaths.includes('android/app/src/main/res/drawable/ic_delete.xml'));
    assert.ok(generatedPaths.includes('android-child/app/src/main/res/drawable/ic_send.xml'));
  });
});
