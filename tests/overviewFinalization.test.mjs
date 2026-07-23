import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { describe, it } from 'node:test';

const root = resolve(process.cwd());
const resources = join(root, 'package/luci-app-sheepfold-family-internet-control/htdocs/luci-static/resources');
const overviewPath = join(resources, 'view/sheepfold/overview.js');
const applicationPath = join(resources, 'sheepfold/features/overview/application.js');
const overview = readFileSync(overviewPath, 'utf8');
const application = readFileSync(applicationPath, 'utf8');

const modules = [
  'sheepfold/features/overview/application.js',
  'sheepfold/features/overview/store.js',
  'sheepfold/features/overview/environment.js',
  'sheepfold/features/page/shell.js',
  'sheepfold/features/page/refresh.js',
  'sheepfold/features/devices/controller.js',
  'sheepfold/features/wifi/controller.js',
  'sheepfold/features/schedules/controller.js',
  'sheepfold/features/groups/controller.js',
  'sheepfold/features/groups/naming.js',
  'sheepfold/features/administrators/controller.js',
  'sheepfold/features/settings/controller.js',
  'sheepfold/features/settings/backup-controller.js',
];

function stripAi(source) {
  return source.replace(/\/\* SHEEPFOLD_AI_BEGIN \*\/[\s\S]*?\/\* SHEEPFOLD_AI_END \*\//g, '');
}

function checkSyntax(source, label) {
  const temp = mkdtempSync(join(tmpdir(), 'sheepfold-overview-final-'));
  const file = join(temp, 'source.js');
  try {
    writeFileSync(file, source);
    const result = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
    assert.equal(result.status, 0, `${label}:\n${result.stderr || result.stdout}`);
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
}

describe('overview.js final composition root §frontmod §ovfinal1', () => {
  it('keeps overview.js as a tiny stable entry point', () => {
    const bytes = Buffer.byteLength(overview, 'utf8');
    const lines = overview.trimEnd().split(/\r?\n/).length;

    assert.ok(bytes < 256, `overview.js is ${bytes} bytes`);
    assert.ok(lines <= 4, `overview.js is ${lines} lines`);
    assert.match(overview, /require sheepfold\.features\.overview\.application as overviewApplication/);
    assert.match(overview, /return overviewApplication/);
    assert.doesNotMatch(overview, /uci\.|ui\.|fs\.|function\s+|pageShellModel/);
  });

  it('keeps application.js bounded and delegates every large feature boundary', () => {
    const bytes = Buffer.byteLength(application, 'utf8');
    const lines = application.split(/\r?\n/).length;

    assert.ok(bytes < 30_000, `application.js is ${bytes} bytes`);
    assert.ok(lines < 700, `application.js is ${lines} lines`);
    for (const alias of [
      'overviewStoreModel', 'overviewEnvironmentModel', 'pageShellModel',
      'deviceControllerModel', 'wifiControllerModel', 'scheduleControllerModel',
      'groupControllerModel', 'administratorControllerModel', 'settingsControllerModel',
    ]) {
      assert.match(application, new RegExp(`require sheepfold\\.[^;]+ as ${alias}`));
    }
    assert.match(application, /return pageShellModel\.create\(/);
    assert.doesNotMatch(application, /return view\.extend\(/);
    assert.doesNotMatch(application, /\buci\.(?:set|unset|remove|add|save|apply)\s*\(/);
    assert.doesNotMatch(application, /\bui\.(?:showModal|hideModal|addNotification)\s*\(/);
    assert.doesNotMatch(application, /\bfs\.exec\s*\(/);
    assert.doesNotMatch(application, /function (?:persistDeviceSettings|showAdminSettingsModal|showScheduleEditor|persistGroupSettings|renderSettingsMisc|renderDeviceTable)\b/);
    assert.doesNotMatch(application, /E\('(?:table|textarea|select)'/);
  });

  it('keeps controllers focused and individually reviewable', () => {
    for (const relative of modules) {
      const source = readFileSync(join(resources, relative), 'utf8');
      const lines = source.split(/\r?\n/).length;
      assert.ok(lines < 700, `${relative} is ${lines} lines`);
      checkSyntax(source, relative);
    }
    const store = readFileSync(join(resources, 'sheepfold/features/overview/store.js'), 'utf8');
    assert.doesNotMatch(store, /\buci\.|\bfs\.|\bui\.|routerBackend|document\.|window\./);
    const environment = readFileSync(join(resources, 'sheepfold/features/overview/environment.js'), 'utf8');
    assert.doesNotMatch(environment, /devicePersistence|schedulePersistence|groupPersistence|pairingPersistence/);
  });

  it('keeps the Standard product syntactically valid and free of AI presentation wiring', () => {
    const strippedApplication = stripAi(application);
    checkSyntax(strippedApplication, 'Standard application.js');
    assert.doesNotMatch(strippedApplication, /AI assistant|aiView|settingsAiModel|ai_individual_logs/);

    for (const relative of modules.concat([
      'sheepfold/features/settings/ai.js',
      'sheepfold/features/settings/side-effects.js',
      'sheepfold/features/settings/persistence.js',
    ])) {
      checkSyntax(stripAi(readFileSync(join(resources, relative), 'utf8')), `Standard ${relative}`);
    }
  });

  it('acknowledges the new-device LED only for the configured acknowledgement mode', () => {
    const shell = readFileSync(join(resources, 'sheepfold/features/page/shell.js'), 'utf8');
    const condition = shell.indexOf("router_led_control', 'router_default') === 'new_device_alert_until_luci_login'");
    const write = shell.indexOf("new-device-alert.ack", condition);
    assert.ok(condition >= 0 && write > condition);
    assert.match(shell, /'require uci';/);
  });
});
