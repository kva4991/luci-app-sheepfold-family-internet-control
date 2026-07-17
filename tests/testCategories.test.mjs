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

  it('exposes stable npm commands for common problem categories', () => {
    for (const name of ['smoke', 'luci', 'access', 'devices', 'sites', 'backend', 'backendFast', 'policySimulation', 'networkIntegration', 'android', 'security', 'packaging']) {
      assert.equal(packageJson.scripts[`test:${name}`], `node scripts/run-test-category.mjs ${name}`);
    }
    assert.equal(packageJson.scripts['test:category'], 'node scripts/run-test-category.mjs');
    assert.equal(packageJson.scripts['test:list'], 'node scripts/run-test-category.mjs --list');
  });
});
