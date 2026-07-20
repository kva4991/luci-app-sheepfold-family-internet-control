/*
 * Печатает all-pairs матрицу для планирования локальных и живых проверок.
 * Скрипт ничего не устанавливает и не меняет; строки матрицы ещё не являются
 * доказательством работы соответствующей конфигурации на роутере. §pairmat §testwhy
 */
import { allValidRows, generatePairwise } from './pairwise.mjs';
import { expectedRuntime, requiredRuntimeRows, runtimeFactors } from './runtimeCompatibilityModel.mjs';

const rows = generatePairwise(runtimeFactors, { requiredRows: requiredRuntimeRows });
const exhaustiveCount = allValidRows(runtimeFactors).length;

console.log(`All-pairs матрица Sheepfold: ${rows.length} сценариев вместо ${exhaustiveCount} полного перебора.`);
for (const [index, row] of rows.entries()) {
  const expected = expectedRuntime(row);
  console.log([
    String(index + 1).padStart(2, '0'),
    ...Object.entries(row).map(([name, value]) => `${name}=${value}`),
    `activeSiteBackend=${expected.activeSiteBackend}`,
    `siteStatus=${expected.siteStatus}`,
    `forceIpv6Off=${expected.forceIpv6Off}`,
  ].join(' | '));
}
