import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it } from 'node:test';
import vm from 'node:vm';

const resources = resolve('package/luci-app-sheepfold-family-internet-control/htdocs/luci-static/resources');
const source = (relative) => readFileSync(resolve(resources, relative), 'utf8');

function loadModule(relative, extras = {}) {
  const raw = source(relative).replace(/^'require .*?';\r?\n/gm, '');
  const executable = raw.replace('return baseclass.extend(', 'module.exports = baseclass.extend(');
  const context = {
    module: { exports: {} }, baseclass: { extend: (value) => value }, Promise, Object, Array,
    String, Number, Boolean, Math, Date, JSON, Error, RegExp, Map, Set, parseInt, isNaN,
    setTimeout, clearTimeout, setInterval, clearInterval,
    _: (value) => value,
    E: (tag, attrs, children) => ({ tag, attrs: attrs || {}, children, disabled: false,
      classList: { add() {}, remove() {}, toggle() {} },
      addEventListener() {}, querySelectorAll: () => [], replaceChildren() {},
    }),
    ui: { hideModal() {}, showModal() {} },
    window: { confirm: () => true, setTimeout, clearTimeout, setInterval, clearInterval,
      location: { protocol: 'https:', hostname: '192.168.1.1' } },
    document: { querySelectorAll: () => [] },
    ...extras,
  };
  vm.createContext(context);
  vm.runInContext(`(function () { ${executable} })()`, context, { filename: relative });
  return context.module.exports;
}

function persistenceDeps(sections) {
  return {
    uci: { get: () => [], set() {}, unset() {}, remove() {} },
    persistence: {
      sections: (config, type) => (sections[config] || []).filter((section) => !type || section['.type'] === type),
      ensureSection: (config, type, name) => {
        sections[config] ||= [];
        sections[config].push({ '.name': name, '.type': type });
        return name;
      },
      replaceList() {}, reload: async () => {}, discard: async () => {},
    },
    accessLists: { updatedValues: () => [] }, normalizeMac: (value) => String(value || '').toUpperCase(),
    generatedSectionName: (prefix) => `${prefix}_generated`, normalizeGroupName: (value) => value,
    notConfiguredGroup: 'Not configured', isAdminDevice: () => false,
    noRestrictionsGroupName: () => '', personalDevicesGroupName: () => '',
    markNoRestrictionsExcluded() {}, markPersonalDevicesExcluded() {},
    run: async () => ({ code: 0 }), ensureOk: (result) => result,
    refreshSiteStatus: async () => {}, invalidMacMessage: () => 'bad mac',
    accessRuntimeError: () => 'access', siteRuntimeError: () => 'sites', action: async () => ({ result: {} }),
  };
}

describe('final r252 experimental regressions §ovaudit4', () => {
  it('allows an existing permanent DHCP lease to be explicitly removed in the editor', () => {
    const editor = source('sheepfold/features/devices/editor.js');
    assert.match(editor, /Uncheck to remove the existing permanent DHCP lease/);
    const leaseBlock = editor.slice(editor.indexOf('var staticLeaseField'), editor.indexOf('/* SHEEPFOLD_AI_BEGIN */'));
    assert.doesNotMatch(leaseBlock, /disabled/);
  });

  it('rejects a stale device section pointing at another MAC and recreates a missing deterministic section', () => {
    const module = loadModule('sheepfold/features/devices/persistence.js');
    const sections = { sheepfold: [{ '.name': 'wrong', '.type': 'device', mac: 'BB:BB:BB:BB:BB:BB' }], dhcp: [] };
    const deps = persistenceDeps(sections);
    const adapter = module.create(deps);
    assert.throws(() => adapter.ensureDeviceSection({ mac: 'AA:AA:AA:AA:AA:AA', configSection: 'wrong' }),
      (error) => error.errorCode === 'device_section_collision');
    const created = adapter.ensureDeviceSection({ mac: 'CC:CC:CC:CC:CC:CC', configSection: 'missing' });
    assert.equal(created, 'device_generated');
    assert.ok(sections.sheepfold.some((section) => section['.name'] === 'device_generated' && section['.type'] === 'device'));
  });

  it('never overwrites an unrelated DHCP host when the generated static-lease name collides', () => {
    const module = loadModule('sheepfold/features/devices/persistence.js');
    const sections = {
      sheepfold: [],
      dhcp: [{ '.name': 'sheepfold_generated', '.type': 'host', mac: 'BB:BB:BB:BB:BB:BB' }],
    };
    const deps = persistenceDeps(sections);
    deps.generatedSectionName = () => 'sheepfold_generated';
    const adapter = module.create(deps);
    assert.equal(adapter.ensureStaticDhcpSection({ mac: 'AA:AA:AA:AA:AA:AA' }), 'sheepfold_generated_2');
    assert.equal(sections.dhcp[0].mac, 'BB:BB:BB:BB:BB:BB');
  });

  it('marks a fully persisted device batch as runtime-failed instead of reporting a total rollback', async () => {
    const module = loadModule('sheepfold/features/devices/controller.js');
    const selected = [{ id: '1', mac: 'AA:AA:AA:AA:AA:AA', status: 'new', name: 'Phone', group: 'Not configured' }];
    const controller = module.create({
      store: { devices: () => selected, replaceDevices: () => selected },
      inventory: {
        normalizeMac: (value) => /^([0-9A-F]{2}:){5}[0-9A-F]{2}$/.test(String(value || '').toUpperCase()) ? String(value).toUpperCase() : '',
        listValues: (value) => value || [], macInList: () => false, build: () => selected,
      },
      sections: () => [], notConfigured: 'Not configured',
      groups: { normalize: (value) => value, sectionByName: () => null, display: (value) => value, options: () => [] },
      administrators: () => ({ isAdminDevice: () => false }),
      table: { sortHeader: () => null, filter() {} }, selection: { create: () => ({}) },
      quickAllowlist: { create: () => ({}) }, wifi: () => ({ readNetworks: () => [] }),
      wifiPayload: { build: () => '' }, random: { urlToken: () => 'token' },
      discovery: { quickAllowlistUrl: () => '', routerAddress: () => '' }, qrCode: () => null,
      settingLine: () => null, identityIcon: () => null, fs: { read: async () => '' },
      actions: { execute: (options) => Promise.resolve().then(options.task).then((data) => ({ data })) },
      persistence: {
        setBackendStatus: async () => ({}), applyRuntime: async () => { throw new Error('runtime failed'); },
        reload: async () => {}, removeFromList: async () => {}, persistSettings: async () => {},
      },
      accessLists: { conflictingList: () => '' }, pageRefresh: { userLists() {}, groups() {} },
      types: { displayedType: () => 'phone', byValue: () => ({ label: 'Phone' }), icon: () => null },
      typeControl: { control: () => ({ input: { value: 'phone' }, node: null }) },
      forms: {}, get: () => '', editor: {}, notify() {}, errorText: (error) => error.message,
    });
    await assert.rejects(controller.persistMembership(selected, 'allow'),
      (error) => error.persisted === true && error.runtimeApplied === false &&
        error.completedCount === 1 && error.totalCount === 1);
  });

  it('rejects stale or wrong-type schedule references before staging a silent no-op', async () => {
    const module = loadModule('sheepfold/features/schedules/persistence.js');
    const values = [{ '.name': 'rule', '.type': 'device' }];
    const adapter = module.create({
      uci: { set() {}, remove() {} },
      persistence: {
        sections: () => values, ensureSection: (_c, _t, name) => name, replaceList() {},
        mutate: async (_configs, stage) => ({ stageResult: stage() }), reload: async () => {}, discard: async () => {},
      },
      run: async () => ({ code: 0 }), ensureOk: (result) => result, runtimeError: () => 'runtime',
      newSectionName: () => 'schedule_new',
    });
    await assert.rejects(adapter.setEnabled({ '.name': 'rule' }, true),
      (error) => error.errorCode === 'schedule_section_type_conflict');
    values.length = 0;
    await assert.rejects(adapter.remove({ '.name': 'missing' }),
      (error) => error.errorCode === 'schedule_not_found');
  });

  it('rejects duplicate group creation and stale group editor references inside persistence', async () => {
    const module = loadModule('sheepfold/features/groups/persistence.js');
    const groups = [{ '.name': 'group_a', '.type': 'group', name: 'Children' }];
    const deps = {
      uci: { set() {}, remove() {} }, groupModel: { hash: () => 1, membershipChanges: () => [] },
      persistence: {
        sections: (_config, type) => groups.filter((group) => !type || group['.type'] === type),
        ensureSection: (_c, _t, name) => name, replaceList() {},
        mutate: async (_configs, stage) => ({ stageResult: stage() }), reload: async () => {}, discard: async () => {},
      },
      devicePersistence: { ensureDeviceSection: () => 'device_1', applyRuntime: async () => {} },
      normalizeMac: (value) => value, normalizeGroupName: (value) => value,
      notConfiguredGroup: 'Not configured', noRestrictionsGroupName: () => 'No restrictions',
      personalDevicesGroupName: () => 'Personal devices', markNoRestrictionsExcluded() {}, markPersonalDevicesExcluded() {},
      listValues: (value) => value || [], isAdminDevice: () => false,
    };
    const adapter = module.create(deps);
    await assert.rejects(adapter.persistNew({ name: 'Children', color: '#ffffff', personal: false }),
      (error) => error.errorCode === 'group_name_exists');
    await assert.rejects(adapter.persistSettings({
      oldName: 'Missing', newName: 'Missing', selectedDevices: [], selectedSchedules: [],
      color: '#ffffff', allowlistOnly: false,
    }, { '.name': 'missing', '.type': 'group' }, []),
    (error) => error.errorCode === 'group_not_found');
  });

  it('rechecks administrator login uniqueness inside the serialized creation mutation', async () => {
    const module = loadModule('sheepfold/features/pairing/persistence.js');
    const administrators = [{ '.name': 'admin_parent', '.type': 'administrator', login: 'Parent' }];
    const adapter = module.create({
      persistence: {
        sections: (_config, type) => administrators.filter((section) => !type || section['.type'] === type),
        ensureSection: (_c, _t, name) => name, replaceList() {},
      },
      devicePersistence: {
        saveAccess: async (_configs, stage) => ({ stageResult: stage() }),
        ensureDeviceSection: () => 'device_1', updateMacList() {},
      },
      uci: { set() {}, get() {} }, action: async () => ({ result: {} }), listValues: (value) => value || [],
      canBind: () => true, normalizeMac: (value) => value, deviceById: () => null,
    });
    await assert.rejects(adapter.persistBindings({ id: '2', login: 'parent', name: 'Other' }, [], [], true),
      (error) => error.errorCode === 'administrator_login_exists');
  });

  it('treats undefined apply/confirm statuses as failures rather than implicit success', async () => {
    const module = loadModule('sheepfold/core/persistence/uci.js');
    const state = { creates: {}, changes: {}, deletes: {}, reorder: {} };
    const uci = {
      state, changes: async () => ({}),
      set(_config, _section, _option, _value) { state.changes.sheepfold = { global: { language: 'ru' } }; },
      async save() { state.changes = {}; },
      async callApply() { return undefined; }, async callConfirm() { return 0; },
      unload() {}, async load() {},
    };
    const adapter = module.create({ uci, revert: async () => {}, setTimeout: (callback) => { callback(); } });
    await assert.rejects(adapter.mutate(['sheepfold'], () => uci.set('sheepfold', 'global', 'language', 'ru')),
      (error) => error.errorCode === 'uci_apply_failed' && error.uciCleanupAttempted === true);
  });

  it('keeps the secure administrator modal uniqueness check inside the mutation callback', () => {
    const secure = source('view/sheepfold/overview-secure.js');
    const mutation = secure.slice(secure.indexOf("return uciPersistence.mutate(['sheepfold']"), secure.indexOf('return sectionName;', secure.indexOf("return uciPersistence.mutate(['sheepfold']")));
    assert.match(mutation, /administratorLoginExists\(login\)/);
    assert.match(mutation, /administrator_login_exists/);
  });
});
