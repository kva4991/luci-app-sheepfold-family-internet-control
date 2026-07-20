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

  const rowByKey = new Map(rows.map((row) => [rowKey(row, names), row]));
  const selected = [];
  const selectedKeys = new Set();
  const uncovered = new Set(rows.flatMap((row) => pairTokens(row, names)));

  function addRow(row) {
    const key = rowKey(row, names);
    if (selectedKeys.has(key)) return;
    const canonical = rowByKey.get(key);
    if (!canonical) throw new Error(`Обязательная комбинация недопустима: ${key}`);
    selected.push(canonical);
    selectedKeys.add(key);
    for (const token of pairTokens(canonical, names)) uncovered.delete(token);
  }

  for (const seed of options.requiredRows || []) addRow(seed);

  while (uncovered.size) {
    let bestRow = null;
    let bestScore = -1;
    let bestKey = '';

    for (const row of rows) {
      const key = rowKey(row, names);
      if (selectedKeys.has(key)) continue;
      const score = pairTokens(row, names).filter((token) => uncovered.has(token)).length;
      if (score > bestScore || (score === bestScore && key < bestKey)) {
        bestRow = row;
        bestScore = score;
        bestKey = key;
      }
    }

    if (!bestRow || bestScore <= 0)
      throw new Error(`Не удалось покрыть ${uncovered.size} допустимых пар.`);
    addRow(bestRow);
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
