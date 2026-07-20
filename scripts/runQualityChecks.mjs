/*
 * Единый локальный gate связывает карту изменений с минимальным набором линтеров
 * и тестов, измеряет каждый этап и сохраняет JSON-отчёт. Он намеренно не запускает
 * живой роутер, сборку release и другие изменяющие внешнее состояние проверки. §qassist
 */
import { existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { performance } from 'node:perf_hooks';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { auditDocumentation, formatDocumentationAudit } from '../tools/quality/documentationAudit.mjs';
import { formatImpact, inspectChanges, recommendedCommands } from '../tools/quality/changeImpact.mjs';
import { collectGitChanges, repoRoot } from '../tools/quality/gitChanges.mjs';
import { formatStructureAudit, inspectStructure } from '../tools/quality/structureAudit.mjs';
import { selectTestNames } from '../tools/quality/testSelection.mjs';
import { auditChangedWhitespace } from '../tools/quality/whitespaceAudit.mjs';

const reportPath = resolve(repoRoot, '.build', 'quality', 'last-run.json');
const lintRoots = [
  'eslint.config.js',
  'scripts/**/*.mjs',
  'tests/**/*.mjs',
  'tools/**/*.mjs',
  'package/luci-app-sheepfold-family-internet-control/htdocs/luci-static/resources/**/*.js',
];
const lintablePath = /^(?:eslint\.config\.js$|(?:scripts|tests|tools)\/.*\.mjs$|package\/luci-app-[^/]+\/htdocs\/luci-static\/resources\/.*\.js$)/;

export function parseQualityArgs(args) {
  const options = {
    base: 'origin/main',
    mode: 'base',
    full: false,
    strict: false,
    planOnly: false,
    skipAndroid: false,
  };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--git') {
      options.mode = 'base';
      if (args[index + 1] && !args[index + 1].startsWith('--')) options.base = args[++index];
    } else if (arg === '--staged') options.mode = 'staged';
    else if (arg === '--working-tree') options.mode = 'working';
    else if (arg === '--full') options.full = true;
    else if (arg === '--strict') options.strict = true;
    else if (arg === '--plan') options.planOnly = true;
    else if (arg === '--skip-android') options.skipAndroid = true;
    else throw new Error(`Неизвестный аргумент quality gate: ${arg}`);
  }
  return options;
}

function elapsed(startedAt) {
  return Math.round(performance.now() - startedAt);
}

function runProcess(command, args, options = {}) {
  const startedAt = performance.now();
  const result = spawnSync(command, args, {
    cwd: repoRoot,
    stdio: 'inherit',
    windowsHide: true,
    ...options,
  });
  return {
    status: result.status === 0 ? 'passed' : 'failed',
    exitCode: result.status,
    error: result.error?.message || null,
    durationMs: elapsed(startedAt),
  };
}

async function lintJavaScript(changes, full) {
  const changedFiles = changes
    .filter((change) => change.status !== 'D' && lintablePath.test(change.path) && existsSync(resolve(repoRoot, change.path)))
    .map((change) => change.path);
  const configChanged = changes.some((change) => ['eslint.config.js', 'package.json'].includes(change.path));
  const files = full || configChanged ? lintRoots : changedFiles;
  if (!files.length) return { status: 'skipped', durationMs: 0, files: [] };

  const startedAt = performance.now();
  const { ESLint } = await import('eslint');
  const eslint = new ESLint();
  const results = await eslint.lintFiles(files);
  const formatter = await eslint.loadFormatter('stylish');
  const output = formatter.format(results);
  if (output) process.stdout.write(output);
  const errorCount = results.reduce((sum, result) => sum + result.errorCount, 0);
  const warningCount = results.reduce((sum, result) => sum + result.warningCount, 0);
  return {
    status: errorCount ? 'failed' : 'passed',
    durationMs: elapsed(startedAt),
    files,
    errorCount,
    warningCount,
  };
}

export function diffCheckArgs(options) {
  if (options.mode === 'staged') return ['diff', '--cached', '--check', '--'];
  if (options.mode === 'working') return ['diff', '--check', '--'];
  return ['diff', '--check', options.base, '--'];
}

function runDiffCheck(options) {
  return runProcess('git', diffCheckArgs(options));
}

function runNodeTests(report, full) {
  if (full) {
    const names = readdirSync(resolve(repoRoot, 'tests'))
      .filter((name) => name.endsWith('.test.mjs'))
      .sort();
    return runProcess(process.execPath, ['--test', ...names.map((name) => `tests/${name}`)]);
  }
  const names = selectTestNames(report.categories, report.directTests);
  if (!names.length) return { status: 'skipped', durationMs: 0, files: [] };
  const args = [
    resolve(repoRoot, 'scripts', 'run-test-category.mjs'),
    ...report.categories,
    ...report.directTests.flatMap((name) => ['--file', name]),
  ];
  return { ...runProcess(process.execPath, args), files: names };
}

function writeReport(report) {
  mkdirSync(dirname(reportPath), { recursive: true });
  writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
}

export async function main(args = process.argv.slice(2)) {
  const options = parseQualityArgs(args);
  const startedAt = performance.now();
  const changes = collectGitChanges({ mode: options.mode, base: options.base });
  const impact = inspectChanges(changes);
  const structure = inspectStructure(changes, { base: options.base });
  const commands = recommendedCommands(impact, { full: options.full });

  console.log(formatImpact(impact));
  console.log('');
  console.log(formatStructureAudit(structure));
  if (options.planOnly) return 0;

  const steps = [];
  console.log('\n[quality] Проверка whitespace...');
  const gitDiffCheck = runDiffCheck(options);
  const whitespaceIssues = auditChangedWhitespace(changes);
  for (const issue of whitespaceIssues) {
    console.error(`${issue.path}:${issue.line}: ${issue.code}`);
  }
  steps.push({
    id: 'diffCheck',
    ...gitDiffCheck,
    status: gitDiffCheck.status === 'failed' || whitespaceIssues.length ? 'failed' : 'passed',
    whitespaceIssues,
  });

  const markdownPaths = changes.map((change) => change.path).filter((path) => path.endsWith('.md'));
  console.log('[quality] Проверка документации...');
  const docsStartedAt = performance.now();
  const docs = auditDocumentation(markdownPaths);
  console.log(formatDocumentationAudit(docs));
  steps.push({
    id: 'documentation',
    status: docs.brokenLinks.length || docs.unknownTags.length ? 'failed' : 'passed',
    durationMs: elapsed(docsStartedAt),
    ...docs,
  });

  console.log('[quality] ESLint изменённых файлов...');
  steps.push({ id: 'eslint', ...await lintJavaScript(changes, options.full) });

  if (impact.checks.includes('lintAndroid') && !options.skipAndroid) {
    console.log('[quality] Android Lint...');
    steps.push({
      id: 'androidLint',
      ...runProcess(process.execPath, [resolve(repoRoot, 'scripts', 'runAndroidLint.mjs')]),
    });
  } else if (impact.checks.includes('lintAndroid')) {
    steps.push({ id: 'androidLint', status: 'pending', durationMs: 0, reason: '--skip-android' });
  }

  console.log(options.full ? '[quality] Полный набор Node-тестов...' : '[quality] Выбранные Node-тесты...');
  steps.push({ id: options.full ? 'fullTests' : 'focusedTests', ...runNodeTests(impact, options.full) });

  const failed = steps.some((step) => step.status === 'failed');
  const pendingFull = impact.fullTest && !options.full;
  const strictUnknown = options.strict && impact.unknown.length > 0;
  const pendingAndroid = steps.some((step) => step.status === 'pending');
  const status = failed || strictUnknown ? 'failed' : (pendingFull || pendingAndroid ? 'partial' : 'passed');
  const result = {
    status,
    checkedAt: new Date().toISOString(),
    durationMs: elapsed(startedAt),
    options,
    impact,
    structure,
    commands,
    pendingFull,
    pendingManualChecks: commands.manual,
    steps,
  };
  writeReport(result);

  console.log(`\n[quality] Итог: ${status}. Отчёт: ${reportPath}`);
  if (pendingFull) console.warn('[quality] Общий контракт требует полного npm.cmd test перед push.');
  if (strictUnknown) console.error('[quality] Строгий режим запрещает неизвестные карте пути.');
  return failed || strictUnknown ? 1 : 0;
}

const isDirect = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isDirect) {
  try {
    process.exitCode = await main();
  } catch (error) {
    console.error(error.stack || error.message);
    process.exitCode = 1;
  }
}
