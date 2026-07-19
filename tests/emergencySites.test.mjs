/*
 * Защищает хранение аварийно-полезных сайтов и их узкое firewall-исключение.
 * Тест меняет только модели в памяти и читает исходники; реальный DNS/firewall
 * проверяется отдельной категорией networkIntegration и на тестовом роутере.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { describe, it } from 'node:test';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (path) => readFileSync(resolve(repoRoot, path), 'utf8');
const modelPath = 'package/luci-app-sheepfold-family-internet-control/htdocs/luci-static/resources/sheepfold/features/emergency/sites.js';

function loadModel() {
  const source = read(modelPath).replace(/^'require .*?';\r?\n/gm, '');
  const context = {
    module: { exports: {} },
    baseclass: { extend: (value) => value },
  };
  vm.runInNewContext(`(function () { ${source.replace('return baseclass.extend(', 'module.exports = baseclass.extend(')} })()`, context);
  return context.module.exports;
}

const overview = read('package/luci-app-sheepfold-family-internet-control/htdocs/luci-static/resources/view/sheepfold/overview.js');
const defaults = read('package/luci-app-sheepfold-family-internet-control/root/usr/share/sheepfold/sheepfold.uci.defaults');
const makefile = read('package/luci-app-sheepfold-family-internet-control/Makefile');
const helper = read('package/luci-app-sheepfold-family-internet-control/root/usr/libexec/sheepfold/sheepfold-emergency-sites');
const firewall = read('package/luci-app-sheepfold-family-internet-control/root/usr/libexec/sheepfold/sheepfold-firewall');
const nft = read('package/luci-app-sheepfold-family-internet-control/root/usr/share/nftables.d/table-pre/30-sheepfold.nft');
const routerControl = read('package/luci-app-sheepfold-family-internet-control/root/usr/libexec/sheepfold/sheepfold-router-control-legacy');

describe('emergency-useful sites persistence and enforcement §emerg1', () => {
  it('normalizes web input to a safe domain and rejects addresses and shell text', () => {
    const model = loadModel();

    assert.equal(model.normalizeDomain('https://WWW.Gosuslugi.ru/path?q=1'), 'gosuslugi.ru');
    assert.equal(model.normalizeDomain('esia.gosuslugi.ru:443'), 'esia.gosuslugi.ru');
    assert.equal(model.normalizeDomain('192.168.1.1'), '');
    assert.equal(model.normalizeDomain('ya.ru;reboot'), '');
    assert.equal(model.normalizeDomain('localhost'), '');
  });

  it('loads metadata from UCI and stages stable named sections', () => {
    const model = loadModel();
    const removed = [];
    const writes = [];
    const source = [{
      '.name': 'emergency_gosuslugi_ru',
      '.type': 'emergency_site',
      domain: 'gosuslugi.ru',
      name: 'Госуслуги',
      description: 'Государственные услуги',
      order: '1',
      enabled: '1',
      source: 'country_profile',
      profile_country: 'ru',
      profile_id: 'gosuslugi',
    }];
    const uci = {
      sections: () => source,
      remove: (_config, section) => removed.push(section),
      add: (_config, _type, section) => section,
      set: (_config, section, option, value) => writes.push([section, option, value]),
    };
    const sites = model.fromSections(source);
    const normalized = model.stage(uci, 'sheepfold', sites);

    assert.equal(sites[0][0], 'gosuslugi.ru');
    assert.equal(sites[0][4], 'country_profile');
    assert.equal(normalized[0][3], 'emergency_gosuslugi_ru');
    assert.deepEqual(removed, ['emergency_gosuslugi_ru']);
    assert.ok(writes.some((entry) => entry.join(':') === 'emergency_gosuslugi_ru:domain:gosuslugi.ru'));
    assert.ok(writes.some((entry) => entry.join(':') === 'emergency_gosuslugi_ru:profile_id:gosuslugi'));
    assert.throws(() => model.stage(uci, 'sheepfold', [sites[0], sites[0]]), /duplicate_domain/);
  });

  it('turns a deleted generated site into a persistent profile exclusion', () => {
    const model = loadModel();
    const writes = [];
    const source = [{
      '.name': 'emergency_profile_ru_mchs',
      '.type': 'emergency_site',
      domain: 'mchs.gov.ru',
      name: 'МЧС России',
      description: 'Чрезвычайные ситуации',
      order: '1',
      enabled: '1',
      source: 'country_profile',
      profile_country: 'ru',
      profile_id: 'mchs',
    }];
    const uci = {
      sections: () => source,
      remove: () => {},
      add: (_config, _type, section) => section,
      set: (_config, section, option, value) => writes.push([section, option, value]),
    };

    model.stage(uci, 'sheepfold', []);
    assert.ok(writes.some((entry) => entry.join(':') === 'emergency_profile_ru_mchs:enabled:0'));
    assert.ok(writes.some((entry) => entry.join(':') === 'emergency_profile_ru_mchs:profile_id:mchs'));
  });

  it('keeps changes in the settings draft until the shared Save action', () => {
    assert.match(overview, /registerEmergencySitesSaver/);
    assert.match(overview, /emergencySiteModel\.stage\(uci, 'sheepfold', emergencySites\)/);
    assert.match(overview, /routerControl\(\['emergency-sites-apply'\]\)/);
    assert.match(overview, /Press Save settings to apply it/);
    assert.doesNotMatch(overview, /var emergencySites = \[\s*\['gosuslugi\.ru'/);
  });

  it('ships defaults once and preserves a deliberately emptied list on later upgrades', () => {
    assert.match(defaults, /config emergency_site 'emergency_gosuslugi_ru'/);
    assert.match(defaults, /option emergency_sites_initialized '1'/);
    assert.match(makefile, /emergency_sites_initialized/);
    assert.match(makefile, /if \[ "\$\$\(uci -q get sheepfold\.global\.emergency_sites_initialized/);
    assert.match(makefile, /add_emergency_site emergency_gosuslugi_ru/);
  });

  it('uses short per-domain dnsmasq nftset sections and falls back to router resolution', () => {
    assert.match(helper, /dnsmasq_supports_nftset/);
    assert.match(helper, /section="\$\{DHCP_PREFIX\}_\$index"/);
    assert.match(helper, /add_list "dhcp\.\$section\.domain=\$domain"/);
    assert.match(helper, /command -v resolveip/);
    assert.match(helper, /nslookup "\$domain"/);
    assert.match(helper, /Name:/);
    assert.match(helper, /remove_dnsmasq_sections[\s\S]*dnsmasq restart/);
    assert.match(routerControl, /emergency-sites-apply/);
  });

  it('allows only emergency web destinations before device and global drops', () => {
    const firstEmergency = nft.indexOf('@sheepfold_emergency_macs ip daddr');
    const deviceDrop = nft.indexOf('@sheepfold_block_macs counter drop');
    const globalEmergency = nft.indexOf('@sheepfold_global_ifaces ip daddr');
    const globalDrop = nft.lastIndexOf('@sheepfold_global_ifaces counter drop');

    assert.ok(firstEmergency >= 0 && firstEmergency < deviceDrop);
    assert.ok(deviceDrop < globalEmergency);
    assert.ok(firstEmergency < globalDrop);
    assert.match(nft, /tcp dport \{ 80, 443 \} counter return/);
    assert.match(nft, /udp dport 443 counter return/);
    assert.doesNotMatch(nft, /emergency[^\n]*counter accept/);
    assert.match(nft, /block_macs tcp dport 53 counter return[\s\S]*block_macs counter drop/);
    assert.match(firewall, /domain_allowlist_for_blocklist/);
    assert.match(firewall, /append_unique "\$emergency_mac_file" "\$mac"/);
    assert.match(firewall, /refresh_empty_emergency_sets/);
    assert.match(firewall, /emergency-refresh\.at/);
  });
});
