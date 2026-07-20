/*
 * Связывает изменённые пути Sheepfold с предметными тестами и вопросами ревью.
 * Это консервативная подсказка без запуска тестов и без изменения состояния;
 * неизвестный путь требует ручной оценки, а зелёные категории не заменяют CI. §impact1 §testwhy
 */
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const categoryFile = resolve(repoRoot, 'tests/categories.mjs');

export const impactRules = Object.freeze([
  {
    area: 'LuCI frontend',
    pattern: /package\/luci-app-[^/]+\/htdocs\/luci-static\/resources\//,
    categories: ['luci'],
    review: 'Проверить локализацию, mobile overflow, состояния загрузки/ошибки и версию JS/CSS.',
  },
  {
    area: 'Устройства и их паспорт',
    pattern: /(?:features\/devices\/|sheepfold-device-|device-(?:mdns|ssdp|ws-discovery)|device-passport|device-detection)/,
    categories: ['devices', 'access', 'security'],
    review: 'Не смешать MAC-карточку, классификацию, trusted baseline и права родителя.',
  },
  {
    area: 'Группы, расписания и администраторы',
    pattern: /(?:features\/(?:groups|schedules|administrators)\/|sheepfold-(?:schedule|group|admin|pair))/,
    categories: ['luci', 'access', 'security'],
    review: 'Проверить конфликт расписаний, protected groups и границу административного сопряжения.',
  },
  {
    area: 'Router backend',
    pattern: /package\/luci-app-[^/]+\/root\/(?:usr\/libexec\/sheepfold|www\/cgi-bin)\//,
    categories: ['backendFast'],
    review: 'Проверить BusyBox-совместимость, validation, lock, exit code и структурированный JSON.',
  },
  {
    area: 'Общий API-контракт',
    pattern: /(?:sheepfold-api|android-openwrt-api|RouterAdminClient|ClientStatusRepository|SecureRouterConnectionManager)/,
    categories: ['backendFast', 'android', 'security'],
    review: 'Сверить HTTP status, stable errorCode, старого клиента, auth и неоднозначный повтор команды.',
    full: true,
  },
  {
    area: 'UCI и миграция',
    pattern: /(?:sheepfold\.uci\.defaults|etc\/uci-defaults|postinst|preinst|uci-config-migration|settings\/save)/,
    categories: ['backendFast', 'packaging', 'security'],
    review: 'Проверить первую установку, upgrade живого конфига, named sections, secrets и повторный запуск.',
    full: true,
  },
  {
    area: 'Firewall, DNS и списки сайтов',
    pattern: /(?:firewall|nft|domain-policy|site-list|adguard|dnsmasq|emergency-site)/,
    categories: ['access', 'sites', 'security', 'networkIntegration'],
    review: 'Проверить приоритет устройств, последний рабочий cache, транзакционный rollback и чужие объекты интеграций.',
    full: true,
  },
  {
    area: 'Android parent/child',
    pattern: /^(?:android|android-child)\//,
    categories: ['android', 'security'],
    review: 'Проверить оба APK, lifecycle, offline/timeout и сохранение локальной защиты приложения.',
  },
  {
    area: 'Пакет, release и updater',
    pattern: /(?:^package\/[^/]+\/Makefile$|^scripts\/(?:build-test-ipk|sheepfold_variants|prepare-openwrt|collect-openwrt|create-openwrt-release)|(?:^|\/)sheepfold-updater$|^install\.sh$|^uninstall\.sh$|^\.github\/workflows\/)/,
    categories: ['packaging', 'tooling', 'security'],
    review: 'Проверить Standard/AI, IPK/OpenWrt APK, package identity, upgrade и сохранение UCI.',
    full: true,
  },
  {
    area: 'Архитектура и правила агентов',
    pattern: /(?:^AGENTS\.md$|^CODING_RULES\.md$|^docs\/(?:architecture|dev\/tag-map|agent-|developer-task|test-strategy|change-impact|debugging|ui-review|api-contracts))/,
    categories: ['tooling'],
    review: 'Сверить ADR, профильный документ, §-теги и автоматическую проверку контракта.',
  },
  {
    area: 'Тестовый инструментарий',
    pattern: /^(?:package\.json$|tests\/|tools\/|scripts\/)/,
    categories: ['tooling'],
    review: 'Проверить purpose note, изменяемое состояние, границу доказательства и запуск в Windows/CI.',
  },
]);

function cleanPath(path) {
  return String(path || '').trim().replaceAll('\\', '/').replace(/^\.\//, '');
}

function gitLines(args) {
  const result = spawnSync('git', args, { cwd: repoRoot, encoding: 'utf8' });
  if (result.error) throw new Error(`Не удалось запустить git: ${result.error.message}`);
  if (result.status !== 0) throw new Error(String(result.stderr || result.stdout || 'git завершился с ошибкой').trim());
  return String(result.stdout || '').split(/\r?\n/).map(cleanPath).filter(Boolean);
}

export function collectGitPaths(base = 'origin/main') {
  return [...new Set([
    ...gitLines(['diff', '--name-only', '--relative', base, '--']),
    ...gitLines(['ls-files', '--others', '--exclude-standard']),
  ])].sort();
}

function testFileCategories(path, source) {
  const name = path.slice('tests/'.length);
  const categories = [];
  for (const match of source.matchAll(/^\s{2}(\w+): \[([\s\S]*?)^\s{2}\],/gm)) {
    if (match[2].includes(`'${name}'`)) categories.push(match[1]);
  }
  return categories;
}

export function inspectChanges(paths, options = {}) {
  const categorySource = options.categorySource ?? readFileSync(categoryFile, 'utf8');
  const files = [...new Set(paths.map(cleanPath).filter(Boolean))].sort();
  const areas = new Map();
  const categories = new Set();
  const reviews = new Set();
  const unknown = [];
  let fullTest = false;

  for (const path of files) {
    let matched = false;
    for (const rule of impactRules) {
      if (!rule.pattern.test(path)) continue;
      matched = true;
      areas.set(rule.area, (areas.get(rule.area) || 0) + 1);
      for (const category of rule.categories) categories.add(category);
      reviews.add(rule.review);
      fullTest ||= rule.full === true;
    }
    if (path.startsWith('tests/') && path.endsWith('.test.mjs')) {
      for (const category of testFileCategories(path, categorySource)) categories.add(category);
    }
    if (!matched) unknown.push(path);
  }

  return {
    files,
    areas: [...areas.entries()].map(([name, count]) => ({ name, count })),
    categories: [...categories].sort(),
    reviews: [...reviews],
    unknown,
    fullTest,
  };
}

export function formatImpact(report) {
  const lines = [`Изменённых путей: ${report.files.length}.`];
  if (report.areas.length) {
    lines.push('Затронутые области:');
    for (const area of report.areas) lines.push(`  - ${area.name}: ${area.count}`);
  }
  if (report.categories.length) {
    lines.push(`Рекомендуемый прогон: npm.cmd run test:category -- ${report.categories.join(' ')}`);
  }
  if (report.fullTest) lines.push('Изменён общий контракт: перед публикацией обязателен npm.cmd test.');
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

async function stdinPaths() {
  let input = '';
  for await (const chunk of process.stdin) input += chunk;
  return input.split(/\r?\n/);
}

const isDirect = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isDirect) {
  const json = process.argv.includes('--json');
  const rawArgs = process.argv.slice(2).filter((arg) => arg !== '--json');
  const gitIndex = rawArgs.indexOf('--git');
  let paths;
  if (gitIndex >= 0) {
    const base = rawArgs[gitIndex + 1] && !rawArgs[gitIndex + 1].startsWith('--')
      ? rawArgs[gitIndex + 1]
      : 'origin/main';
    paths = collectGitPaths(base);
  } else {
    paths = rawArgs.length ? rawArgs : await stdinPaths();
  }
  const report = inspectChanges(paths);
  if (!report.files.length) {
    console.error('Не получены изменённые пути. Передайте файлы аргументами или через stdin.');
    process.exitCode = 2;
  } else {
    console.log(json ? JSON.stringify(report, null, 2) : formatImpact(report));
  }
}
