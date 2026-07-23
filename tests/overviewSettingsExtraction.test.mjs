/* Final ownership checks for Settings presentation after overview.js became a composition root. §settingview1 */
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { describe, it } from 'node:test';

const resources = resolve(process.cwd(), 'package/luci-app-sheepfold-family-internet-control/htdocs/luci-static/resources');
const read = (relative) => readFileSync(join(resources, relative), 'utf8');
const overview = read('sheepfold/features/overview/application.js');
const controller = read('sheepfold/features/settings/controller.js');
const fields = read('sheepfold/features/settings/fields.js');
const misc = read('sheepfold/features/settings/misc.js');
const storage = read('sheepfold/features/settings/storage.js');
const ai = read('sheepfold/features/settings/ai.js');
const typeControl = read('sheepfold/features/devices/type-control.js');

function stripAi(source) {
  return source.replace(/\/\* SHEEPFOLD_AI_BEGIN \*\/[\s\S]*?\/\* SHEEPFOLD_AI_END \*\//g, '');
}

function checkSyntax(source, label) {
  const dir = mkdtempSync(join(tmpdir(), 'sheepfold-settingview-'));
  const path = join(dir, 'source.js');
  writeFileSync(path, source);
  const result = spawnSync(process.execPath, ['--check', path], { encoding: 'utf8' });
  rmSync(dir, { recursive: true, force: true });
  assert.equal(result.status, 0, `${label}: ${result.stderr || result.stdout}`);
}

describe('overview settings presentation extraction §frontmod §settingview1', () => {
  it('loads the Settings controller and removes the large local helper block', () => {
    assert.match(overview, /require sheepfold\.features\.settings\.controller as settingsControllerModel/);
    assert.match(overview, /settingsControllerModel\.create\(/);
    assert.match(controller, /require sheepfold\.features\.settings\.fields as settingsFieldsModel/);
    assert.match(controller, /require sheepfold\.features\.settings\.misc as settingsMiscModel/);
    assert.match(controller, /require sheepfold\.features\.settings\.storage as settingsStorageModel/);
    assert.match(controller, /require sheepfold\.features\.settings\.ai as settingsAiModel/);
    for (const name of ['globalTextareaOptionField', 'aiSettingsBox', 'timeAutomationField', 'deviceTypeSelectControl'])
      assert.doesNotMatch(overview, new RegExp(`function\\s+${name}\\s*\\(`));
  });

  it('delegates Settings sections without adding persistence to presentation modules', () => {
    assert.match(controller, /var fields = settingsFieldsModel\.create/);
    assert.match(controller, /var miscPanel = settingsMiscModel\.create/);
    assert.match(controller, /var storageView = settingsStorageModel\.create/);
    assert.match(controller, /var aiView = settingsAiModel\.create/);
    assert.match(overview, /var deviceTypeControl = deviceTypeControlModel\.create/);
    for (const source of [fields, misc, storage, ai, typeControl])
      assert.doesNotMatch(source, /\buci\.(?:get|set|unset|save|apply|remove)|routerControl|saveUciChanges|'require [^']*overview/);
  });

  it('keeps each extracted source below the project warning threshold', () => {
    for (const [name, source] of Object.entries({ fields, misc, storage, ai, typeControl, controller }))
      assert.ok(source.split(/\r?\n/).length < 700, `${name} is too large`);
    assert.ok(overview.split(/\r?\n/).length < 650, `overview.js is ${overview.split(/\r?\n/).length} lines`);
  });

  it('keeps the moved behavior contracts in their focused owners', () => {
    assert.match(misc, /function confirmWifiAutoDisable/);
    assert.match(misc, /schedule_conflict_internet/);
    assert.match(misc, /site_lists_update_interval/);
    assert.match(storage, /log_retention/);
    assert.match(storage, /offline_device_retention_days/);
    assert.match(ai, /ai_provider/);
    assert.match(typeControl, /role': 'listbox'/);
    assert.match(controller, /renderFeedback[\s\S]*runAction: deps\.run[\s\S]*runCommand: deps\.run/);
  });

  it('keeps Standard valid after AI-only presentation is stripped', () => {
    for (const [name, source] of [['overview', overview], ['controller', controller], ['ai', ai]])
      checkSyntax(stripAi(source), name);
    const stripped = stripAi(ai);
    assert.match(stripped, /render: function \(\) \{ return ''; \}/);
    assert.doesNotMatch(stripped, /DeepSeek|Gemini|Grok|ai_provider/);
  });
});
