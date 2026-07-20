/*
 * Статически защищает сам тестовый контур: команды npm, backup/restore, фиктивный
 * MAC, отсутствие разрушительных операций и read-only границу Playwright.
 * Живой роутер этот тест не вызывает, поэтому он остаётся частью обычного CI.
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (name) => readFileSync(resolve(repoRoot, name), 'utf8');
const packageJson = JSON.parse(read('package.json'));

describe('live router automation §routerharness', () => {
  it('publishes explicit camelCase commands for each risk level', () => {
    assert.match(packageJson.scripts['router:setup'], /setupRouterTest\.ps1/);
    assert.match(packageJson.scripts['router:readOnly'], /-Profile readOnly/);
    assert.match(packageJson.scripts['router:install'], /-Profile install/);
    assert.match(packageJson.scripts['router:writeSafe'], /-Profile writeSafe/);
    assert.match(packageJson.scripts['router:fullSafe'], /-Profile fullSafe/);
    assert.match(packageJson.scripts['router:frontend'], /runFrontendTests\.ps1/);
    assert.match(packageJson.scripts['router:allSafe'], /runAllRouterTests\.ps1/);
  });

  it('keeps unattended SSH constrained to a private test router and a dedicated key', () => {
    const common = read('tools/router-testing/routerTestCommon.ps1');
    const setup = read('tools/router-testing/setupRouterTest.ps1');

    assert.match(common, /BatchMode=yes/);
    assert.match(common, /'-O'/);
    assert.match(common, /OpenSSH 9[\s\S]*?SFTP[\s\S]*?OpenWrt/);
    assert.match(common, /Test-SheepfoldPrivateIpv4/);
    assert.match(common, /Get-SheepfoldLuciBaseUrl/);
    assert.match(common, /luciScheme[\s\S]*?'http'/);
    assert.match(common, /luciPort[\s\S]*?80/);
    assert.match(common, /StrictHostKeyChecking=accept-new/);
    assert.match(common, /normalizedCommand[\s\S]*?Replace\("`r`n", "`n"\)[\s\S]*?Replace\("`r", "`n"\)/);
    assert.match(common, /ssh\.exe[\s\S]*?\$normalizedCommand/);
    assert.match(setup, /sheepfold_test_router_ed25519/);
    assert.match(setup, /\[string\]\$LuciScheme = 'http'/);
    assert.match(setup, /\[int\]\$LuciPort = 80/);
    assert.doesNotMatch(setup, /\$HttpsPort|httpsPort =/);
    assert.match(setup, /Export-Clixml/);
    assert.match(setup, /\[string\]\$RouterHost = ''/);
    assert.doesNotMatch(setup, /\[string\]\$RouterHost = '192\./);
    assert.doesNotMatch(`${common}\n${setup}`, /sshpass|plink\.exe|-pw\s|password\s*=\s*['"][^'"]+/i);
    assert.match(setup, /'\/grant:r'\s+"\$\(\$env:USERNAME\):\(F\)"/);
    assert.doesNotMatch(setup, /\/grant:r:\$\(\$env:USERNAME\)/);
    assert.match(setup, /\^ssh-ed25519 \[A-Za-z0-9\+\/\]/);
    assert.match(setup, /test -n/);
    assert.doesNotMatch(setup, /keyBase64|base64 -d/);
  });

  it('passes icacls grant switches and identities as separate arguments', () => {
    const scripts = [
      read('tools/router-testing/setupRouterTest.ps1'),
      read('tools/router-testing/runRouterTests.ps1'),
      read('tools/router-testing/runFrontendTests.ps1'),
    ].join('\n');

    assert.doesNotMatch(scripts, /["']\/grant:r:/);
    assert.match(scripts, /'\/grant:r'\s+"\$\(\$env:USERNAME\):\(OI\)\(CI\)\(F\)"/);
  });

  it('can place generated scripts and private reports in an explicit Windows scratch directory', () => {
    const common = read('tools/router-testing/routerTestCommon.ps1');
    const backendRunner = read('tools/router-testing/runRouterTests.ps1');
    const frontendRunner = read('tools/router-testing/runFrontendTests.ps1');

    assert.match(common, /SHEEPFOLD_SCRIPT_SCRATCH_ROOT/);
    assert.match(common, /IsPathRooted/);
    assert.match(common, /sheepfold-temp/);
    assert.match(backendRunner, /Get-SheepfoldWorkRoot/);
    assert.match(backendRunner, /Join-Path \$workRoot "live-router\\\$runId"/);
    assert.match(backendRunner, /Join-Path \$workRoot 'live-router-ipk'/);
    assert.match(frontendRunner, /Get-SheepfoldWorkRoot/);
    assert.match(frontendRunner, /Join-Path \$workRoot "live-router\\\$runId\\frontend"/);
  });

  it('backs up configuration and forbids destructive router operations', () => {
    const runner = read('tools/router-testing/runRouterTests.ps1');
    const remote = read('tools/router-testing/remoteChecks.sh');
    const runtimeMatrix = read('tools/router-testing/runCurrentRuntimeMatrix.ps1');
    const routerState = read('tools/router-testing/routerState.sh');
    // Запрет проверяет исполняемый код, а документация обязана называть запрещённые команды явно.
    const runnerCode = runner.replace(/<#[\s\S]*?#>/g, '');
    const remoteCode = remote.replace(/^\s*#.*$/gm, '');
    const stateCode = routerState.replace(/^\s*#.*$/gm, '');

    assert.match(runner, /routerState\.sh' backup/);
    assert.match(runner, /routerState\.sh' restore/);
    assert.match(routerState, /config-backup\.tgz/);
    assert.match(runner, /SHA-256 локальной резервной копии/);
    assert.match(routerState, /cmp -s "\$run_dir\/config\/\$name"/);
    assert.match(runner, /SHA-256 загруженного пакета/);
    assert.match(runner, /Assert-SafeSecretState/);
    assert.match(runner, /configured-secret-count/);
    assert.match(runner, /AllowConfiguredSecrets/);
    assert.match(runner, /try \{[\s\S]*?Проверяется OpenWrt[\s\S]*?Assert-SafeSecretState[\s\S]*?switch \(\$Profile\)/);
    assert.match(runner, /if \(\$remoteDirReady\) \{[\s\S]*?Remove-RemoteRunDirectory/);
    assert.match(runner, /opkg update/);
    assert.match(runner, /opkg install/);
    assert.match(runner, /apk update/);
    assert.match(runner, /apk add --allow-untrusted --force-reinstall/);
    assert.match(runner, /package-manager=apk/);
    assert.match(routerState, /apk info -e/);
    assert.match(remote, /apk info --from installed --fields version --format json/);
    assert.match(remote, /tlsPublicKeyFingerprint/);
    assert.match(remote, /pairingUciTransaction/);
    assert.match(remote, /uci -c "\$config_dir" -t "\$delta_dir" -p "\$delta_dir" commit/);
    assert.match(remote, /uci -t "\$PAIR_UCI_SAVEDIR" -p "\$PAIR_UCI_SAVEDIR"/);
    assert.doesNotMatch(remote, /^\s*uci\(\).*command uci -P/m);
    assert.match(remote, /openssl pkey -pubin/);
    assert.match(remote, /tls-public-key-fingerprint/);
    assert.match(remote, /\^router_model=\.\+\$/);
    assert.match(remote, /\^firmware_version=\.\+\$/);
    assert.doesNotMatch(remote, /\^model=\.\+\$|\^firmware=\.\+\$/);
    assert.doesNotMatch(runnerCode, /(?:opkg|apk) upgrade|sysupgrade|firstboot|jffs2reset/i);
    assert.doesNotMatch(stateCode, /(?:opkg|apk) upgrade|sysupgrade|firstboot|jffs2reset/i);
    assert.doesNotMatch(stateCode, /settings-import-applied|uci\s+(?:-q\s+)?commit/);
    assert.match(routerState, /\/tmp\/sheepfold-live-test-/);
    assert.match(remote, /02:53:48:45:45:50/);
    assert.match(remote, /trap restore_state EXIT HUP INT TERM/);
    assert.match(remote, /firewall-sync\.flock/);
    assert.match(remote, /acquire_firewall_test_lock/);
    assert.match(remote, /while ! flock -n 8/);
    assert.doesNotMatch(remote, /flock -w/);
    assert.match(remote, /SHEEPFOLD_FIREWALL_LOCK_HELD=1/);
    assert.match(runtimeMatrix, /\.SYNOPSIS[\s\S]*без установки пакета/);
    assert.match(runtimeMatrix, /finally[\s\S]*runtime-restore-ok/);
    assert.match(runtimeMatrix, /sha256sum[\s\S]*runtimeTarget/);
    assert.match(runtimeMatrix, /runRouterTests[\s\S]*writeSafe[\s\S]*readOnly/);
    assert.match(remote, /settings-import-applied/);
    assert.match(remote, /nft_set_has_mac sheepfold_exempt_macs "\$test_mac"/);
    assert.match(remote, /nft_set_has_mac sheepfold_block_macs "\$test_mac"/);
    assert.match(remote, /SHEEPFOLD_NOW_WEEKDAY=mon SHEEPFOLD_NOW_MINUTES=600/);
    assert.match(remote, /scheduleBlockRuntime/);
    assert.match(remote, /scheduleConflictOffRuntime/);
    assert.match(remote, /scheduleConflictOnRuntime/);
    assert.match(remote, /overnightScheduleRuntime/);
    assert.match(remote, /scheduleAllowRuntime/);
    assert.match(remote, /disabledScheduleRuntime/);
    assert.match(remote, /noRestrictionsRuntime/);
    assert.match(remote, /blocklistBeatsGroupRuntime/);
    assert.match(remote, /noRestrictionsRelease/);
    assert.match(remote, /device-temp-access "\$test_mac" 30/);
    assert.match(remote, /tempAccessRuntime/);
    assert.match(remote, /expire-temp-access/);
    assert.match(remote, /tempAccessExpiry/);
    assert.match(remote, /nft_set_has_mac sheepfold_restricted_macs "\$test_mac"/);
    assert.match(remote, /runtimeRestore/);
    assert.match(runner, /'writeSafe'[\s\S]*?catch \{[\s\S]*?Restore-RemoteBackup/);
    assert.doesNotMatch(remoteCode, /\breboot\b|wifi\s+(down|off|disable)|wps-button|led-apply|flush ruleset/i);
  });

  it('runs LuCI in an isolated read-only browser context', () => {
    const wrapper = read('tools/router-testing/runFrontendTests.ps1');
    const browser = read('tools/router-testing/frontendSmoke.mjs');

    assert.match(wrapper, /playwright-core@1\.61\.1/);
    assert.match(wrapper, /Get-SheepfoldLuciBaseUrl -Config \$config/);
    assert.doesNotMatch(wrapper, /'https:\/\/\{0\}/);
    assert.match(wrapper, /routerTestCredential\.xml|Get-SheepfoldRouterCredentialPath/);
    assert.match(wrapper, /icacls\.exe \$reportDir/);
    assert.match(wrapper, /browser-артефактами LuCI/);
    assert.match(browser, /ignoreHTTPSErrors: true/);
    assert.match(browser, /button\.cbi-button-positive\.important/);
    assert.match(browser, /за пределы скрытой[\s\S]*?JS-обработчик/);
    assert.match(browser, /waitForNavigation\(\{ waitUntil: 'domcontentloaded', timeout: 30_000 \}\)/);
    assert.match(browser, /session cookie:[\s\S]*?Access denied/);
    assert.match(browser, /Первый HTTP 403[\s\S]*?авторизованного интерфейса/);
    assert.match(browser, /await page\.close\(\);[\s\S]*?page = await context\.newPage\(\)/);
    assert.match(browser, /topTabs\.first\(\)\.waitFor\(\{ state: 'visible', timeout: 30_000 \}\)/);
    assert.doesNotMatch(browser, /waitForTimeout\(800\)/);
    assert.match(browser, /width: 1440/);
    assert.match(browser, /width: 390/);
    assert.match(browser, /page\.screenshot/);
    assert.match(browser, /RPCError/);
    assert.match(browser, /validateRouterInformation/);
    assert.match(browser, /validateLogPanel/);
    assert.match(browser, /validatePanelControls/);
    assert.match(browser, /нет доступного имени/);
    assert.match(browser, /малая цель/);
    assert.match(browser, /controlAudits/);
    assert.match(browser, /uxWarningCount/);
    assert.match(browser, /неблокирующих UX-предупреждений/);
    assert.match(browser, /\.sf-log-filters-wrap/);
    assert.match(browser, /Router model/);
    assert.match(browser, /-failure\.png/);
    assert.doesNotMatch(browser, /\.click\([^)]*save|Сохранить.*click|Настройки успешно сохранены.*click/i);
  });

  it('documents the one-time setup and safety boundary', () => {
    const documentation = read('docs/live-router-automation.ru.md');
    assert.match(documentation, /§routerharness/);
    assert.match(documentation, /npm\.cmd run router:allSafe/);
    assert.match(documentation, /не перезагружает роутер/i);
    assert.match(documentation, /DPAPI/);
  });

  it('requires every router test script to explain its particular purpose', () => {
    const files = [
      'tools/router-testing/routerTestCommon.ps1',
      'tools/router-testing/setupRouterTest.ps1',
      'tools/router-testing/runRouterTests.ps1',
      'tools/router-testing/remoteChecks.sh',
      'tools/router-testing/routerState.sh',
      'tools/router-testing/runFrontendTests.ps1',
      'tools/router-testing/frontendSmoke.mjs',
      'tools/router-testing/runAllRouterTests.ps1',
    ];
    for (const file of files) {
      const source = read(file).slice(0, 1_600);
      assert.match(source, /провер|тест|назнач|подключ/i, `${file} has no purpose note`);
      assert.match(source, /не |ничего не|запрещ|read-only|без /i, `${file} has no boundary note`);
    }
  });

  it('keeps PowerShell scripts readable by Windows PowerShell 5.1', () => {
    const files = [
      'routerTestCommon.ps1',
      'setupRouterTest.ps1',
      'runRouterTests.ps1',
      'runFrontendTests.ps1',
      'runAllRouterTests.ps1',
    ];
    for (const file of files) {
      const bytes = readFileSync(resolve(repoRoot, 'tools/router-testing', file));
      assert.deepEqual([...bytes.subarray(0, 3)], [0xef, 0xbb, 0xbf], `${file} must use UTF-8 BOM`);
    }
  });
});
