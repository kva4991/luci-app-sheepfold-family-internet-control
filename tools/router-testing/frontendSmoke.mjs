/*
 * Запускает read-only аудит Sheepfold в реальной LuCI на desktop и mobile и
 * сохраняет скриншоты с JSON-результатом. Все проверки страницы находятся в
 * frontendAudit.mjs; этот файл не нажимает команды приложения и не сохраняет UCI. §uxrev01
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { checkViewport, summarizeUxWarnings } from './frontendAudit.mjs';

const requiredEnvironment = [
  'SHEEPFOLD_PLAYWRIGHT_ROOT',
  'SHEEPFOLD_BROWSER_PATH',
  'SHEEPFOLD_LUCI_URL',
  'SHEEPFOLD_LUCI_USER',
  'SHEEPFOLD_LUCI_PASSWORD',
  'SHEEPFOLD_FRONTEND_REPORT_DIR',
];
for (const name of requiredEnvironment) {
  if (!process.env[name]) throw new Error(`Не задана обязательная переменная ${name}`);
}

const require = createRequire(import.meta.url);
const playwrightEntry = path.join(process.env.SHEEPFOLD_PLAYWRIGHT_ROOT, 'node_modules', 'playwright-core');
const { chromium } = require(playwrightEntry);
const reportDir = process.env.SHEEPFOLD_FRONTEND_REPORT_DIR;
const stylePath = process.env.SHEEPFOLD_FRONTEND_STYLE_PATH
  ? path.resolve(process.env.SHEEPFOLD_FRONTEND_STYLE_PATH)
  : null;
if (stylePath && !fs.existsSync(stylePath)) throw new Error(`Локальный CSS не найден: ${stylePath}`);
const styleText = stylePath ? fs.readFileSync(stylePath, 'utf8') : null;
const credentials = {
  url: process.env.SHEEPFOLD_LUCI_URL,
  user: process.env.SHEEPFOLD_LUCI_USER,
  password: process.env.SHEEPFOLD_LUCI_PASSWORD,
};
fs.mkdirSync(reportDir, { recursive: true });

function target(name, viewport) {
  return {
    name,
    viewport,
    screenshotPath: path.join(reportDir, `${name}.png`),
    failureScreenshotPath: path.join(reportDir, `${name}-failure.png`),
  };
}

const browser = await chromium.launch({
  executablePath: process.env.SHEEPFOLD_BROWSER_PATH,
  headless: true,
});
try {
  // Последовательный запуск бережёт маломощный роутер и делает сетевые ошибки
  // воспроизводимее, чем две одновременные LuCI-сессии.
  const results = [];
  const options = { styleText };
  results.push(await checkViewport(browser, target('desktop', { width: 1440, height: 900 }), credentials, options));
  results.push(await checkViewport(browser, target('mobile', { width: 390, height: 844 }), credentials, options));
  const uxWarnings = summarizeUxWarnings(results);
  if (uxWarnings.total) {
    console.warn(`WARN: найдено ${uxWarnings.total} неблокирующих UX-предупреждений; подробности в result.json.`);
  }
  fs.writeFileSync(
    path.join(reportDir, 'result.json'),
    `${JSON.stringify({ status: 'pass', checkedAt: new Date().toISOString(), localStyleInjected: Boolean(stylePath), uxWarnings, results }, null, 2)}\n`,
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
