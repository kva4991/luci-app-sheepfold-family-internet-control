/*
 * Защищает UCI/runtime-контракт редактора групп после выноса DOM в feature-модуль.
 * Тест не взаимодействует с настоящим UCI или firewall, поэтому фактическое
 * применение членства дополнительно проверяется на тестовом роутере.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { readOverviewApplication } from '../tools/quality/overviewApplicationSource.mjs';

const root = 'package/luci-app-sheepfold-family-internet-control/htdocs/luci-static/resources/';
const overview = readOverviewApplication(root + 'view/sheepfold/overview.js');
const editor = readFileSync(root + 'sheepfold/features/groups/editor.js', 'utf8');
const controller = readFileSync(root + 'sheepfold/features/groups/controller.js', 'utf8');
const groupPersistence = readFileSync(root + 'sheepfold/features/groups/persistence.js', 'utf8');

describe('Group editor module §frontmod', () => {
  it('keeps modal state outside the overview and delegates persistence explicitly', () => {
    assert.match(overview, /require sheepfold\.features\.groups\.editor as groupEditor/);
    assert.match(overview, /require sheepfold\.features\.groups\.controller as groupControllerModel/);
    assert.match(controller, /function showSettings\(name, section, onSave\)[\s\S]*deps\.editor\.openSettings/);
    assert.match(controller, /function showAdd\(existingNames, onSave\)[\s\S]*deps\.editor\.openAdd/);
    assert.match(editor, /deps\.persistSettings\(payload, section, onSave, button\)/);
    assert.match(editor, /deps\.persistNew\([\s\S]*onSave, button\)/);
    assert.doesNotMatch(editor, /uci\.(?:get|set|unset|remove)|safeUciSections/);
  });

  it('applies membership through the DOM-free persistence adapter and updates inventory after commit', () => {
    const coordinator = controller.slice(
      controller.indexOf('function persistSettings('),
      controller.indexOf('function persistNew('),
    );

    assert.match(groupPersistence, /groupModel\.membershipChanges/);
    assert.match(groupPersistence, /markNoRestrictionsExcluded/);
    assert.match(groupPersistence, /markPersonalDevicesExcluded/);
    assert.match(groupPersistence, /persistence\.mutate\(\['sheepfold'\]/);
    assert.match(groupPersistence, /devicePersistence\.applyRuntime\(\)/);
    assert.match(coordinator, /deps\.persistence\.persistSettings\(payload, section, deps\.devices\(\)\)/);
    assert.match(coordinator, /The group was saved, but internet access rules could not be applied/);
    assert.match(controller, /change\.device\.group = change\.nextGroup/);
    assert.doesNotMatch(groupPersistence, /\bdocument\b|\bwindow\b|ui\.showModal|\bE\s*\(/);
  });

  it('creates groups without a page reload and preserves product-variant markers', () => {
    assert.match(controller, /function persistNew\(payload, onSave, button\)/);
    assert.match(groupPersistence, /auto_assignable', '0'/);
    assert.match(groupPersistence, /personal', payload\.personal \? '1' : '0'/);
    assert.doesNotMatch(editor, /window\.location\.reload/);
    assert.match(editor, /SHEEPFOLD_AI_BEGIN/);
    assert.match(editor, /SHEEPFOLD_AI_END/);
    assert.match(groupPersistence, /SHEEPFOLD_AI_BEGIN/);
    assert.match(groupPersistence, /SHEEPFOLD_AI_END/);
  });
});
