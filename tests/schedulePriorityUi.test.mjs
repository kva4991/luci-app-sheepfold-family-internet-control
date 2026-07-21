/*
 * Защищает визуальный редактор расписаний и совпадение его UCI-контракта с
 * реальным evaluator/firewall. Тест не открывает LuCI, поэтому загрузка модулей
 * и геометрия окна дополнительно проверяются browser smoke на живом роутере.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { chmodSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { delimiter, join, relative, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const overview = readFileSync('package/luci-app-sheepfold-family-internet-control/htdocs/luci-static/resources/view/sheepfold/overview.js', 'utf8');
const scheduleModel = readFileSync('package/luci-app-sheepfold-family-internet-control/htdocs/luci-static/resources/sheepfold/features/schedules/model.js', 'utf8');
const scheduleView = readFileSync('package/luci-app-sheepfold-family-internet-control/htdocs/luci-static/resources/sheepfold/features/schedules/view.js', 'utf8');
const scheduleEditor = readFileSync('package/luci-app-sheepfold-family-internet-control/htdocs/luci-static/resources/sheepfold/features/schedules/editor.js', 'utf8');
const settingsPersistence = readFileSync('package/luci-app-sheepfold-family-internet-control/htdocs/luci-static/resources/sheepfold/features/settings/persistence.js', 'utf8');
const styles = readFileSync('package/luci-app-sheepfold-family-internet-control/htdocs/luci-static/resources/sheepfold/sheepfold.css', 'utf8');
const defaults = readFileSync('package/luci-app-sheepfold-family-internet-control/root/usr/share/sheepfold/sheepfold.uci.defaults', 'utf8');
const makefile = readFileSync('package/luci-app-sheepfold-family-internet-control/Makefile', 'utf8');
const evaluator = readFileSync('package/luci-app-sheepfold-family-internet-control/root/usr/libexec/sheepfold/sheepfold-schedule-evaluator', 'utf8');
const firewall = readFileSync('package/luci-app-sheepfold-family-internet-control/root/usr/libexec/sheepfold/sheepfold-firewall', 'utf8');
const clientStatus = readFileSync('package/luci-app-sheepfold-family-internet-control/root/usr/libexec/sheepfold/sheepfold-client-status-effective', 'utf8');
const gotchas = readFileSync('docs/agent-gotchas.ru.md', 'utf8');
const ownerProfile = readFileSync('docs/owner-communication-profile.ru.md', 'utf8');
const publicClientStatus = readFileSync('package/luci-app-sheepfold-family-internet-control/root/usr/libexec/sheepfold/sheepfold-api-client-status', 'utf8');

const legacyOrder = 'emergency_sites no_restrictions blocklist allowlist global_block temp_access device_schedule group_schedule default_access';
const defaultOrder = 'blocklist admin_devices no_restrictions allowlist global_block temp_access device_schedule group_schedule default_access';

function runEvaluator(values, weekday = 'mon', minutes = '600', fallbackStatus = 'none') {
  mkdirSync(resolve('.build'), { recursive: true });
  const temp = mkdtempSync(join(resolve('.build'), 'sheepfold-schedule-'));
  const binDir = join(temp, 'bin');
  const uciData = join(temp, 'uci.txt');
  const stateDir = join(temp, 'state');
  const fakeUci = join(binDir, 'uci');

  mkdirSync(binDir);
  writeFileSync(uciData, Object.entries(values).map(([key, value]) => `${key}=${value}`).join('\n') + '\n');
  writeFileSync(fakeUci, `#!/bin/sh
[ "$1" = "-q" ] && shift
case "$1" in
  show) cat "$SHEEPFOLD_TEST_UCI" ;;
  get) sed -n "s|^$2=||p" "$SHEEPFOLD_TEST_UCI" | sed -n '1p' ;;
  *) exit 1 ;;
esac
`);
  chmodSync(fakeUci, 0o755);

  const result = spawnSync('bash', [
    resolve('package/luci-app-sheepfold-family-internet-control/root/usr/libexec/sheepfold/sheepfold-schedule-evaluator'),
    'device_1',
    fallbackStatus,
  ], {
    encoding: 'utf8',
    env: {
      ...process.env,
      PATH: `${binDir}${delimiter}${process.env.PATH || ''}`,
      SHEEPFOLD_TEST_UCI: relative(process.cwd(), uciData).replace(/\\/g, '/'),
      SHEEPFOLD_NOW_WEEKDAY: weekday,
      SHEEPFOLD_NOW_MINUTES: minutes,
      SHEEPFOLD_SCHEDULE_STATE_DIR: relative(process.cwd(), stateDir).replace(/\\/g, '/'),
      SHEEPFOLD_LOG_HELPER: relative(process.cwd(), join(temp, 'missing-log-helper')).replace(/\\/g, '/'),
    },
  });
  rmSync(temp, { recursive: true, force: true });
  assert.equal(result.status, 0, result.stderr);
  return Object.fromEntries(result.stdout.trim().split(/\r?\n/).map((line) => {
    const separator = line.indexOf('=');
    return [line.slice(0, separator), line.slice(separator + 1)];
  }));
}

function scheduleFixture(policy = 'off') {
  return {
    'sheepfold.device_1': 'device',
    'sheepfold.device_1.id': '1',
    'sheepfold.device_1.group': 'Дети',
    'sheepfold.global.schedule_conflict_internet': policy,
    'sheepfold.child_1': 'group',
    'sheepfold.child_1.name': 'Дети',
    'sheepfold.allow_rule': 'schedule',
    'sheepfold.allow_rule.enabled': '1',
    'sheepfold.allow_rule.target_type': 'device',
    'sheepfold.allow_rule.targets': '1',
    'sheepfold.allow_rule.weekdays': 'mon',
    'sheepfold.allow_rule.time_ranges': '09:00-11:00',
    'sheepfold.allow_rule.action': 'allow',
    'sheepfold.allow_rule.name': 'Уроки закончены',
    'sheepfold.block_rule': 'schedule',
    'sheepfold.block_rule.enabled': '1',
    'sheepfold.block_rule.target_type': 'device',
    'sheepfold.block_rule.targets': '1',
    'sheepfold.block_rule.weekdays': 'mon',
    'sheepfold.block_rule.time_ranges': '09:30-10:30',
    'sheepfold.block_rule.action': 'block',
    'sheepfold.block_rule.name': 'Учебное время',
  };
}

describe('Schedule editor and access priority UI', () => {
  it('keeps the future priority value complete but shows only the enforced runtime order', () => {
    assert.match(defaults, new RegExp(`option access_priority '${defaultOrder}'`));
    assert.match(makefile, new RegExp(`legacy_access_priority='${legacyOrder}'`));
    assert.match(makefile, new RegExp(`safe_access_priority='${defaultOrder}'`));
    assert.match(makefile, /current_access_priority.*sheepfold\.global\.access_priority/);
    assert.match(settingsPersistence, /function normalizeAccessOrder\(value, accessKeys\)/);
    const priorityField = overview.slice(
      overview.indexOf('function accessPriorityField()'),
      overview.indexOf('function scheduleConflictPolicyField()'),
    );
    assert.match(overview, /var accessSteps = \[\s*\['blocklist', 'Blocklist'\],\s*\['admin_devices', 'Admin devices'\]/);
    assert.match(priorityField, /var enforcedOrder = accessSteps/);
    assert.match(priorityField, /The order is temporarily fixed/);
    assert.doesNotMatch(priorityField, /setSettingsDraftOption\('access_priority'/);
    assert.doesNotMatch(priorityField, /moveStep|Move up|Move down|Reset order/);
  });

  it('edits and persists recurring rules without forcing deletion', () => {
    assert.match(overview, /function showScheduleEditor\(section, copyMode\)[\s\S]*scheduleEditor\.open/);
    assert.match(scheduleEditor, /function open\(deps, section, copyMode\)/);
    assert.match(overview, /setUciList\(secName, 'time_ranges', draft\.timeRanges\.map/);
    assert.match(overview, /uci\.set\('sheepfold', section, option, values\)/);
    assert.match(overview, /uci\.set\('sheepfold', secName, 'enabled', draft\.enabled \? '1' : '0'\)/);
    assert.match(overview, /function setScheduleEnabled\(section, enabled\)/);
    assert.match(overview, /function deleteSchedule\(section\)/);
    assert.match(scheduleView, /Disable without deleting/);
    assert.doesNotMatch(overview, /\['school_days', _\('School days'\)\]/);
  });

  it('handles overnight conflicts and scopes weekday selection to its modal', () => {
    assert.match(scheduleModel, /function windows\(days, runs, dayDefinitions\)/);
    assert.match(scheduleModel, /if \(end < start\)\s+end \+= 1440/);
    assert.match(scheduleModel, /\[-week, 0, week\]/);
    assert.match(overview, /scheduleModel\.windowsOverlap/);
    assert.match(scheduleEditor, /dayBox\.querySelectorAll\('\[data-schedule-day\]:checked'\)/);
    assert.doesNotMatch(scheduleEditor, /document\.querySelectorAll\('\[data-schedule-day\]:checked'\)/);
    assert.match(overview, /timeToMinutes: scheduleModel\.timeToMinutes/);
    assert.doesNotMatch(overview, /(^|[^.])\btimeToMinutes\(/m);
    assert.doesNotMatch(overview, /\bscheduleRanges\(/);
  });

  it('persists and enforces the selected schedule conflict outcome', () => {
    assert.match(defaults, /option schedule_conflict_internet 'off'/);
    assert.match(makefile, /ensure_global_option schedule_conflict_internet 'off'/);
    assert.match(overview, /function scheduleConflictPolicyField\(\)/);
    assert.match(overview, /setSettingsDraftOption\('schedule_conflict_internet', item\[0\]\)/);
    assert.match(overview, /function scheduleConflictResultText\(\)[\s\S]*return savedScheduleConflictInternetValue\(\) === 'on'/);
    assert.match(overview, /routerControl\(\['schedule-sync'\]\)/);
    assert.match(overview, /The conflict will still be shown in the interface and written to the journal/);

    assert.match(evaluator, /evaluate_scope device/);
    assert.match(evaluator, /evaluate_scope group/);
    assert.match(evaluator, /schedule_conflict_internet/);
    assert.match(evaluator, /schedule_conflict_internet_on/);
    assert.match(evaluator, /schedule_conflict_internet_off/);
    assert.match(evaluator, /Конфликт расписаний для устройства/);
    assert.match(firewall, /sheepfold-schedule-evaluator/);
    assert.match(clientStatus, /evaluate_schedule/);
    assert.match(publicClientStatus, /"scheduleConflict":%s/);
    assert.match(publicClientStatus, /Расписания конфликтуют/);
    assert.match(makefile, /\* \* \* \* \* \/usr\/libexec\/sheepfold\/sheepfold-firewall sync/);
  });

  it('applies access-affecting LuCI changes immediately after save', () => {
    assert.match(overview, /hasOwn\(options, 'new_device_policy'\)[\s\S]*routerControl\(\['schedule-sync'\]\)/);
    assert.match(overview, /saveUciChanges\(configs\.filter[\s\S]*Could not apply internet access rules/);
    assert.match(overview, /saveUciChanges\(\['sheepfold'\]\)\.then\(function \(\) \{[\s\S]*applySheepfoldAccessRuntime\(\)\.then/);
    assert.match(overview, /applySheepfoldAccessRuntime\(\)\.then\(function \(\) \{[\s\S]*Group saved/);
    assert.match(overview, /The group was saved, but internet access rules could not be applied/);
  });

  it('resolves real evaluator fixtures for off, on, specificity, and overnight windows', () => {
    const blockedConflict = runEvaluator(scheduleFixture('off'));
    assert.equal(blockedConflict.status, 'block');
    assert.equal(blockedConflict.conflict, '1');
    assert.equal(blockedConflict.reason, 'schedule_conflict_internet_off');

    const allowedConflict = runEvaluator(scheduleFixture('on'));
    assert.equal(allowedConflict.status, 'allow');
    assert.equal(allowedConflict.conflict, '1');

    const specificDevice = scheduleFixture('off');
    specificDevice['sheepfold.block_rule.target_type'] = 'group';
    specificDevice['sheepfold.block_rule.targets'] = 'child_1';
    const deviceWins = runEvaluator(specificDevice);
    assert.equal(deviceWins.status, 'allow');
    assert.equal(deviceWins.scope, 'device');
    assert.equal(deviceWins.conflict, '0');

    const overnight = scheduleFixture('off');
    delete overnight['sheepfold.allow_rule'];
    for (const key of Object.keys(overnight)) {
      if (key.startsWith('sheepfold.allow_rule.')) delete overnight[key];
    }
    overnight['sheepfold.block_rule.target_type'] = 'group';
    overnight['sheepfold.block_rule.targets'] = 'child_1';
    overnight['sheepfold.block_rule.weekdays'] = 'mon';
    overnight['sheepfold.block_rule.time_ranges'] = '22:00-07:00';
    const overnightResult = runEvaluator(overnight, 'tue', '60');
    assert.equal(overnightResult.status, 'block');
    assert.equal(overnightResult.scope, 'group');
  });

  it('returns the next boundary that really changes effective access', () => {
    const values = scheduleFixture('off');

    assert.equal(runEvaluator(values, 'mon', '480', 'block').next_change_time, '09:00');
    assert.equal(runEvaluator(values, 'mon', '480', 'allow').next_change_time, '09:30');
    assert.equal(runEvaluator(values, 'mon', '600', 'allow').next_change_time, '10:30');

    delete values['sheepfold.allow_rule'];
    for (const key of Object.keys(values)) {
      if (key.startsWith('sheepfold.allow_rule.')) delete values[key];
    }
    values['sheepfold.block_rule.target_type'] = 'group';
    values['sheepfold.block_rule.targets'] = 'child_1';
    values['sheepfold.block_rule.weekdays'] = 'mon';
    values['sheepfold.block_rule.time_ranges'] = '22:00-07:00';
    assert.equal(runEvaluator(values, 'tue', '60', 'allow').next_change_time, '07:00');
  });

  it('documents the visually-correct but runtime-broken failure class', () => {
    assert.match(gotchas, /§uirunfx/);
    assert.match(gotchas, /визуально выглядит нормально, а на роутере ломает правила/);
    assert.match(gotchas, /черновик → `Сохранить` → UCI после apply → backend → фактическое правило/);
  });

  it('keeps device and site list terminology explicit for future agents', () => {
    assert.match(ownerProfile, /§usrcomm/);
    assert.match(ownerProfile, /\*\*Чёрный список устройств\*\*/);
    assert.match(ownerProfile, /\*\*Чёрный список сайтов\*\*/);
    assert.match(ownerProfile, /всегда запрещает вход в LuCI, SSH и API роутера/);
  });

  it('includes stable visual layouts for schedules and priorities', () => {
    assert.ok(styles.includes('.sf-priority-list'));
    assert.ok(styles.includes('.sf-schedule-grid'));
    assert.ok(styles.includes('.sf-schedule-editor'));
    assert.ok(styles.includes('.sf-time-row'));
  });
});
