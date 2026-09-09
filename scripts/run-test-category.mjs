/*
 * Запускает пересекающиеся предметные категории без повторного запуска test-файла.
 * Это ускоряет точечную разработку и не меняет внешнее состояние. Зелёная категория
 * не заменяет обоснованный release-gate и применимые live-router/Android проверки.
 */
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { categoryRows, selectTestNames } from '../tools/quality/testSelection.mjs';
import { applyTestEnvironment } from '../tools/quality/testEnvironment.mjs';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const testEnvironment = applyTestEnvironment(repoRoot);
const args = process.argv.slice(2);
const defaultTimeoutSeconds = process.platform === 'win32' ? '1800' : '720';
const timeoutSeconds = Number.parseInt(process.env.SHEEPFOLD_TEST_TIMEOUT_SECONDS || defaultTimeoutSeconds, 10);

if (!Number.isInteger(timeoutSeconds) || timeoutSeconds < 60 || timeoutSeconds > 3600) {
  console.error('SHEEPFOLD_TEST_TIMEOUT_SECONDS должен быть целым числом от 60 до 3600.');
  process.exit(2);
}

function printCategories() {
  const rows = categoryRows();
  const categoryWidth = Math.max(...rows.map((row) => row.name.length));
  console.log('Доступные категории тестов:');
  for (const row of rows) {
    console.log(`  ${row.name.padEnd(categoryWidth)} ${String(row.fileCount).padStart(2)} файлов  ${row.description}`);
  }
  console.log(`  ${'all'.padEnd(categoryWidth)} все tests/*.test.mjs; команда: npm.cmd test`);
}

function parseSelection(input) {
  const categories = [];
  const directTests = [];
  for (let index = 0; index < input.length; index += 1) {
    if (input[index] === '--file') {
      if (!input[index + 1]) throw new Error('После --file требуется имя test-файла.');
      directTests.push(input[++index]);
    } else categories.push(input[index]);
  }
  return { categories, directTests };
}

if (args.includes('--list') || args.includes('-l')) {
  printCategories();
  process.exit(0);
}

if (!args.length) {
  printCategories();
  console.error('\nУкажите одну или несколько категорий, например: npm.cmd run test:category -- luci devices');
  process.exit(2);
}

let selection;
try {
  selection = parseSelection(args);
} catch (error) {
  console.error(error.message);
  printCategories();
  process.exit(2);
}

let selectedNames;
try {
  selectedNames = selectTestNames(selection.categories, selection.directTests);
} catch (error) {
  console.error(error.message);
  printCategories();
  process.exit(2);
}
if (!selectedNames.length) {
  console.error('Не выбраны категории или test-файлы.');
  process.exit(2);
}
const selectedFiles = selectedNames.map((name) => resolve(repoRoot, 'tests', name));
const missingFiles = selectedFiles.filter((file) => !existsSync(file));

if (missingFiles.length) {
  console.error(`В карте категорий отсутствуют файлы:\n${missingFiles.join('\n')}`);
  process.exit(2);
}

const selectionLabel = [
  selection.categories.length ? `категории ${selection.categories.join(', ')}` : '',
  selection.directTests.length ? `файлы ${selection.directTests.join(', ')}` : '',
].filter(Boolean).join('; ');
console.log(`Выбор: ${selectionLabel}. Тестовых файлов: ${selectedFiles.length}.`);
console.log(selectedNames.map((name) => `  tests/${name}`).join('\n'));

for (const [index, name] of selectedNames.entries()) {
  const startedAt = Date.now();
  console.log(`\n[${index + 1}/${selectedNames.length}] tests/${name}`);
  const result = spawnSync(
    process.execPath,
    ['--test', '--test-concurrency=1', `tests/${name}`],
    {
      cwd: repoRoot,
      env: testEnvironment,
      stdio: 'inherit',
      timeout: timeoutSeconds * 1000,
      windowsHide: true,
    },
  );

  if (result.error?.code === 'ETIMEDOUT') {
    console.error(`${name}: превышен лимит ${timeoutSeconds} сек.`);
    process.exit(124);
  }
  if (result.error) {
    console.error(`${name}: не удалось запустить Node test runner: ${result.error.message}`);
    process.exit(1);
  }
  if (result.status !== 0) {
    console.error(`${name}: завершён с кодом ${result.status ?? 'unknown'}.`);
    process.exit(result.status || 1);
  }
  console.log(`${name}: успешно, ${Math.round((Date.now() - startedAt) / 1000)} сек.`);
}

console.log('\nВсе выбранные test-файлы успешно пройдены ровно один раз.');
