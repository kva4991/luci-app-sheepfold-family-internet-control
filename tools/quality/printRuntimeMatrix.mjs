/*
 * Печатает all-pairs матрицу для планирования локальных и живых проверок.
 * Скрипт ничего не устанавливает и не меняет; строки матрицы ещё не являются
 * доказательством работы соответствующей конфигурации на роутере. §pairmat §testwhy
 */
import { coverageSummary, generatePairwise } from './pairwise.mjs';
import { expectedRuntime, requiredRuntimeRows, runtimeFactors } from './runtimeCompatibilityModel.mjs';

const rows = generatePairwise(runtimeFactors, { requiredRows: requiredRuntimeRows });
const coverage = coverageSummary(runtimeFactors, rows);
const outputRows = rows.map((row, index) => ({
  id: index + 1,
  ...row,
  ...expectedRuntime(row),
}));

if (process.argv.includes('--json')) {
  console.log(JSON.stringify({ coverage, rows: outputRows }, null, 2));
  process.exit(0);
}

console.log([
  `All-pairs матрица Sheepfold: ${coverage.selectedRows} сценариев вместо ${coverage.exhaustiveRows} полного перебора.`,
  `Покрыто допустимых пар: ${coverage.coveredPairs}/${coverage.expectedPairs}.`,
].join(' '));
for (const row of outputRows) {
  console.log([
    String(row.id).padStart(2, '0'),
    ...Object.keys(runtimeFactors).map((name) => `${name}=${row[name]}`),
    `activeSiteBackend=${row.activeSiteBackend}`,
    `siteStatus=${row.siteStatus}`,
    `forceIpv6Off=${row.forceIpv6Off}`,
  ].join(' | '));
}
