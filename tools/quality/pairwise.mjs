/*
 * Строит детерминированную all-pairs выборку для небольших конфигурационных
 * моделей. Helper не запускает продукт и не меняет состояние; зелёное покрытие
 * пар не заменяет явные security-сценарии и тесты живого роутера. §pairmat §testwhy
 */

function cartesianRows(factors, isValid) {
  const names = Object.keys(factors);
  const rows = [];

  function visit(index, current) {
    if (index === names.length) {
      if (isValid(current)) rows.push({ ...current });
      return;
    }

    const name = names[index];
    for (const value of factors[name]) {
      current[name] = value;
      visit(index + 1, current);
    }
    delete current[name];
  }

  visit(0, {});
  return rows;
}

function rowKey(row, names) {
  return names.map((name) => `${name}=${row[name]}`).join('|');
}

function preparedRows(rows, names) {
  return rows.map((row) => ({
    row,
    key: rowKey(row, names),
    tokens: pairTokens(row, names),
  }));
}

export function pairTokens(row, names = Object.keys(row)) {
  const tokens = [];
  for (let left = 0; left < names.length; left += 1) {
    for (let right = left + 1; right < names.length; right += 1) {
      tokens.push(`${names[left]}=${row[names[left]]}::${names[right]}=${row[names[right]]}`);
    }
  }
  return tokens;
}

export function allValidRows(factors, isValid = () => true) {
  if (Object.keys(factors).length < 2)
    throw new Error('All-pairs модель должна содержать минимум два фактора.');
  for (const [name, values] of Object.entries(factors)) {
    if (!Array.isArray(values) || values.length < 2)
      throw new Error(`Фактор ${name} должен содержать минимум два значения.`);
  }
  return cartesianRows(factors, isValid);
}

export function generatePairwise(factors, options = {}) {
  const names = Object.keys(factors);
  const rows = allValidRows(factors, options.isValid);
  if (!rows.length) throw new Error('Модель не содержит допустимых комбинаций.');

  // Набор пар строки неизменен. Предварительный расчёт заметно сокращает работу
  // на больших моделях и оставляет выбор детерминированным при одинаковом score.
  const candidates = preparedRows(rows, names);
  const rowByKey = new Map(candidates.map((candidate) => [candidate.key, candidate]));
  const selected = [];
  const selectedKeys = new Set();
  const uncovered = new Set(candidates.flatMap((candidate) => candidate.tokens));

  function addRow(row) {
    const key = rowKey(row, names);
    if (selectedKeys.has(key)) return;
    const candidate = rowByKey.get(key);
    if (!candidate) throw new Error(`Обязательная комбинация недопустима: ${key}`);
    selected.push(candidate.row);
    selectedKeys.add(key);
    for (const token of candidate.tokens) uncovered.delete(token);
  }

  for (const seed of options.requiredRows || []) addRow(seed);

  while (uncovered.size) {
    let bestCandidate = null;
    let bestScore = -1;
    let bestKey = '';

    for (const candidate of candidates) {
      if (selectedKeys.has(candidate.key)) continue;
      let score = 0;
      for (const token of candidate.tokens) {
        if (uncovered.has(token)) score += 1;
      }
      if (score > bestScore || (score === bestScore && candidate.key < bestKey)) {
        bestCandidate = candidate;
        bestScore = score;
        bestKey = candidate.key;
      }
    }

    if (!bestCandidate || bestScore <= 0)
      throw new Error(`Не удалось покрыть ${uncovered.size} допустимых пар.`);
    addRow(bestCandidate.row);
  }

  return selected;
}

export function uncoveredPairs(factors, rows, isValid = () => true) {
  const names = Object.keys(factors);
  const expected = new Set(allValidRows(factors, isValid).flatMap((row) => pairTokens(row, names)));
  for (const row of rows) {
    for (const token of pairTokens(row, names)) expected.delete(token);
  }
  return [...expected].sort();
}

export function coverageSummary(factors, rows, isValid = () => true) {
  const names = Object.keys(factors);
  const expected = new Set(allValidRows(factors, isValid).flatMap((row) => pairTokens(row, names)));
  const covered = new Set(rows.flatMap((row) => pairTokens(row, names)).filter((token) => expected.has(token)));
  return {
    factorCount: names.length,
    exhaustiveRows: allValidRows(factors, isValid).length,
    selectedRows: rows.length,
    expectedPairs: expected.size,
    coveredPairs: covered.size,
    uncoveredPairs: [...expected].filter((token) => !covered.has(token)).sort(),
  };
}
