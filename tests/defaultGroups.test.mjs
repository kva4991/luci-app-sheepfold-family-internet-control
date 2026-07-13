import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const packageDir = resolve(repoRoot, 'package/luci-app-sheepfold-family-internet-control');

function readProjectFile(path) {
  return readFileSync(resolve(packageDir, path), 'utf8');
}

describe('Default Sheepfold groups', () => {
  it('keeps singleton default groups in UCI and does not inject gettext duplicates in LuCI', () => {
    const overview = readProjectFile('htdocs/luci-static/resources/view/sheepfold/overview.js');

    assert.match(overview, /DEFAULT_GROUP_SECTION_IDS = \['no_restrictions', 'child_1'\]/);
    assert.match(overview, /LEGACY_GROUP_ALIASES/);
    assert.match(overview, /ensureDefaultGroupSections\(/);
    assert.match(overview, /defaultGroupDisplayName\('no_restrictions'/);
    assert.doesNotMatch(overview, /ensureVisibleDefaultGroup\(_\('No restrictions'\)/);
    assert.doesNotMatch(overview, /ensureVisibleDefaultGroup\(_\('Child number 1'\)/);
  });

  it('creates default group names from install language without overwriting custom names', () => {
    const helper = readProjectFile('root/usr/libexec/sheepfold/sheepfold-default-groups');

    assert.match(helper, /consume_install_language_pref/);
    assert.match(helper, /sync_luci_main_lang/);
    assert.match(helper, /luci\.main\.lang/);
    assert.match(helper, /install\.language/);
    assert.match(helper, /default_owner_display_name/);
    assert.match(helper, /INSTALL_LANGUAGE_SELECTED/);
    assert.match(helper, /current_nr/);
    assert.match(helper, /current_child/);
    assert.match(helper, /'First child'/);
    assert.match(helper, /'第一个孩子'/);
    assert.match(helper, /migrate_device_group_aliases/);
    assert.match(helper, /'No restrictions'\|'Без ограничений'/);
    assert.match(helper, /'Не настроено'\)[\s\S]*Not configured/);
  });

  it('assigns auto-detected devices to the canonical no_restrictions group name', () => {
    const detector = readProjectFile('root/usr/libexec/sheepfold/sheepfold-device-detector');
    const classifier = readProjectFile('root/usr/libexec/sheepfold/sheepfold-device-classifier');

    assert.match(detector, /no_restrictions_group_name\(\)/);
    assert.match(detector, /'No restrictions'\|'Без ограничений'/);
    assert.match(detector, /ensure_default_groups/);
    assert.match(detector, /write_locked_device_observation[\s\S]*assign_no_restrictions_if_allowed/);
    assert.match(detector, /\[ "\$current_group" = "\$target_group" \] && return 0/);
    assert.match(classifier, /sheepfold\.no_restrictions\.name/);
  });
});
