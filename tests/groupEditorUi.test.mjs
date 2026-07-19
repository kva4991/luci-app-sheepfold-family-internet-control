/*
 * Защищает UCI/runtime-контракт редактора групп после выноса DOM в feature-модуль.
 * Тест не взаимодействует с настоящим UCI или firewall, поэтому фактическое
 * применение членства дополнительно проверяется на тестовом роутере.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

const root = 'package/luci-app-sheepfold-family-internet-control/htdocs/luci-static/resources/';
const overview = readFileSync(root + 'view/sheepfold/overview.js', 'utf8');
const editor = readFileSync(root + 'sheepfold/features/groups/editor.js', 'utf8');

describe('Group editor module §frontmod', () => {
  it('keeps modal state outside the overview and delegates persistence explicitly', () => {
    assert.match(overview, /require sheepfold\.features\.groups\.editor as groupEditor/);
    assert.match(overview, /function showGroupSettingsModal[\s\S]*groupEditor\.openSettings/);
    assert.match(overview, /function showAddGroupModal[\s\S]*groupEditor\.openAdd/);
    assert.match(editor, /deps\.persistSettings\(payload, section, onSave\)/);
    assert.match(editor, /deps\.persistNew\(/);
    assert.doesNotMatch(editor, /uci\.(?:get|set|unset|remove)|safeUciSections/);
  });

  it('applies membership through the access runtime and updates inventory only after commit', () => {
    const persistStart = overview.indexOf('function persistGroupSettings(');
    const persistEnd = overview.indexOf('function persistNewGroup(', persistStart);
    const persist = overview.slice(persistStart, persistEnd);

    assert.match(persist, /groupModel\.membershipChanges/);
    assert.match(persist, /markNoRestrictionsAutoExcluded/);
    assert.match(persist, /markPersonalDevicesAutoExcluded/);
    assert.match(persist, /saveUciChanges\(\['sheepfold'\]\)\.then/);
    assert.match(persist, /applySheepfoldAccessRuntime\(\)\.then/);
    assert.match(persist, /The group was saved, but internet access rules could not be applied/);
    assert.match(persist, /commandErrorText\(error/);
    assert.match(persist, /change\.device\.group = change\.nextGroup/);
    assert.match(persist, /saveUciChanges\(\['sheepfold'\]\)\.then[\s\S]*finishSavedGroup\(\)/);
  });

  it('creates groups without a page reload and preserves product-variant markers', () => {
    assert.match(overview, /function persistNewGroup\(payload, onSave\)/);
    assert.match(overview, /auto_assignable', '0'/);
    assert.match(overview, /personal', payload\.personal \? '1' : '0'/);
    assert.doesNotMatch(editor, /window\.location\.reload/);
    assert.match(editor, /SHEEPFOLD_AI_BEGIN/);
    assert.match(editor, /SHEEPFOLD_AI_END/);
  });
});
