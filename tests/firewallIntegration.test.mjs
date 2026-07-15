import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (path) => readFileSync(resolve(repoRoot, path), 'utf8');

const firewall = read('package/luci-app-sheepfold-family-internet-control/root/usr/libexec/sheepfold/sheepfold-firewall');
const tableSnippet = read('package/luci-app-sheepfold-family-internet-control/root/usr/share/nftables.d/table-pre/30-sheepfold.nft');
const forwardSnippet = read('package/luci-app-sheepfold-family-internet-control/root/usr/share/nftables.d/chain-pre/forward/30-sheepfold.nft');
const inputSnippet = read('package/luci-app-sheepfold-family-internet-control/root/usr/share/nftables.d/chain-pre/input/30-sheepfold.nft');
const routerControl = read('package/luci-app-sheepfold-family-internet-control/root/usr/libexec/sheepfold/sheepfold-router-control-legacy');
const service = read('package/luci-app-sheepfold-family-internet-control/root/usr/libexec/sheepfold/sheepfold-service');
const pairDevice = read('package/luci-app-sheepfold-family-internet-control/root/usr/libexec/sheepfold/sheepfold-pair-device');
const clientStatus = read('package/luci-app-sheepfold-family-internet-control/root/usr/libexec/sheepfold/sheepfold-client-status-effective');
const installer = read('install.sh');
const makefile = read('package/luci-app-sheepfold-family-internet-control/Makefile');

describe('fw4 access enforcement and integration profiles', () => {
  it('uses package-author fw4 hooks and only Sheepfold-owned sets and chains', () => {
    assert.match(tableSnippet, /set sheepfold_block_macs/);
    assert.match(tableSnippet, /set sheepfold_exempt_macs/);
    assert.match(tableSnippet, /set sheepfold_global_ifaces/);
    assert.match(tableSnippet, /chain sheepfold_forward_guard/);
    assert.match(tableSnippet, /chain sheepfold_input_guard/);
    assert.match(forwardSnippet, /^jump sheepfold_forward_guard\s*$/);
    assert.match(inputSnippet, /^jump sheepfold_input_guard\s*$/);

    const blockRule = tableSnippet.indexOf('ether saddr @sheepfold_block_macs');
    const exemptionRule = tableSnippet.indexOf('ether saddr @sheepfold_exempt_macs');
    const globalDrop = tableSnippet.lastIndexOf('iifname @sheepfold_global_ifaces counter drop');
    assert.ok(blockRule >= 0 && blockRule < exemptionRule && exemptionRule < globalDrop);
  });

  it('does not touch Podkop routing, packet marks, or foreign nftables state', () => {
    const implementation = `${firewall}\n${tableSnippet}\n${forwardSnippet}\n${inputSnippet}`;
    assert.doesNotMatch(implementation, /flush\s+(?:ruleset|table)/i);
    assert.doesNotMatch(implementation, /delete\s+table/i);
    assert.doesNotMatch(implementation, /(?:meta|ct)\s+mark/i);
    assert.doesNotMatch(implementation, /\bip\s+(?:rule|route)\b/i);
    assert.doesNotMatch(implementation, /PodkopTable/);
    assert.match(firewall, /nft flush set inet fw4 sheepfold_block_macs/);
  });

  it('syncs enforcement after UCI changes and restores sets after fw4 reload', () => {
    assert.match(routerControl, /sync_firewall\(\)/);
    assert.match(routerControl, /global_block_on\(\)[\s\S]*sync_firewall/);
    assert.match(routerControl, /global_internet_disable\(\)[\s\S]*sync_firewall/);
    assert.match(routerControl, /device_block\(\)[\s\S]*sync_firewall/);
    assert.match(pairDevice, /sheepfold-firewall sync/);
    assert.match(service, /"\$FIREWALL_HELPER" sync/);
    assert.match(firewall, /ensure_sets\(\)[\s\S]*\/etc\/init\.d\/firewall reload/);
  });

  it('keeps global block above temporary access but below explicit exemptions', () => {
    const admin = clientStatus.indexOf('administrator_device');
    const allowlist = clientStatus.indexOf('reason=allowlist');
    const noRestrictions = clientStatus.indexOf('reason=no_restrictions_group');
    const globalBlock = clientStatus.indexOf('reason=global_block');
    const temporary = clientStatus.indexOf('reason=temporary_access');
    assert.ok(admin >= 0 && admin < globalBlock);
    assert.ok(allowlist >= 0 && allowlist < globalBlock);
    assert.ok(noRestrictions >= 0 && noRestrictions < globalBlock);
    assert.ok(globalBlock < temporary);
    assert.match(firewall, /temp_access\|temp-access\|temporary\|blocked\|block\) continue/);
  });

  it('supports exactly four compatibility modes and preserves a manual choice', () => {
    assert.match(installer, /INTEGRATION_MODE="none"/);
    assert.match(installer, /INTEGRATION_MODE="adguard"/);
    assert.match(installer, /INTEGRATION_MODE="podkop"/);
    assert.match(installer, /INTEGRATION_MODE="adguard_podkop"/);
    assert.match(installer, /integration_mode_user_set[\s\S]*!= "1"/);
    assert.match(installer, /Keeping manually selected integration mode/);
    assert.match(firewall, /none\|adguard\|podkop\|adguard_podkop/);
  });

  it('ships migration defaults and a new package release', () => {
    assert.match(makefile, /PKG_RELEASE:=164/);
    assert.match(makefile, /ensure_global_option lan_firewall_zones 'lan'/);
    assert.match(makefile, /ensure_global_option integration_mode 'none'/);
    assert.doesNotMatch(makefile, /mv -f "\$\$tmp" "\$\$cron_file"[^\r\n]*\[ -x \/etc\/init\.d\/cron/);
    assert.match(makefile, /sheepfold-firewall clear/);
  });
});
