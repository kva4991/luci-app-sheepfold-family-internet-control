/*
 * Повторная проверка трёх исправлений из альтернативного r293, отсутствующих
 * в доступном bundle a1cb6cb. Исполняются реальные LuCI-модули в Node VM,
 * WebCrypto и модель UCI staging. Роутер и браузер не используются.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { webcrypto } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import vm from 'node:vm';

const resources = resolve('package/luci-app-sheepfold-family-internet-control/htdocs/luci-static/resources/sheepfold');
function load(relative) {
  const source = readFileSync(resolve(resources, relative), 'utf8').replace(/^'require .*?';\r?\n/gm, '');
  return vm.runInNewContext(`(function () { ${source} })()`, {
    baseclass: { extend: (value) => value }, crypto: webcrypto, TextEncoder, TextDecoder, Uint8Array,
    btoa: (value) => Buffer.from(value, 'binary').toString('base64'),
    atob: (value) => Buffer.from(value, 'base64').toString('binary'),
    Promise, Object, Array, String, Number, Boolean, Math, Date, JSON, Error, RegExp, Map, Set,
  }, { filename: relative });
}
function sections(secret = 'stored-token', routerId = 'a'.repeat(32)) {
  return { sheepfold: [
    { '.name': 'global', '.type': 'sheepfold', router_install_id: routerId, api_token: secret },
    { '.name': 'allowlist', '.type': 'list' },
    { '.name': 'blocklist', '.type': 'list' },
    { '.name': 'phone', '.type': 'device', name: 'Old name', admin_device: '1' },
  ], dhcp: [], wireless: [
    { '.name': 'radio0', '.type': 'wifi-device', channel: 'auto' },
    { '.name': 'wifi0', '.type': 'wifi-iface', ssid: 'Old Wi-Fi', key: 'old-key' },
  ] };
}
function adapter(model, current) {
  const calls = [];
  const persistence = {
    sections: (config) => current[config],
    ensureSection: (_config, _type, name) => name,
    mutate: async (_configs, stage) => ({ stageResult: stage() }),
  };
  return { calls, writer: load('features/settings/backup-persistence.js').create({ model, persistence,
    uci: { remove: (...args) => calls.push(['remove', ...args]),
      unset: (...args) => calls.push(['unset', ...args]), set: (...args) => calls.push(['set', ...args]) },
    refreshRuntime: async () => {},
  }) };
}
function section(payload, config, name) { return payload.configs[config].find((entry) => entry.name === name); }

describe('Restored backup validation and literal values', () => {
  for (const secrets of [true, false]) {
    it(`restores literal [secret] in nonsecret fields, containsSecrets=${secrets}`, async () => {
      const model = load('features/settings/backup.js'), current = sections();
      const payload = model.build(sections(), secrets);
      section(payload, 'sheepfold', 'phone').options.name = '[secret]';
      section(payload, 'wireless', 'wifi0').options.ssid = '[secret]';
      const { writer, calls } = adapter(model, current);
      await writer.apply(payload, model.build(current, true));
      assert.ok(calls.some((entry) => entry.join('|') === 'set|sheepfold|phone|name|[secret]'));
      assert.ok(calls.some((entry) => entry.join('|') === 'set|wireless|wifi0|ssid|[secret]'));
    });
  }
  it('restores a literal secret after real WebCrypto encryption/decryption', async () => {
    const model = load('features/settings/backup.js'), current = sections();
    const encrypted = await model.encrypt(model.build(sections('[secret]'), true), 'Synthetic Password 123!');
    const decrypted = await model.decrypt(encrypted, 'Synthetic Password 123!');
    const { writer, calls } = adapter(model, current);
    await writer.apply(decrypted, model.build(current, true));
    assert.ok(calls.some((entry) => entry.join('|') === 'set|sheepfold|global|api_token|[secret]'));
  });
  it('keeps the current secret for a redacted readable backup', async () => {
    const model = load('features/settings/backup.js'), current = sections();
    const { writer, calls } = adapter(model, current);
    await writer.apply(model.build(sections('other-token'), false), model.build(current, true));
    assert.ok(calls.some((entry) => entry.join('|') === 'set|sheepfold|global|api_token|stored-token'));
  });
  it('does not invent a missing secret from a redacted readable backup', async () => {
    const model = load('features/settings/backup.js'), current = sections();
    delete current.sheepfold[0].api_token;
    const { writer, calls } = adapter(model, current);
    await writer.apply(model.build(sections(), false), model.build(current, true));
    assert.equal(calls.some((entry) => entry[0] === 'set' && entry[3] === 'api_token'), false);
  });
  for (const value of [['__proto__'], ['normal'], 123, { toString: () => 'safe' }]) {
    for (const field of ['name', 'type']) it(`rejects nonstring ${field}: ${JSON.stringify(value)}`, () => {
      const model = load('features/settings/backup.js');
      const payload = model.build(sections(), true);
      section(payload, 'sheepfold', 'phone')[field] = value;
      assert.throws(() => model.validate(payload), /invalid_section/);
    });
  }
  for (const type of ['toString', 'valueOf', 'hasOwnProperty', 'isPrototypeOf']) {
    it(`does not accept inherited object key ${type} as a wireless section type`, () => {
      const model = load('features/settings/backup.js'), payload = model.build(sections(), true);
      section(payload, 'wireless', 'wifi0').type = type;
      assert.throws(() => model.validate(payload), /invalid_wireless_section/);
    });
  }
  it('drops only enumerated router-bound fields on transfer, preserving custom inherited-key names', () => {
    const model = load('features/settings/backup.js');
    const payload = model.build(sections('token', 'b'.repeat(32)), true);
    const device = section(payload, 'sheepfold', 'phone');
    device.options.toString = 'custom value'; device.options.valueOf = 'another value';
    const result = model.prepareRestore(payload, model.build(sections(), true));
    const output = section(result.payload, 'sheepfold', 'phone').options;
    assert.equal(output.toString, 'custom value'); assert.equal(output.valueOf, 'another value');
    assert.equal(output.admin_device, undefined);
  });
});

describe('Preflight failure preserves unowned LuCI drafts', () => {
  for (const outcome of ['clean', 'remoteConflict', 'readFailure']) {
    it(`preserves a draft inserted during preflight (${outcome})`, async () => {
      const state = { creates: {}, changes: {}, deletes: {}, reorder: {} }, calls = [];
      let resolveRead, rejectRead;
      const read = new Promise((resolve, reject) => { resolveRead = resolve; rejectRead = reject; });
      let entered;
      const started = new Promise((resolve) => { entered = resolve; });
      const uci = { state, changes: () => { entered(); return read; },
        unload: (config) => { calls.push('unload'); for (const bucket of Object.values(state)) delete bucket[config]; },
        load: async () => { calls.push('load'); }, save: async () => { calls.push('save'); } };
      const writer = load('core/persistence/uci.js').create({ uci });
      const result = writer.mutate(['sheepfold'], () => { calls.push('stage'); });
      await started;
      state.changes.sheepfold = { phone: { name: 'Draft typed while waiting' } };
      if (outcome === 'readFailure') rejectRead(new Error('read_failure'));
      else resolveRead(outcome === 'remoteConflict' ? { sheepfold: [['set', 'x']] } : {});
      await assert.rejects(result);
      assert.equal(state.changes.sheepfold?.phone?.name, 'Draft typed while waiting');
      assert.deepEqual(calls, []);
    });
  }
  it('still cleans its own staging when the stage callback fails', async () => {
    const state = { creates: {}, changes: {}, deletes: {}, reorder: {} }, calls = [];
    const uci = { state, changes: async () => ({}),
      unload: (config) => { calls.push('unload'); for (const bucket of Object.values(state)) delete bucket[config]; },
      load: async () => {} };
    const writer = load('core/persistence/uci.js').create({ uci });
    await assert.rejects(writer.mutate(['sheepfold'], () => {
      state.changes.sheepfold = { phone: { name: 'own partial stage' } }; throw new Error('stage_failure');
    }), /stage_failure/);
    assert.deepEqual(calls, ['unload']); assert.equal(state.changes.sheepfold, undefined);
  });
});
