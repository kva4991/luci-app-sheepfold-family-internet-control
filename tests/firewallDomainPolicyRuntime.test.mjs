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
const firewall = resolve(
  repoRoot,
  'package/luci-app-sheepfold-family-internet-control/root/usr/libexec/sheepfold/sheepfold-firewall',
);
const testTmp = join(repoRoot, '.build', 'test-tmp');
mkdirSync(testTmp, { recursive: true });

const bashExecutable = process.platform === 'win32'
  ? 'C:\\Program Files\\Git\\bin\\bash.exe'
  : 'bash';
const posix = (path) => path
  .replaceAll('\\', '/')
  .replace(/^([A-Za-z]):\//, (_, drive) => `/${drive.toLowerCase()}/`);

function executable(path, body) {
  writeFileSync(path, body.replace(/^\n/, ''), 'utf8');
  chmodSync(path, 0o755);
}

function runScenario({
  siteMode = 'except_allowlist_admins',
  active = true,
  command = 'sync',
  primeSync = false,
} = {}) {
  const root = mkdtempSync(join(testTmp, 'sheepfold-firewall-domain-'));
  const bin = join(root, 'bin');
  const stateDir = join(root, 'state');
  const activeFile = join(root, 'active');
  const nftLog = join(root, 'nft.log');
  mkdirSync(bin, { recursive: true });
  mkdirSync(stateDir, { recursive: true });
  if (active) {
    writeFileSync(activeFile, 'backend=dnsmasq\nallowlist_ready=1\nblocklist_ready=1\n', 'utf8');
  }

  executable(join(bin, 'uci'), `
#!/bin/sh
case "$*" in
  *"show sheepfold")
    printf '%s\n' \\
      'sheepfold.strict=group' \\
      'sheepfold.admin=device' \\
      'sheepfold.allowed=device' \\
      'sheepfold.strict_device=device' \\
      'sheepfold.normal=device'
    ;;
  *"show firewall") printf 'firewall.lan=zone\n' ;;
  *"get sheepfold.global.lan_firewall_zones") printf 'lan' ;;
  *"get sheepfold.global.domain_allowlist_for_blocklist") printf '1' ;;
  *"get sheepfold.global.site_blocklist_mode") printf '%s' "$SITE_MODE" ;;
  *"get sheepfold.global.block_on_boot") printf '0' ;;
  *"get sheepfold.global.new_device_policy") printf 'allow' ;;
  *"get sheepfold.no_restrictions.name") printf 'No restrictions' ;;
  *"get sheepfold.blocklist.mac") printf '00:11:22:33:44:01' ;;
  *"get sheepfold.allowlist.mac") printf '00:11:22:33:44:03' ;;
  *"get sheepfold.strict.allowlist_only") printf '1' ;;
  *"get sheepfold.strict.name") printf 'Kids' ;;
  *"get sheepfold.admin.mac") printf '00:11:22:33:44:02' ;;
  *"get sheepfold.admin.status") printf 'new' ;;
  *"get sheepfold.admin.group") printf 'Parents' ;;
  *"get sheepfold.admin.admin_device") printf '1' ;;
  *"get sheepfold.allowed.mac") printf '00:11:22:33:44:03' ;;
  *"get sheepfold.allowed.status") printf 'allow' ;;
  *"get sheepfold.allowed.group") printf 'Parents' ;;
  *"get sheepfold.allowed.admin_device") printf '0' ;;
  *"get sheepfold.strict_device.mac") printf '00:11:22:33:44:04' ;;
  *"get sheepfold.strict_device.status") printf 'new' ;;
  *"get sheepfold.strict_device.group") printf 'Kids' ;;
  *"get sheepfold.strict_device.admin_device") printf '0' ;;
  *"get sheepfold.normal.mac") printf '00:11:22:33:44:05' ;;
  *"get sheepfold.normal.status") printf 'new' ;;
  *"get sheepfold.normal.group") printf 'Not configured' ;;
  *"get sheepfold.normal.admin_device") printf '0' ;;
  *"get firewall.lan.name") printf 'lan' ;;
  *"get firewall.lan.network") printf 'lan' ;;
  *"get network.lan.device") printf 'br-lan' ;;
  *) exit 1 ;;
esac
`);
  executable(join(bin, 'nft'), `
#!/bin/sh
case "$1" in
  list) exit 0 ;;
  -f) cat "$2" > "$NFT_LOG"; exit 0 ;;
  flush) printf '%s\n' "$*" >> "$NFT_LOG"; exit 0 ;;
  *) exit 2 ;;
esac
`);

  const env = {
    ...process.env,
    PATH: `${posix(relative(repoRoot, bin))}:/usr/bin:/bin`,
    SITE_MODE: siteMode,
    NFT_LOG: posix(relative(repoRoot, nftLog)),
    SHEEPFOLD_FIREWALL_STATE_DIR: posix(relative(repoRoot, stateDir)),
    SHEEPFOLD_DOMAIN_POLICY_ACTIVE: posix(relative(repoRoot, activeFile)),
    SHEEPFOLD_SCHEDULE_EVALUATOR: posix(relative(repoRoot, join(root, 'missing-schedule-evaluator'))),
  };
  const run = (wantedCommand) => spawnSync(
    bashExecutable,
    [posix(relative(repoRoot, firewall)), wantedCommand],
    {
      cwd: repoRoot,
      env,
      encoding: 'utf8',
    },
  );
  if (primeSync) {
    const primingResult = run('sync');
    assert.equal(primingResult.status, 0, primingResult.stderr || primingResult.stdout);
    writeFileSync(nftLog, '', 'utf8');
  }
  const result = run(command);

  return {
    result,
    batch: existsSync(nftLog) ? readFileSync(nftLog, 'utf8') : '',
  };
}

describe('firewall state for site lists', () => {
  it('keeps the device blocklist strongest and assigns domain-policy sets by role', () => {
    const test = runScenario();
    assert.equal(test.result.status, 0, test.result.stderr || test.result.stdout);
    assert.match(test.batch, /sheepfold_block_macs \{ 00:11:22:33:44:01 \}/);
    assert.match(test.batch, /sheepfold_exempt_macs \{ 00:11:22:33:44:02, 00:11:22:33:44:03 \}/);
    assert.match(test.batch, /sheepfold_site_allow_macs \{ 00:11:22:33:44:04 \}/);
    assert.match(test.batch, /sheepfold_site_block_exempt_macs \{ 00:11:22:33:44:02, 00:11:22:33:44:03 \}/);
    assert.match(test.batch, /sheepfold_site_filter_ifaces \{ "br-lan" \}/);
    assert.doesNotMatch(test.batch, /sheepfold_site_allow_macs[^\n]*00:11:22:33:44:01/);
  });

  it('does not exempt allowlist or admin devices when the site blocklist targets everyone', () => {
    const test = runScenario({ siteMode: 'all' });
    assert.equal(test.result.status, 0, test.result.stderr || test.result.stdout);
    assert.doesNotMatch(test.batch, /add element inet fw4 sheepfold_site_block_exempt_macs/);
    assert.match(test.batch, /sheepfold_site_filter_ifaces \{ "br-lan" \}/);
  });

  it('leaves site MAC and interface sets empty without an active checked DNS policy', () => {
    const test = runScenario({ active: false });
    assert.equal(test.result.status, 0, test.result.stderr || test.result.stdout);
    assert.doesNotMatch(test.batch, /add element inet fw4 sheepfold_site_allow_macs/);
    assert.doesNotMatch(test.batch, /add element inet fw4 sheepfold_site_block_exempt_macs/);
    assert.doesNotMatch(test.batch, /add element inet fw4 sheepfold_site_filter_ifaces/);
  });

  it('resets all domain and device-policy sets in one nft batch even when the state hash matches', () => {
    const test = runScenario({ command: 'domain-reset', primeSync: true });
    assert.equal(test.result.status, 0, test.result.stderr || test.result.stdout);
    assert.match(test.batch, /flush set inet fw4 sheepfold_site_allow_v4/);
    assert.match(test.batch, /flush set inet fw4 sheepfold_site_allow_v6/);
    assert.match(test.batch, /flush set inet fw4 sheepfold_site_block_v4/);
    assert.match(test.batch, /flush set inet fw4 sheepfold_site_block_v6/);
    assert.match(test.batch, /add element inet fw4 sheepfold_site_allow_macs/);
    assert.doesNotMatch(test.batch, /^domain-reset/m);
  });
});
