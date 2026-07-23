/* Focused checks for the final coordinator cleanup. §coordclean1 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it } from 'node:test';
import vm from 'node:vm';

const resources = resolve('package/luci-app-sheepfold-family-internet-control/htdocs/luci-static/resources');
const source = (relative) => readFileSync(resolve(resources, relative), 'utf8');
function loadModule(relative) {
  const raw = source(relative).replace(/^'require .*?';\r?\n/gm, '');
  const context = { module: { exports: {} }, baseclass: { extend: (value) => value }, Promise, Object, Array,
    String, Number, Boolean, Math, Date, JSON, Error, RegExp, encodeURIComponent };
  vm.createContext(context);
  vm.runInContext(`(function () { ${raw.replace('return baseclass.extend(', 'module.exports = baseclass.extend(')} })()`, context);
  return context.module.exports;
}
function persistence(sections = {}) {
  const calls = [];
  return {
    calls,
    sections: (_config, type) => sections[type] || [],
    ensureSection: (_config, _type, name) => name,
    replaceList: (...args) => calls.push(['list', ...args]),
    mutate: async (configs, stage) => { calls.push(['mutate', [...configs]]); return { stageResult: stage() }; },
    reload: async (configs) => calls.push(['reload', configs]),
    discard: async (configs) => calls.push(['discard', configs]),
  };
}

describe('LuCI coordinator cleanup §coordclean1', () => {
  it('keeps discovery and pairing construction pure and IPv6-safe', () => {
    const discovery = loadModule('sheepfold/features/router/discovery.js');
    assert.equal(discovery.routerAddress({ host: '[fd00::1]:443' }), 'fd00::1');
    assert.equal(discovery.urlHost('fd00::1'), '[fd00::1]');
    assert.equal(discovery.pairingPayload('192.168.1.1', 5201, 'Parent', '123456', 'a'.repeat(64)),
      `SF2|h=192.168.1.1|p=5201|u=Parent|c=123456|spki=${'a'.repeat(64)}`);
    assert.equal(discovery.quickAllowlistUrl('https:', 'fd00::1', 'a b'), 'https://[fd00::1]/q/a%20b');
  });

  it('preserves ordered settings side effects and checks every backend result', async () => {
    const model = loadModule('sheepfold/features/settings/side-effects.js');
    const events = [];
    const effects = model.create({
      run: async (args) => { events.push(args.join(':')); return { code: 0 }; },
      ensureOk(result, fallback) { if (result.code) throw new Error(fallback); return result; },
      siteCronError: () => 'cron', sitePolicyError: () => 'site', ledError: () => 'led', ipv6Error: () => 'ipv6', scheduleError: () => 'schedule',
      emergencyError: () => 'emergency', discoveryError: () => 'discovery', restartError: () => 'restart', countryProfileError: () => 'country',
      refreshSiteStatus: async () => events.push('site-status'), emergencySitesChanged: () => false,
      writeDiscovery: async () => events.push('discovery-write'), restartService: async () => { events.push('restart'); return { code: 0 }; },
      reloadConfig: async () => events.push('reload-config'), refreshEmergencySites: async () => events.push('refresh-emergency'), reloadPage: async () => {},
    });
    const options = { site_lists_update_interval: 'daily', site_blocklist_mode: 'all', router_led_control: 'off', router_ipv6_disabled: '1',
      schedule_conflict_internet: 'off', new_device_policy: 'restricted', domain_allowlist_for_blocklist: '1', app_port: '5202', country_profile: 'ru' };
    await effects.apply(options);
    await effects.applyPostSave(options);
    assert.deepEqual(events, ['site-lists-cron-apply', 'site-lists-apply', 'site-status', 'led-apply', 'ipv6-apply', 'schedule-sync',
      'emergency-sites-apply', 'discovery-write', 'restart', 'country-profile-apply:ru', 'reload-config', 'refresh-emergency']);
  });

  it('stages schedule lists inside one mutation and marks runtime-only failure as persisted', async () => {
    const model = loadModule('sheepfold/features/schedules/persistence.js');
    const writes = [];
    const p = persistence();
    const adapter = model.create({
      uci: { set: (...args) => writes.push(args), remove() {} }, persistence: p, newSectionName: () => 'schedule_new',
      run: async () => ({ code: 5 }), ensureOk(_result, fallback) { throw new Error(fallback); }, runtimeError: () => 'runtime failed',
    });
    await assert.rejects(adapter.persistDraft({ name: 'School', description: '', enabled: true, action: 'block', targetType: 'group',
      targets: ['child_1'], weekdays: ['mon'], timeRanges: [{ start: '09:00', end: '10:00' }] }, ''),
      (error) => error.persisted === true && error.runtimeApplied === false);
    assert.deepEqual(p.calls[0], ['mutate', ['sheepfold']]);
    assert.ok(p.calls.some((call) => call[0] === 'list' && call[3] === 'targets'));
    assert.ok(writes.some((entry) => entry[2] === 'name'));
  });

  it('stages group membership through one mutation and protects deletion invariants', async () => {
    const group = { '.name': 'children', '.type': 'group', name: 'Children' };
    const p = persistence({ group: [group], device: [{ '.name': 'device_1', '.type': 'device', mac: 'AA', group: 'Children' }], schedule: [] });
    const model = loadModule('sheepfold/features/groups/persistence.js');
    const adapter = model.create({
      uci: { set() {}, remove() {} }, persistence: p, groupModel: { hash: () => 1, membershipChanges: () => [] },
      devicePersistence: { ensureDeviceSection: () => 'device_1', applyRuntime: async () => {} }, normalizeMac: (value) => value,
      normalizeGroupName: (value) => value, notConfiguredGroup: 'Not configured', noRestrictionsGroupName: () => 'No restrictions',
      personalDevicesGroupName: () => 'Personal devices', markNoRestrictionsExcluded() {}, markPersonalDevicesExcluded() {}, listValues: (value) => value || [],
    });
    await assert.rejects(adapter.remove('children'), (error) => error.errorCode === 'group_has_devices');
    assert.equal(p.calls.some((call) => call[0] === 'mutate'), false, 'deletion must fail before staging');
  });

  it('keeps extracted persistence and side-effect owners DOM-free and below 700 lines', () => {
    for (const relative of [
      'sheepfold/features/schedules/persistence.js', 'sheepfold/features/groups/persistence.js',
      'sheepfold/features/settings/side-effects.js', 'sheepfold/features/router/discovery.js',
    ]) {
      const text = source(relative);
      assert.doesNotMatch(text, /\bdocument\.|\bwindow\.|\bui\./, relative);
      assert.ok(text.split(/\r?\n/).length < 700, relative);
    }
  });

  it('leaves overview.js as a bootstrap and application.js as the only composition root', () => {
    const overview = source('view/sheepfold/overview.js');
    const application = source('sheepfold/features/overview/application.js');
    assert.equal(overview.trimEnd().split(/\r?\n/).length, 4);
    assert.match(application, /groupPersistenceModel\.create/);
    assert.match(application, /schedulePersistenceModel\.create/);
    assert.match(application, /settingsSideEffectsModel\.create/);
    assert.doesNotMatch(overview, /uci\.|routerControl|showModal|function persist/);
  });
});
