/*
 * Проверяет согласованность настоящих firewall/status helper-ов и решений владельца
 * Поддельные UCI/nft заменяют системные границы, но не расчёт политики; .build очищается
 * Наличие MAC в batch не доказывает остановку пакетов, offloading и живой OpenWrt нужны отдельно
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createRouterFixture, parseCgi, basePolicy, childPolicy, testMac, testIp, repoRoot } from './helpers/routerRuntimeFixture.mjs';

function runPolicy(extra = {}, withDevice = true, env = {}) {
  const fixture = createRouterFixture({ ...basePolicy, ...(withDevice ? childPolicy : {}), ...extra });
  try {
    const firewall = fixture.run('sheepfold-firewall', ['sync'], { env });
    assert.equal(firewall.status, 0, firewall.stderr);
    const status = fixture.run('sheepfold-client-status-effective', [testIp], { env });
    assert.equal(status.status, 0, status.stderr);
    const effective = Object.fromEntries(status.stdout.trim().split('\n').map((line) => {
      const equals = line.indexOf('='); return [line.slice(0, equals), line.slice(equals + 1)];
    }));
    const response = parseCgi(fixture.run('sheepfold-api-client-status', [], { env }));
    assert.equal(response.status, 200);
    const batch = fixture.batch();
    const sets = Object.fromEntries([...batch.matchAll(/add element inet fw4 (\S+) \{ ([^}]+) \}/g)].map((m) => [m[1], m[2]]));
    return { effective, data: response.body.data, sets, batch };
  } finally { fixture.close(); }
}
const inSet = (result, name) => (result.sets[`sheepfold_${name}`] || '').includes(testMac);

describe('Shared access-policy runtime', () => {
  for (const group of ['No restrictions', 'no_restrictions']) {
    for (const status of ['restricted', 'blocked']) {
      it(`unrestricted group ${group} beats blocklist with stored ${status}, but keeps management closed`, () => {
        const result = runPolicy({ 'sheepfold.child.group': group, 'sheepfold.child.status': status,
          'sheepfold.blocklist.mac': testMac, 'sheepfold.global.block_on_boot': '1' });
        assert.equal(result.data.internetState, 'enabled');
        assert.equal(result.effective.reason, 'no_restrictions_group');
        assert.ok(inSet(result, 'exempt_macs'));
        assert.ok(inSet(result, 'management_block_macs'));
        assert.ok(!inSet(result, 'block_macs'));
        assert.ok(!inSet(result, 'restricted_macs'));
      });
    }
  }
  for (const mode of ['block', 'restrict']) {
    it(`quarantine ${mode} overrides saved allowlist and unrestricted group`, () => {
      const result = runPolicy({ 'sheepfold.child.group': 'No restrictions', 'sheepfold.child.status': 'allow',
        'sheepfold.allowlist.mac': testMac, 'sheepfold.child.identity_quarantine_mode': mode });
      assert.equal(result.data.internetState, 'disabled');
      assert.equal(result.effective.reason, 'identity_quarantine');
      assert.ok(inSet(result, 'management_block_macs'));
      assert.ok(!inSet(result, 'exempt_macs'));
      assert.ok(inSet(result, mode === 'block' ? 'block_macs' : 'restricted_macs'));
    });
  }
  it('ordinary blocklist still wins over admin, allowlist and a live temporary grant', () => {
    const result = runPolicy({ 'sheepfold.child.admin_device': '1', 'sheepfold.allowlist.mac': testMac,
      'sheepfold.blocklist.mac': testMac, 'sheepfold.child.status': 'temp_access', 'sheepfold.child.temp_access_until': '4102444800' });
    assert.equal(result.effective.reason, 'blocklist');
    assert.equal(result.data.internetState, 'disabled');
    assert.ok(inSet(result, 'block_macs'));
  });
  it('returns an explicit disabled state for a configured restricted device', () => {
    const result = runPolicy();
    assert.ok(inSet(result, 'restricted_macs'));
    assert.equal(result.data.internetState, 'disabled');
  });
  it('applies global block to a MAC whose device card has not been created', () => {
    const result = runPolicy({ 'sheepfold.global.block_on_boot': '1' }, false);
    assert.equal(result.effective.reason, 'global_block');
    assert.equal(result.data.internetState, 'disabled');
    assert.equal(result.sets.sheepfold_global_ifaces, '"br-lan"');
  });
  it('restricts unknown MACs by selected interfaces without waiting for the detector', () => {
    const result = runPolicy({ 'sheepfold.global.new_device_policy': 'restrict_until_configured' }, false);
    assert.equal(result.data.internetState, 'disabled');
    assert.equal(result.sets.sheepfold_new_device_ifaces, '"br-lan"');
    assert.ok(!inSet(result, 'known_macs'));
    const rules = readFileSync(join(repoRoot, 'package/luci-app-sheepfold-family-internet-control/root/usr/share/nftables.d/table-pre/30-sheepfold.nft'), 'utf8');
    assert.match(rules, /iifname @sheepfold_new_device_ifaces ether saddr != @sheepfold_known_macs goto sheepfold_new_device_guard/);
    assert.match(rules, /chain sheepfold_new_device_guard \{[\s\S]*Sheepfold unknown device restriction/);
  });
  it('keeps explicit allowlist access for a MAC without a card under restrictive defaults', () => {
    const result = runPolicy({ 'sheepfold.global.new_device_policy': 'restrict_until_configured', 'sheepfold.allowlist.mac': testMac }, false);
    assert.ok(inSet(result, 'known_macs'));
    assert.ok(inSet(result, 'exempt_macs'));
    assert.equal(result.data.internetState, 'enabled');
  });
  for (const previous of ['restricted', 'scheduled', 'new', 'allow', 'blocked', 'corrupt']) {
    it(`restores expired temporary rights from ${previous} without running housekeeping`, () => {
      const result = runPolicy({ 'sheepfold.child.status': 'temp_access', 'sheepfold.child.temp_access_until': '1',
        'sheepfold.child.temp_access_previous_status': previous, 'sheepfold.global.new_device_policy': 'restrict_until_configured' });
      assert.equal(result.data.internetState, previous === 'allow' ? 'enabled' : 'disabled');
      if (previous === 'allow') assert.ok(inSet(result, 'exempt_macs'));
      else assert.ok(inSet(result, previous === 'blocked' ? 'block_macs' : 'restricted_macs'));
    });
  }
  it('active temporary access yields to global block', () => {
    const result = runPolicy({ 'sheepfold.child.status': 'temp_access', 'sheepfold.child.temp_access_until': '4102444800',
      'sheepfold.global.block_on_boot': '1' });
    assert.equal(result.data.internetState, 'disabled');
    assert.equal(result.effective.reason, 'global_block');
  });
  it('does not turn a legacy technical temporary allowlist into a permanent exception', () => {
    const result = runPolicy({ 'sheepfold.child.status': 'temp_access', 'sheepfold.child.temp_access_until': '1',
      'sheepfold.allowlist.mac': testMac, 'sheepfold.child.temp_access_allowlist_added': '1' });
    assert.equal(result.data.internetState, 'disabled');
    assert.ok(!inSet(result, 'exempt_macs'));
  });
  it('preserves a genuine manual allowlist when temporary metadata expires', () => {
    const result = runPolicy({ 'sheepfold.child.status': 'temp_access', 'sheepfold.child.temp_access_until': '1',
      'sheepfold.allowlist.mac': testMac, 'sheepfold.child.temp_access_allowlist_added': '0' });
    assert.equal(result.data.internetState, 'enabled');
    assert.ok(inSet(result, 'exempt_macs'));
  });
  it('retains restrictive fallback if schedule evaluation fails', () => {
    const result = runPolicy({}, true, { SHEEPFOLD_SCHEDULE_EVALUATOR: '/bin/false' });
    assert.equal(result.data.internetState, 'disabled');
    assert.ok(inSet(result, 'restricted_macs'));
  });
  it('keeps the default allow policy for a new MAC without a saved card', () => {
    const result = runPolicy({}, false);
    assert.equal(result.data.internetState, 'enabled');
    assert.equal(result.effective.reason, 'new_device_policy_allow');
    assert.ok(!result.sets.sheepfold_new_device_ifaces);
  });
  it('allows a live temporary grant without promoting it into an exemption', () => {
    const result = runPolicy({ 'sheepfold.child.status': 'temp_access', 'sheepfold.child.temp_access_until': '4102444800' });
    assert.equal(result.data.internetState, 'enabled');
    assert.equal(result.effective.reason, 'temporary_access');
    assert.equal(result.effective.next_change_at, '4102444800');
    assert.ok(!inSet(result, 'exempt_macs'));
    assert.ok(!inSet(result, 'restricted_macs'));
  });
  for (const [action, minute, enabled] of [['allow', '600', true], ['allow', '660', false],
    ['block', '600', false], ['block', '660', true]]) {
    it(`agrees across API and firewall for ${action} schedule at minute ${minute}`, () => {
      const result = runPolicy({ 'sheepfold.child.status': action === 'allow' ? 'restricted' : 'new',
        'sheepfold.lesson': 'schedule', 'sheepfold.lesson.name': 'Private rule title',
        'sheepfold.lesson.enabled': '1', 'sheepfold.lesson.action': action,
        'sheepfold.lesson.target_type': 'device', 'sheepfold.lesson.targets': 'child',
        'sheepfold.lesson.weekdays': 'mon', 'sheepfold.lesson.time_ranges': '09:00-11:00' },
      true, { SHEEPFOLD_NOW_MINUTES: minute });
      assert.equal(result.data.internetState, enabled ? 'enabled' : 'disabled');
      assert.equal(inSet(result, 'restricted_macs'), !enabled);
      assert.ok(!inSet(result, 'exempt_macs'));
      assert.ok(!JSON.stringify(result.data).includes('Private rule title'));
    });
  }
  it('does not claim an unknown-device restriction applied without a LAN interface', () => {
    const values = { ...basePolicy, 'sheepfold.global.new_device_policy': 'restrict_until_configured' };
    delete values['network.lan.device'];
    const fixture = createRouterFixture(values);
    try {
      const result = fixture.run('sheepfold-firewall', ['sync']);
      assert.notEqual(result.status, 0);
      assert.equal(fixture.batch(), '');
    } finally { fixture.close(); }
  });
});
