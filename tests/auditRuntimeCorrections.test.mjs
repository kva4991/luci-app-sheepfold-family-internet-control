/* Runtime regressions for defects found by the post-finalization audit. §ovaudit1 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it } from 'node:test';
import vm from 'node:vm';

const resources = resolve('package/luci-app-sheepfold-family-internet-control/htdocs/luci-static/resources');
const source = (relative) => readFileSync(resolve(resources, relative), 'utf8');
function loadModule(relative, extras = {}) {
  const raw = source(relative).replace(/^'require .*?';\r?\n/gm, '');
  const context = {
    module: { exports: {} }, baseclass: { extend: (value) => value }, Promise, Object, Array, String,
    Number, Boolean, Math, Date, JSON, Error, RegExp, Map, Set, encodeURIComponent,
    _: (value) => value, E: (tag, attrs, children) => ({ tag, attrs: attrs || {}, children, disabled: false,
      classList: { add() {}, remove() {}, toggle() {} }, addEventListener() {}, replaceChildren() {} }),
    ui: { hideModal() {}, showModal() {} }, window: { confirm: () => true, setTimeout, clearTimeout, setInterval, clearInterval },
    document: { querySelectorAll: () => [] }, ...extras,
  };
  vm.createContext(context);
  vm.runInContext(`(function () { ${raw.replace('return baseclass.extend(', 'module.exports = baseclass.extend(')} })()`, context, { filename: relative });
  return context.module.exports;
}
function actionExecutor() {
  return { execute(spec) { return Promise.resolve().then(() => spec.task ? spec.task() : null).then((data) => ({ data })); } };
}

describe('audited runtime corrections §ovaudit1', () => {
  it('normalizes MAC lookups and obtains group colors only through exported model APIs', () => {
    const module = loadModule('sheepfold/features/groups/naming.js');
    const adapter = module.create({
      uci: { set() {} }, get: (_c, _s, _o, fallback) => fallback,
      sections: (_c, type) => type === 'device' ? [{ '.name': 'device_7', mac: 'AA:BB:CC:DD:EE:FF', group: 'Family' }] : [],
      notConfigured: 'Not configured', groupModel: { hash: () => 3, palette: () => ['#111111'], validColor: () => true,
        automaticColor: () => '#222222', nextColor: () => '#333333' },
      normalizeMac: (value) => String(value || '').toUpperCase(), reservedListSection: () => false,
      generatedSectionName: (prefix) => prefix + '_generated', devices: () => [{ id: '7', mac: 'aa:bb:cc:dd:ee:ff', group: 'Family' }],
    });
    const grouped = { Family: [] };
    adapter.supplement(grouped, [{ id: '7', mac: 'aa:bb:cc:dd:ee:ff', group: 'Family' }]);
    assert.equal(grouped.Family.length, 1);
    assert.match(adapter.automaticColor('Family'), /^#[0-9a-f]{6}$/i);
    assert.doesNotMatch(source('sheepfold/features/groups/naming.js'), /colorForName/);
  });

  it('keeps pre-commit schedule failure on a Promise and emits the original error', async () => {
    const module = loadModule('sheepfold/features/schedules/controller.js');
    let persist;
    const notices = [];
    const controller = module.create({
      model: { ranges: () => [], timeToMinutes: () => 0, windows: () => [], windowsOverlap: () => false }, view: { render: () => ({}) },
      editor: { open: (deps) => { persist = deps.persist; } }, persistence: { persistDraft: async () => { throw new Error('commit failed'); }, reload: async () => {} },
      actions: actionExecutor(), sections: () => [], get: () => '', listValues: (value) => value || [], devices: () => [], deviceById: () => null,
      displayDeviceId: () => '#1', groups: {}, conflictValue: () => 'off', refresh() {}, notify: (message, level) => notices.push([message, level]),
      errorText: (error, fallback) => error.message || fallback,
    });
    controller.openEditor(null, false);
    const result = persist({}, '', null);
    assert.equal(typeof result.then, 'function');
    await result;
    assert.deepEqual(notices, [['commit failed', 'warning']]);
  });

  it('rejects asynchronous UCI stage callbacks and cleans the owned local state', async () => {
    const module = loadModule('sheepfold/core/persistence/uci.js');
    const events = [];
    const uci = { state: { creates: {}, changes: {}, deletes: {}, reorder: {} }, changes: async () => ({}),
      save: async () => events.push('save'), apply: async () => events.push('apply'), unload: (config) => events.push(`unload:${config}`), load: async () => {} };
    const adapter = module.create({ uci, revert: async () => {} });
    await assert.rejects(adapter.mutate(['sheepfold'], () => Promise.resolve()), (error) => error.errorCode === 'uci_async_stage_forbidden');
    assert.deepEqual(events, ['unload:sheepfold']);
  });

  it('checks backend exit codes and propagates discovery and service restart failures', async () => {
    const module = loadModule('sheepfold/features/settings/side-effects.js');
    const base = {
      run: async () => ({ code: 0 }), ensureOk(result, fallback) { if (result.code) throw new Error(fallback); return result; },
      siteCronError: () => 'cron failed', sitePolicyError: () => 'site failed', ledError: () => 'led failed', ipv6Error: () => 'ipv6 failed',
      scheduleError: () => 'schedule failed', emergencyError: () => 'emergency failed', discoveryError: () => 'discovery failed',
      restartError: () => 'restart failed', countryProfileError: () => 'country failed', refreshSiteStatus: async () => {}, emergencySitesChanged: () => false,
      writeDiscovery: async () => {}, restartService: async () => ({ code: 0 }), reloadConfig: async () => {}, refreshEmergencySites: async () => {}, reloadPage: async () => {},
    };
    await assert.rejects(module.create({ ...base, run: async () => ({ code: 3 }) }).apply({ router_led_control: 'off' }), /led failed/);
    await assert.rejects(module.create({ ...base, writeDiscovery: async () => { throw new Error('write failed'); } }).apply({ app_port: '5202' }), /write failed/);
    await assert.rejects(module.create({ ...base, restartService: async () => ({ code: 9 }) }).apply({ app_port: '5202' }), /restart failed/);
  });

  it('reports a partially completed device batch with exact counters', async () => {
    const module = loadModule('sheepfold/features/devices/controller.js');
    const selected = [{ id: '1', mac: 'AA:AA:AA:AA:AA:01', status: 'new' }, { id: '2', mac: 'AA:AA:AA:AA:AA:02', status: 'new' }];
    let calls = 0;
    const controller = module.create({
      store: { devices: () => selected, replaceDevices: () => selected }, inventory: { normalizeMac: (value) => value, listValues: (value) => value || [], macInList: () => false, build: () => [] },
      persistence: { setBackendStatus: async () => { if (++calls === 2) throw new Error('second failed'); }, reload: async () => {} }, actions: actionExecutor(),
      accessLists: { conflictingList: () => '' }, sections: () => [], administrators: () => ({ isAdminDevice: () => false }), quickAllowlist: { create: () => ({ button() {} }) },
      groups: { normalize: (value) => value, display: (value) => value, options: () => [] }, fs: { read: async () => '' }, pageRefresh: { userLists() {}, groups() {} },
      selection: {}, table: {}, types: {}, typeControl: {}, editor: {}, wifiPayload: {}, discovery: {}, random: {}, wifi: () => ({}), notConfigured: 'Not configured',
      get: () => '', run: async () => ({ code: 0 }), ensureOk() {}, errorText: (error) => error.message, notify() {}, infoValue: (value) => value,
      forms: {}, iconButton() {}, identityIcon() {}, adminCrown() {}, staticLease() {}, qrCode() {}, settingLine() {},
    });
    await assert.rejects(controller.persistMembership(selected, 'allow'),
      (error) => error.persisted === true && error.partial === true && error.completedCount === 1 && error.totalCount === 2);
  });

  it('validates administrator logins, avoids section collisions and removes device schedule targets', () => {
    const module = loadModule('sheepfold/features/pairing/persistence.js');
    const sections = [{ '.name': 'admin_parent_deadbeef', '.type': 'administrator', login: 'other' },
      { '.name': 'school', '.type': 'schedule', target_type: 'device', targets: ['7', '8'] }];
    const lists = [];
    const adapter = module.create({
      uci: { set() {}, get: () => '' }, persistence: { sections: (_c, type) => type ? sections.filter((item) => item['.type'] === type) : sections,
        ensureSection: (_c, type, name) => { sections.push({ '.name': name, '.type': type }); return name; }, replaceList: (_c, section, option, values) => lists.push([section, option, [...values]]),
        mutate: async (_configs, stage) => ({ stageResult: stage() }) },
      devicePersistence: { ensureDeviceSection: (device) => `device_${device.id}`, updateMacList() {}, saveAccess: async (_c, stage) => ({ stageResult: stage() }) },
      normalizeMac: (value) => value, notConfiguredGroup: 'Not configured', deviceById: () => null, canBind: () => true,
      listValues: (value) => Array.isArray(value) ? value : [], action: async () => ({ result: {}, data: {} }),
    });
    assert.equal(adapter.validateLogin('parent.one+2'), true);
    assert.equal(adapter.validateLogin('bad login'), false);
    assert.notEqual(adapter.sectionName({ login: 'a.b' }), adapter.sectionName({ login: 'a-b' }));
    adapter.stageBindings({ login: 'parent', name: 'Parent' }, [{ id: '7', mac: 'AA' }], []);
    assert.deepEqual(lists.find(([section]) => section === 'school')[2], ['8']);
  });

  it('blocks protected, assigned and schedule-referenced group deletion in persistence', async () => {
    const module = loadModule('sheepfold/features/groups/persistence.js');
    function make(groups, devices = [], schedules = []) {
      return module.create({ uci: { remove() {} }, groupModel: { hash: () => 1, membershipChanges: () => [] },
        persistence: { sections: (_c, type) => type === 'group' ? groups : type === 'device' ? devices : type === 'schedule' ? schedules : [],
          mutate: async (_c, stage) => ({ stageResult: stage() }), ensureSection: () => 'group_1', replaceList() {} },
        normalizeGroupName: (value) => String(value || ''), listValues: (value) => value || [], normalizeMac: (value) => value,
        devicePersistence: {}, notConfiguredGroup: 'Not configured', noRestrictionsGroupName: () => 'No restrictions', personalDevicesGroupName: () => 'Personal devices' });
    }
    await assert.rejects(make([{ '.name': 'p', '.type': 'group', name: 'P', protected: '1' }]).remove('p'), (e) => e.errorCode === 'group_protected');
    await assert.rejects(make([{ '.name': 'g', '.type': 'group', name: 'G' }], [{ '.name': 'd', '.type': 'device', group: 'G' }]).remove('g'), (e) => e.errorCode === 'group_has_devices');
    await assert.rejects(make([{ '.name': 'g', '.type': 'group', name: 'G' }], [], [{ '.name': 's', '.type': 'schedule', target_type: 'group', targets: ['g'] }]).remove('g'), (e) => e.errorCode === 'group_referenced_by_schedule');
  });

  it('uses MAC-only quick-allowlist identity and catches rejected polling reads', () => {
    const quick = source('sheepfold/features/devices/quick-allowlist.js');
    assert.match(quick, /function candidateKey\(device\)[\s\S]*normalizeMac/);
    assert.doesNotMatch(quick, /device\.ip \|\| device\.name/);
    assert.match(quick, /refreshCandidates\(\)\.catch/);
  });

  it('unlocks the Wi-Fi editor even when synchronous staging throws', async () => {
    const module = loadModule('sheepfold/features/wifi/editor.js', { wifiCards: {
      editorIsDirty: () => true, editorSnapshot: () => ({ ssid: 'Home', encryption: 'psk2', password: 'secret', channel: 'auto', enabled: true }),
    } });
    const buttons = [{ disabled: false, classList: { toggle() {} } }];
    const editorNode = { addEventListener() {} };
    const instance = module.create({
      setOption() { throw new Error('stage failed'); }, unsetOption() {}, persist: (stage) => Promise.resolve().then(stage),
      confirm: () => true, notify() {}, errorText: (error) => error.message,
    });
    instance.register({ sectionName: 'wifi0', device: 'radio0', original: { enabled: true }, radioDisabled: false,
      ssidInput: editorNode, passwordInput: editorNode, securitySelect: editorNode, channelSelect: editorNode, enabledInput: editorNode });
    const oldDocument = globalThis.document;
    globalThis.document = { querySelectorAll: () => buttons };
    try { await assert.rejects(instance.save(), /stage failed/); assert.equal(buttons[0].disabled, false); }
    finally { globalThis.document = oldDocument; }
  });
});
