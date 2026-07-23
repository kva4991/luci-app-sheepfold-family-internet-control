/*
 * Проверяет единый источник country profiles и границу владения карточками.
 * Тест не проверяет доступность внешних сайтов и не меняет UCI: сетевую
 * достижимость и фактическое применение следует проверять на живом роутере.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const packageRoot = resolve(repoRoot, 'package/luci-app-sheepfold-family-internet-control');
const read = (path) => readFileSync(resolve(repoRoot, path), 'utf8');
const readPackage = (path) => readFileSync(resolve(packageRoot, path), 'utf8');

const expectedDomains = Object.freeze({
  ru: ['mchs.gov.ru', 'psi.mchs.gov.ru', 'gosuslugi.ru', 'esia.gosuslugi.ru', 'minzdrav.gov.ru', 'dnevnik.ru', 'ya.ru', '2gis.ru', 'rzd.ru'],
  by: ['mchs.gov.by', 'minzdrav.gov.by', 'portal.gov.by', 'account.gov.by', 'rw.by'],
  cn: ['mem.gov.cn', 'nhc.gov.cn', 'gjzwfw.www.gov.cn', 'smartedu.cn', '12306.cn'],
});

function loadProfile(country) {
  return JSON.parse(readPackage(`root/usr/share/sheepfold/country-profiles/${country}.json`));
}

describe('country-specific emergency-useful sites §country1', () => {
  it('ships valid localized profiles for Russia, Belarus, and China', () => {
    for (const country of Object.keys(expectedDomains)) {
      const profile = loadProfile(country);
      const ids = new Set();
      const domains = new Set();

      assert.equal(profile.schemaVersion, 1);
      assert.equal(profile.country, country);
      assert.ok(Array.isArray(profile.emergencySites) && profile.emergencySites.length > 0);
      for (const site of profile.emergencySites) {
        assert.match(site.id, /^[a-z0-9_]{1,40}$/);
        assert.match(site.domain, /^[a-z0-9][a-z0-9.-]*\.[a-z]{2,}$/);
        assert.equal(ids.has(site.id), false, `duplicate id ${country}:${site.id}`);
        assert.equal(domains.has(site.domain), false, `duplicate domain ${country}:${site.domain}`);
        ids.add(site.id);
        domains.add(site.domain);
        for (const language of ['ru', 'en', 'zh_Hans']) {
          assert.ok(site.name[language]?.trim(), `missing ${language} name for ${site.domain}`);
          assert.ok(site.description[language]?.trim(), `missing ${language} description for ${site.domain}`);
        }
      }
      for (const domain of expectedDomains[country])
        assert.ok(domains.has(domain), `${country} misses ${domain}`);
    }
  });

  it('does not put broad portals, marketplaces, taxi, or entertainment into defaults', () => {
    const forbiddenDomains = new Set([
      'yandex.ru', 'market.yandex.ru', 'go.yandex', 'wildberries.ru', 'ozon.ru',
      'aliexpress.ru', 'vk.com', 'youtube.com', 'tiktok.com', 'taximaxim.ru',
      'city-mobil.ru', 'vezet.ru', 'taxovichkof.ru',
    ]);

    for (const country of Object.keys(expectedDomains)) {
      for (const site of loadProfile(country).emergencySites)
        assert.equal(forbiddenDomains.has(site.domain), false, `forbidden default ${country}:${site.domain}`);
    }
  });

  it('uses jshn and changes only profile-owned UCI sections', () => {
    const helper = readPackage('root/usr/libexec/sheepfold/sheepfold-country-profile');

    assert.match(helper, /json_load_file "\$profile_file"/);
    assert.match(helper, /source=country_profile/);
    assert.match(helper, /remove_active_profile_sites/);
    assert.match(helper, /enabled.*0/);
    assert.match(helper, /active_domain_exists/);
    assert.match(helper, /country_profile_migrated/);
    assert.match(helper, /flock -x 9/);
    assert.doesNotMatch(helper, /SNMP|snmp/);
  });

  it('applies the country after emergency drafts and exposes the choice in install and LuCI', () => {
    const generalSettings = readPackage('htdocs/luci-static/resources/sheepfold/features/settings/general.js');
    const saveFlow = readPackage('htdocs/luci-static/resources/sheepfold/features/settings/save-flow.js');
    const sideEffects = readPackage('htdocs/luci-static/resources/sheepfold/features/settings/side-effects.js');
    const installer = read('install.sh');
    const routerControl = readPackage('root/usr/libexec/sheepfold/sheepfold-router-control-legacy');
    const specialSave = saveFlow.indexOf('result = saver.save()');
    const countryApply = saveFlow.indexOf('return deps.applyPostSave(options)');

    assert.match(generalSettings, /Router country/);
    assert.match(sideEffects, /country-profile-apply/);
    assert.ok(specialSave >= 0 && countryApply > specialSave);
    assert.match(installer, /Choose router country/);
    assert.match(installer, /country_profile="\$\{ROUTER_COUNTRY\}"/);
    assert.match(routerControl, /country-profile-apply/);
  });
});
