/*
 * Объединяет категории и точечные test-файлы в один список без повторов.
 * Чистый helper не запускает тесты, поэтому выбор легко проверить отдельно от
 * долгих сетевых стендов и Node test reporter. §testcat
 */
import { categoryDescriptions, testCategories } from '../../tests/categories.mjs';

function normalizeTestName(value) {
  return String(value || '').replaceAll('\\', '/').replace(/^tests\//, '');
}

export function selectTestNames(categories, directTests = []) {
  const unknownCategories = categories.filter((name) => !Object.hasOwn(testCategories, name));
  if (unknownCategories.length) {
    throw new Error(`Неизвестные категории: ${unknownCategories.join(', ')}`);
  }

  const names = [
    ...categories.flatMap((name) => testCategories[name]),
    ...directTests.map(normalizeTestName),
  ].filter(Boolean);
  return [...new Set(names)].sort();
}

export function categoryRows() {
  return Object.keys(testCategories).map((name) => ({
    name,
    fileCount: testCategories[name].length,
    description: categoryDescriptions[name],
  }));
}
