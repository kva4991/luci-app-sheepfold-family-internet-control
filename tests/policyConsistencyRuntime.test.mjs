/*
 * Проверяет смену поколения UCI и отказы вспомогательных расчётов на настоящих
 * shell-файлах. UCI, nft и журнал заменены детерминированными локальными моделями.
 * Меняет только удаляемые .build fixtures; не доказывает сетевой результат OpenWrt.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createRouterFixture, basePolicy, childPolicy, testIp } from './helpers/routerRuntimeFixture.mjs';
import { installExecutable, installNftModel } from './helpers/controlRuntimeFixture.mjs';

const quote = (value) => `'${String(value).replaceAll("'", "'\\''")}'`;
const posix = (value) => value.replaceAll('\\', '/').replace(/^([A-Za-z]):\//, (_, drive) => `/${drive.toLowerCase()}/`);
const filePath = (fixture, name) => quote(posix(join(fixture.root, name)));
const values = { ...basePolicy, ...childPolicy };

function mutateOnRead(fixture, before, after, trigger) {
  fixture.setValues(before);
  copyFileSync(join(fixture.bin, 'uci'), join(fixture.bin, 'uciBefore'));
  fixture.setValues(after);
  copyFileSync(join(fixture.bin, 'uci'), join(fixture.bin, 'uciAfter'));
  installExecutable(fixture, 'uci', `#!/bin/sh
if [ -e ${filePath(fixture, 'changed')} ]; then
  exec ${quote(posix(join(fixture.bin, 'uciAfter')))} "$@"
fi
${quote(posix(join(fixture.bin, 'uciBefore')))} "$@"
result=$?
[ "$*" != ${quote(trigger)} ] || : > ${filePath(fixture, 'changed')}
exit "$result"
`);
}

const blockingSchedule = {
  'sheepfold.lesson': 'schedule', 'sheepfold.lesson.name': 'Private rule',
  'sheepfold.lesson.enabled': '1', 'sheepfold.lesson.target_type': 'device',
  'sheepfold.lesson.targets': 'child', 'sheepfold.lesson.weekdays': 'mon',
  'sheepfold.lesson.time_ranges': '09:00-11:00', 'sheepfold.lesson.action': 'block',
};

function runSchedule(fixture, options = {}) {
  return fixture.run('sheepfold-schedule-evaluator', ['child', 'allow'], {
    env: { SHEEPFOLD_SCHEDULE_STATE_DIR: posix(join(fixture.root, 'schedule-state')), ...options },
  });
}

describe('Policy generation and helper failure boundaries', () => {
  it('rejects a changed Sheepfold configuration without replacing the applied firewall state', () => {
    const fixture = createRouterFixture(values);
    const nft = installNftModel(fixture);
    try {
      assert.equal(fixture.run('sheepfold-firewall').status, 0);
      const previous = fixture.batch();
      const hash = readFileSync(join(fixture.state, 'state.hash'), 'utf8');
      mutateOnRead(fixture, values, { ...values, 'sheepfold.child.status': 'allow' }, '-q get sheepfold.child.status');
      const result = fixture.run('sheepfold-firewall');
      assert.notEqual(result.status, 0, 'mixed generations must not be acknowledged');
      assert.equal(nft.attempts(), 1);
      assert.equal(fixture.batch(), previous);
      assert.equal(readFileSync(join(fixture.state, 'state.hash'), 'utf8'), hash);
    } finally { fixture.close(); }
  });
  it('does not publish a client status assembled across two configuration generations', () => {
    const fixture = createRouterFixture(values);
    try {
      mutateOnRead(fixture, values, { ...values, 'sheepfold.child.status': 'allow' }, '-q get sheepfold.child.status');
      const result = fixture.run('sheepfold-client-status-effective', [testIp]);
      assert.equal(result.status, 0, result.stderr);
      assert.match(result.stdout, /^status=unknown$/m);
      assert.match(result.stdout, /^reason=policy_changed$/m);
      assert.doesNotMatch(result.stdout, /schedule_name=/);
    } finally { fixture.close(); }
  });
  for (const [config, trigger, update] of [
    ['network', '-q get network.lan.device', { 'network.lan.device': 'br-other' }],
    ['firewall', '-q get firewall.lan.network', { 'firewall.lan.network': 'other' }],
  ]) {
    it(`rejects ${config} changes while resolving restricted LAN interfaces`, () => {
      const before = { ...values, 'sheepfold.global.new_device_policy': 'restrict' };
      const fixture = createRouterFixture(before);
      try {
        mutateOnRead(fixture, before, { ...before, ...update }, trigger);
        assert.notEqual(fixture.run('sheepfold-firewall').status, 0);
        assert.equal(fixture.batch(), '');
      } finally { fixture.close(); }
    });
  }
  for (const cached of [false, true]) {
    it(`rejects a configuration change during ${cached ? 'cached runtime validation' : 'nft readiness checks'}`, () => {
      const fixture = createRouterFixture(values);
      const nft = installNftModel(fixture);
      try {
        if (cached) assert.equal(fixture.run('sheepfold-firewall').status, 0);
        mutateOnRead(fixture, values, { ...values, 'sheepfold.child.status': 'allow' }, 'never');
        copyFileSync(join(fixture.bin, 'nft'), join(fixture.bin, 'nftBefore'));
        installExecutable(fixture, 'nft', `#!/bin/sh
${quote(posix(join(fixture.bin, 'nftBefore')))} "$@"
result=$?
[ "$1" != list ] || : > ${filePath(fixture, 'changed')}
exit "$result"
`);
        assert.notEqual(fixture.run('sheepfold-firewall').status, 0);
        assert.equal(nft.attempts(), cached ? 1 : 0);
      } finally { fixture.close(); }
    });
  }
  it('detects a change during client device-section lookup, not only during policy evaluation', () => {
    const fixture = createRouterFixture(values);
    try {
      mutateOnRead(fixture, values, { ...values, 'sheepfold.child.status': 'allow' }, '-q get sheepfold.child.mac');
      const result = fixture.run('sheepfold-client-status-effective', [testIp]);
      assert.equal(result.status, 0, result.stderr);
      assert.match(result.stdout, /^status=unknown$/m);
      assert.match(result.stdout, /^reason=policy_changed$/m);
    } finally { fixture.close(); }
  });
  for (const config of ['sheepfold', 'firewall', 'network']) {
    it(`retains the old firewall transaction if the final ${config} read fails`, () => {
      const fixture = createRouterFixture(values);
      const nft = installNftModel(fixture);
      try {
        assert.equal(fixture.run('sheepfold-firewall').status, 0);
        const previous = fixture.batch();
        copyFileSync(join(fixture.bin, 'uci'), join(fixture.bin, 'uciBefore'));
        installExecutable(fixture, 'uci', `#!/bin/sh
if [ "$*" = '-q show ${config}' ] && [ -e ${filePath(fixture, 'read-once')} ]; then exit 1; fi
[ "$*" != '-q show ${config}' ] || : > ${filePath(fixture, 'read-once')}
exec ${quote(posix(join(fixture.bin, 'uciBefore')))} "$@"
`);
        assert.notEqual(fixture.run('sheepfold-firewall').status, 0);
        assert.equal(nft.attempts(), 1);
        assert.equal(fixture.batch(), previous);
      } finally { fixture.close(); }
    });
  }
  for (const [rawStatus, fallback, partial] of [
    ['restricted', 'restricted', 'allow'], ['new', 'allow', 'block'],
  ]) {
    it(`discards partial ${partial} from an evaluator that exits unsuccessfully`, () => {
      const fixture = createRouterFixture({ ...values, 'sheepfold.child.status': rawStatus });
      try {
        installExecutable(fixture, 'sheepfold-schedule-evaluator', `#!/bin/sh\nprintf 'status=${partial}\\nreason=partial_result\\nnext_change_time=11:00\\n'\nexit 1\n`);
        const result = fixture.run('sheepfold-client-status-effective', [testIp]);
        assert.equal(result.status, 0, result.stderr);
        assert.match(result.stdout, new RegExp(`^status=${fallback}$`, 'm'));
        assert.doesNotMatch(result.stdout, /partial_result|next_change_time=11:00/);
      } finally { fixture.close(); }
    });
  }
  it('does not predict future schedule boundaries in the periodic firewall path', () => {
    const fixture = createRouterFixture(values);
    try {
      installExecutable(fixture, 'sheepfold-schedule-evaluator', `#!/bin/sh
printf '%s\\n' "\${SHEEPFOLD_SCHEDULE_INCLUDE_NEXT:-1}" > ${filePath(fixture, 'forecast-mode')}
printf 'status=none\\n'
`);
      assert.equal(fixture.run('sheepfold-firewall').status, 0);
      assert.equal(readFileSync(join(fixture.root, 'forecast-mode'), 'utf8').trim(), '0');
    } finally { fixture.close(); }
  });
  it('keeps next-boundary prediction enabled in the client status path', () => {
    const fixture = createRouterFixture(values);
    try {
      installExecutable(fixture, 'sheepfold-schedule-evaluator', `#!/bin/sh
printf '%s\\n' "\${SHEEPFOLD_SCHEDULE_INCLUDE_NEXT:-1}" > ${filePath(fixture, 'forecast-mode')}
printf 'status=none\\nnext_change_time=11:00\\n'
`);
      const result = fixture.run('sheepfold-client-status-effective', [testIp]);
      assert.equal(result.status, 0);
      assert.equal(readFileSync(join(fixture.root, 'forecast-mode'), 'utf8').trim(), '1');
      assert.match(result.stdout, /^next_change_time=11:00$/m);
    } finally { fixture.close(); }
  });
  it('supports explicit current-state-only schedule evaluation', () => {
    const fixture = createRouterFixture({ ...values, ...blockingSchedule, 'sheepfold.child.status': 'new' });
    try {
      const result = runSchedule(fixture, { SHEEPFOLD_SCHEDULE_INCLUDE_NEXT: '0' });
      assert.equal(result.status, 0, result.stderr);
      assert.match(result.stdout, /^status=block$/m);
      assert.match(result.stdout, /^next_change_time=$/m);
    } finally { fixture.close(); }
  });
  it('reports a valid next boundary when prediction is requested', () => {
    const fixture = createRouterFixture({ ...values, ...blockingSchedule, 'sheepfold.child.status': 'new' });
    try {
      const result = runSchedule(fixture);
      assert.equal(result.status, 0, result.stderr);
      assert.match(result.stdout, /^status=block$/m);
      assert.match(result.stdout, /^next_change_time=11:00$/m);
    } finally { fixture.close(); }
  });
  for (const failure of ['directory', 'stamp']) {
    it(`does not lose a blocking schedule when the conflict ${failure} cannot be written`, () => {
      const fixture = createRouterFixture({ ...values, ...blockingSchedule,
        'sheepfold.child.status': 'new', 'sheepfold.global.schedule_conflict_internet': 'off',
        'sheepfold.break': 'schedule', 'sheepfold.break.name': 'Conflicting rule',
        'sheepfold.break.target_type': 'device', 'sheepfold.break.targets': 'child',
        'sheepfold.break.weekdays': 'mon', 'sheepfold.break.time_ranges': '09:00-11:00',
        'sheepfold.break.action': 'allow',
      });
      try {
        const badPath = join(fixture.root, 'not-a-directory');
        writeFileSync(badPath, 'block directory creation');
        const statePath = failure === 'directory' ? badPath : join(fixture.root, 'conflicts');
        if (failure === 'stamp') mkdirSync(join(statePath, 'child'), { recursive: true });
        const result = fixture.run('sheepfold-client-status-effective', [testIp], {
          env: { SHEEPFOLD_SCHEDULE_STATE_DIR: posix(statePath) },
        });
        assert.equal(result.status, 0, result.stderr);
        assert.match(result.stdout, /^status=blocked$/m);
        assert.match(result.stdout, /^schedule_conflict=1$/m);
      } finally { fixture.close(); }
    });
  }
  for (const output of ['', 'add rule inet fw4 sheepfold_home_input counter']) {
    it(`rejects incomplete successful home rules ${JSON.stringify(output)}`, () => {
      const fixture = createRouterFixture(values);
      try {
        installExecutable(fixture, 'home-helper', `#!/bin/sh\nprintf '%s\\n' ${quote(output)}\n`);
        const result = fixture.run('sheepfold-firewall', [], {
          env: { SHEEPFOLD_HOME_NETWORK: posix(join(fixture.bin, 'home-helper')) },
        });
        assert.notEqual(result.status, 0);
        assert.equal(fixture.batch(), '');
      } finally { fixture.close(); }
    });
  }
  it('does not replace applied home API rules with an empty chain after a helper failure', () => {
    const fixture = createRouterFixture(values);
    const nft = installNftModel(fixture);
    const helper = posix(join(fixture.bin, 'home-helper'));
    try {
      installExecutable(fixture, 'home-helper', '#!/bin/sh\nprintf \'flush chain inet fw4 sheepfold_home_input\\nadd rule inet fw4 sheepfold_home_input counter comment "fixture"\\n\'\n');
      assert.equal(fixture.run('sheepfold-firewall', [], { env: { SHEEPFOLD_HOME_NETWORK: helper } }).status, 0);
      const previous = fixture.batch();
      installExecutable(fixture, 'home-helper', '#!/bin/sh\nprintf \'flush chain inet fw4 sheepfold_home_input\\n\'\nexit 1\n');
      const result = fixture.run('sheepfold-firewall', [], { env: { SHEEPFOLD_HOME_NETWORK: helper } });
      assert.notEqual(result.status, 0);
      assert.equal(nft.attempts(), 1);
      assert.equal(fixture.batch(), previous);
    } finally { fixture.close(); }
  });
});
