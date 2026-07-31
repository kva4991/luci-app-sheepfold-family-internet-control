/*
 * Генерирует все машинные представления значков из icons/catalog.json.
 * Один источник нужен, чтобы LuCI, Android и страница разработчика не расходились
 * после локальной правки SVG. §iconcat1
 */
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const catalogPath = resolve(repoRoot, 'icons/catalog.json');
export const registryPath = resolve(
  repoRoot,
  'package/luci-app-sheepfold-family-internet-control/htdocs/luci-static/resources/sheepfold/shared/icon-registry.js',
);
export const htmlPath = resolve(repoRoot, 'icons/catalog.html');

function normalizedPath(path) {
  return String(path || '').replaceAll('\\', '/');
}

function htmlEscape(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function readCatalog() {
  return JSON.parse(readFileSync(catalogPath, 'utf8'));
}

function resolveIcons(catalog) {
  const sourceByName = new Map(catalog.icons.map((icon) => [icon.name, icon]));
  const resolvedByName = new Map();

  function resolveIcon(name, stack = []) {
    const source = sourceByName.get(name);
    if (!source) throw new Error(`Unknown inherited icon: ${name}`);
    if (resolvedByName.has(name)) return resolvedByName.get(name);
    if (stack.includes(name)) throw new Error(`Circular icon inheritance: ${[...stack, name].join(' -> ')}`);

    const parent = source.extends ? resolveIcon(source.extends, [...stack, name]) : null;
    const resolved = {
      ...source,
      viewBox: source.viewBox || parent?.viewBox || '0 0 24 24',
      paths: [
        ...(parent?.paths || []),
        ...(source.paths || []),
        ...(source.appendPaths || []),
      ],
      thinPaths: [
        ...(parent?.thinPaths || []),
        ...(source.thinPaths || []),
        ...(source.appendThinPaths || []),
      ],
    };
    delete resolved.extends;
    delete resolved.appendPaths;
    delete resolved.appendThinPaths;
    resolvedByName.set(name, resolved);
    return resolved;
  }

  return catalog.icons.map((icon) => resolveIcon(icon.name));
}

export function validateCatalog(catalog = readCatalog()) {
  const errors = [];
  const names = new Set();
  const allEntries = [...(catalog.icons || []), ...(catalog.brandAssets || [])];

  if (catalog.schemaVersion !== 1) errors.push('schemaVersion must equal 1');
  for (const entry of allEntries) {
    if (!/^[a-z][A-Za-z0-9]*$/.test(entry.name || ''))
      errors.push(`Icon name must be English camelCase: ${entry.name || '<empty>'}`);
    if (names.has(entry.name)) errors.push(`Duplicate icon name: ${entry.name}`);
    names.add(entry.name);
    if (!entry.category) errors.push(`Missing category: ${entry.name}`);
    if (!entry.title) errors.push(`Missing title: ${entry.name}`);
    if (!Array.isArray(entry.uses) || entry.uses.length === 0)
      errors.push(`Missing usage list: ${entry.name}`);
    for (const usage of entry.uses || []) {
      if (!usage.place) errors.push(`Missing usage description: ${entry.name}`);
      for (const file of usage.files || []) {
        if (!existsSync(resolve(repoRoot, file)))
          errors.push(`Usage path does not exist for ${entry.name}: ${file}`);
      }
    }
  }
  for (const icon of catalog.icons || []) {
    if (icon.extends && !names.has(icon.extends))
      errors.push(`Unknown parent ${icon.extends} for ${icon.name}`);
    if (!icon.extends && (!Array.isArray(icon.paths) || icon.paths.length === 0))
      errors.push(`Missing SVG paths: ${icon.name}`);
  }
  if (!names.has(catalog.fallbackIcon))
    errors.push(`Unknown fallbackIcon: ${catalog.fallbackIcon}`);

  resolveIcons(catalog);
  if (errors.length) throw new Error(errors.join('\n'));
  return catalog;
}

function registrySource(catalog, icons) {
  const definitions = Object.fromEntries(icons.map((icon) => [
    icon.name,
    { viewBox: icon.viewBox, paths: icon.paths, thinPaths: icon.thinPaths },
  ]));

  return `'use strict';
'require baseclass';

/* Generated from icons/catalog.json by npm run icons:generate. Do not edit manually. §iconcat1 */
var definitions = ${JSON.stringify(definitions, null, '\t')};
var fallbackName = ${JSON.stringify(catalog.fallbackIcon)};

function get(name) {
\treturn definitions[name] || definitions[fallbackName];
}

function names() {
\treturn Object.keys(definitions);
}

return baseclass.extend({
\tget: get,
\tnames: names
});
`;
}

function svgMarkup(icon) {
  const paths = icon.paths.map((path) => `<path d="${htmlEscape(path)}"></path>`).join('');
  const thinPaths = icon.thinPaths.map((path) => (
    `<path d="${htmlEscape(path)}" stroke-width="1.25"></path>`
  )).join('');
  return `<svg viewBox="${htmlEscape(icon.viewBox)}" aria-hidden="true">${paths}${thinPaths}</svg>`;
}

function usageMarkup(entry) {
  return entry.uses.map((usage) => {
    const files = (usage.files || []).map((file) => (
      `<a href="../${htmlEscape(normalizedPath(file))}">${htmlEscape(normalizedPath(file))}</a>`
    )).join('');
    return `<li><span>${htmlEscape(usage.place)}</span><div class="files">${files}</div></li>`;
  }).join('');
}

function vectorRow(icon) {
  return `<article class="icon-row" data-search="${htmlEscape(
    `${icon.name} ${icon.title} ${icon.category} ${icon.uses.map((usage) => usage.place).join(' ')}`.toLowerCase(),
  )}">
  <div class="preview" style="color:${htmlEscape(icon.color || '#24343b')}">${svgMarkup(icon)}</div>
  <div class="details">
    <div class="title-line"><code>${htmlEscape(icon.name)}</code><span>${htmlEscape(icon.title)}</span></div>
    <ul>${usageMarkup(icon)}</ul>
  </div>
</article>`;
}

function brandRow(asset) {
  return `<article class="icon-row brand-row" data-search="${htmlEscape(
    `${asset.name} ${asset.title} ${asset.category} ${asset.uses.map((usage) => usage.place).join(' ')}`.toLowerCase(),
  )}">
  <div class="preview raster"><img src="../${htmlEscape(normalizedPath(asset.source))}" alt=""></div>
  <div class="details">
    <div class="title-line"><code>${htmlEscape(asset.name)}</code><span>${htmlEscape(asset.title)}</span></div>
    <ul>${usageMarkup(asset)}</ul>
    <a class="source" href="../${htmlEscape(normalizedPath(asset.source))}">Источник: ${htmlEscape(normalizedPath(asset.source))}</a>
  </div>
</article>`;
}

function htmlSource(catalog, icons) {
  const entries = [...icons, ...(catalog.brandAssets || [])];
  const categories = [...new Set(entries.map((entry) => entry.category))];
  const sections = categories.map((category) => {
    const vectorRows = icons.filter((icon) => icon.category === category).map(vectorRow).join('\n');
    const brandRows = (catalog.brandAssets || []).filter((asset) => asset.category === category).map(brandRow).join('\n');
    return `<section class="catalog-section">
  <h2>${htmlEscape(category)}</h2>
  <div class="rows">${vectorRows}${brandRows}</div>
</section>`;
  }).join('\n');

  return `<!doctype html>
<html lang="ru">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Каталог значков Sheepfold</title>
  <style>
    :root { color-scheme: light dark; font-family: Inter, Segoe UI, Arial, sans-serif; }
    * { box-sizing: border-box; }
    body { margin: 0; background: #f4f7f6; color: #17211f; }
    header { border-bottom: 4px solid #24343b; background: #bdd7ce; padding: 24px max(20px, calc((100vw - 1120px) / 2)); }
    h1 { margin: 0 0 8px; font-size: 30px; letter-spacing: 0; }
    header p { margin: 0; max-width: 760px; line-height: 1.5; }
    .toolbar { max-width: 1120px; margin: 20px auto 0; padding: 0 20px; }
    .toolbar label { display: block; font-weight: 700; margin-bottom: 7px; }
    .toolbar input { width: min(100%, 560px); min-height: 44px; padding: 9px 12px; border: 2px solid #6f817b; border-radius: 4px; background: #fff; color: #17211f; font: inherit; }
    main { max-width: 1120px; margin: 0 auto; padding: 8px 20px 44px; }
    h2 { margin: 28px 0 0; padding: 11px 0; border-bottom: 3px solid #7e9890; font-size: 21px; letter-spacing: 0; }
    .icon-row { display: grid; grid-template-columns: 116px minmax(0, 1fr); min-height: 132px; border-bottom: 1px solid #c6d2ce; }
    .preview { display: grid; place-items: center; padding: 22px; border-right: 1px solid #c6d2ce; }
    .preview svg { width: 68px; height: 68px; fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }
    .preview.raster img { display: block; width: 82px; height: 82px; object-fit: contain; }
    .details { min-width: 0; padding: 18px 20px; }
    .title-line { display: flex; align-items: baseline; gap: 14px; flex-wrap: wrap; }
    code { color: #005f50; background: #e4efeb; border: 1px solid #b7c9c3; border-radius: 3px; padding: 3px 7px; font: 700 15px Consolas, monospace; }
    .title-line span { font-weight: 700; }
    ul { margin: 12px 0 0; padding-left: 20px; }
    li + li { margin-top: 10px; }
    .files { display: flex; flex-direction: column; gap: 3px; margin-top: 4px; }
    a { color: #075fa3; overflow-wrap: anywhere; }
    .source { display: inline-block; margin-top: 10px; }
    .icon-row[hidden], .catalog-section[hidden] { display: none; }
    @media (prefers-color-scheme: dark) {
      body { background: #111715; color: #eef5f2; }
      header { background: #34534a; border-bottom-color: #9fc6b9; }
      .toolbar input { background: #19221f; color: #eef5f2; border-color: #829a92; }
      h2 { border-bottom-color: #78958b; }
      .icon-row, .preview { border-color: #3b4944; }
      code { color: #b5efdc; background: #21372f; border-color: #416156; }
      a { color: #8ec8ff; }
    }
    @media (max-width: 620px) {
      h1 { font-size: 25px; }
      .icon-row { grid-template-columns: 82px minmax(0, 1fr); }
      .preview { padding: 13px; }
      .preview svg { width: 50px; height: 50px; }
      .preview.raster img { width: 58px; height: 58px; }
      .details { padding: 15px 14px; }
    }
  </style>
</head>
<body>
  <header>
    <h1>Каталог значков Sheepfold</h1>
    <p>${icons.length} SVG-значков и ${(catalog.brandAssets || []).length} фирменных изображения. Слева показан значок, справа — его уникальное английское имя и все места использования.</p>
  </header>
  <div class="toolbar">
    <label for="icon-search">Поиск по имени или месту использования</label>
    <input id="icon-search" type="search" autocomplete="off" placeholder="Например: deviceTypeCamera или расписание">
  </div>
  <main>${sections}</main>
  <script>
    const search = document.getElementById('icon-search');
    search.addEventListener('input', () => {
      const query = search.value.trim().toLowerCase();
      document.querySelectorAll('.catalog-section').forEach((section) => {
        let visible = 0;
        section.querySelectorAll('.icon-row').forEach((row) => {
          row.hidden = query && !row.dataset.search.includes(query);
          if (!row.hidden) visible += 1;
        });
        section.hidden = visible === 0;
      });
    });
  </script>
</body>
</html>
`;
}

function androidVectorSource(icon) {
  const mainPath = `    <path
        android:fillColor="@android:color/transparent"
        android:pathData="${icon.paths.join(' ')}"
        android:strokeColor="#FF000000"
        android:strokeLineCap="round"
        android:strokeLineJoin="round"
        android:strokeWidth="2" />`;
  const thinPath = icon.thinPaths.length === 0 ? '' : `
    <path
        android:fillColor="@android:color/transparent"
        android:pathData="${icon.thinPaths.join(' ')}"
        android:strokeColor="#FF000000"
        android:strokeLineCap="round"
        android:strokeLineJoin="round"
        android:strokeWidth="1.25" />`;

  return `<?xml version="1.0" encoding="utf-8"?>
<vector xmlns:android="http://schemas.android.com/apk/res/android"
    android:width="24dp"
    android:height="24dp"
    android:viewportWidth="24"
    android:viewportHeight="24">
${mainPath}${thinPath}
</vector>
`;
}

export function generatedOutputs(catalog = validateCatalog()) {
  const icons = resolveIcons(catalog);
  const outputs = new Map([
    [registryPath, registrySource(catalog, icons)],
    [htmlPath, htmlSource(catalog, icons)],
  ]);

  for (const icon of icons) {
    if (icon.androidVector)
      outputs.set(resolve(repoRoot, icon.androidVector), androidVectorSource(icon));
  }
  return { catalog, icons, outputs };
}

export function checkGenerated() {
  const { catalog, outputs } = generatedOutputs();
  const errors = [];

  for (const [path, content] of outputs) {
    if (!existsSync(path) || readFileSync(path, 'utf8') !== content)
      errors.push(`Generated icon file is stale: ${normalizedPath(relative(repoRoot, path))}`);
  }
  for (const asset of catalog.brandAssets || []) {
    for (const copy of asset.copies || []) {
      const source = readFileSync(resolve(repoRoot, asset.source));
      const targetPath = resolve(repoRoot, copy);
      if (!existsSync(targetPath) || !source.equals(readFileSync(targetPath)))
        errors.push(`Brand asset copy is stale: ${copy}`);
    }
  }
  if (errors.length) throw new Error(`${errors.join('\n')}\nRun: npm run icons:generate`);
}

export function generate() {
  const { catalog, outputs } = generatedOutputs();
  for (const [path, content] of outputs) {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, content, 'utf8');
  }
  for (const asset of catalog.brandAssets || []) {
    for (const copy of asset.copies || []) {
      const targetPath = resolve(repoRoot, copy);
      mkdirSync(dirname(targetPath), { recursive: true });
      copyFileSync(resolve(repoRoot, asset.source), targetPath);
    }
  }
}

export function main(args = process.argv.slice(2)) {
  if (args.includes('--check')) checkGenerated();
  else generate();
}

const isDirect = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isDirect) {
  try {
    main();
    console.log(process.argv.includes('--check') ? 'Icon catalog is up to date.' : 'Icon catalog generated.');
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
