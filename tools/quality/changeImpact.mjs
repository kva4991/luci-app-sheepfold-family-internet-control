/*
 * Чистый движок карты влияния: получает уже известные пути, не вызывает Git и не
 * запускает тесты. Благодаря этому решения о риске и соседних проверках быстры,
 * детерминированы и покрываются unit-тестами. §impact1 §testwhy
 */
import { checkCatalog, impactRules, riskLevels } from './changeImpactRules.mjs';

const testFilePattern = /^tests\/([^/]+\.test\.mjs)$/;
const sourcePattern = /\.(?:bat|css|java|js|kt|kts|mjs|nft|ps1|py|sh|uc|xml|yml|yaml)$/i;

function cleanPath(path) {
  return String(path || '').trim().replaceAll('\\', '/').replace(/^\.\//, '');
}

function normalizeChange(change) {
  if (typeof change === 'string') return { status: 'M', path: cleanPath(change) };
  return {
    status: String(change?.status || 'M'),
    path: cleanPath(change?.path),
    previousPath: cleanPath(change?.previousPath),
    kind: String(change?.kind || ''),
  };
}

function riskIndex(level) {
  const index = riskLevels.indexOf(level);
  return index < 0 ? 0 : index;
}

function highestRisk(current, candidate) {
  return riskIndex(candidate) > riskIndex(current) ? candidate : current;
}

export function inspectChanges(inputChanges) {
  const seen = new Map();
  for (const rawChange of inputChanges) {
    const change = normalizeChange(rawChange);
    if (!change.path) continue;
    seen.set(`${change.status}:${change.previousPath || ''}:${change.path}`, change);
  }

  const changes = [...seen.values()].sort((left, right) => left.path.localeCompare(right.path));
  const areas = new Map();
  const categories = new Set();
  const checks = new Set();
  const reviews = new Set();
  const directTests = new Set();
  const unknown = [];
  const fileImpacts = [];
  let fullTest = false;
  let risk = 'low';

  for (const change of changes) {
    const candidatePaths = [change.path, change.previousPath].filter(Boolean);
    const matchedRules = impactRules.filter((rule) => {
      const pathMatches = candidatePaths.some((path) => rule.pattern.test(path));
      const kindMatches = !rule.kinds || rule.kinds.includes(change.kind);
      const kindExcluded = rule.excludeKinds?.includes(change.kind);
      return pathMatches && kindMatches && !kindExcluded;
    });
    const matchedAreas = [];

    for (const rule of matchedRules) {
      matchedAreas.push(rule.area);
      areas.set(rule.area, (areas.get(rule.area) || 0) + 1);
      for (const category of rule.categories) categories.add(category);
      for (const check of rule.checks || []) checks.add(check);
      reviews.add(rule.review);
      fullTest ||= rule.full === true;
      risk = highestRisk(risk, rule.risk);
    }

    const testMatch = change.path.match(testFilePattern);
    if (testMatch && change.status !== 'D') {
      directTests.add(testMatch[1]);
    }

    if (!matchedRules.length) {
      unknown.push(change.path);
      risk = highestRisk(risk, sourcePattern.test(change.path) ? 'high' : 'medium');
    }

    fileImpacts.push({ ...change, areas: matchedAreas });
  }

  return {
    changes,
    files: changes.map((change) => change.path),
    fileImpacts,
    areas: [...areas.entries()].map(([name, count]) => ({ name, count })),
    categories: [...categories].sort(),
    directTests: [...directTests].sort(),
    checks: [...checks].sort(),
    reviews: [...reviews],
    unknown,
    risk,
    fullTest,
  };
}

export function recommendedCommands(report, options = {}) {
  const commands = ['git diff --check'];
  const automatic = [];
  const manual = [];

  for (const check of report.checks) {
    const item = checkCatalog[check];
    if (!item) continue;
    (item.automatic ? automatic : manual).push(item.command);
  }

  if (options.full) automatic.push('npm.cmd test');
  else {
    if (report.categories.length) {
      automatic.push(`npm.cmd run test:category -- ${report.categories.join(' ')}`);
    }
    if (report.directTests.length) {
      automatic.push(`node --test ${report.directTests.map((name) => `tests/${name}`).join(' ')}`);
    }
  }

  commands.push(...new Set(automatic), ...new Set(manual));
  return {
    automatic: [...new Set(automatic)],
    manual: [...new Set(manual)],
    all: [...new Set(commands)],
  };
}

export function formatImpact(report) {
  const commands = recommendedCommands(report);
  const lines = [
    `Изменённых путей: ${report.files.length}.`,
    `Максимальный риск: ${report.risk}.`,
  ];
  if (report.areas.length) {
    lines.push('Затронутые области:');
    for (const area of report.areas) lines.push(`  - ${area.name}: ${area.count}`);
  }
  if (report.categories.length) {
    lines.push(`Рекомендуемый прогон: npm.cmd run test:category -- ${report.categories.join(' ')}`);
  }
  if (report.directTests.length) {
    lines.push(`Изменённые тесты: ${report.directTests.map((name) => `tests/${name}`).join(', ')}`);
  }
  if (report.fullTest) lines.push('Изменён общий контракт: перед публикацией обязателен npm.cmd test.');
  if (commands.manual.length) {
    lines.push('Проверки, которые не запускаются автоматически:');
    for (const command of commands.manual) lines.push(`  - ${command}`);
  }
  if (report.reviews.length) {
    lines.push('Вопросы ревью:');
    for (const item of report.reviews) lines.push(`  - ${item}`);
  }
  if (report.unknown.length) {
    lines.push('Неизвестные карте пути, нужна ручная оценка:');
    for (const path of report.unknown) lines.push(`  - ${path}`);
  }
  return lines.join('\n');
}
