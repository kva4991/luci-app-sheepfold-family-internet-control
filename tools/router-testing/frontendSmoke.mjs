/*
 * Read-only проверка Sheepfold внутри реальной LuCI на desktop и mobile.
 * Отдельный browser context нужен, чтобы принять сертификат тестового роутера,
 * не ослабляя обычный браузер пользователя. Тест не нажимает команды приложения:
 * он ловит ошибки загрузки, консоли, запросов и горизонтальное переполнение.
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const requiredEnvironment = [
  'SHEEPFOLD_PLAYWRIGHT_ROOT',
  'SHEEPFOLD_BROWSER_PATH',
  'SHEEPFOLD_LUCI_URL',
  'SHEEPFOLD_LUCI_USER',
  'SHEEPFOLD_LUCI_PASSWORD',
  'SHEEPFOLD_FRONTEND_REPORT_DIR',
];
for (const name of requiredEnvironment) {
  if (!process.env[name]) {
    throw new Error(`Не задана обязательная переменная ${name}`);
  }
}

const require = createRequire(import.meta.url);
const playwrightEntry = path.join(
  process.env.SHEEPFOLD_PLAYWRIGHT_ROOT,
  'node_modules',
  'playwright-core',
);
const { chromium } = require(playwrightEntry);
const reportDir = process.env.SHEEPFOLD_FRONTEND_REPORT_DIR;
fs.mkdirSync(reportDir, { recursive: true });

const forbiddenPageText = [
  'RPCError',
  'factory yields invalid constructor',
  '[object HTML',
  'TypeError',
];

async function loginToLuci(page) {
  await page.goto(process.env.SHEEPFOLD_LUCI_URL, { waitUntil: 'domcontentloaded', timeout: 30_000 });
  const username = page.locator('input[name="luci_username"]');
  if (await username.count()) {
    await username.fill(process.env.SHEEPFOLD_LUCI_USER);
    await page.locator('input[name="luci_password"]').fill(process.env.SHEEPFOLD_LUCI_PASSWORD);
    const submit = page.locator('button[type="submit"], input[type="submit"]').first();
    await Promise.all([
      page.waitForLoadState('domcontentloaded'),
      submit.click(),
    ]);
    // LuCI может опрашивать status endpoint постоянно, поэтому networkidle здесь
    // дал бы ложный timeout на полностью исправной странице.
    await page.goto(process.env.SHEEPFOLD_LUCI_URL, { waitUntil: 'domcontentloaded', timeout: 30_000 });
  } else {
    await page.waitForLoadState('domcontentloaded');
  }

  if (await page.locator('input[name="luci_password"]').count()) {
    throw new Error('LuCI не принял сохранённые учётные данные.');
  }
}

async function validateRouterInformation(page) {
  const result = page.locator('.sf-info-body .sf-info-row, .sf-info-body .sf-note-warning').first();
  await result.waitFor({ state: 'visible', timeout: 25_000 });

  const warning = page.locator('.sf-info-body .sf-note-warning').first();
  if (await warning.isVisible()) {
    throw new Error(`Панель информации о роутере вернула ошибку: ${await warning.innerText()}`);
  }

  const rows = await page.locator('.sf-info-body .sf-info-row').evaluateAll((nodes) => nodes.map((node) => ({
    label: node.querySelector('span')?.textContent?.trim() || '',
    value: node.querySelector('strong')?.textContent?.trim() || '',
  })));
  const requiredRows = [
    { names: ['Router model', 'Модель роутера'], resultName: 'routerModel' },
    { names: ['Router firmware version', 'Версия прошивки роутера'], resultName: 'routerFirmware' },
  ];
  const values = {};
  for (const required of requiredRows) {
    const row = rows.find((candidate) => required.names.includes(candidate.label));
    if (!row || !row.value || /^(unknown|неизвестно)$/i.test(row.value)) {
      throw new Error(`В панели информации отсутствует ${required.names.join(' / ')}`);
    }
    values[required.resultName] = row.value;
  }
  return values;
}

async function checkViewport(browser, target) {
  const context = await browser.newContext({
    viewport: target.viewport,
    ignoreHTTPSErrors: true,
    locale: 'ru-RU',
  });
  const page = await context.newPage();
  const consoleErrors = [];
  const requestErrors = [];
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('pageerror', (error) => consoleErrors.push(error.message));
  page.on('requestfailed', (request) => {
    const failure = request.failure();
    if (new URL(request.url()).origin === new URL(process.env.SHEEPFOLD_LUCI_URL).origin) {
      requestErrors.push(`${request.method()} ${request.url()}: ${failure?.errorText || 'unknown'}`);
    }
  });

  try {
    await loginToLuci(page);
    await page.waitForTimeout(800);
    const bodyText = await page.locator('body').innerText();
    if (!bodyText.includes('Sheepfold')) {
      throw new Error('На странице LuCI не найдено название Sheepfold.');
    }
    for (const fragment of forbiddenPageText) {
      if (bodyText.includes(fragment)) {
        throw new Error(`На странице найден признак frontend-ошибки: ${fragment}`);
      }
    }

    const tabLabels = [
      ['Списки пользователей', 'User lists'],
      ['Управление пользователями', 'User management'],
      ['Wi-Fi'],
      ['Настройки', 'Settings'],
    ];
    const translatedTabsFound = tabLabels
      .filter((alternatives) => alternatives.some((label) => bodyText.includes(label)))
      .map((alternatives) => alternatives[0]);
    if (translatedTabsFound.length < 3) {
      throw new Error('Не найдены основные вкладки Sheepfold в русском или английском интерфейсе.');
    }

    const checkedPanels = [];
    const overflowSamples = [];
    let routerInformation = null;
    const checkPageOverflow = async (panelName) => {
      const overflow = await page.evaluate(() => ({
        body: document.body.scrollWidth - document.body.clientWidth,
        document: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      }));
      overflowSamples.push({ panelName, ...overflow });
      if (overflow.body > 1 || overflow.document > 1) {
        throw new Error(`Панель ${panelName} имеет горизонтальную прокрутку: body=${overflow.body}, document=${overflow.document}`);
      }
    };

    const topTabs = page.locator('button.sf-tab[data-tab]');
    const topTabCount = await topTabs.count();
    if (topTabCount < 5) {
      throw new Error(`Найдено слишком мало верхних вкладок Sheepfold: ${topTabCount}`);
    }
    for (let index = 0; index < topTabCount; index += 1) {
      const button = topTabs.nth(index);
      const tabName = await button.getAttribute('data-tab');
      await button.click();
      const panel = page.locator(`.sf-tab-panel[data-tab="${tabName}"]`);
      if (!(await panel.isVisible())) {
        throw new Error(`После нажатия не открылась верхняя панель ${tabName}`);
      }
      checkedPanels.push(tabName);
      await checkPageOverflow(`top:${tabName}`);
    }

    await page.locator('button.sf-tab[data-tab="settings"]').click();
    const settingsTabs = page.locator('button.sf-settings-tab[data-settings-tab]');
    const settingsTabCount = await settingsTabs.count();
    if (settingsTabCount < 5) {
      throw new Error(`Найдено слишком мало вкладок настроек Sheepfold: ${settingsTabCount}`);
    }
    for (let index = 0; index < settingsTabCount; index += 1) {
      const button = settingsTabs.nth(index);
      const tabName = await button.getAttribute('data-settings-tab');
      await button.click();
      const panel = page.locator(`.sf-settings-panel[data-settings-panel="${tabName}"]`);
      if (!(await panel.isVisible())) {
        throw new Error(`После нажатия не открылась панель настроек ${tabName}`);
      }
      if (tabName === 'info') {
        routerInformation = await validateRouterInformation(page);
      }
      checkedPanels.push(`settings:${tabName}`);
      await checkPageOverflow(`settings:${tabName}`);
    }

    await page.screenshot({
      path: path.join(reportDir, `${target.name}.png`),
      fullPage: true,
    });
    if (consoleErrors.length || requestErrors.length) {
      throw new Error([
        ...consoleErrors.map((item) => `console: ${item}`),
        ...requestErrors.map((item) => `request: ${item}`),
      ].join('\n'));
    }
    return {
      name: target.name,
      viewport: target.viewport,
      translatedTabsFound,
      checkedPanels,
      overflowSamples,
      routerInformation,
    };
  } catch (error) {
    await page.screenshot({
      path: path.join(reportDir, `${target.name}-failure.png`),
      fullPage: true,
    }).catch(() => {});
    throw error;
  } finally {
    await context.close();
  }
}

const browser = await chromium.launch({
  executablePath: process.env.SHEEPFOLD_BROWSER_PATH,
  headless: true,
});
try {
  const results = [];
  results.push(await checkViewport(browser, { name: 'desktop', viewport: { width: 1440, height: 900 } }));
  results.push(await checkViewport(browser, { name: 'mobile', viewport: { width: 390, height: 844 } }));
  fs.writeFileSync(
    path.join(reportDir, 'result.json'),
    `${JSON.stringify({ status: 'pass', checkedAt: new Date().toISOString(), results }, null, 2)}\n`,
    'utf8',
  );
} catch (error) {
  fs.writeFileSync(
    path.join(reportDir, 'result.json'),
    `${JSON.stringify({ status: 'fail', checkedAt: new Date().toISOString(), message: error.message }, null, 2)}\n`,
    'utf8',
  );
  throw error;
} finally {
  await browser.close();
}
