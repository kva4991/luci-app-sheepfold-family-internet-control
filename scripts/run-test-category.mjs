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
import { categoryDescriptions, testCategories } from '../tests/categories.mjs';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);

function printCategories() {
  const categoryWidth = Math.max(...Object.keys(testCategories).map((name) => name.length));
  console.log('Доступные категории тестов:');
  for (const name of Object.keys(testCategories)) {
    console.log(`  ${name.padEnd(categoryWidth)} ${String(testCategories[name].length).padStart(2)} файлов  ${categoryDescriptions[name]}`);
  }
  console.log(`  ${'all'.padEnd(categoryWidth)} все tests/*.test.mjs; команда: npm.cmd test`);
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

const unknown = args.filter((name) => !Object.hasOwn(testCategories, name));
if (unknown.length) {
  console.error(`Неизвестные категории: ${unknown.join(', ')}`);
  printCategories();
  process.exit(2);
}

const selectedNames = [...new Set(args.flatMap((name) => testCategories[name]))].sort();
const selectedFiles = selectedNames.map((name) => resolve(repoRoot, 'tests', name));
const missingFiles = selectedFiles.filter((file) => !existsSync(file));

if (missingFiles.length) {
  console.error(`В карте категорий отсутствуют файлы:\n${missingFiles.join('\n')}`);
  process.exit(2);
}

console.log(`Категории: ${args.join(', ')}. Тестовых файлов: ${selectedFiles.length}.`);
console.log(selectedNames.map((name) => `  tests/${name}`).join('\n'));

let failed = false;
const testStream = run({ files: selectedFiles, concurrency: true });
testStream.on('test:fail', () => { failed = true; });
testStream.compose(spec()).pipe(process.stdout);
testStream.once('end', () => { process.exitCode = failed ? 1 : 0; });
