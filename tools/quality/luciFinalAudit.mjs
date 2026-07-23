#!/usr/bin/env node
/*
 * Final structural audit for the Sheepfold LuCI overview graph. The tool is
 * intentionally dependency-free so it can run in the repository quality gate.
 * It validates local require resolution, critical create(deps) contracts, UCI
 * API call arity, the overview bootstrap, owner size, and Standard AI stripping.
 */
import { existsSync, readFileSync, readdirSync, statSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const toolDir = dirname(fileURLToPath(import.meta.url));
const defaultRoot = resolve(toolDir, '..', '..');
const args = process.argv.slice(2);
const rootArg = args.find((arg) => !arg.startsWith('--'));
const repo = resolve(rootArg || defaultRoot);
const allowOverlayMissing = args.includes('--allow-overlay-missing');
const jsonOnly = args.includes('--json');
const packageRoot = resolve(repo, 'package/luci-app-sheepfold-family-internet-control');
const resources = resolve(packageRoot, 'htdocs/luci-static/resources');
const errors = [];
const warnings = [];
const stats = {
  filesChecked: 0,
  localRequires: 0,
  createContracts: 0,
  uciCalls: 0,
  standardFiles: 0,
};

const overlayOriginalModules = new Set([
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
  if (!existsSync(path)) return [];
  const out = [];
  for (const name of readdirSync(path)) {
    const entry = resolve(path, name);
    if (statSync(entry).isDirectory()) out.push(...walk(entry));
    else out.push(entry);
  }
  return out;
}

function read(path) { return readFileSync(path, 'utf8'); }
function rel(path) { return relative(repo, path).replaceAll('\\', '/'); }
function addError(code, message, path = '') { errors.push({ code, path, message }); }
function addWarning(code, message, path = '') { warnings.push({ code, path, message }); }

function localModulePath(name) {
  if (name.startsWith('sheepfold.'))
    return resolve(resources, 'sheepfold', name.slice('sheepfold.'.length).replaceAll('.', '/') + '.js');
  if (name.startsWith('view.'))
    return resolve(resources, name.replaceAll('.', '/') + '.js');
  return null;
}

function requireAliases(source) {
  const map = new Map();
  for (const match of source.matchAll(/^'require ([^' ]+)(?: as ([^']+))?';/gm)) {
    const moduleName = match[1];
    const alias = match[2] || moduleName.split('.').at(-1);
    map.set(alias, moduleName);
  }
  return map;
}

function codeMask(source) {
  // Preserve code characters and line structure while blanking comments and
  // quoted/template contents. This is sufficient for call and token scanning.
  let out = '';
  let i = 0;
  let state = 'code';
  let quote = '';
  let templateDepth = 0;
  while (i < source.length) {
    const ch = source[i];
    const next = source[i + 1];
    if (state === 'line') {
      if (ch === '\n') { out += '\n'; state = 'code'; } else out += ' ';
      i += 1; continue;
    }
    if (state === 'block') {
      if (ch === '*' && next === '/') { out += '  '; i += 2; state = 'code'; }
      else { out += ch === '\n' ? '\n' : ' '; i += 1; }
      continue;
    }
    if (state === 'string') {
      if (ch === '\\') { out += ' '; if (i + 1 < source.length) out += source[i + 1] === '\n' ? '\n' : ' '; i += 2; continue; }
      if (ch === quote) { out += ' '; state = 'code'; i += 1; continue; }
      out += ch === '\n' ? '\n' : ' '; i += 1; continue;
    }
    if (state === 'template') {
      if (ch === '\\') { out += ' '; if (i + 1 < source.length) out += source[i + 1] === '\n' ? '\n' : ' '; i += 2; continue; }
      if (ch === '`' && templateDepth === 0) { out += ' '; state = 'code'; i += 1; continue; }
      if (ch === '$' && next === '{') { out += '${'; templateDepth += 1; i += 2; continue; }
      if (ch === '}' && templateDepth > 0) { out += '}'; templateDepth -= 1; i += 1; continue; }
      out += templateDepth > 0 ? ch : (ch === '\n' ? '\n' : ' '); i += 1; continue;
    }
    if (ch === '/' && next === '/') { out += '  '; i += 2; state = 'line'; continue; }
    if (ch === '/' && next === '*') { out += '  '; i += 2; state = 'block'; continue; }
    if (ch === '"' || ch === "'") { quote = ch; out += 'x'; state = 'string'; i += 1; continue; }
    if (ch === '`') { out += 'x'; state = 'template'; templateDepth = 0; i += 1; continue; }
    out += ch; i += 1;
  }
  return out;
}

function skipSpace(mask, index) {
  while (index < mask.length && /\s/.test(mask[index])) index += 1;
  return index;
}

function matchingClose(mask, openIndex, open = '(', close = ')') {
  let depth = 0;
  for (let i = openIndex; i < mask.length; i += 1) {
    if (mask[i] === open) depth += 1;
    else if (mask[i] === close) {
      depth -= 1;
      if (depth === 0) return i;
    }
  }
  return -1;
}

function argumentCount(mask, openIndex) {
  const close = matchingClose(mask, openIndex);
  if (close < 0) return null;
  let paren = 0, brace = 0, bracket = 0, commas = 0, nonSpace = false;
  for (let i = openIndex + 1; i < close; i += 1) {
    const ch = mask[i];
    if (ch === '(') paren += 1;
    else if (ch === ')') paren -= 1;
    else if (ch === '{') brace += 1;
    else if (ch === '}') brace -= 1;
    else if (ch === '[') bracket += 1;
    else if (ch === ']') bracket -= 1;
    else if (ch === ',' && paren === 0 && brace === 0 && bracket === 0) commas += 1;
    if (!/\s/.test(ch)) nonSpace = true;
  }
  return nonSpace ? commas + 1 : 0;
}

function scanUciCalls(file, source) {
  const mask = codeMask(source);
  const callPattern = /\b(?:(?:deps\.)?uci)\.(save|apply|callApply|callConfirm|add|set|unset|remove|load|unload|sections|get|changes)\s*\(/g;
  const allowed = {
    save: new Set([0]), apply: new Set([0]), callApply: new Set([2]), callConfirm: new Set([0]),
    add: new Set([2, 3]), set: new Set([4]), unset: new Set([3]), remove: new Set([2]),
    load: new Set([1]), unload: new Set([1]), sections: new Set([1, 2, 3]),
    get: new Set([2, 3]), changes: new Set([0]),
  };
  let match;
  while ((match = callPattern.exec(mask))) {
    const open = mask.indexOf('(', match.index);
    const count = argumentCount(mask, open);
    stats.uciCalls += 1;
    if (count == null || !allowed[match[1]].has(count))
      addError('uci_call_arity', `${match[1]}() received ${count == null ? 'unbalanced' : count} arguments`, rel(file));
    if (['save', 'apply', 'callApply', 'callConfirm'].includes(match[1]) && !rel(file).endsWith('/core/persistence/uci.js'))
      addError('uci_boundary_bypass', `${match[1]}() is allowed only in core/persistence/uci.js`, rel(file));
  }
  if (/\bui\.changes\.apply\s*\(/.test(mask))
    addError('ui_changes_apply_forbidden', 'ui.changes.apply() is not an awaitable persistence primitive', rel(file));
}

function depsUsed(source) {
  const mask = codeMask(source);
  return new Set([...mask.matchAll(/\bdeps\.([A-Za-z_$][A-Za-z0-9_$]*)/g)].map((match) => match[1]));
}

function objectKeys(source, mask, openIndex) {
  const close = matchingClose(mask, openIndex, '{', '}');
  if (close < 0) return null;
  const keys = new Set();
  let depthBrace = 0, depthParen = 0, depthBracket = 0;
  let start = openIndex + 1;
  function inspect(from, to) {
    const masked = mask.slice(from, to).trim();
    if (!masked || masked.startsWith('...')) return;
    const match = masked.match(/^([A-Za-z_$][A-Za-z0-9_$]*)\s*:/) || masked.match(/^([A-Za-z_$][A-Za-z0-9_$]*)\s*(?:,|$)/);
    if (match) keys.add(match[1]);
  }
  for (let i = openIndex + 1; i < close; i += 1) {
    const ch = mask[i];
    if (ch === '{') depthBrace += 1;
    else if (ch === '}') depthBrace -= 1;
    else if (ch === '(') depthParen += 1;
    else if (ch === ')') depthParen -= 1;
    else if (ch === '[') depthBracket += 1;
    else if (ch === ']') depthBracket -= 1;
    else if (ch === ',' && depthBrace === 0 && depthParen === 0 && depthBracket === 0) {
      inspect(start, i); start = i + 1;
    }
  }
  inspect(start, close);
  return { keys, close };
}

function auditCreateContracts(file, source) {
  const aliases = requireAliases(source);
  const mask = codeMask(source);
  for (const [alias, moduleName] of aliases) {
    const target = localModulePath(moduleName);
    if (!target || !existsSync(target)) continue;
    const targetDeps = depsUsed(read(target));
    if (!targetDeps.size) continue;
    const pattern = new RegExp(`\\b${alias.replace(/[.*+?^${}()|[\\]\\]/g, '\\$&')}\\.create\\s*\\(`, 'g');
    let match;
    while ((match = pattern.exec(mask))) {
      const callOpen = mask.indexOf('(', match.index);
      const first = skipSpace(mask, callOpen + 1);
      if (mask[first] !== '{') {
        addWarning('nonliteral_dependency_object', `${alias}.create() is not passed a literal object and was not automatically checked`, rel(file));
        continue;
      }
      const parsed = objectKeys(source, mask, first);
      if (!parsed) { addError('unbalanced_dependency_object', `${alias}.create() object is unbalanced`, rel(file)); continue; }
      stats.createContracts += 1;
      const missing = [...targetDeps].filter((key) => !parsed.keys.has(key));
      if (missing.length)
        addError('missing_dependency', `${alias}.create() misses: ${missing.sort().join(', ')}`, rel(file));
      pattern.lastIndex = parsed.close + 1;
    }
  }
}

function stripAi(source) {
  return source.replace(/\/\* SHEEPFOLD_AI_BEGIN \*\/[\s\S]*?\/\* SHEEPFOLD_AI_END \*\//g, '');
}

function syntaxCheckStandard(files) {
  const temp = mkdtempSync(join(tmpdir(), 'sheepfold-standard-audit-'));
  try {
    for (const file of files) {
      const target = resolve(temp, rel(file).replaceAll('/', '__'));
      writeFileSync(target, stripAi(read(file)));
      const result = spawnSync(process.execPath, ['--check', target], { encoding: 'utf8' });
      stats.standardFiles += 1;
      if (result.status !== 0)
        addError('standard_syntax', (result.stderr || result.stdout || 'node --check failed').trim(), rel(file));
    }
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
}

if (!existsSync(resources)) {
  addError('resources_missing', 'LuCI resources directory was not found', rel(resources));
} else {
  const files = walk(resources).filter((path) => path.endsWith('.js'));
  stats.filesChecked = files.length;
  for (const file of files) {
    const source = read(file);
    for (const match of source.matchAll(/^'require ([^' ]+)(?: as [^']+)?';/gm)) {
      const target = localModulePath(match[1]);
      if (!target) continue;
      stats.localRequires += 1;
      if (!existsSync(target)) {
        if (allowOverlayMissing && overlayOriginalModules.has(match[1]))
          addWarning('overlay_original_module_missing', match[1], rel(file));
        else
          addError('local_require_missing', match[1], rel(file));
      }
    }
    scanUciCalls(file, source);
    auditCreateContracts(file, source);
  }
  syntaxCheckStandard(files);
}

const overview = resolve(resources, 'view/sheepfold/overview.js');
if (existsSync(overview)) {
  const lines = read(overview).trimEnd().split(/\r?\n/);
  const expected = [
    "'use strict';",
    "'require sheepfold.features.overview.application as overviewApplication';",
    '',
    'return overviewApplication;',
  ];
  if (JSON.stringify(lines) !== JSON.stringify(expected))
    addError('overview_bootstrap_changed', 'overview.js must remain the stable four-line bootstrap', rel(overview));
}

for (const root of [resolve(resources, 'sheepfold/features'), resolve(resources, 'sheepfold/core')]) {
  for (const file of walk(root).filter((path) => path.endsWith('.js'))) {
    const count = read(file).split(/\r?\n/).length;
    if (count > 700) addError('owner_too_large', `${count} lines`, rel(file));
  }
}

const application = resolve(resources, 'sheepfold/features/overview/application.js');
if (existsSync(application)) {
  const source = codeMask(read(application));
  for (const forbidden of [
    /\buci\.(?:set|unset|remove|save|apply)\s*\(/,
    /\bfs\.exec\s*\(/,
    /\bui\.(?:showModal|hideModal|addNotification)\s*\(/,
  ]) if (forbidden.test(source)) addError('composition_root_privilege', String(forbidden), rel(application));
  const raw = read(application);
  if (!/definitions:\s*deviceTypes\.definitions/.test(raw))
    addError('device_type_definitions_missing', 'deviceTypes.definitions must be injected', rel(application));
  if (!/revert:\s*function \(configs\)/.test(raw) || !/callUciRevert/.test(raw))
    addError('uci_revert_missing', 'UCI persistence must receive the narrow revert RPC', rel(application));
}

const devicePersistence = resolve(resources, 'sheepfold/features/devices/persistence.js');
if (existsSync(devicePersistence)) {
  const standard = stripAi(read(devicePersistence));
  if (/activityLogEnabled|activity_log_enabled/.test(standard))
    addError('standard_ai_leak', 'AI activity-log identifiers remain after stripping', rel(devicePersistence));
}

const report = {
  ok: errors.length === 0,
  root: repo,
  stats,
  errors,
  warnings,
};
console.log(JSON.stringify(report, null, 2));
if (!jsonOnly && warnings.length)
  console.error(`luciFinalAudit: ${warnings.length} warning(s)`);
if (errors.length) process.exitCode = 1;
