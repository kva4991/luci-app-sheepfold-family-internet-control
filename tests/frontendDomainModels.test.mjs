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

  it('normalizes Wi-Fi bands from radio mode and channel', () => {
    const wifi = loadFeature('wifi/cards.js');

    assert.equal(wifi.bandKind('11ng', 'auto'), '2g');
    assert.equal(wifi.bandKind('', '44'), '5g');
    assert.equal(wifi.bandKind('6ghz', 'auto'), '6g');
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
