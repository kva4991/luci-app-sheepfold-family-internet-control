/*
 * Read-only проверки уже открытого LuCI: вход, вкладки, информация о роутере,
 * overflow и доступность элементов. Модуль не сохраняет UCI и не нажимает команды
 * Sheepfold; браузерный runner отвечает только за запуск и артефакты. §uxrev01
 */

export const forbiddenPageText = Object.freeze([
  'RPCError',
  'factory yields invalid constructor',
  '[object HTML',
  'TypeError',
]);

export async function continueThroughLocalCertificateWarning(page, luciUrl) {
  const configuredUrl = new URL(luciUrl);
  const privateIpv4 = /^(?:10\.|192\.168\.|172\.(?:1[6-9]|2\d|3[01])\.)/;
  if (!privateIpv4.test(configuredUrl.hostname)) return;

  const kasperskyTitle = page.getByText('Kaspersky Endpoint Security для Windows', { exact: true });
  const continueLink = page.getByText('Я понимаю риск, но хочу продолжить', { exact: true });
  if (await kasperskyTitle.count() !== 1 || await continueLink.count() !== 1) return;

  // Kaspersky перехватывает self-signed HTTPS раньше Chromium. Исключение
  // допустимо только для буквального частного IP тестового роутера.
  await continueLink.click();
  await page.waitForLoadState('domcontentloaded');
}

export async function loginToLuci(page, credentials) {
  await page.goto(credentials.url, { waitUntil: 'domcontentloaded', timeout: 30_000 });
  await continueThroughLocalCertificateWarning(page, credentials.url);
  const username = page.locator('input[name="luci_username"]');
  if (await username.count()) {
    await username.fill(credentials.user);
    await page.locator('input[name="luci_password"]').fill(credentials.password);
    // LuCI 25.12 привязывает JS-обработчик к системной кнопке вне form.cbi-map.
    // Классы стабильнее переведённого текста и не отправят форму второй раз.
    const submit = page.locator('button.cbi-button-positive.important');
    if (await submit.count() !== 1) {
      throw new Error('В форме входа LuCI не найдена единственная кнопка отправки.');
    }
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

export async function validateRouterInformation(page) {
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

export async function validateLogPanel(page) {
  const toolbarButtons = page.locator('.sf-log-toolbar-row button');
  const buttonCount = await toolbarButtons.count();
  if (buttonCount !== 3) {
    throw new Error(`Панель журнала должна содержать фильтр, очистку и экспорт; найдено кнопок: ${buttonCount}`);
  }
  const filters = page.locator('.sf-log-filters-wrap');
  const toggle = page.locator('.sf-log-toolbar-row > button.sf-action-neutral');
  if (await toggle.count() !== 1) throw new Error('В панели журнала не найдена отдельная кнопка фильтра.');
  await toggle.click();
  await filters.waitFor({ state: 'visible', timeout: 5_000 });
  const inputCount = await filters.locator('input').count();
  const selectCount = await filters.locator('select').count();
  if (inputCount !== 5 || selectCount !== 1) {
    throw new Error(`Неполный набор фильтров журнала: input=${inputCount}, select=${selectCount}`);
  }
}

export async function validatePanelControls(panel, panelName, mobile) {
  const audit = await panel.evaluate((root, isMobile) => {
    const selector = 'button, a[href], [role="button"], input:not([type="hidden"]), select, textarea';
    const controls = [...root.querySelectorAll(selector)];
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
      const explicitLabel = node.id
        ? document.querySelector(`label[for="${CSS.escape(node.id)}"]`)?.textContent
        : '';
      return [
        node.getAttribute('aria-label'),
        labelledBy,
        explicitLabel,
        node.closest('label')?.textContent,
        node.getAttribute('title'),
        node.getAttribute('placeholder'),
        node.textContent,
        node.querySelector('title')?.textContent,
      ].map((value) => String(value || '').trim()).find(Boolean) || '';
    }

    for (const [index, node] of controls.entries()) {
      if (!isVisible(node)) continue;
      visibleCount += 1;
      const rect = node.getBoundingClientRect();
      const name = accessibleName(node);
      const marker = node.id ? `#${node.id}` : `[${index}]`;
      const identity = `${node.tagName.toLowerCase()}${marker}${name ? ` "${name.slice(0, 48)}"` : ''}`;
      const issue = (code, message) => ({ code, control: identity, message });

      if (rect.width <= 1 || rect.height <= 1) fatal.push(issue('zeroSize', 'нулевой размер'));
      if (!name) fatal.push(issue('missingName', 'нет доступного имени'));
      if (rect.left < -1 || rect.right > document.documentElement.clientWidth + 1) {
        fatal.push(issue('outsideViewport', `за границей viewport: left=${Math.round(rect.left)}, right=${Math.round(rect.right)}`));
      }
      if (isMobile && (rect.width < 24 || rect.height < 24)) {
        warnings.push(issue('targetBelow24', `малая цель ${Math.round(rect.width)}x${Math.round(rect.height)}`));
      } else if (isMobile && (rect.width < 32 || rect.height < 32)) {
        warnings.push(issue('targetBelow32', `компактная цель ${Math.round(rect.width)}x${Math.round(rect.height)}`));
      }
      if (node.scrollWidth > node.clientWidth + 2 && window.getComputedStyle(node).overflowX === 'hidden') {
        warnings.push(issue('clippedLabel', 'текст элемента обрезается'));
      }
    }
    return { visibleCount, fatal, warnings };
  }, mobile);

  if (audit.fatal.length) {
    throw new Error(`Панель ${panelName} содержит недоступные элементы: ${audit.fatal.map((item) => `${item.control}: ${item.message}`).join('; ')}`);
  }
  return { panelName, ...audit };
}

export async function checkPageOverflow(page, panelName) {
  const overflow = await page.evaluate(() => ({
    body: document.body.scrollWidth - document.body.clientWidth,
    document: document.documentElement.scrollWidth - document.documentElement.clientWidth,
  }));
  if (overflow.body > 1 || overflow.document > 1) {
    throw new Error(`Панель ${panelName} имеет горизонтальную прокрутку: body=${overflow.body}, document=${overflow.document}`);
  }
  return { panelName, ...overflow };
}

export function summarizeUxWarnings(results) {
  const byCode = {};
  for (const result of results) {
    for (const audit of result.controlAudits) {
      for (const warning of audit.warnings) byCode[warning.code] = (byCode[warning.code] || 0) + 1;
    }
  }
  return {
    total: Object.values(byCode).reduce((sum, count) => sum + count, 0),
    byCode,
  };
}

export async function checkViewport(browser, target, credentials, options = {}) {
  const context = await browser.newContext({
    viewport: target.viewport,
    ignoreHTTPSErrors: true,
    locale: 'ru-RU',
  });
  let page = await context.newPage();
  const consoleErrors = [];
  const requestErrors = [];

  try {
    await loginToLuci(page, credentials);
    // Ошибки до получения session cookie не относятся к авторизованному view.
    await page.close();
    page = await context.newPage();
    page.on('console', (message) => {
      if (message.type() === 'error') consoleErrors.push(message.text());
    });
    page.on('pageerror', (error) => consoleErrors.push(error.message));
    page.on('requestfailed', (request) => {
      const failure = request.failure();
      if (new URL(request.url()).origin === new URL(credentials.url).origin) {
        requestErrors.push(`${request.method()} ${request.url()}: ${failure?.errorText || 'unknown'}`);
      }
    });
    await page.goto(credentials.url, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    if (options.styleText) {
      // LuCI добавляет основной <link> внутрь view. Preview-стиль должен идти
      // после него, иначе равный по специфичности production CSS исказит тест.
      await page.evaluate((source) => {
        const style = document.createElement('style');
        style.setAttribute('data-sheepfold-local-preview', '');
        style.textContent = source;
        document.documentElement.appendChild(style);
      }, options.styleText);
    }
    const topTabs = page.locator('button.sf-tab[data-tab]');
    await topTabs.first().waitFor({ state: 'visible', timeout: 30_000 });
    const bodyText = await page.locator('body').innerText();
    if (!bodyText.includes('Sheepfold')) throw new Error('На странице LuCI не найдено название Sheepfold.');
    for (const fragment of forbiddenPageText) {
      if (bodyText.includes(fragment)) throw new Error(`На странице найден признак frontend-ошибки: ${fragment}`);
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
    const topTabCount = await topTabs.count();
    if (topTabCount < 5) throw new Error(`Найдено слишком мало верхних вкладок Sheepfold: ${topTabCount}`);
    for (let index = 0; index < topTabCount; index += 1) {
      const button = topTabs.nth(index);
      const tabName = await button.getAttribute('data-tab');
      await button.click();
      const panel = page.locator(`.sf-tab-panel[data-tab="${tabName}"]`);
      if (!(await panel.isVisible())) throw new Error(`После нажатия не открылась верхняя панель ${tabName}`);
      if (tabName === 'logs') await validateLogPanel(page);
      checkedPanels.push(tabName);
      controlAudits.push(await validatePanelControls(panel, `top:${tabName}`, target.name === 'mobile'));
      overflowSamples.push(await checkPageOverflow(page, `top:${tabName}`));
    }

    await page.locator('button.sf-tab[data-tab="settings"]').click();
    const settingsTabs = page.locator('button.sf-settings-tab[data-settings-tab]');
    const settingsTabCount = await settingsTabs.count();
    if (settingsTabCount < 5) throw new Error(`Найдено слишком мало вкладок настроек Sheepfold: ${settingsTabCount}`);
    for (let index = 0; index < settingsTabCount; index += 1) {
      const button = settingsTabs.nth(index);
      const tabName = await button.getAttribute('data-settings-tab');
      await button.click();
      const panel = page.locator(`.sf-settings-panel[data-settings-panel="${tabName}"]`);
      if (!(await panel.isVisible())) throw new Error(`После нажатия не открылась панель настроек ${tabName}`);
      if (tabName === 'info') routerInformation = await validateRouterInformation(page);
      checkedPanels.push(`settings:${tabName}`);
      controlAudits.push(await validatePanelControls(panel, `settings:${tabName}`, target.name === 'mobile'));
      overflowSamples.push(await checkPageOverflow(page, `settings:${tabName}`));
    }

    await page.screenshot({ path: target.screenshotPath, fullPage: true });
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
    await page.screenshot({ path: target.failureScreenshotPath, fullPage: true }).catch(() => {});
    throw error;
  } finally {
    await context.close();
  }
}
