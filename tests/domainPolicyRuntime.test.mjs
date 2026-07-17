/*
 * Симулирует runtime белых/чёрных списков сайтов, DNS и firewall в изолированном
 * временном стенде. Все файлы создаются вне реального /etc; зелёный результат не
 * заменяет проверку dnsmasq/nftables и трафика клиента на живом OpenWrt.
 */
import {
  chmodSync,
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const helper = resolve(
  repoRoot,
  'package/luci-app-sheepfold-family-internet-control/root/usr/libexec/sheepfold/sheepfold-domain-policy',
);
const firewall = readFileSync(resolve(
  repoRoot,
  'package/luci-app-sheepfold-family-internet-control/root/usr/libexec/sheepfold/sheepfold-firewall',
), 'utf8');
const table = readFileSync(resolve(
  repoRoot,
  'package/luci-app-sheepfold-family-internet-control/root/usr/share/nftables.d/table-pre/30-sheepfold.nft',
), 'utf8');
const siteLists = readFileSync(resolve(
  repoRoot,
  'package/luci-app-sheepfold-family-internet-control/root/usr/libexec/sheepfold/sheepfold-site-lists',
), 'utf8');
const testTmp = join(repoRoot, '.build', 'test-tmp');
mkdirSync(testTmp, { recursive: true });

const shellPath = process.platform === 'win32'
  ? `C:\\Program Files\\Git\\usr\\bin;C:\\Program Files\\Git\\bin;${process.env.PATH}`
  : process.env.PATH;
const posix = (path) => path
  .replaceAll('\\', '/')
  .replace(/^([A-Za-z]):\//, (_, drive) => `/${drive.toLowerCase()}/`);

function executable(path, body) {
  writeFileSync(path, body.replace(/^\n/, ''), 'utf8');
  chmodSync(path, 0o755);
}

function scenario({
  integrationMode = 'none',
  siteFilterBackend = 'auto',
  adguardAutoManage = '1',
  adguardSyncResult = 'success',
  adguardReason = 'active',
  siteBlocklistMode = 'except_allowlist_admins',
  allowlistOnly = '1',
  nftset = true,
  failFirstRestart = false,
  failFirstDomainReset = false,
  oldConfig = '',
  oldActive = '',
} = {}) {
  const root = mkdtempSync(join(testTmp, 'sheepfold-domain-policy-'));
  const bin = join(root, 'bin');
  const siteListsDir = join(root, 'site-lists');
  const runtime = join(root, 'runtime');
  const dnsmasqDir = join(root, 'dnsmasq.d');
  const restartCount = join(root, 'restart.count');
  const firewallLog = join(root, 'firewall.log');
  const notificationLog = join(root, 'notification.log');
  const adguardLog = join(root, 'adguard.log');
  const domainResetCount = join(root, 'domain-reset.count');
  const target = join(dnsmasqDir, 'sheepfold-domain-policy.conf');
  mkdirSync(bin, { recursive: true });
  mkdirSync(siteListsDir, { recursive: true });
  mkdirSync(runtime, { recursive: true });
  mkdirSync(dnsmasqDir, { recursive: true });
  writeFileSync(join(siteListsDir, 'allowlist.domains'), 'library.example\nschool.example\n', 'utf8');
  writeFileSync(join(siteListsDir, 'blocklist.domains'), 'bad.example\nmalware.example\n', 'utf8');
  if (oldConfig) writeFileSync(target, oldConfig, 'utf8');
  if (oldActive) writeFileSync(join(runtime, 'active'), oldActive, 'utf8');

  executable(join(bin, 'uci'), `
#!/bin/sh
case "$*" in
  *"get sheepfold.global.integration_mode") printf '%s' "$INTEGRATION_MODE" ;;
  *"get sheepfold.global.site_filter_backend") printf '%s' "$SITE_FILTER_BACKEND" ;;
  *"get sheepfold.global.adguard_auto_manage") printf '%s' "$ADGUARD_AUTO_MANAGE" ;;
  *"get sheepfold.global.site_blocklist_mode") printf '%s' "$SITE_BLOCKLIST_MODE" ;;
  *"get sheepfold.child.allowlist_only") printf '%s' "$ALLOWLIST_ONLY" ;;
  *"get dhcp.@dnsmasq[0].confdir") printf '%s' "$DNSMASQ_CONF_DIR" ;;
  *"show sheepfold") printf 'sheepfold.child=group\n' ;;
  *) exit 1 ;;
esac
`);
  executable(join(bin, 'adguard'), `
#!/bin/sh
printf '%s\n' "$1" >> "$ADGUARD_LOG"
case "$1" in
  sync)
    [ "$ADGUARD_SYNC_RESULT" = success ]
    ;;
  disable) exit 0 ;;
  status)
    printf 'reason=%s\n' "$ADGUARD_REASON"
    printf 'allowlist_ready=1\nblocklist_ready=1\n'
    printf 'server_running=1\nprotection_enabled=1\nserver_version=v0.107.66\ndns_port=53\n'
    printf 'dns_address_count=2\ndns_info_available=1\ndns_info_reason=available\n'
    printf 'upstream_count=2\nfallback_count=1\nbootstrap_count=2\n'
    printf 'engine_checked=1\ndns_path_status=not_checked\ndns_path_reason=client_probe_required\n'
    ;;
  *) exit 2 ;;
esac
`);
  executable(join(bin, 'dnsmasq'), `
#!/bin/sh
case "$1" in
  --version)
    printf 'Dnsmasq test build\nCompile time options: IPv6 DHCP${nftset ? ' nftset' : ''}\n'
    ;;
  --test) exit 0 ;;
  *) exit 2 ;;
esac
`);
  executable(join(bin, 'dnsmasq-init'), `
#!/bin/sh
count="$(cat "$RESTART_COUNT" 2>/dev/null || printf 0)"
count=$((count + 1))
printf '%s\n' "$count" > "$RESTART_COUNT"
if [ "$FAIL_FIRST_RESTART" = 1 ] && [ "$count" -eq 1 ]; then
  exit 1
fi
exit 0
`);
  executable(join(bin, 'firewall'), `
#!/bin/sh
allow_ready="$(sed -n 's/^allowlist_ready=//p' "$ACTIVE_FILE" 2>/dev/null | sed -n '1p')"
block_ready="$(sed -n 's/^blocklist_ready=//p' "$ACTIVE_FILE" 2>/dev/null | sed -n '1p')"
printf '%s:%s:%s\n' "$*" "$allow_ready" "$block_ready" >> "$FIREWALL_LOG"
case "$1" in
  ensure|sync) exit 0 ;;
  domain-reset)
    count="$(cat "$DOMAIN_RESET_COUNT" 2>/dev/null || printf 0)"
    count=$((count + 1))
    printf '%s\n' "$count" > "$DOMAIN_RESET_COUNT"
    if [ "$FAIL_FIRST_DOMAIN_RESET" = 1 ] && [ "$count" -eq 1 ]; then exit 1; fi
    exit 0
    ;;
  *) exit 2 ;;
esac
`);
  executable(join(bin, 'notification'), `
#!/bin/sh
printf '%s\n' "$*" >> "$NOTIFICATION_LOG"
exit 0
`);
  executable(join(bin, 'log'), '#!/bin/sh\nexit 0\n');

  const env = {
    ...process.env,
    PATH: shellPath,
    INTEGRATION_MODE: integrationMode,
    SITE_FILTER_BACKEND: siteFilterBackend,
    ADGUARD_AUTO_MANAGE: adguardAutoManage,
    ADGUARD_SYNC_RESULT: adguardSyncResult,
    ADGUARD_REASON: adguardReason,
    ADGUARD_LOG: posix(relative(repoRoot, adguardLog)),
    SITE_BLOCKLIST_MODE: siteBlocklistMode,
    ALLOWLIST_ONLY: allowlistOnly,
    DNSMASQ_CONF_DIR: posix(relative(repoRoot, dnsmasqDir)),
    RESTART_COUNT: posix(relative(repoRoot, restartCount)),
    FAIL_FIRST_RESTART: failFirstRestart ? '1' : '0',
    FAIL_FIRST_DOMAIN_RESET: failFirstDomainReset ? '1' : '0',
    FIREWALL_LOG: posix(relative(repoRoot, firewallLog)),
    DOMAIN_RESET_COUNT: posix(relative(repoRoot, domainResetCount)),
    ACTIVE_FILE: posix(relative(repoRoot, join(runtime, 'active'))),
    NOTIFICATION_LOG: posix(relative(repoRoot, notificationLog)),
    SHEEPFOLD_SITE_LIST_RUNTIME_DIR: posix(relative(repoRoot, siteListsDir)),
    SHEEPFOLD_DOMAIN_POLICY_RUNTIME_DIR: posix(relative(repoRoot, runtime)),
    SHEEPFOLD_DOMAIN_POLICY_DNSMASQ_DIR: posix(relative(repoRoot, dnsmasqDir)),
    SHEEPFOLD_DOMAIN_POLICY_UCI_HELPER: posix(relative(repoRoot, join(bin, 'uci'))),
    SHEEPFOLD_DOMAIN_POLICY_DNSMASQ_BIN: posix(relative(repoRoot, join(bin, 'dnsmasq'))),
    SHEEPFOLD_DOMAIN_POLICY_DNSMASQ_INIT: posix(relative(repoRoot, join(bin, 'dnsmasq-init'))),
    SHEEPFOLD_DOMAIN_POLICY_FIREWALL_HELPER: posix(relative(repoRoot, join(bin, 'firewall'))),
    SHEEPFOLD_ADGUARD_HELPER: posix(relative(repoRoot, join(bin, 'adguard'))),
    SHEEPFOLD_NOTIFICATION_HELPER: posix(relative(repoRoot, join(bin, 'notification'))),
    SHEEPFOLD_LOG_HELPER: posix(relative(repoRoot, join(bin, 'log'))),
    SHEEPFOLD_DOMAIN_POLICY_ALLOW_RELATIVE_PATHS: '1',
  };

  const run = (command = 'apply') => spawnSync('bash', [
    posix(relative(repoRoot, helper)), command,
  ], { cwd: repoRoot, env, encoding: 'utf8' });

  return {
    run,
    target,
    active: join(runtime, 'active'),
    status: join(runtime, 'status'),
    restartCount,
    firewallLog,
    notificationLog,
    adguardLog,
  };
}

describe('runtime policy for site allowlists and blocklists', () => {
  it('applies checked dnsmasq nftset rules once and records active readiness', () => {
    const test = scenario();
    const first = test.run();
    assert.equal(first.status, 0, first.stderr || first.stdout);
    const config = readFileSync(test.target, 'utf8');
    assert.match(config, /school\.example/);
    assert.match(config, /sheepfold_site_allow_v4/);
    assert.match(config, /bad\.example/);
    assert.match(config, /sheepfold_site_block_v6/);
    assert.ok(config.split(/\r?\n/).every((line) => line.length <= 900));
    assert.match(readFileSync(test.active, 'utf8'), /^backend=dnsmasq$/m);
    assert.match(readFileSync(test.active, 'utf8'), /^allowlist_ready=1$/m);
    assert.match(readFileSync(test.active, 'utf8'), /^blocklist_ready=1$/m);
    assert.equal(readFileSync(test.restartCount, 'utf8').trim(), '1');
    assert.match(readFileSync(test.firewallLog, 'utf8'), /^ensure::$/m);
    assert.match(readFileSync(test.firewallLog, 'utf8'), /^domain-reset:1:1$/m);

    const second = test.run();
    assert.equal(second.status, 0, second.stderr || second.stdout);
    assert.equal(readFileSync(test.restartCount, 'utf8').trim(), '1');
    assert.match(readFileSync(test.firewallLog, 'utf8'), /^sync:1:1$/m);
  });

  it('uses the confirmed Sheepfold-managed AdGuard filter without local DNS rules', () => {
    const test = scenario({
      integrationMode: 'adguard_podkop',
      oldConfig: 'nftset=/old.example/4#inet#fw4#old\n',
      oldActive: 'backend=dnsmasq\nallowlist_ready=1\nblocklist_ready=1\n',
    });
    const result = test.run();
    assert.equal(result.status, 0, result.stderr || result.stdout);
    assert.equal(existsSync(test.target), false);
    assert.equal(existsSync(test.active), false);
    assert.match(readFileSync(test.status, 'utf8'), /^backend=adguard$/m);
    assert.match(readFileSync(test.status, 'utf8'), /^reason=active$/m);
    assert.match(readFileSync(test.status, 'utf8'), /^adguard_reason=active$/m);
    assert.match(readFileSync(test.status, 'utf8'), /^adguard_server_running=1$/m);
    assert.match(readFileSync(test.status, 'utf8'), /^adguard_server_version=v0\.107\.66$/m);
    assert.match(readFileSync(test.status, 'utf8'), /^adguard_dns_path_status=not_checked$/m);
    assert.match(readFileSync(test.adguardLog, 'utf8'), /^sync$/m);
    assert.equal(readFileSync(test.restartCount, 'utf8').trim(), '1');
  });

  it('falls back to built-in filtering when the AdGuard API cannot be confirmed', () => {
    const test = scenario({
      integrationMode: 'adguard',
      adguardSyncResult: 'failure',
      adguardReason: 'authentication_failed',
    });
    const result = test.run();
    assert.equal(result.status, 0, result.stderr || result.stdout);
    assert.match(readFileSync(test.status, 'utf8'), /^backend=dnsmasq$/m);
    assert.match(readFileSync(test.status, 'utf8'), /^adguard_reason=authentication_failed$/m);
    assert.match(readFileSync(test.status, 'utf8'), /^adguard_fallback=1$/m);
    assert.match(readFileSync(test.adguardLog, 'utf8'), /^sync$/m);
    assert.match(readFileSync(test.adguardLog, 'utf8'), /^disable$/m);
  });

  it('reports manual AdGuard delegation as unverified when automatic management is off', () => {
    const test = scenario({
      integrationMode: 'adguard',
      siteFilterBackend: 'adguard',
      adguardAutoManage: '0',
      oldConfig: 'nftset=/old.example/4#inet#fw4#old\n',
      oldActive: 'backend=dnsmasq\nallowlist_ready=1\nblocklist_ready=1\n',
    });
    const result = test.run();
    assert.equal(result.status, 0, result.stderr || result.stdout);
    assert.equal(existsSync(test.target), false);
    assert.match(readFileSync(test.status, 'utf8'), /^backend=adguard$/m);
    assert.match(readFileSync(test.status, 'utf8'), /^reason=manual_unverified$/m);
    assert.doesNotMatch(readFileSync(test.adguardLog, 'utf8'), /^(sync|disable)$/m);
  });

  it('restores the previous dnsmasq file when the new configuration cannot start', () => {
    const oldConfig = '# old working policy\nnftset=/old.example/4#inet#fw4#old\n';
    const oldActive = 'backend=dnsmasq\nallowlist_ready=1\nblocklist_ready=0\n';
    const test = scenario({
      siteBlocklistMode: 'disabled',
      failFirstRestart: true,
      oldConfig,
      oldActive,
    });
    const result = test.run();
    assert.notEqual(result.status, 0);
    assert.equal(readFileSync(test.target, 'utf8'), oldConfig);
    assert.equal(readFileSync(test.active, 'utf8'), oldActive);
    assert.match(readFileSync(test.status, 'utf8'), /^backend=error$/m);
    assert.match(readFileSync(test.status, 'utf8'), /^reason=restart_failed$/m);
    assert.equal(readFileSync(test.restartCount, 'utf8').trim(), '2');
  });

  it('restores DNS config and active readiness when clearing firewall state fails', () => {
    const oldConfig = '# old working policy\nnftset=/old.example/4#inet#fw4#old\n';
    const oldActive = 'backend=dnsmasq\nallowlist_ready=1\nblocklist_ready=1\n';
    const test = scenario({
      integrationMode: 'adguard',
      failFirstDomainReset: true,
      oldConfig,
      oldActive,
    });
    const result = test.run();
    assert.notEqual(result.status, 0);
    assert.equal(readFileSync(test.target, 'utf8'), oldConfig);
    assert.equal(readFileSync(test.active, 'utf8'), oldActive);
    assert.match(readFileSync(test.status, 'utf8'), /^backend=error$/m);
    assert.match(readFileSync(test.status, 'utf8'), /^reason=firewall_sync_failed$/m);
    assert.equal(readFileSync(test.restartCount, 'utf8').trim(), '2');
    assert.match(readFileSync(test.firewallLog, 'utf8'), /^domain-reset::$/m);
    assert.match(readFileSync(test.firewallLog, 'utf8'), /^domain-reset:1:1$/m);
  });

  it('fails open and notifies the administrator when dnsmasq has no nftset support', () => {
    const test = scenario({
      allowlistOnly: '0',
      nftset: false,
      oldConfig: 'nftset=/old.example/4#inet#fw4#old\n',
      oldActive: 'backend=dnsmasq\nallowlist_ready=0\nblocklist_ready=1\n',
    });
    const result = test.run();
    assert.equal(result.status, 0, result.stderr || result.stdout);
    assert.equal(existsSync(test.target), false);
    assert.equal(existsSync(test.active), false);
    assert.match(readFileSync(test.status, 'utf8'), /^backend=unsupported$/m);
    assert.match(readFileSync(test.status, 'utf8'), /^reason=dnsmasq_nftset_unavailable$/m);
    assert.match(readFileSync(test.notificationLog, 'utf8'), /domain_policy_nftset_unavailable/);
  });

  it('keeps device block rules above domain policy and global access below it', () => {
    const deviceBlock = table.indexOf('ether saddr @sheepfold_block_macs counter drop');
    const sitePolicy = table.indexOf('jump sheepfold_site_guard');
    const globalExemption = table.indexOf('iifname @sheepfold_global_ifaces ether saddr @sheepfold_exempt_macs');
    assert.ok(deviceBlock >= 0 && deviceBlock < sitePolicy);
    assert.ok(sitePolicy < globalExemption);
    assert.match(table, /chain sheepfold_site_guard/);
    assert.match(firewall, /group_is_allowlist_only/);
    assert.match(firewall, /domain-reset\) reset_domain_sets/);
    assert.match(siteLists, /"\$POLICY_HELPER" apply/);
    assert.doesNotMatch(`${firewall}\n${table}`, /(?:meta|ct)\s+mark/i);
  });
});
