/*
 * Защищает целостность карты категорий: каждый test-файл достижим выборочным runner,
 * а npm-команды остаются стабильными. Тест не оценивает качество и полноту самих
 * сценариев и ничего вне репозитория не меняет.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { categoryDescriptions, testCategories } from './categories.mjs';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const packageJson = JSON.parse(readFileSync(resolve(repoRoot, 'package.json'), 'utf8'));

describe('test category map §testcat', () => {
  it('assigns every test file to at least one problem category', () => {
    const actualFiles = readdirSync(resolve(repoRoot, 'tests'))
      .filter((name) => name.endsWith('.test.mjs'))
      .sort();
    const assignedFiles = [...new Set(Object.values(testCategories).flat())].sort();

    assert.deepEqual(assignedFiles, actualFiles);
  });

  it('contains only existing files and no duplicate inside one category', () => {
    const actualFiles = new Set(readdirSync(resolve(repoRoot, 'tests')));

    for (const [name, files] of Object.entries(testCategories)) {
      assert.ok(categoryDescriptions[name], `missing description for ${name}`);
      assert.equal(new Set(files).size, files.length, `duplicate test in ${name}`);
      for (const file of files)
        assert.ok(actualFiles.has(file), `${name} references missing ${file}`);
    }
  });

  it('keeps smoke focused enough for frequent local runs', () => {
    assert.ok(testCategories.smoke.length <= 12, 'smoke must stay a small representative set');
    for (const heavy of [
      'luciFinalAuditTool.test.mjs',
      'productVariants.test.mjs',
      'adguardIntegration.test.mjs',
      'networkIntegration.test.mjs',
    ])
      assert.ok(!testCategories.smoke.includes(heavy), `${heavy} makes smoke too slow`);
  });

  it('exposes stable npm commands for common problem categories', () => {
    for (const name of ['smoke', 'luci', 'access', 'devices', 'sites', 'backend', 'backendFast', 'policySimulation', 'networkIntegration', 'android', 'security', 'packaging']) {
      assert.equal(packageJson.scripts[`test:${name}`], `node scripts/run-test-category.mjs ${name}`);
    }
    assert.equal(packageJson.scripts['test:category'], 'node scripts/run-test-category.mjs');
    assert.equal(packageJson.scripts['test:list'], 'node scripts/run-test-category.mjs --list');
    assert.equal(packageJson.scripts.test, 'node scripts/runAllTests.mjs');
    const focusedRunner = readFileSync(resolve(repoRoot, 'scripts/run-test-category.mjs'), 'utf8');
    assert.match(focusedRunner, /--file/);
    assert.match(focusedRunner, /for \(const \[index, name\] of selectedNames\.entries\(\)\)/);
    assert.match(focusedRunner, /spawnSync/);
    assert.match(focusedRunner, /--test-concurrency=1/);
    assert.doesNotMatch(focusedRunner, /run\(\{ files: selectedFiles, concurrency: true \}\)/);
    assert.match(focusedRunner, /SHEEPFOLD_TEST_TIMEOUT_SECONDS/);
    const fullRunner = readFileSync(resolve(repoRoot, 'scripts/runAllTests.mjs'), 'utf8');
    assert.match(fullRunner, /networkIntegration/);
    assert.match(fullRunner, /policySimulation/);
    assert.match(fullRunner, /packaging/);
    assert.match(fullRunner, /SHEEPFOLD_TEST_BATCH_SIZE/);
    assert.match(fullRunner, /SHEEPFOLD_TEST_TIMEOUT_SECONDS/);
    assert.match(fullRunner, /process\.platform === 'win32' \? '1800' : '720'/);
    assert.match(fullRunner, /result\.error\?\.code === 'ETIMEDOUT'/);
    assert.match(fullRunner, /group\.tests\.slice\(offset, offset \+ batchSize\)/);
    assert.match(fullRunner, /new Set\(selectedTests\)\.size !== allTests\.length/);
  });

  it('keeps Python package builders out of the fast tooling category', () => {
    for (const heavy of [
      'openWrtVariantFeed.test.mjs',
      'productVariants.test.mjs',
      'testIpkI18n.test.mjs',
      'testIpkPermissions.test.mjs',
    ]) {
      assert.ok(testCategories.packaging.includes(heavy), `${heavy} must stay in packaging`);
      assert.ok(!testCategories.tooling.includes(heavy), `${heavy} makes tooling slow`);
    }
  });

  it('keeps feature-specific suites in their owning categories', () => {
    for (const [file, category] of [
      ['remoteSupportTransport.test.mjs', 'security'],
      ['familyMessageRelayProtocol.test.mjs', 'android'],
      ['luciCommandActions.test.mjs', 'luci'],
      ['openWrtBuildWorkflow.test.mjs', 'packaging'],
      ['liveRouterHarness.test.mjs', 'security'],
    ]) {
      assert.ok(testCategories[category].includes(file), `${file} must stay in ${category}`);
      assert.ok(!testCategories.tooling.includes(file), `${file} does not test the tooling core`);
    }
  });
});
