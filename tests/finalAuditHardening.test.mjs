import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it } from 'node:test';
import vm from 'node:vm';

const resources = resolve('package/luci-app-sheepfold-family-internet-control/htdocs/luci-static/resources');

function loadModule(relative, extras = {}) {
  const raw = readFileSync(resolve(resources, relative), 'utf8').replace(/^'require .*?';\r?\n/gm, '');
  const executable = raw.replace('return baseclass.extend(', 'module.exports = baseclass.extend(');
  const context = {
    module: { exports: {} }, baseclass: { extend: (value) => value }, Promise, Object, Array,
    String, Number, Boolean, Math, Date, JSON, Error, RegExp, Map, Set, parseInt, isNaN,
    setTimeout, clearTimeout, setInterval, clearInterval,
    _: (value) => value,
    E: (tag, attrs, children) => ({
      tag, attrs: attrs || {}, children: Array.isArray(children) ? children : children == null ? [] : [children],
      disabled: false, setAttribute(name, value) { this.attrs[name] = String(value); },
      removeAttribute(name) { delete this.attrs[name]; }, classList: { add() {}, remove() {}, toggle() {} },
    }),
    ui: { showModal() {}, hideModal() {} }, document: { querySelectorAll: () => [] },
    window: { setTimeout, clearTimeout, setInterval, clearInterval, confirm: () => true },
    ...extras,
  };
  vm.createContext(context);
  vm.runInContext(`(function () { ${executable} })()`, context, { filename: relative });
  return context.module.exports;
}

function cleanState() { return { creates: {}, changes: {}, deletes: {}, reorder: {} }; }

function directApplyUci(events = []) {
  const state = cleanState();
  return {
    state,
    sections: () => [],
    changes: async () => ({}),
    set(config, section, option, value) {
      state.changes[config] ||= {}; state.changes[config][section] ||= {}; state.changes[config][section][option] = value;
    },
    unset() {}, add(_config, _type, name) { return name; },
    save() { events.push('save'); this.state.creates = {}; this.state.changes = {}; this.state.deletes = {}; this.state.reorder = {}; return Promise.resolve(); },
    callApply: async () => { events.push('apply'); return 0; },
    callConfirm: async () => { events.push('confirm'); return 0; },
    unload: (config) => events.push(`unload:${config}`), load: async () => {},
  };
}

function immediateTimer(callback) { callback(); return 1; }

describe('final cumulative hardening experiments §ovaudit4', () => {
  it('checks remote UCI state once, stages synchronously and invokes save in the same turn', async () => {
    const module = loadModule('sheepfold/core/persistence/uci.js');
    const events = [];
    const uci = directApplyUci(events);
    let changesCalls = 0;
    uci.changes = async () => { changesCalls += 1; events.push('preflight'); return {}; };
    const adapter = module.create({ uci, revert: async () => {}, setTimeout: immediateTimer });
    const result = await adapter.mutate(['sheepfold'], () => {
      events.push('stage');
      uci.set('sheepfold', 'global', 'language', 'ru');
      return 'done';
    });
    assert.equal(result.stageResult, 'done');
    assert.equal(changesCalls, 1);
    assert.deepEqual(events.slice(0, 5), ['preflight', 'stage', 'save', 'apply', 'confirm']);
    assert.equal(adapter.save, undefined, 'unsafe already-staged compatibility save must not be exported');
  });

  it('does not disguise UCI section enumeration failures and deduplicates list values', () => {
    const module = loadModule('sheepfold/core/persistence/uci.js');
    const writes = [];
    const expected = new Error('sections failed');
    const adapter = module.create({
      uci: {
        sections() { throw expected; }, unset: (...args) => writes.push(['unset', ...args]),
        set: (...args) => writes.push(['set', ...args]), state: cleanState(),
      },
      setTimeout: immediateTimer,
    });
    assert.throws(() => adapter.sections('sheepfold'), (error) => error === expected);
    const values = adapter.replaceList('sheepfold', 'allowlist', 'mac', ['AA', 'AA', '', 'BB']);
    assert.deepEqual(Array.from(values), ['AA', 'BB']);
    assert.deepEqual(Array.from(writes[1][4]), ['AA', 'BB']);
  });

  it('fails closed when direct apply/confirm primitives are unavailable', async () => {
    const module = loadModule('sheepfold/core/persistence/uci.js');
    const events = [];
    const uci = directApplyUci(events);
    delete uci.callApply; delete uci.callConfirm;
    const adapter = module.create({ uci, revert: async () => events.push('revert'), setTimeout: immediateTimer });
    await assert.rejects(adapter.mutate(['sheepfold'], () => uci.set('sheepfold', 'global', 'language', 'ru')),
      (error) => error.errorCode === 'uci_apply_api_unavailable' && error.uciCleanupAttempted === true);
    assert.ok(events.includes('revert'));
  });

  it('accepts a special saver whose UCI commit succeeded but runtime refresh failed', async () => {
    const module = loadModule('sheepfold/features/settings/save-flow.js');
    let dirty = true;
    let accepted = 0;
    const failure = new Error('runtime failed'); failure.persisted = true; failure.runtimeApplied = false;
    const saver = { isChanged: () => dirty, save: async () => { throw failure; }, accept: () => { dirty = false; accepted += 1; } };
    const flow = module.create({
      draft: {
        snapshot: () => ({}), dirtySavers: () => [saver], has: () => false, get: () => '',
        setSaving() {}, clearOptions() {},
      },
      persistence: { validate() {}, save: async () => {} }, applyRuntime: async () => {}, applyPostSave: async () => {},
      value: () => 'never', updateButtons() {}, notify() {}, notifyCentered() {}, errorText: (error) => error.message,
      confirmWifiAutoDisable: async () => true,
    });
    await assert.rejects(flow.save(), (error) => error === failure && error.completedSpecialSavers === 1);
    assert.equal(dirty, false);
    assert.equal(accepted, 1);
  });

  it('normalizes primitive Settings validation failures before notifying', async () => {
    const module = loadModule('sheepfold/features/settings/save-flow.js');
    const notices = [];
    const flow = module.create({
      draft: { snapshot: () => ({ language: 'ru' }), dirtySavers: () => [], has: () => false, get: () => '', setSaving() {}, clearOptions() {} },
      persistence: { validate() { throw 7; }, save: async () => {} }, applyRuntime: async () => {}, applyPostSave: async () => {},
      value: () => 'never', updateButtons() {}, notify: (message, level) => notices.push([message, level]),
      notifyCentered() {}, errorText: (error) => error.message, confirmWifiAutoDisable: async () => true,
    });
    await assert.rejects(flow.save(), (error) => error instanceof Error && error.cause === 7);
    assert.deepEqual(notices, [['7', 'warning']]);
  });

  it('rejects a device already owned by another administrator inside persistence', () => {
    const module = loadModule('sheepfold/features/pairing/persistence.js');
    const adapter = module.create({
      uci: { set() {}, get: () => '' }, persistence: { sections: () => [], replaceList() {}, ensureSection: (_c, _t, name) => name },
      devicePersistence: { ensureDeviceSection: () => 'device_1', updateMacList() {} }, normalizeMac: (value) => value,
      notConfiguredGroup: 'Not configured', deviceById: () => null, canBind: () => true, listValues: (value) => value || [],
      boundElsewhereError: () => 'already owned',
    });
    assert.throws(() => adapter.stageBindings({ login: 'parent-a', name: 'A' }, [{
      id: '1', mac: 'AA', adminDevice: true, adminLogin: 'parent-b',
    }], []), (error) => error.errorCode === 'administrator_device_already_bound' && error.adminLogin === 'parent-b');
  });

  it('treats missing selectedDevices as an empty group selection', () => {
    const module = loadModule('sheepfold/features/groups/persistence.js');
    let selectedIds;
    const adapter = module.create({
      uci: { set() {} }, groupModel: { hash: () => 1, membershipChanges: (_devices, _old, _next, ids) => { selectedIds = ids; return []; } },
      persistence: { sections: () => [], ensureSection: () => 'group_1', replaceList() {} },
      devicePersistence: { ensureDeviceSection: () => 'device_1' }, normalizeMac: (value) => value,
      normalizeGroupName: (value) => value, notConfiguredGroup: 'Not configured', noRestrictionsGroupName: () => 'No restrictions',
      personalDevicesGroupName: () => 'Personal devices', markNoRestrictionsExcluded() {}, markPersonalDevicesExcluded() {}, isAdminDevice: () => false,
    });
    const result = adapter.stageSettings({ oldName: 'Children', newName: 'Children', selectedSchedules: [], color: '#ffffff' }, null, []);
    assert.deepEqual(Array.from(selectedIds), []);
    assert.equal(result.sectionName, 'group_1');
  });

  it('applies committed group membership locally when post-commit reload fails', async () => {
    const module = loadModule('sheepfold/features/groups/controller.js', { ui: { hideModal() {} } });
    const device = { id: '1', group: 'Old' };
    const error = new Error('runtime failed');
    error.persisted = true; error.runtimeApplied = false;
    error.groupResult = { membershipChanges: [{ device, nextGroup: 'Children' }] };
    const notices = [];
    let savedCallback = 0;
    const controller = module.create({
      actions: { execute: () => Promise.reject(error) }, persistence: { persistSettings() {}, reload: async () => { throw new Error('reload failed'); } },
      notConfigured: 'Not configured', notify: (message, level) => notices.push([message, level]), errorText: (value) => value.message,
      devices: () => [device], refreshDevices() {}, naming: {}, forms: {}, createDeviceSelector() {}, schedules: () => ({}),
      editor: {}, view: {}, sections: () => [], model: {}, iconButton() {}, displayDeviceId() {}, listValues: (value) => value || [],
    });
    await controller.persistSettings({ oldName: 'Old' }, null, () => { savedCallback += 1; }, null);
    assert.equal(device.group, 'Children');
    assert.equal(savedCallback, 1);
    assert.ok(notices.some(([message]) => /could not be refreshed/.test(message)));
  });

  it('marks a fully persisted device batch runtime failure without calling it partial', async () => {
    const module = loadModule('sheepfold/features/devices/controller.js');
    const selected = [{ id: '1', mac: 'AA:AA:AA:AA:AA:01', status: 'new' }, { id: '2', mac: 'AA:AA:AA:AA:AA:02', status: 'new' }];
    const controller = module.create({
      store: { devices: () => selected, replaceDevices: (value) => value }, inventory: {
        normalizeMac: (value) => String(value || '').toUpperCase(), listValues: (value) => value || [], macInList: () => false,
      },
      groups: { normalize: (value) => value, sectionByName: () => null, display: (value) => value, options: () => [] },
      administrators: () => ({ isAdminDevice: () => false }), sections: () => [],
      persistence: { setBackendStatus: async () => ({}), applyRuntime: async () => { throw new Error('runtime failed'); }, reload: async () => {} },
      actions: { execute: (spec) => Promise.resolve().then(spec.task) }, accessLists: { conflictingList: () => '' },
      quickAllowlist: { create: () => ({ button: () => ({}) }) }, wifi: () => ({ readNetworks: () => [] }), wifiPayload: { build: () => '' },
      random: { urlToken: () => 'token' }, discovery: { quickAllowlistUrl: () => '', routerAddress: () => '' }, qrCode: () => ({}),
      settingLine: () => ({}), identityIcon: () => ({}), table: {}, selection: { create: () => ({}) }, fs: { read: async () => '' },
      pageRefresh: { userLists() {}, groups() {} }, editor: {}, typeControl: {}, forms: {}, types: {}, get: () => '',
      errorText: (error) => error.message, notify() {}, iconButton() {}, staticLeaseIcon() {}, adminCrownIcon() {}, deviceIdentityIcon() {},
      notConfigured: 'Not configured',
    });
    await assert.rejects(controller.persistMembership(selected, 'allow', null),
      (error) => error.persisted === true && error.partial === false && error.runtimeApplied === false && error.completedCount === 2 && error.totalCount === 2);
  });
  it('keeps an existing permanent DHCP lease removable from the device editor', () => {
    const editor = readFileSync(resolve(resources, 'sheepfold/features/devices/editor.js'), 'utf8');
    const block = editor.slice(editor.indexOf('var staticLeaseField'), editor.indexOf('/* SHEEPFOLD_AI_BEGIN */'));
    assert.match(block, /Uncheck to remove the existing permanent DHCP lease/);
    assert.doesNotMatch(block, /'disabled': 'disabled'/);
  });

  it('rechecks administrator-login uniqueness inside the serialized secure mutation', () => {
    const secure = readFileSync(resolve(resources, 'view/sheepfold/overview-secure.js'), 'utf8');
    const task = secure.slice(secure.indexOf("task: function ()"), secure.indexOf("}).then(function ()", secure.indexOf("task: function ()")));
    assert.match(task, /uciPersistence\.sections\('sheepfold', 'administrator'\)/);
    assert.match(task, /administrator_login_exists/);
    assert.ok(task.indexOf('administrator_login_exists') < task.indexOf('administratorSectionName(login)'));
  });

});
