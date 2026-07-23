import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { describe, it } from 'node:test';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const featureRoot = join(root, 'package/luci-app-sheepfold-family-internet-control/htdocs/luci-static/resources/sheepfold/features');

function loadFeature(path, extraContext = {}) {
  const source = readFileSync(join(featureRoot, path), 'utf8').replace(/^'require .*?';\r?\n/gm, '');
  const context = {
    module: { exports: {} },
    baseclass: { extend: (value) => value },
    _: (value) => value,
    console,
    ...extraContext
  };

  vm.runInNewContext(`(function () { ${source.replace('return baseclass.extend(', 'module.exports = baseclass.extend(')} })()`, context);
  return context.module.exports;
}

describe('extracted LuCI domain models §frontmod', () => {
  it('detects schedule overlap across midnight', () => {
    const schedules = loadFeature('schedules/model.js');
    const days = [['mon', 'Mon'], ['tue', 'Tue'], ['wed', 'Wed'], ['thu', 'Thu'], ['fri', 'Fri'], ['sat', 'Sat'], ['sun', 'Sun']];
    const mondayNight = schedules.windows(['mon'], [{ start: '22:00', end: '02:00' }], days);
    const tuesdayMorning = schedules.windows(['tue'], [{ start: '01:00', end: '03:00' }], days);

    assert.equal(schedules.windowsOverlap(mondayNight, tuesdayMorning), true);
  });

  it('chooses a free pastel group color before falling back to a stable color', () => {
    const groups = loadFeature('groups/model.js');
    const palette = groups.palette();
    const used = { [palette[0]]: true, [palette[1]]: true };

    assert.equal(groups.nextColor('Family', used), palette[2]);
    assert.equal(groups.automaticColor('Family'), groups.automaticColor('Family'));
  });

  it('calculates group membership changes without mutating device inventory', () => {
    const groups = loadFeature('groups/model.js');
    const devices = [
      { id: '1', group: 'Children' },
      { id: '2', group: 'Children' },
      { id: '3', group: 'Guests' }
    ];
    const changes = groups.membershipChanges(devices, 'Children', 'School', ['2', '3'], (value) => value);

    assert.deepEqual([...changes].map((change) => ({
      id: change.device.id,
      linked: change.linked,
      nextGroup: change.nextGroup
    })), [
      { id: '1', linked: false, nextGroup: '' },
      { id: '2', linked: true, nextGroup: 'School' },
      { id: '3', linked: true, nextGroup: 'School' }
    ]);
    assert.deepEqual(devices.map((device) => device.group), ['Children', 'Children', 'Guests']);
  });

  it('explains why a protected or assigned group cannot be deleted', () => {
    const groups = loadFeature('groups/model.js');

    assert.equal(groups.deletionBlockReason({ protectedGroup: true, deviceCount: 0, hasSection: true }), 'protected');
    assert.equal(groups.deletionBlockReason({ deviceCount: 2, hasSection: true }), 'assigned');
    assert.equal(groups.deletionBlockReason({ deviceCount: 0, hasSection: false }), 'missing-section');
    assert.equal(groups.deletionBlockReason({ deviceCount: 0, hasSection: true }), '');
  });

  it('keeps administrator IDs numeric and detects duplicate logins case-insensitively', () => {
    const administrators = loadFeature('administrators/model.js');
    const list = [{ id: '1', login: 'SuperParent' }, { id: '4', login: 'SecondParent' }];
    const parseId = (value) => /^\d+$/.test(String(value)) ? Number(value) : Number.MAX_SAFE_INTEGER;

    assert.equal(administrators.nextId(list, parseId), '5');
    assert.equal(administrators.loginExists(list, 'superparent'), true);
  });

  it('owns settings draft state and special saver dirtiness', () => {
    const drafts = loadFeature('settings/draft.js');
    let specialDirty = false;
    const draft = drafts.create();

    draft.set('language', 'ru');
    draft.registerSaver({ isChanged: () => specialDirty });
    assert.deepEqual({ ...draft.snapshot() }, { language: 'ru' });
    assert.equal(draft.isDirty(), true);
    draft.clearOptions();
    assert.equal(draft.isDirty(), false);
    specialDirty = true;
    assert.equal(draft.dirtySavers().length, 1);
  });

  it('maps the general automatic-setup choice to one coherent draft', () => {
    const general = loadFeature('settings/general.js');

    assert.deepEqual({ ...general.automaticSetupDraft('full') }, {
      auto_configure: '1',
      detection_mode: 'full',
      no_restrictions_auto_assign: '1'
    });
    assert.deepEqual({ ...general.automaticSetupDraft('reduced') }, {
      auto_configure: '1',
      detection_mode: 'reduced',
      no_restrictions_auto_assign: '1'
    });
    assert.deepEqual({ ...general.automaticSetupDraft('disabled') }, {
      auto_configure: '0',
      detection_mode: 'full',
      no_restrictions_auto_assign: '0'
    });
  });

  it('validates and stages one settings draft through the persistence adapter', async () => {
    const persistenceModel = loadFeature('settings/persistence.js');
    const accessKeys = ['blocklist', 'allowlist', 'default_access'];
    const knownSections = new Set(['global']);
    const writes = [];
    const adapter = persistenceModel.create({
      accessKeys,
      normalizeLanguage: (value) => value.toLowerCase(),
      sectionValue: () => '',
      uci: {
        set: (...args) => writes.push(args)
      },
      persistence: {
        ensureSection: (_config, _type, name) => {
          knownSections.add(name);
          return name;
        },
        mutate: async (configs, stage) => ({ configs, stageResult: stage() })
      }
    });

    const partitioned = adapter.partition({
      language: 'RU',
      'usb.device': '/dev/sda1',
      'cloud.login': 'owner',
      'adguard.url': 'https://192.168.1.2:3000'
    });
    assert.deepEqual(JSON.parse(JSON.stringify(partitioned)), {
      global: { language: 'RU' },
      sections: {
        usb: { device: '/dev/sda1' },
        cloud: { login: 'owner' },
        adguard: { url: 'https://192.168.1.2:3000' }
      }
    });
    assert.throws(() => adapter.validate({ app_port: '0' }), /Application HTTPS port/);
    assert.throws(() => adapter.validate({
      access_priority: 'blocklist unknown allowlist default_access'
    }), /Access priority contains an unknown or duplicate rule/);
    assert.throws(() => adapter.validate({
      'adguard.url': 'http://192.168.1.2:3000'
    }), /Use HTTPS for AdGuard Home on another device/);
    assert.doesNotThrow(() => adapter.validate({
      'adguard.url': 'https://192.168.1.2:03000'
    }));

    adapter.validate({ app_port: '5201' });
    assert.deepEqual(JSON.parse(JSON.stringify(await adapter.save({
      language: 'RU',
      'usb.device': '/dev/sda1',
      'cloud.login': 'owner'
    }))), {
      global: { language: 'ru' },
      sections: {
        usb: { device: '/dev/sda1' },
        cloud: { login: 'owner' }
      }
    });
    assert.ok(writes.some((args) => args.join('|') === 'sheepfold|global|language|ru'));
    assert.equal(knownSections.has('usb'), true);
    assert.ok(writes.some((args) => args.join('|') === 'sheepfold|cloud|authorized|0'));
  });

  it('normalizes Wi-Fi bands from radio mode and channel', () => {
    const wifi = loadFeature('wifi/cards.js');

    assert.equal(wifi.bandKind('11ng', 'auto'), '2g');
    assert.equal(wifi.bandKind('', '44'), '5g');
    assert.equal(wifi.bandKind('6ghz', 'auto'), '6g');
  });

  it('plans Wi-Fi shutdown and shared radio enabling without touching UCI §wifitgl1', () => {
    const wifiCards = loadFeature('wifi/cards.js');
    const wifiEditor = loadFeature('wifi/editor.js', { wifiCards });
    const editor = (device, radioDisabled, beforeEnabled, afterEnabled) => ({
      sectionName: `${device}_ap`,
      device,
      radioDisabled,
      original: {
        ssid: 'Home', password: 'password', encryption: 'psk2', channel: 'auto', enabled: beforeEnabled
      },
      ssidInput: { value: 'Home' },
      passwordInput: { value: 'password' },
      securitySelect: { value: 'psk2' },
      channelSelect: { value: 'auto' },
      enabledInput: { checked: afterEnabled }
    });
    const plan = wifiEditor.savePlan([
      editor('radio0', false, true, false),
      editor('radio1', true, false, true)
    ]);

    assert.equal(plan.turnsWifiOff, true);
    assert.deepEqual({ ...plan.radiosToEnable }, { radio1: true });
    assert.equal(plan.items.length, 2);
    assert.equal(plan.items[0].snapshot.enabled, false);
    assert.equal(plan.items[1].snapshot.enabled, true);
  });

  it('restores only IPv6 state that Sheepfold changed automatically for Podkop §ipv6pod', () => {
    const integrations = loadFeature('integrations/panel.js');

    assert.deepEqual({ ...integrations.ipv6Draft('podkop', '0', 'default') }, {
      router_ipv6_disabled: '1',
      router_ipv6_mode_source: 'auto_podkop'
    });
    assert.deepEqual({ ...integrations.ipv6Draft('none', '1', 'auto_podkop') }, {
      router_ipv6_disabled: '0',
      router_ipv6_mode_source: 'default'
    });
    assert.equal(integrations.ipv6Draft('none', '1', 'manual'), null);
    assert.equal(integrations.usesPodkop('adguard_podkop'), true);
    assert.equal(integrations.usesPodkop('adguard'), false);
  });

  it('merges router device sources and preserves existing static DHCP sections §devinv', () => {
    const inventory = loadFeature('devices/inventory.js');
    const devices = inventory.build({
      dhcpLeases: '1710000000 00-11-22-33-44-55 192.168.1.10 dhcp *',
      arpTable: [
        'IP address HW type Flags HW address Mask Device',
        '192.168.1.10 0x1 0x2 00:11:22:33:44:55 * br-lan'
      ].join('\n'),
      staticHosts: [
        { '.name': 'phone_lease', mac: ['00:11:22:33:44:55'], name: 'Телефон', ip: '192.168.1.10' },
        { '.name': 'boiler_lease', mac: 'AA:BB:CC:DD:EE:FF', name: 'Котёл', ip: '192.168.1.20' }
      ],
      deviceSections: [
        {
          '.name': 'device_001122334455',
          id: '7',
          mac: '00:11:22:33:44:55',
          name: 'dhcp',
          status: 'new',
          group: 'Not configured'
        }
      ],
      listSections: [
        { '.name': 'allowlist', mac: ['00:11:22:33:44:55'] },
        { '.name': 'blocklist', mac: ['AA:BB:CC:DD:EE:FF'] }
      ],
      notConfiguredGroup: 'Not configured',
      normalizeGroupName: (value) => value,
      groupSectionByName: () => null,
      statusBadge: (status) => `badge:${status}`,
      translate: (value) => value
    });

    assert.equal(devices.length, 2);
    assert.equal(devices[0].id, '7');
    assert.equal(devices[0].name, 'Телефон');
    assert.equal(devices[0].mac, '00:11:22:33:44:55');
    assert.equal(devices[0].status, 'allow');
    assert.equal(devices[0].staticLease, true);
    assert.equal(devices[0].staticSection, 'phone_lease');
    assert.match(devices[0].sourceLabel, /Active DHCP lease/);
    assert.match(devices[0].sourceLabel, /ARP\/neighbor entry/);
    assert.match(devices[0].sourceLabel, /Static DHCP lease/);
    assert.equal(devices[1].name, 'Котёл');
    assert.equal(devices[1].status, 'blocked');
    assert.equal(devices[1].staticSection, 'boiler_lease');
  });

  it('uses detected type unless the parent explicitly fixed a manual type §devpas1', () => {
    const inventory = loadFeature('devices/inventory.js');

    assert.equal(inventory.effectiveDeviceType({
      device_type: 'unknown',
      detected_type: 'smart_home',
      manual_device_type: '0'
    }), 'smart_home');
    assert.equal(inventory.effectiveDeviceType({
      device_type: 'phone',
      detected_type: 'smart_home',
      manual_device_type: '1'
    }), 'phone');
    assert.equal(inventory.effectiveDeviceType({ device_type: 'camera' }), 'camera');
  });

  it('keeps allowlist and device blocklist mutually exclusive without automatic transfer §lstxcl1', () => {
    const inventory = loadFeature('devices/inventory.js');
    const accessLists = loadFeature('devices/access-lists.js', { deviceInventory: inventory });
    const sections = [
      { '.name': 'allowlist', mac: ['00:11:22:33:44:55'] },
      { '.name': 'blocklist', mac: ['AA:BB:CC:DD:EE:FF'] }
    ];

    assert.deepEqual(
      [...accessLists.updatedValues(['00-11-22-33-44-55', '00:11:22:33:44:55'], '66:77:88:99:AA:BB', true)],
      ['00:11:22:33:44:55', '66:77:88:99:AA:BB']
    );
    assert.equal(accessLists.conflictingList(sections, 'allow', 'AA:BB:CC:DD:EE:FF'), 'blocklist');
    assert.equal(accessLists.conflictingList(sections, 'blocked', '00:11:22:33:44:55'), 'allowlist');
    assert.equal(accessLists.conflictingList(sections, 'allow', '66:77:88:99:AA:BB'), '');
  });
});
