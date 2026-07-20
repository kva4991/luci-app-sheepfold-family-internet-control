/*
 * Read-only проверка Sheepfold внутри реальной LuCI на desktop и mobile.
 * Отдельный browser context нужен, чтобы принять сертификат тестового роутера,
 * не ослабляя обычный браузер пользователя. Тест не нажимает команды приложения:
 * он ловит ошибки загрузки, консоли, запросов, горизонтальное переполнение и
 * недоступные интерактивные элементы. Проверка не является pixel baseline. §uxrev01
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
  await continueThroughLocalCertificateWarning(page);
  const username = page.locator('input[name="luci_username"]');
  if (await username.count()) {
    await username.fill(process.env.SHEEPFOLD_LUCI_USER);
    await page.locator('input[name="luci_password"]').fill(process.env.SHEEPFOLD_LUCI_PASSWORD);
    // LuCI 25.12 выносит обычный <button> без type="submit" за пределы скрытой
    // form.cbi-map и привязывает к нему JS-обработчик. Уникальные системные классы
    // надёжнее текста кнопки и не зависят от выбранного языка интерфейса.
    const submit = page.locator('button.cbi-button-positive.important');
    if (await submit.count() !== 1) {
      throw new Error('В форме входа LuCI не найдена единственная кнопка отправки.');
    }
    // sysauth.js вызывает form.submit(), то есть начинается полноценная
    // навигация. Повторный page.goto() раньше мог оборвать POST до установки
    // session cookie: оболочка загружалась, но UCI отвечал Access denied.
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 30_000 }),
      submit.click(),
    ]);
  } else {
    await page.waitForLoadState('domcontentloaded');
  }

  if (await page.locator('input[name="luci_password"]').count()) {
    throw new Error('LuCI не принял сохранённые учётные данные.');
  }
}

async function continueThroughLocalCertificateWarning(page) {
  const configuredUrl = new URL(process.env.SHEEPFOLD_LUCI_URL);
  const privateIpv4 = /^(?:10\.|192\.168\.|172\.(?:1[6-9]|2\d|3[01])\.)/;

  if (!privateIpv4.test(configuredUrl.hostname)) return;

  const kasperskyTitle = page.getByText('Kaspersky Endpoint Security для Windows', { exact: true });
  const continueLink = page.getByText('Я понимаю риск, но хочу продолжить', { exact: true });
  if (await kasperskyTitle.count() !== 1 || await continueLink.count() !== 1) return;

  // Kaspersky перехватывает self-signed HTTPS раньше Chromium и тем самым
  // обходит ignoreHTTPSErrors. Исключение допустимо только для буквального
  // частного IP из профиля тестового роутера, а не для произвольного сайта.
  await continueLink.click();
  await page.waitForLoadState('domcontentloaded');
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

async function validateLogPanel(page) {
  const toolbarButtons = page.locator('.sf-log-toolbar-row button');
  const buttonCount = await toolbarButtons.count();
  if (buttonCount !== 3) {
    throw new Error(`Панель журнала должна содержать фильтр, очистку и экспорт; найдено кнопок: ${buttonCount}`);
  }

  const filters = page.locator('.sf-log-filters-wrap');
  const toggle = page.locator('.sf-log-toolbar-row > button.sf-action-neutral');
  if (await toggle.count() !== 1) {
    throw new Error('В панели журнала не найдена отдельная кнопка фильтра.');
  }
  await toggle.click();
  await filters.waitFor({ state: 'visible', timeout: 5_000 });

  const inputCount = await filters.locator('input').count();
  const selectCount = await filters.locator('select').count();
  if (inputCount !== 5 || selectCount !== 1) {
    throw new Error(`Неполный набор фильтров журнала: input=${inputCount}, select=${selectCount}`);
  }
}

async function validatePanelControls(panel, panelName, mobile) {
  const audit = await panel.evaluate((root, isMobile) => {
    const controls = [...root.querySelectorAll('button, a[href], [role="button"], input, select, textarea')];
    const fatal = [];
    const warnings = [];
    let visibleCount = 0;

    function isVisible(node) {
      const style = window.getComputedStyle(node);
      const rect = node.getBoundingClientRect();
      return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
    }

    function accessibleName(node) {
      const labelledBy = (node.getAttribute('aria-labelledby') || '')
        .split(/\s+/)
        .filter(Boolean)
        .map((id) => document.getElementById(id)?.textContent?.trim() || '')
        .filter(Boolean)
        .join(' ');
      return [
        node.getAttribute('aria-label'),
        labelledBy,
        node.getAttribute('title'),
        node.textContent,
        node.querySelector('title')?.textContent,
      ].map((value) => String(value || '').trim()).find(Boolean) || '';
    }

    for (const [index, node] of controls.entries()) {
      if (!isVisible(node)) continue;
      visibleCount += 1;
      const rect = node.getBoundingClientRect();
      const command = node.matches('button, a[href], [role="button"]');
      const name = command ? accessibleName(node) : '';
      const marker = node.id ? `#${node.id}` : `[${index}]`;
      const identity = `${node.tagName.toLowerCase()}${marker}${name ? ` "${name.slice(0, 48)}"` : ''}`;

      if (rect.width <= 1 || rect.height <= 1) fatal.push(`${identity}: нулевой размер`);
      if (command && !name) fatal.push(`${identity}: нет доступного имени`);
      if (isMobile && command && (rect.width < 32 || rect.height < 32)) {
        warnings.push(`${identity}: малая цель ${Math.round(rect.width)}x${Math.round(rect.height)}`);
      }
    }

    return { visibleCount, fatal, warnings };
  }, mobile);

  if (audit.fatal.length) {
    throw new Error(`Панель ${panelName} содержит недоступные элементы: ${audit.fatal.join('; ')}`);
  }
  return { panelName, ...audit };
}

async function checkViewport(browser, target) {
  const context = await browser.newContext({
    viewport: target.viewport,
    ignoreHTTPSErrors: true,
    locale: 'ru-RU',
  });
  let page = await context.newPage();
  const consoleErrors = [];
  const requestErrors = [];

  try {
    await loginToLuci(page);
    // Первый HTTP 403 является штатным ответом LuCI до авторизации. После
    // получения session cookie открываем чистую страницу в том же context и
    // начинаем собирать ошибки только для уже авторизованного интерфейса.
    await page.close();
    page = await context.newPage();
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
    await page.goto(process.env.SHEEPFOLD_LUCI_URL, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    // После входа LuCI сначала показывает системный spinner и только затем
    // асинхронно компилирует view Sheepfold. Ждать фиксированные 800 мс нельзя:
    // время зависит от мощности роутера и холодного browser-кэша.
    const topTabs = page.locator('button.sf-tab[data-tab]');
    await topTabs.first().waitFor({ state: 'visible', timeout: 30_000 });
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
    const controlAudits = [];
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
      if (tabName === 'logs') {
        await validateLogPanel(page);
      }
      checkedPanels.push(tabName);
      controlAudits.push(await validatePanelControls(panel, `top:${tabName}`, target.name === 'mobile'));
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
      controlAudits.push(await validatePanelControls(panel, `settings:${tabName}`, target.name === 'mobile'));
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
      controlAudits,
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
  const uxWarningCount = results.reduce((total, result) => (
    total + result.controlAudits.reduce((sum, audit) => sum + audit.warnings.length, 0)
  ), 0);
  if (uxWarningCount) {
    console.warn(`WARN: найдено ${uxWarningCount} неблокирующих UX-предупреждений; подробности в result.json.`);
  }
  fs.writeFileSync(
    path.join(reportDir, 'result.json'),
    `${JSON.stringify({ status: 'pass', checkedAt: new Date().toISOString(), uxWarningCount, results }, null, 2)}\n`,
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
