/*
 * Воспроизводит повтор после отказа nft, потерю runtime при reload, будущие
 * расписания и длительности из CLI. Исполняется production shell, UCI/nft заменены
 * Изменения живут только в удаляемой .build; это не аппаратный тест OpenWrt
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createRouterFixture, parseCgi, basePolicy, childPolicy, testIp, testMac } from './helpers/routerRuntimeFixture.mjs';
import { createControlFixture, installNftModel } from './helpers/controlRuntimeFixture.mjs';

const schedule = {
  'sheepfold.lesson': 'schedule', 'sheepfold.lesson.name': 'Private schedule',
  'sheepfold.lesson.enabled': '1', 'sheepfold.lesson.target_type': 'device',
  'sheepfold.lesson.targets': 'child', 'sheepfold.lesson.weekdays': 'mon',
  'sheepfold.lesson.time_ranges': '11:00-12:00',
};

describe('Runtime recovery after partial failure', () => {
  it('reapplies the complete transaction when fw4 recreated chains but UCI is unchanged', () => {
    const fixture = createRouterFixture({ ...basePolicy, ...childPolicy });
    const nft = installNftModel(fixture);
    try {
      assert.equal(fixture.run('sheepfold-firewall', ['sync']).status, 0);
      assert.equal(nft.attempts(), 1);
      assert.equal(fixture.run('sheepfold-firewall', ['sync']).status, 0);
      assert.equal(nft.attempts(), 1, 'unchanged runtime still uses the cheap cache');
      nft.reload();
      assert.equal(fixture.run('sheepfold-firewall', ['sync']).status, 0);
      assert.equal(nft.attempts(), 2, 'existing but empty chains must invalidate the RAM hash');
      assert.ok(fixture.batch().includes(`sheepfold_restricted_macs { ${testMac} }`));
    } finally { fixture.close(); }
  });
  it('does not publish a marker on failed apply and retries the same configuration', () => {
    const fixture = createRouterFixture({ ...basePolicy, ...childPolicy });
    const nft = installNftModel(fixture);
    try {
      nft.fail();
      assert.notEqual(fixture.run('sheepfold-firewall', ['sync']).status, 0);
      assert.equal(nft.marker(), '');
      nft.fail(false);
      assert.equal(fixture.run('sheepfold-firewall', ['sync']).status, 0);
      assert.equal(nft.attempts(), 2);
      assert.match(nft.marker(), /sheepfold-state:/);
    } finally { fixture.close(); }
  });
  it('clears all Sheepfold runtime in one transaction, never a sequence of partial flushes', () => {
    const fixture = createRouterFixture({ ...basePolicy, ...childPolicy });
    const nft = installNftModel(fixture);
    try {
      assert.equal(fixture.run('sheepfold-firewall', ['sync']).status, 0);
      assert.equal(fixture.run('sheepfold-firewall', ['clear']).status, 0);
      assert.equal(nft.attempts(), 2);
      assert.doesNotMatch(nft.log(), /DIRECT /);
      assert.equal(nft.marker(), '');
      assert.equal(fixture.run('sheepfold-firewall', ['sync']).status, 0);
      assert.equal(nft.attempts(), 3);
    } finally { fixture.close(); }
  });
  it('retains applied state and cache when the atomic clear fails', () => {
    const fixture = createRouterFixture({ ...basePolicy, ...childPolicy });
    const nft = installNftModel(fixture);
    try {
      assert.equal(fixture.run('sheepfold-firewall', ['sync']).status, 0);
      const batch = fixture.batch();
      const marker = nft.marker();
      const hash = readFileSync(join(fixture.state, 'state.hash'), 'utf8');
      nft.fail();
      assert.notEqual(fixture.run('sheepfold-firewall', ['clear']).status, 0);
      assert.equal(fixture.batch(), batch);
      assert.equal(nft.marker(), marker);
      assert.equal(readFileSync(join(fixture.state, 'state.hash'), 'utf8'), hash);
      assert.doesNotMatch(nft.log(), /DIRECT /);
    } finally { fixture.close(); }
  });
  it('clears an older partial schema even when the new marker chain is absent', () => {
    const fixture = createRouterFixture({ ...basePolicy, ...childPolicy });
    const nft = installNftModel(fixture);
    try {
      nft.removeMarkerChain();
      assert.equal(fixture.run('sheepfold-firewall', ['clear']).status, 0);
      assert.equal(nft.attempts(), 1);
      assert.match(fixture.batch(), /flush set inet fw4 sheepfold_restricted_macs/);
      assert.doesNotMatch(fixture.batch(), /sheepfold_sync_marker/);
      assert.doesNotMatch(fixture.batch(), /flush (table|ruleset)/);
    } finally { fixture.close(); }
  });
  it('rejects a runtime marker from another policy generation', () => {
    const fixture = createRouterFixture({ ...basePolicy, ...childPolicy });
    const nft = installNftModel(fixture);
    try {
      assert.equal(fixture.run('sheepfold-firewall', ['sync']).status, 0);
      nft.replaceMarker('counter comment "sheepfold-state:another-generation"\n');
      assert.equal(fixture.run('sheepfold-firewall', ['sync']).status, 0);
      assert.equal(nft.attempts(), 2);
      assert.doesNotMatch(nft.marker(), /another-generation/);
    } finally { fixture.close(); }
  });
  for (const action of ['allow', 'block']) {
    it(`keeps the next ${action} boundary when no schedule is active now`, () => {
      const fixture = createRouterFixture({ ...basePolicy, ...childPolicy, ...schedule,
        'sheepfold.child.status': action === 'allow' ? 'restricted' : 'new', 'sheepfold.lesson.action': action });
      try {
        const result = fixture.run('sheepfold-client-status-effective', [testIp]);
        assert.equal(result.status, 0, result.stderr);
        assert.match(result.stdout, /^next_change_time=11:00$/m);
        const response = parseCgi(fixture.run('sheepfold-api-client-status'));
        assert.equal(response.body.data.nextAccessChangeTime, '11:00');
        assert.ok(!JSON.stringify(response.body).includes('Private schedule'));
      } finally { fixture.close(); }
    });
  }
  it('retries enforcement instead of returning false success for an already saved allow', () => {
    const fixture = createControlFixture();
    const nft = installNftModel(fixture);
    try {
      nft.fail();
      const first = fixture.run('sheepfold-router-control-legacy', ['device-allow', testMac]);
      assert.notEqual(first.status, 0);
      assert.equal(fixture.values()['sheepfold.child.status'], 'allow');
      const second = fixture.run('sheepfold-router-control-legacy', ['device-allow', testMac]);
      assert.notEqual(second.status, 0, 'saved allow is not proof of nft success');
      assert.equal(nft.attempts(), 2);
      nft.fail(false);
      const third = fixture.run('sheepfold-router-control-legacy', ['device-allow', testMac]);
      assert.equal(third.status, 0, third.stderr);
      assert.equal(nft.attempts(), 3);
      assert.match(third.stdout, /OK/);
    } finally { fixture.close(); }
  });
  for (const value of ['abc', '0', '-1', '1441', '99999999999999999999999', '']) {
    it(`rejects explicit invalid CLI duration ${JSON.stringify(value)} without granting anything`, () => {
      const fixture = createControlFixture();
      try {
        const result = fixture.run('sheepfold-router-control-legacy', ['device-temp-access', testMac, value]);
        assert.equal(result.status, 2, result.stderr);
        assert.equal(fixture.values()['sheepfold.child.status'], 'restricted');
        assert.equal(fixture.writes(), '');
      } finally { fixture.close(); }
    });
  }
  for (const [value, duration] of [['0008', 8], ['0010', 10], ['1440', 1440]]) {
    it(`uses decimal CLI duration ${value} as ${duration} minutes`, () => {
      const fixture = createControlFixture();
      try {
        const result = fixture.run('sheepfold-router-control-legacy', ['device-temp-access', testMac, value]);
        assert.equal(result.status, 0, result.stderr);
        assert.equal(Number(fixture.values()['sheepfold.child.temp_access_until']), 1700000000 + duration * 60);
        assert.match(result.stdout, new RegExp(`^minutes=${duration}$`, 'm'));
      } finally { fixture.close(); }
    });
  }
  it('preserves the documented CLI default only when the duration argument is omitted', () => {
    const fixture = createControlFixture();
    try {
      const result = fixture.run('sheepfold-router-control-legacy', ['device-temp-access', testMac]);
      assert.equal(result.status, 0, result.stderr);
      assert.equal(Number(fixture.values()['sheepfold.child.temp_access_until']), 1700000000 + 30 * 60);
    } finally { fixture.close(); }
  });
});
