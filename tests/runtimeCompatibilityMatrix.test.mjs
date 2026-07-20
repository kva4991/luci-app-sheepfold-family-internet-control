/*
 * Проверяет компактную all-pairs матрицу редакций, package format и интеграций.
 * Она сокращает комбинаторный перебор, но security-инварианты и реальные DNS,
 * nftables, opkg/apk эффекты всё равно проверяются отдельными тестами. §pairmat §testwhy
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { allValidRows, generatePairwise, uncoveredPairs } from '../tools/quality/pairwise.mjs';
import { expectedRuntime, requiredRuntimeRows, runtimeFactors } from '../tools/quality/runtimeCompatibilityModel.mjs';

const matrix = generatePairwise(runtimeFactors, { requiredRows: requiredRuntimeRows });

function includesRow(rows, expected) {
  return rows.some((row) => Object.keys(expected).every((name) => row[name] === expected[name]));
}

describe('runtime compatibility all-pairs matrix §pairmat', () => {
  it('covers every valid pair with a substantially smaller deterministic set', () => {
    const exhaustive = allValidRows(runtimeFactors);
    assert.deepEqual(uncoveredPairs(runtimeFactors, matrix), []);
    assert.ok(matrix.length < exhaustive.length / 4, `${matrix.length} is not compact against ${exhaustive.length}`);
    assert.deepEqual(matrix, generatePairwise(runtimeFactors, { requiredRows: requiredRuntimeRows }));
  });

  it('preserves explicit security and degraded-state scenarios', () => {
    for (const row of requiredRuntimeRows) assert.ok(includesRow(matrix, row));
    const missingAdguard = requiredRuntimeRows.at(-1);
    assert.equal(expectedRuntime(missingAdguard).siteStatus, 'missingAdguard');
    assert.equal(expectedRuntime({ ...missingAdguard, adguardManage: 'off' }).siteStatus, 'missingAdguard');
    assert.equal(expectedRuntime(requiredRuntimeRows[1]).forceIpv6Off, true);
    assert.equal(expectedRuntime(requiredRuntimeRows[0]).activeSiteBackend, 'sheepfold');
  });

  it('documents the matrix as planning coverage rather than runtime proof', async () => {
    const { readFile } = await import('node:fs/promises');
    const docs = await readFile(new URL('../docs/test-strategy.ru.md', import.meta.url), 'utf8');
    assert.match(docs, /§pairmat/);
    assert.match(docs, /quality:matrix/);
    assert.match(docs, /не заменяет.+жив/i);
  });
});
