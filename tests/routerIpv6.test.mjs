/*
 * Симулирует включение и восстановление IPv6-режима Podkop с подменёнными /proc,/etc
 * и UCI в temp-каталоге. Реальный network reload не выполняется; влияние на WAN/LAN
 * и конкретную версию Podkop проверяется только на тестовом роутере.
 */
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readOverviewApplication } from '../tools/quality/overviewApplicationSource.mjs';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (path) => readFileSync(resolve(repoRoot, path), 'utf8');
const helper = resolve(repoRoot, 'package/luci-app-sheepfold-family-internet-control/root/usr/libexec/sheepfold/sheepfold-ipv6-control');
const overview = readOverviewApplication(resolve(repoRoot, 'package/luci-app-sheepfold-family-internet-control/htdocs/luci-static/resources/view/sheepfold/overview.js'));
const integrationPanel = read('package/luci-app-sheepfold-family-internet-control/htdocs/luci-static/resources/sheepfold/features/integrations/panel.js');
const settingsSideEffects = read('package/luci-app-sheepfold-family-internet-control/htdocs/luci-static/resources/sheepfold/features/settings/side-effects.js');
const defaults = read('package/luci-app-sheepfold-family-internet-control/root/usr/share/sheepfold/sheepfold.uci.defaults');
const makefile = read('package/luci-app-sheepfold-family-internet-control/Makefile');
const init = read('package/luci-app-sheepfold-family-internet-control/root/etc/init.d/sheepfold');
const wrapper = read('package/luci-app-sheepfold-family-internet-control/root/usr/libexec/sheepfold/sheepfold-router-control');
const temporaryDirs = [];

afterEach(() => {
  while (temporaryDirs.length) rmSync(temporaryDirs.pop(), { recursive: true, force: true });
});

function executable(path, content) {
  writeFileSync(path, content.replace(/^\n/, ''), 'utf8');
  chmodSync(path, 0o755);
}

function fixturePath(path) {
  return relative(repoRoot, path).replaceAll('\\', '/');
}

function fixture(integration = 'podkop', disabled = '0', source = 'default') {
  const fixtureRoot = resolve(repoRoot, '.build', 'test-fixtures');
  mkdirSync(fixtureRoot, { recursive: true });
  const root = mkdtempSync(join(fixtureRoot, 'sheepfold-ipv6-'));
  temporaryDirs.push(root);
  const bin = join(root, 'bin');
  const procRoot = join(root, 'proc');
  const state = join(root, 'uci.state');
  const sysctlFile = join(root, '99-sheepfold-disable-ipv6.conf');
  const restoreFile = join(root, 'ipv6-restore.conf');

  mkdirSync(join(procRoot, 'all'), { recursive: true });
  mkdirSync(join(procRoot, 'default'), { recursive: true });
  mkdirSync(bin, { recursive: true });
  writeFileSync(join(procRoot, 'all', 'disable_ipv6'), '0\n');
  writeFileSync(join(procRoot, 'default', 'disable_ipv6'), '0\n');
  writeFileSync(state, `integration_mode=${integration}\nrouter_ipv6_disabled=${disabled}\nrouter_ipv6_mode_source=${source}\n`);

  executable(join(bin, 'uci'), `
#!/bin/sh
state="$SHEEPFOLD_TEST_UCI_STATE"
case "$2" in
  get)
    key="\${3#sheepfold.global.}"
    sed -n "s/^$key=//p" "$state" | head -n 1
    ;;
  set)
    pair="$3"
    key="\${pair%%=*}"
    key="\${key#sheepfold.global.}"
    value="\${pair#*=}"
    grep -v "^$key=" "$state" > "$state.tmp" || true
    printf '%s=%s\n' "$key" "$value" >> "$state.tmp"
    mv -f "$state.tmp" "$state"
    ;;
  commit) ;;
  *) exit 2 ;;
esac
`);

  executable(join(bin, 'sysctl'), `
#!/bin/sh
assignment="$2"
name="\${assignment#net.ipv6.conf.}"
scope="\${name%%.*}"
value="\${assignment##*=}"
printf '%s\n' "$value" > "$SHEEPFOLD_IPV6_PROC_ROOT/$scope/disable_ipv6"
`);

  const env = {
    ...process.env,
    SHEEPFOLD_TEST_UCI_STATE: fixturePath(state),
    SHEEPFOLD_IPV6_UCI_BIN: fixturePath(join(bin, 'uci')),
    SHEEPFOLD_IPV6_SYSCTL_BIN: fixturePath(join(bin, 'sysctl')),
    SHEEPFOLD_IPV6_PROC_ROOT: fixturePath(procRoot),
    SHEEPFOLD_IPV6_SYSCTL_FILE: fixturePath(sysctlFile),
    SHEEPFOLD_IPV6_STATE_FILE: fixturePath(restoreFile),
  };

  return { root, procRoot, state, sysctlFile, restoreFile, env };
}

function runHelper(testFixture, command = 'apply') {
  const result = spawnSync('sh', [fixturePath(helper), command], {
    cwd: repoRoot,
    env: testFixture.env,
    encoding: 'utf8',
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
}

describe('router IPv6 management for Podkop §ipv6pod', () => {
  it('exposes one saved Misc setting and locks it on Podkop integrations', () => {
    assert.match(overview, /integrationPanel\.ipv6Field\(integrationUi\)/);
    assert.match(integrationPanel, /Disable IPv6 on the router/);
    assert.match(integrationPanel, /function usesPodkop/);
    assert.match(integrationPanel, /router_ipv6_mode_source: 'auto_podkop'/);
    assert.match(settingsSideEffects, /checkedRun\(\['ipv6-apply'\]/);
    assert.match(defaults, /option router_ipv6_disabled '0'/);
    assert.match(defaults, /option router_ipv6_mode_source 'default'/);
    assert.match(makefile, /podkop\|adguard_podkop[\s\S]*router_ipv6_disabled='1'/);
  });

  it('routes application through the focused backend and reapplies it on service start', () => {
    assert.match(wrapper, /IPV6_CONTROL="\/usr\/libexec\/sheepfold\/sheepfold-ipv6-control"/);
    assert.match(wrapper, /ipv6-apply\)[\s\S]*exec "\$IPV6_CONTROL" apply/);
    assert.match(wrapper, /ipv6-status\)[\s\S]*exec "\$IPV6_CONTROL" status/);
    assert.match(wrapper, /ipv6-release\)[\s\S]*exec "\$IPV6_CONTROL" release/);
    assert.match(init, /apply_ipv6_settings[\s\S]*sheepfold-ipv6-control apply/);
  });

  it('automatically disables IPv6 for Podkop and restores the previous kernel state afterward', () => {
    const f = fixture();
    runHelper(f);

    assert.match(readFileSync(f.state, 'utf8'), /router_ipv6_disabled=1/);
    assert.match(readFileSync(f.state, 'utf8'), /router_ipv6_mode_source=auto_podkop/);
    assert.match(readFileSync(f.sysctlFile, 'utf8'), /net\.ipv6\.conf\.all\.disable_ipv6=1/);
    assert.equal(readFileSync(join(f.procRoot, 'all', 'disable_ipv6'), 'utf8').trim(), '1');
    assert.equal(readFileSync(join(f.procRoot, 'default', 'disable_ipv6'), 'utf8').trim(), '1');

    writeFileSync(f.state, 'integration_mode=none\nrouter_ipv6_disabled=1\nrouter_ipv6_mode_source=auto_podkop\n');
    runHelper(f);

    assert.match(readFileSync(f.state, 'utf8'), /router_ipv6_disabled=0/);
    assert.match(readFileSync(f.state, 'utf8'), /router_ipv6_mode_source=default/);
    assert.equal(readFileSync(join(f.procRoot, 'all', 'disable_ipv6'), 'utf8').trim(), '0');
    assert.equal(readFileSync(join(f.procRoot, 'default', 'disable_ipv6'), 'utf8').trim(), '0');
    assert.equal(existsSync(f.sysctlFile), false);
    assert.equal(existsSync(f.restoreFile), false);
  });

  it('releases only Sheepfold-owned runtime state during package removal', () => {
    const f = fixture();
    runHelper(f);
    runHelper(f, 'release');

    assert.match(readFileSync(f.state, 'utf8'), /router_ipv6_disabled=1/);
    assert.equal(readFileSync(join(f.procRoot, 'all', 'disable_ipv6'), 'utf8').trim(), '0');
    assert.equal(readFileSync(join(f.procRoot, 'default', 'disable_ipv6'), 'utf8').trim(), '0');
    assert.equal(existsSync(f.sysctlFile), false);
    assert.equal(existsSync(f.restoreFile), false);
  });
});
