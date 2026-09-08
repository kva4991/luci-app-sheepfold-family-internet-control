/*
 * Проверяет реальные shell-пути чтения: отказ UCI не равен пустой семье/allow,
 * а специальные символы в карточке не повреждают JSON. Модели UCI/nft изолированы
 * Меняет и удаляет только .build-fixtures; не доказывает работу libuci/HTTP на роутере
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { createRouterFixture, parseCgi, basePolicy, childPolicy, testIp } from './helpers/routerRuntimeFixture.mjs';
import { createControlFixture, installExecutable, installNftModel } from './helpers/controlRuntimeFixture.mjs';

function devicesResponse(fixture) {
  return parseCgi(fixture.run('sheepfold-api-legacy', [], { env: { PATH_INFO: '/devices' } }));
}

describe('Read-model failure boundaries', () => {
  it('retains applied nft state when the UCI configuration cannot be read', () => {
    const fixture = createRouterFixture({ ...basePolicy, ...childPolicy });
    const nft = installNftModel(fixture);
    try {
      assert.equal(fixture.run('sheepfold-firewall', ['sync']).status, 0);
      const applied = fixture.batch();
      const hash = readFileSync(join(fixture.state, 'state.hash'), 'utf8');
      installExecutable(fixture, 'uci', '#!/bin/sh\nexit 1\n');
      const result = fixture.run('sheepfold-firewall', ['sync']);
      assert.notEqual(result.status, 0, 'unreadable configuration must not become empty allow defaults');
      assert.equal(nft.attempts(), 1);
      assert.equal(fixture.batch(), applied);
      assert.equal(readFileSync(join(fixture.state, 'state.hash'), 'utf8'), hash);
    } finally { fixture.close(); }
  });
  it('reports unknown, not enabled, when policy initialization fails', () => {
    const fixture = createRouterFixture({ ...basePolicy, ...childPolicy });
    try {
      installExecutable(fixture, 'uci', '#!/bin/sh\nexit 1\n');
      const result = fixture.run('sheepfold-client-status-effective', [testIp]);
      assert.equal(result.status, 0, result.stderr);
      assert.match(result.stdout, /^status=unknown$/m);
      assert.match(result.stdout, /^reason=policy_unavailable$/m);
      const response = parseCgi(fixture.run('sheepfold-api-client-status'));
      assert.equal(response.body.data.internetState, 'unknown');
    } finally { fixture.close(); }
  });
  for (const output of ['', '[{"id":1}']) {
    it(`does not turn backend failure with ${output ? 'partial' : 'empty'} output into a successful device list`, () => {
      const fixture = createRouterFixture();
      try {
        installExecutable(fixture, 'sheepfold-router-control', `#!/bin/sh\nprintf '%s' '${output}'\nexit 1\n`);
        const response = devicesResponse(fixture);
        assert.equal(response.status, 503);
        assert.equal(response.body.ok, false);
        assert.equal(response.body.error, 'devices_unavailable');
        assert.ok(!('devices' in response.body));
      } finally { fixture.close(); }
    });
  }
  it('rejects an empty backend success rather than inventing an empty array', () => {
    const fixture = createRouterFixture();
    try {
      installExecutable(fixture, 'sheepfold-router-control', '#!/bin/sh\nexit 0\n');
      assert.equal(devicesResponse(fixture).status, 503);
    } finally { fixture.close(); }
  });
  it('continues returning a legitimately empty family as a successful empty array', () => {
    const fixture = createRouterFixture();
    try {
      installExecutable(fixture, 'sheepfold-router-control', '#!/bin/sh\nprintf "[]\\n"\n');
      const response = devicesResponse(fixture);
      assert.equal(response.status, 200);
      assert.deepEqual(response.body.devices, []);
    } finally { fixture.close(); }
  });
  it('propagates unreadable UCI through the real list CLI and CGI', () => {
    const fixture = createControlFixture();
    try {
      installExecutable(fixture, 'uci', '#!/bin/sh\nexit 1\n');
      assert.notEqual(fixture.run('sheepfold-router-control-legacy', ['list-devices']).status, 0);
      assert.equal(devicesResponse(fixture).status, 503);
    } finally { fixture.close(); }
  });
  it('recovers normal policy application after UCI becomes readable again', () => {
    const fixture = createRouterFixture({ ...basePolicy, ...childPolicy });
    const nft = installNftModel(fixture);
    try {
      installExecutable(fixture, 'uci', '#!/bin/sh\nexit 1\n');
      assert.notEqual(fixture.run('sheepfold-firewall', ['sync']).status, 0);
      assert.equal(nft.attempts(), 0);
      fixture.setValues({ ...basePolicy, ...childPolicy });
      assert.equal(fixture.run('sheepfold-firewall', ['sync']).status, 0);
      assert.equal(nft.attempts(), 1);
      assert.match(fixture.batch(), /add element inet fw4 sheepfold_restricted_macs/);
    } finally { fixture.close(); }
  });
  it('escapes all non-NUL ASCII controls with BusyBox awk when available', () => {
    // Это portability-проверка; Windows без BusyBox исполняет тот же путь обычным awk
    const controls = Array.from({ length: 31 }, (_, index) => String.fromCharCode(index + 1)).join('') + 'конец';
    const fixture = createControlFixture({ 'sheepfold.child.name': controls });
    try {
      if (spawnSync('busybox', ['awk', 'BEGIN { exit 0 }']).status === 0) {
        installExecutable(fixture, 'awk', '#!/bin/sh\nexec busybox awk "$@"\n');
      }
      const result = fixture.run('sheepfold-router-control-legacy', ['list-devices']);
      assert.equal(result.status, 0, result.stderr);
      assert.equal(JSON.parse(result.stdout)[0].name, controls);
    } finally { fixture.close(); }
  });
  const special = 'Планшет "Маша"\\дом\nстрока\t\r\b\f\u0001\u001f 🙂';
  for (const [key, field] of [['name', 'name'], ['group', 'group'], ['ip', 'ip'], ['mac', 'mac'],
    ['device_type', 'deviceType'], ['status', 'status']]) {
    it(`serializes ${key} as data instead of malformed JSON`, () => {
      const fixture = createControlFixture({ [`sheepfold.child.${key}`]: special });
      try {
        const result = fixture.run('sheepfold-router-control-legacy', ['list-devices']);
        assert.equal(result.status, 0, result.stderr);
        const data = JSON.parse(result.stdout);
        assert.equal(data.length, 1);
        assert.equal(data[0][field], special);
        assert.deepEqual(Object.keys(data[0]).sort(), [
          'id', 'mac', 'name', 'ip', 'group', 'deviceType', 'manualDeviceType', 'status', 'adminDevice', 'adminLogin',
        ].sort());
        assert.equal(fixture.writes(), '', 'valid IDs do not make GET mutate config');
        assert.equal(devicesResponse(fixture).body.devices[0][field], special);
      } finally { fixture.close(); }
    });
  }
});
