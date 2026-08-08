/*
 * Запускает все test-файлы ровно один раз, но изолирует сетевые стенды, глубокие
 * shell-симуляции и упаковщики в небольшие отдельные Node-процессы. Монолитный
 * node --test на Windows удерживал общий процесс более 20 минут, а даже 70 обычных
 * файлов одним процессом не завершались за 6 минут. Скрипт меняет только тестовые
 * fixtures внутри .build; успех не заменяет Android, SDK и live-router проверки.
 */
import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { testCategories } from '../tests/categories.mjs';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const allTests = [...new Set(Object.values(testCategories).flat())].sort();
const concurrency = Number.parseInt(process.env.SHEEPFOLD_TEST_CONCURRENCY || '4', 10);
const batchSize = Number.parseInt(process.env.SHEEPFOLD_TEST_BATCH_SIZE || '1', 10);
const timeoutSeconds = Number.parseInt(process.env.SHEEPFOLD_TEST_TIMEOUT_SECONDS || '720', 10);

if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 16) {
  console.error('SHEEPFOLD_TEST_CONCURRENCY должен быть целым числом от 1 до 16.');
  process.exit(2);
}
if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > 32) {
  console.error('SHEEPFOLD_TEST_BATCH_SIZE должен быть целым числом от 1 до 32.');
  process.exit(2);
}
if (!Number.isInteger(timeoutSeconds) || timeoutSeconds < 60 || timeoutSeconds > 3600) {
  console.error('SHEEPFOLD_TEST_TIMEOUT_SECONDS должен быть целым числом от 60 до 3600.');
  process.exit(2);
}

function withoutAssigned(names, assigned) {
  return names.filter((name) => !assigned.has(name));
}

const assignedTests = new Set();
const groupSpecs = [
  ['networkIntegration', testCategories.networkIntegration],
  ['policySimulation', testCategories.policySimulation],
  ['packaging', testCategories.packaging],
];
const isolatedGroups = groupSpecs.map(([name, names]) => {
  const tests = withoutAssigned(names, assignedTests);
  tests.forEach((testName) => assignedTests.add(testName));
  return { name, tests };
});
const coreTests = withoutAssigned(allTests, assignedTests);
const workloadGroups = [{ name: 'core', tests: coreTests }, ...isolatedGroups];
const testGroups = workloadGroups.flatMap((group) => {
  const batches = [];
  for (let offset = 0; offset < group.tests.length; offset += batchSize) {
    const tests = group.tests.slice(offset, offset + batchSize);
    const suffix = group.tests.length > batchSize ? `-${batches.length + 1}` : '';
    batches.push({ name: `${group.name}${suffix}`, tests });
  }
  return batches;
});
const selectedTests = testGroups.flatMap((group) => group.tests);

if (new Set(selectedTests).size !== allTests.length || selectedTests.length !== allTests.length) {
  console.error('Внутренняя ошибка полного runner: test-файлы потеряны или запущены повторно.');
  process.exit(2);
}

console.log(`Полный набор: ${allTests.length} test-файлов, партии до ${batchSize}, параллелизм ${concurrency}.`);
for (const [index, group] of testGroups.entries()) {
  if (!group.tests.length) continue;
  const startedAt = Date.now();
  console.log(`\n[${index + 1}/${testGroups.length}] ${group.name}: ${group.tests.length} test-файлов.`);
  const result = spawnSync(
    process.execPath,
    ['--test', `--test-concurrency=${concurrency}`, ...group.tests.map((name) => `tests/${name}`)],
    {
      cwd: repoRoot,
      env: process.env,
      stdio: 'inherit',
      timeout: timeoutSeconds * 1000,
      windowsHide: true,
    },
  );

  if (result.error?.code === 'ETIMEDOUT') {
    console.error(`${group.name}: превышен лимит ${timeoutSeconds} сек.; файлы: ${group.tests.join(', ')}.`);
    process.exit(124);
  }
  if (result.error) {
    console.error(`${group.name}: не удалось запустить Node test runner: ${result.error.message}`);
    process.exit(1);
  }
  if (result.status !== 0) {
    console.error(`${group.name}: тестовая группа завершилась с кодом ${result.status ?? 'unknown'}.`);
    process.exit(result.status || 1);
  }
  console.log(`${group.name}: успешно, ${Math.round((Date.now() - startedAt) / 1000)} сек.`);
}

console.log('\nВсе test-файлы успешно пройдены ровно один раз.');
