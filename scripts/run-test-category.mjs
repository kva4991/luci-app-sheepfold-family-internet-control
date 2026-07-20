/*
 * Запускает пересекающиеся предметные категории без повторного запуска test-файла.
 * Это ускоряет точечную разработку и не меняет внешнее состояние. Зелёная категория
 * не заменяет полный npm test перед публикацией и live-router/Android проверки.
 */
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { run } from 'node:test';
import { spec } from 'node:test/reporters';
import { fileURLToPath } from 'node:url';
import { categoryRows, selectTestNames } from '../tools/quality/testSelection.mjs';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);

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

let failed = false;
const testStream = run({ files: selectedFiles, concurrency: true });
testStream.on('test:fail', () => { failed = true; });
testStream.compose(spec()).pipe(process.stdout);
testStream.once('end', () => { process.exitCode = failed ? 1 : 0; });
