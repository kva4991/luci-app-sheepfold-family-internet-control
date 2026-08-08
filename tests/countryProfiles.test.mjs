/*
 * Проверяет единый источник country profiles и границу владения карточками.
 * Тест не проверяет доступность внешних сайтов и не меняет UCI: сетевую
 * достижимость и фактическое применение следует проверять на живом роутере.
 */
import assert from 'node:assert/strict';
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { delimiter, dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const packageRoot = resolve(repoRoot, 'package/luci-app-sheepfold-family-internet-control');
const read = (path) => readFileSync(resolve(repoRoot, path), 'utf8');
const readPackage = (path) => readFileSync(resolve(packageRoot, path), 'utf8');
const uciDefaults = readPackage('root/usr/share/sheepfold/sheepfold.uci.defaults');
const makefile = readPackage('Makefile');

function shellPath(path) {
  return relative(repoRoot, path).replaceAll('\\', '/');
}

const expectedDomains = Object.freeze({
  ru: ['mchs.gov.ru', 'psi.mchs.gov.ru', 'gosuslugi.ru', 'esia.gosuslugi.ru', 'minzdrav.gov.ru', 'dnevnik.ru', '2gis.ru', 'rzd.ru'],
  by: ['mchs.gov.by', 'minzdrav.gov.by', 'portal.gov.by', 'account.gov.by', 'rw.by'],
  cn: ['mem.gov.cn', 'nhc.gov.cn', 'gjzwfw.www.gov.cn', 'smartedu.cn', '12306.cn'],
  other: [],
});

function loadProfile(country) {
  return JSON.parse(readPackage(`root/usr/share/sheepfold/country-profiles/${country}.json`));
}

describe('country-specific emergency-useful sites §country1', () => {
  it('ships valid localized profiles plus an intentionally empty neutral profile', () => {
    for (const country of Object.keys(expectedDomains)) {
      const profile = loadProfile(country);
      const ids = new Set();
      const domains = new Set();

      assert.equal(profile.schemaVersion, 1);
      assert.equal(profile.country, country);
      assert.ok(Array.isArray(profile.emergencySites));
      for (const language of ['ru', 'en', 'zh_Hans'])
        assert.ok(profile.displayName?.[language]?.trim(), `missing ${language} profile name for ${country}`);
      if (country === 'other')
        assert.equal(profile.emergencySites.length, 0);
      else
        assert.ok(profile.emergencySites.length > 0);
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
      'ya.ru',
      'aliexpress.ru', 'vk.com', 'youtube.com', 'tiktok.com', 'taximaxim.ru',
      'city-mobil.ru', 'vezet.ru', 'taxovichkof.ru',
    ]);

    for (const country of Object.keys(expectedDomains)) {
      for (const site of loadProfile(country).emergencySites)
        assert.equal(forbiddenDomains.has(site.domain), false, `forbidden default ${country}:${site.domain}`);
    }
    assert.doesNotMatch(uciDefaults, /option domain 'ya\.ru'/);
    assert.doesNotMatch(makefile, /add_emergency_site\s+emergency_ya_ru\s+ya\.ru/);
  });

  it('removes only the exact legacy factory ya.ru card once', () => {
    const helper = readPackage('root/usr/libexec/sheepfold/sheepfold-country-profile');

    assert.match(uciDefaults, /option broad_ya_emergency_migrated '1'/);
    assert.match(helper, /remove_legacy_broad_ya_site/);
    assert.match(helper, /sheepfold\.global\.broad_ya_emergency_migrated/);
    assert.match(helper, /emergency_ya_ru/);
    assert.match(helper, /country_profile:ya_search/);
  });

  it('executes the ya.ru migration without deleting a user-edited card', () => {
    const buildRoot = resolve(repoRoot, '.build');
    mkdirSync(buildRoot, { recursive: true });
    const fixture = mkdtempSync(join(buildRoot, 'country-ya-migration-'));
    const fakeUci = join(fixture, 'uci');
    const fakeFlock = join(fixture, 'flock');
    const helper = resolve(packageRoot, 'root/usr/libexec/sheepfold/sheepfold-country-profile');
    writeFileSync(fakeUci, `#!/bin/sh
[ "\${1:-}" = -q ] && shift
command="\${1:-}"
shift || true
case "$command" in
  get)
    case "\${1:-}" in
      sheepfold.global) printf '%s\\n' sheepfold ;;
      sheepfold.global.broad_ya_emergency_migrated) exit 1 ;;
      sheepfold.global.country_profile_migrated) printf '%s\\n' 1 ;;
      sheepfold.emergency_ya_ru) printf '%s\\n' emergency_site ;;
      sheepfold.emergency_ya_ru.domain) printf '%s\\n' ya.ru ;;
      sheepfold.emergency_ya_ru.name) printf '%s\\n' 'Поиск Яндекса' ;;
      sheepfold.emergency_ya_ru.description) printf '%s\\n' "$TEST_DESCRIPTION" ;;
      sheepfold.emergency_ya_ru.source) printf '%s' country_profile ;;
      sheepfold.emergency_ya_ru.profile_id) printf '%s' ya_search ;;
      *) exit 1 ;;
    esac
    ;;
  set|delete|commit) printf '%s %s\\n' "$command" "$*" >> "$TEST_ACTIONS" ;;
esac
`, 'utf8');
    chmodSync(fakeUci, 0o755);
    writeFileSync(fakeFlock, '#!/bin/sh\nexit 0\n', 'utf8');
    chmodSync(fakeFlock, 0o755);

    function migrate(description, suffix) {
      const actions = join(fixture, `actions-${suffix}.log`);
      const result = spawnSync('bash', [shellPath(helper), 'migrate'], {
        cwd: repoRoot,
        encoding: 'utf8',
        env: {
          ...process.env,
          PATH: `${fixture}${delimiter}${process.env.PATH}`,
          SHEEPFOLD_COUNTRY_UCI_HELPER: shellPath(fakeUci),
          SHEEPFOLD_COUNTRY_LOCK_FILE: shellPath(join(fixture, `lock-${suffix}`)),
          TEST_ACTIONS: shellPath(actions),
          TEST_DESCRIPTION: description,
        },
      });
      assert.equal(result.status, 0, result.stderr);
      return readFileSync(actions, 'utf8');
    }

    const factoryActions = migrate('Узкая точка входа в поиск', 'factory');
    assert.match(factoryActions, /delete sheepfold\.emergency_ya_ru/);
    assert.match(factoryActions, /set sheepfold\.global\.broad_ya_emergency_migrated=1/);

    const manualActions = migrate('Моя ручная карточка', 'manual');
    assert.doesNotMatch(manualActions, /delete sheepfold\.emergency_ya_ru/);
    assert.match(manualActions, /set sheepfold\.global\.broad_ya_emergency_migrated=1/);
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
    assert.match(installer, /Other country: other/);
    assert.match(installer, /country_profile="\$\{ROUTER_COUNTRY\}"/);
    assert.match(routerControl, /country-profile-apply/);
  });
});
