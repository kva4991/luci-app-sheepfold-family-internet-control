/*
 * Protects the country-aware router-time setup and the explicit optional-nmap
 * boundary. Runtime checks use temporary flat UCI/package-manager stubs and do
 * not modify the host or contact package repositories. §country1 §devpas1
 */
import assert from 'node:assert/strict';
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { delimiter, dirname, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (path) => readFileSync(resolve(repoRoot, path), 'utf8');
const timeModule = read('package/luci-app-sheepfold-family-internet-control/htdocs/luci-static/resources/sheepfold/features/settings/time.js');
const generalModule = read('package/luci-app-sheepfold-family-internet-control/htdocs/luci-static/resources/sheepfold/features/settings/general.js');
const detectionModule = read('package/luci-app-sheepfold-family-internet-control/htdocs/luci-static/resources/sheepfold/features/devices/detection-tools.js');
const overview = read('package/luci-app-sheepfold-family-internet-control/htdocs/luci-static/resources/sheepfold/features/overview/application.js');
const timeHelperPath = 'package/luci-app-sheepfold-family-internet-control/root/usr/libexec/sheepfold/sheepfold-time-control';
const detectionHelperPath = 'package/luci-app-sheepfold-family-internet-control/root/usr/libexec/sheepfold/sheepfold-device-detection-tools';
const timeHelper = read(timeHelperPath);
const detectionHelper = read(detectionHelperPath);
const routerControl = read('package/luci-app-sheepfold-family-internet-control/root/usr/libexec/sheepfold/sheepfold-router-control-legacy');
const defaults = read('package/luci-app-sheepfold-family-internet-control/root/usr/share/sheepfold/sheepfold.uci.defaults');
const makefile = read('package/luci-app-sheepfold-family-internet-control/Makefile');
const eslint = read('eslint.config.js');
const ruCatalog = JSON.parse(read('package/luci-app-sheepfold-family-internet-control/htdocs/luci-static/resources/sheepfold/i18n/ru.json'));

function posix(path) {
  const absolute = resolve(path).replace(/\\/g, '/');
  return process.platform === 'win32'
    ? absolute.replace(/^([A-Za-z]):/, (_, drive) => `/${drive.toLowerCase()}`)
    : absolute;
}

function writeExecutable(path, source) {
  writeFileSync(path, source);
  chmodSync(path, 0o755);
}

function flatUciStub() {
  return `#!/bin/sh
while [ "$#" -gt 0 ]; do
  case "$1" in -q) shift ;; -t|-p) shift 2 ;; *) break ;; esac
done
cmd="\${1:-}"; [ "$#" -eq 0 ] || shift
state="$SHEEPFOLD_TEST_UCI"
get_value() { awk -v key="$1" 'index($0, key "=") == 1 { print substr($0, length(key) + 2); exit }' "$state"; }
set_value() {
  key="\${1%%=*}"; value="\${1#*=}"
  awk -v key="$key" 'index($0, key "=") != 1' "$state" > "$state.tmp"
  printf '%s=%s\\n' "$key" "$value" >> "$state.tmp"
  mv "$state.tmp" "$state"
}
case "$cmd" in
  get) value="$(get_value "$1")"; [ -n "$value" ] || exit 1; printf '%s\\n' "$value" ;;
  set) set_value "$1" ;;
  add)
    config="$1"; type="$2"; key="$config.@$type[0]"
    value="$(get_value "$key")"
    [ -n "$value" ] || set_value "$key=$type"
    printf '@%s[0]\\n' "$type"
    ;;
  add_list)
    assignment="$1"; key="\${assignment%%=*}"; value="\${assignment#*=}"
    current="$(get_value "$key")"
    set_value "$key=\${current}\${current:+ }$value"
    ;;
  delete)
    key="$1"
    awk -v key="$key" 'index($0, key "=") != 1' "$state" > "$state.tmp"
    mv "$state.tmp" "$state"
    ;;
  commit) ;;
  show) cat "$state" ;;
  *) exit 2 ;;
esac
`;
}

function runTime(initialLines, args) {
  mkdirSync(resolve('.build'), { recursive: true });
  const root = mkdtempSync(resolve('.build/sheepfold-time-test-'));
  const bin = join(root, 'bin');
  const state = join(root, 'uci.txt');
  const systemConfig = join(root, 'system.conf');
  const appConfig = join(root, 'sheepfold.conf');
  const lock = join(root, 'lock-common');
  mkdirSync(bin);
  writeFileSync(state, initialLines.join('\n') + '\n');
  writeFileSync(systemConfig, 'system snapshot\n');
  writeFileSync(appConfig, 'sheepfold snapshot\n');
  writeExecutable(join(bin, 'uci'), flatUciStub());
  writeExecutable(lock, '#!/bin/sh\nsheepfold_lock_acquire() { return 0; }\nsheepfold_lock_release() { return 0; }\n');
  const env = {
    ...process.env,
    PATH: `${bin}${delimiter}${process.env.PATH || ''}`,
    SHEEPFOLD_TEST_UCI: posix(state),
    SHEEPFOLD_LOCK_COMMON: posix(lock),
    SHEEPFOLD_TIME_LOCK: posix(join(root, 'time.lock')),
    SHEEPFOLD_TIME_TRANSACTION_ROOT: posix(join(root, 'transactions')),
    SHEEPFOLD_TIME_SYSTEM_CONFIG: posix(systemConfig),
    SHEEPFOLD_TIME_APP_CONFIG: posix(appConfig),
    SHEEPFOLD_SYSNTPD_INIT: posix(join(root, 'missing-sysntpd')),
    SHEEPFOLD_LOG_HELPER: posix(join(root, 'missing-log')),
  };
  const result = spawnSync('sh', [resolve(timeHelperPath), 'save', ...args], {
    cwd: process.cwd(), env, encoding: 'utf8',
  });
  const finalState = readFileSync(state, 'utf8');
  rmSync(root, { recursive: true, force: true });
  return { result, finalState };
}

function runDetection({ freeKb = 32768, install = false, start = false }) {
  mkdirSync(resolve('.build'), { recursive: true });
  const root = mkdtempSync(resolve('.build/sheepfold-nmap-test-'));
  const bin = join(root, 'bin');
  const stateDir = join(root, 'state');
  const lock = join(root, 'lock-common');
  const nmapBinary = join(root, process.platform === 'win32' ? 'nmap.exe' : 'nmap');
  mkdirSync(bin);
  writeExecutable(lock, '#!/bin/sh\nsheepfold_lock_acquire() { return 0; }\nsheepfold_lock_release() { return 0; }\n');
  writeExecutable(join(bin, 'uci'), '#!/bin/sh\nprintf "full\\n"\n');
  writeExecutable(join(bin, 'opkg'), `#!/bin/sh
case "$1" in
  update) exit 0 ;;
  install) : > "$SHEEPFOLD_NMAP_BINARY"; chmod 755 "$SHEEPFOLD_NMAP_BINARY"; exit 0 ;;
  status) exit 1 ;;
  *) exit 0 ;;
esac
`);
  const env = {
    ...process.env,
    PATH: `${bin}${delimiter}${process.env.PATH || ''}`,
    SHEEPFOLD_PACKAGE_MANAGER_HELPER: posix('package/luci-app-sheepfold-family-internet-control/root/usr/libexec/sheepfold/sheepfold-package-manager'),
    SHEEPFOLD_LOCK_COMMON: posix(lock),
    SHEEPFOLD_NMAP_STATE_DIR: posix(stateDir),
    SHEEPFOLD_NMAP_INSTALL_LOCK: posix(join(root, 'install.lock')),
    SHEEPFOLD_NMAP_FREE_KB: String(freeKb),
    SHEEPFOLD_NMAP_MIN_FREE_KB: '16384',
    SHEEPFOLD_NMAP_BINARY: posix(nmapBinary),
  };
  const command = start ? 'start' : (install ? 'run-install' : 'status');
  const result = spawnSync('sh', [resolve(detectionHelperPath), command], {
    cwd: process.cwd(), env, encoding: 'utf8',
  });
  let status = spawnSync('sh', [resolve(detectionHelperPath), 'status'], {
    cwd: process.cwd(), env, encoding: 'utf8',
  });
  if (start) {
    for (let attempt = 0; attempt < 40 && !/state=(?:installed|failed)/.test(status.stdout); attempt += 1) {
      spawnSync('sh', ['-c', 'sleep 0.05']);
      status = spawnSync('sh', [resolve(detectionHelperPath), 'status'], {
        cwd: process.cwd(), env, encoding: 'utf8',
      });
    }
  }
  rmSync(root, { recursive: true, force: true });
  return { result, status };
}

describe('country-aware time and optional nmap setup', () => {
  it('preserves current OpenWrt time and offers country recommendations without IP geolocation', () => {
    assert.match(timeModule, /The current OpenWrt timezone is preserved/);
    assert.match(timeModule, /Europe\/Minsk\|\+03-3/);
    assert.match(timeModule, /Asia\/Shanghai\|CST-8/);
    assert.match(timeModule, /No public-IP geolocation is used/);
    assert.doesNotMatch(timeModule, /fetch\(|geoip|ip-api|ipinfo/i);
    assert.match(overview, /features\.settings\.time as settingsTimeModel/);
    assert.match(eslint, /detectionToolsModel: 'readonly'/);
    assert.match(eslint, /settingsTimeModel: 'readonly'/);
    assert.match(generalModule, /timeSettings\.setCountry/);
    assert.match(timeModule, /timeValues\(initialOptions\)/);
    assert.doesNotMatch(overview, /function routerTimezoneOptions|function routerTimeSettingsField/);
  });

  it('keeps an existing timezone when save arguments are blank', () => {
    const { result, finalState } = runTime([
      'system.@system[0]=system',
      'system.@system[0].zonename=Europe/Berlin',
      'system.@system[0].timezone=CET-1CEST,M3.5.0,M10.5.0/3',
      'system.ntp=timeserver',
      'system.ntp.enabled=1',
      'system.ntp.enable_server=0',
      'system.ntp.server=de.pool.ntp.org',
      'sheepfold.global=sheepfold',
      'sheepfold.global.country_profile=ru',
    ], ['', '', '', '', '', '']);
    assert.equal(result.status, 0, result.stderr);
    assert.match(finalState, /system\.@system\[0\]\.zonename=Europe\/Berlin/);
    assert.match(finalState, /system\.@system\[0\]\.timezone=CET-1CEST,M3\.5\.0,M10\.5\.0\/3/);
    assert.match(finalState, /sheepfold\.global\.router_time_configured=1/);
  });

  it('uses the selected country recommendation only when router time is missing', () => {
    const { result, finalState } = runTime([
      'system.@system[0]=system',
      'system.ntp=timeserver',
      'sheepfold.global=sheepfold',
      'sheepfold.global.country_profile=cn',
    ], ['', '', '', '', '', 'cn']);
    assert.equal(result.status, 0, result.stderr);
    assert.match(finalState, /system\.@system\[0\]\.zonename=Asia\/Shanghai/);
    assert.match(finalState, /system\.@system\[0\]\.timezone=CST-8/);
    assert.match(finalState, /system\.ntp\.server=.*cn\.pool\.ntp\.org/);
  });

  it('rejects an invalid explicit timezone instead of silently falling back to Moscow', () => {
    const { result, finalState } = runTime([
      'system.@system[0]=system',
      'system.@system[0].zonename=UTC',
      'system.@system[0].timezone=UTC0',
      'system.ntp=timeserver',
      'system.ntp.server=pool.ntp.org',
      'sheepfold.global=sheepfold',
      'sheepfold.global.country_profile=ru',
    ], ['1', '1', '../../etc/passwd', 'UTC0', 'pool.ntp.org', 'ru']);
    assert.equal(result.status, 2);
    assert.match(result.stderr, /Invalid router timezone name/);
    assert.match(finalState, /system\.@system\[0\]\.zonename=UTC/);
    assert.doesNotMatch(finalState, /Europe\/Moscow/);
  });

  it('rejects a partly invalid NTP list instead of silently dropping entries', () => {
    const { result, finalState } = runTime([
      'system.@system[0]=system',
      'system.@system[0].zonename=UTC',
      'system.@system[0].timezone=UTC0',
      'system.ntp=timeserver',
      'system.ntp.server=pool.ntp.org',
      'sheepfold.global=sheepfold',
      'sheepfold.global.country_profile=ru',
    ], ['1', '1', 'UTC', 'UTC0', 'pool.ntp.org bad!host', 'ru']);
    assert.equal(result.status, 2);
    assert.match(result.stderr, /invalid hostname/i);
    assert.match(finalState, /system\.ntp\.server=pool\.ntp\.org/);
    assert.doesNotMatch(finalState, /bad!host/);
  });

  it('shows Full mode without port checks and never installs nmap automatically', () => {
    assert.match(generalModule, /detectionTools\.setMode/);
    assert.match(detectionModule, /Full mode without port checks/);
    assert.match(detectionModule, /Install optional nmap/);
    assert.match(detectionModule, /deps\.confirm/);
    assert.doesNotMatch(detectionModule, /setMode[\s\S]*deps\.install\(\)/);
    const runningBlock = detectionModule.slice(
      detectionModule.indexOf("if (state === 'running'"),
      detectionModule.indexOf("setNote('sf-note-warning', _('Full mode without port checks"),
    );
    assert.doesNotMatch(runningBlock, /schedulePoll/);
    assert.match(detectionModule, /function load[\s\S]*schedulePoll\(attempt/);
    assert.match(routerControl, /device-detection-capabilities/);
    assert.match(routerControl, /device-detection-install-nmap/);
  });

  it('allows optional nmap installation only with enough free space and a package manager', () => {
    const enough = runDetection({ freeKb: 32768 });
    assert.equal(enough.result.status, 0, enough.result.stderr);
    assert.match(enough.result.stdout, /nmap_available=0/);
    assert.match(enough.result.stdout, /can_install=1/);
    assert.match(enough.result.stdout, /reason=optional_tool_missing/);

    const low = runDetection({ freeKb: 8192 });
    assert.equal(low.result.status, 0, low.result.stderr);
    assert.match(low.result.stdout, /can_install=0/);
    assert.match(low.result.stdout, /reason=insufficient_space/);
  });

  it('starts the optional installation asynchronously and exposes terminal status', () => {
    const started = runDetection({ freeKb: 32768, start: true });
    assert.equal(started.result.status, 0, started.result.stderr);
    assert.match(started.result.stdout, /started=1|state=installed/);
    assert.match(started.status.stdout, /nmap_available=1/);
    assert.match(started.status.stdout, /state=installed/);
  });

  it('installs only the named nmap package and verifies the binary', () => {
    assert.match(detectionHelper, /sheepfold_package_install_named nmap/);
    assert.match(detectionHelper, /START_LOCK/);
    assert.match(detectionHelper, /start_install\(\) \([\s\S]*sheepfold_lock_acquire "\$START_LOCK"/);
    assert.doesNotMatch(detectionHelper, /upgrade|dist-upgrade/);
    const installed = runDetection({ freeKb: 32768, install: true });
    assert.equal(installed.result.status, 0, installed.result.stderr);
    assert.match(installed.status.stdout, /nmap_available=1/);
    assert.match(installed.status.stdout, /state=installed/);
  });

  it('ships Russian client-catalog entries for the new status boundaries', () => {
    assert.equal(ruCatalog['Full mode without port checks. Device detection still works, but server, camera and printer hints may be less accurate.'],
      'Полный режим без проверки портов. Определение устройств продолжает работать, но распознавание серверов, камер и принтеров может быть менее точным.');
    assert.equal(ruCatalog['Use country recommendation'], 'Использовать рекомендацию страны');
    assert.equal(ruCatalog['Could not save router time settings.'], 'Не удалось сохранить настройки времени роутера.');
  });

  it('tracks explicit first-run time configuration in UCI and package migration', () => {
    assert.match(timeHelper, /router_time_configured=1/);
    assert.match(timeHelper, /set -f/);
    assert.match(timeHelper, /TRANSACTION_ACTIVE=1/);
    assert.match(timeHelper, /transaction_cleanup[\s\S]*rollback/);
    assert.match(timeHelper, /trap 'transaction_cleanup \$\?'/);
    assert.match(defaults, /option router_time_configured '0'/);
    assert.match(makefile, /ensure_global_option router_time_configured '0'/);
    const release = Number(makefile.match(/PKG_RELEASE:=(\d+)/)?.[1] || 0);
    assert.ok(release >= 252);
  });
});
