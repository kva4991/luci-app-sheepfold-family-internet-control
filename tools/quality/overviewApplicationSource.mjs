import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';

/* §ovfinal1
 * Source-contract tests used to read the monolithic overview.js. The public file
 * is now only a stable bootstrap, so tests need the actual implementation graph.
 * This helper follows local Sheepfold LuCI requires recursively and concatenates
 * the real source files. It does not synthesize compatibility functions or copy
 * production logic into tests: assertions still inspect the exact shipped code.
 */
export function overviewApplicationPath(overviewPath) {
  const absoluteOverview = resolve(overviewPath);
  const resources = dirname(dirname(dirname(absoluteOverview)));
  return join(resources, 'sheepfold', 'features', 'overview', 'application.js');
}

function resourcesRoot(overviewPath) {
  return dirname(dirname(dirname(resolve(overviewPath))));
}

function localModulePath(resources, moduleName) {
  if (moduleName.startsWith('sheepfold.'))
    return join(resources, 'sheepfold', ...moduleName.slice('sheepfold.'.length).split('.')) + '.js';
  if (moduleName.startsWith('view.'))
    return join(resources, 'view', ...moduleName.slice('view.'.length).split('.')) + '.js';
  return null;
}

function localRequires(source) {
  return [...String(source || '').matchAll(/^'require\s+([^'\s]+)(?:\s+as\s+[^']+)?';/gm)]
    .map((match) => match[1]);
}

export function overviewImplementationPaths(overviewPath) {
  const resources = resourcesRoot(overviewPath);
  const entry = overviewApplicationPath(overviewPath);
  const seen = new Set();
  const ordered = [];

  function visit(path) {
    const absolute = resolve(path);
    if (seen.has(absolute) || !existsSync(absolute)) return;
    seen.add(absolute);
    const source = readFileSync(absolute, 'utf8');
    ordered.push(absolute);
    for (const dependency of localRequires(source)) {
      const dependencyPath = localModulePath(resources, dependency);
      if (dependencyPath) visit(dependencyPath);
    }
  }

  visit(entry);
  return ordered;
}

export function readOverviewApplication(overviewPath) {
  const resources = resourcesRoot(overviewPath);
  return overviewImplementationPaths(overviewPath).map((path) => {
    const name = relative(resources, path).replaceAll('\\', '/');
    return `\n/* SOURCE: ${name} */\n${readFileSync(path, 'utf8').trimEnd()}\n`;
  }).join('');
}
