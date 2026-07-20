import {
  chmodSync,
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { basename, dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const updater = resolve(
  repoRoot,
  'package/luci-app-sheepfold-family-internet-control/root/usr/libexec/sheepfold/sheepfold-updater',
);
const telegram = resolve(
  repoRoot,
  'package/luci-app-sheepfold-family-internet-control/root/usr/libexec/sheepfold/sheepfold-telegram-bot',
);
const testTmp = join(repoRoot, '.build', 'test-tmp');
mkdirSync(testTmp, { recursive: true });

const posix = (path) => path
  .replaceAll('\\', '/')
  .replace(/^([A-Za-z]):\//, (_, drive) => `/${drive.toLowerCase()}/`);

function executable(path, body) {
  writeFileSync(path, body.replace(/^\n/, ''), 'utf8');
  chmodSync(path, 0o755);
}

let cachedTestIpk = '';

function testIpk() {
  if (cachedTestIpk) return cachedTestIpk;
  if (process.env.SHEEPFOLD_TEST_IPK) {
    assert.ok(existsSync(process.env.SHEEPFOLD_TEST_IPK));
    cachedTestIpk = process.env.SHEEPFOLD_TEST_IPK;
    return cachedTestIpk;
  }

  const outDir = mkdtempSync(join(testTmp, 'sheepfold-updater-ipk-'));
  const python = process.platform === 'win32' ? 'python' : 'python3';
  const result = spawnSync(python, [
    resolve(repoRoot, 'scripts/build-test-ipk.py'),
    '--variant', 'sheepfold',
    '--out-dir', outDir,
  ], { cwd: repoRoot, encoding: 'utf8' });
  assert.equal(result.status, 0, result.error?.message || result.stderr || result.stdout);
  cachedTestIpk = result.stdout.trim().split(/\r?\n/).find((line) => line.endsWith('.ipk')) || '';
  assert.ok(cachedTestIpk && existsSync(cachedTestIpk));
  return cachedTestIpk;
}

function runInstallScenario({
  packageSource = testIpk(),
  assetName = basename(packageSource),
  installExit = 23,
  confirmInstalledVersion = false,
  packageUrl,
} = {}) {
  const root = mkdtempSync(join(testTmp, 'sheepfold-updater-install-'));
  const bin = join(root, 'bin');
  const runtime = join(root, 'runtime');
  const work = join(root, 'work');
  const config = join(root, 'sheepfold.config');
  const release = join(root, 'release.json');
  const opkgLog = join(root, 'opkg.log');
  const opkgState = join(root, 'opkg.state');
  mkdirSync(bin, { recursive: true });
  writeFileSync(config, 'config original\n', 'utf8');
  const releasePackageUrl = packageUrl
    || `https://github.com/kva4991/luci-app-sheepfold-family-internet-control/releases/download/test/${assetName}`;
  writeFileSync(release, JSON.stringify({
    tag_name: 'test',
    browser_download_url: releasePackageUrl,
  }) + '\n', 'utf8');
  const expectedVersion = assetName.match(/_([^_]+)_all\.ipk$/)?.[1] || 'unknown';

  executable(join(bin, 'uci'), `
#!/bin/sh
case "$*" in
  *product_variant*) printf sheepfold ;;
  *language*) printf ru ;;
  *) exit 1 ;;
esac
`);
  executable(join(bin, 'uclient-fetch'), `
#!/bin/sh
output=''
url=''
while [ "$#" -gt 0 ]; do
  case "$1" in
    -O) shift; output="$1" ;;
    http://*|https://*) url="$1" ;;
  esac
  shift
done
case "$url" in
  "$UPDATE_API_URL") cp "$RELEASE_SOURCE" "$output" ;;
  "$RELEASE_PACKAGE_URL") cp "$PACKAGE_SOURCE" "$output" ;;
  *) exit 9 ;;
esac
`);
  executable(join(bin, 'opkg'), `
#!/bin/sh
case "$1" in
  status)
    version='0.0.0-1'
    [ ! -s "$OPKG_STATE" ] || version="$(cat "$OPKG_STATE")"
    printf 'Package: luci-app-sheepfold-family-internet-control\nVersion: %s\nStatus: install user installed\n' "$version"
    ;;
  compare-versions) exit 0 ;;
  install)
    printf 'install %s\n' "$2" >> "$OPKG_LOG"
    printf 'config changed by failed package\n' > "$CONFIG_FILE"
    if [ "$INSTALL_EXIT" = 0 ] && [ "$CONFIRM_INSTALLED_VERSION" = 1 ]; then
      printf '%s\n' "$EXPECTED_VERSION" > "$OPKG_STATE"
    fi
    exit "$INSTALL_EXIT"
    ;;
  *) exit 2 ;;
esac
`);

  const path = process.platform === 'win32'
    ? `${bin};C:\\Program Files\\Git\\usr\\bin;C:\\Program Files\\Git\\bin;${process.env.PATH}`
    : `${bin}:${process.env.PATH}`;
  const bash = process.platform === 'win32'
    ? 'C:\\Program Files\\Git\\bin\\bash.exe'
    : 'bash';
  const updateApiUrl = 'https://api.github.com/repos/kva4991/luci-app-sheepfold-family-internet-control/releases/latest';
  const result = spawnSync(bash, [posix(relative(repoRoot, updater)), 'install'], {
    cwd: repoRoot,
    env: {
      ...process.env,
      PATH: path,
      UPDATE_API_URL: updateApiUrl,
      RELEASE_SOURCE: posix(relative(repoRoot, release)),
      RELEASE_PACKAGE_URL: releasePackageUrl,
      PACKAGE_SOURCE: posix(relative(repoRoot, packageSource)),
      OPKG_LOG: posix(relative(repoRoot, opkgLog)),
      OPKG_STATE: posix(relative(repoRoot, opkgState)),
      CONFIG_FILE: posix(relative(repoRoot, config)),
      INSTALL_EXIT: String(installExit),
      CONFIRM_INSTALLED_VERSION: confirmInstalledVersion ? '1' : '0',
      EXPECTED_VERSION: expectedVersion,
      SHEEPFOLD_UPDATE_RUNTIME_DIR: posix(relative(repoRoot, runtime)),
      SHEEPFOLD_UPDATE_WORK_DIR: posix(relative(repoRoot, work)),
      SHEEPFOLD_UPDATE_CONFIG_FILE: posix(relative(repoRoot, config)),
      SHEEPFOLD_UPDATE_MIGRATION_BACKUP: posix(relative(repoRoot, join(root, 'missing-migration'))),
      SHEEPFOLD_UPDATE_SERVICE_INIT: posix(relative(repoRoot, join(root, 'missing-service'))),
      SHEEPFOLD_UPDATE_RPCD_INIT: posix(relative(repoRoot, join(root, 'missing-rpcd'))),
    },
    encoding: 'utf8',
  });
  return { config, opkgLog, result };
}

function runApkInstallScenario({ metadataName = 'luci-app-sheepfold-family-internet-control' } = {}) {
  const root = mkdtempSync(join(testTmp, 'sheepfold-updater-apk-'));
  const bin = join(root, 'bin');
  const runtime = join(root, 'runtime');
  const work = join(root, 'work');
  const config = join(root, 'sheepfold.config');
  const release = join(root, 'release.json');
  const packageSource = join(root, 'router-package.apk');
  const apkLog = join(root, 'apk.log');
  const apkState = join(root, 'apk.state');
  const fetchLog = join(root, 'fetch.log');
  const jshn = join(root, 'jshn.sh');
  const expectedVersion = '9.9.9-r1';
  const routerAsset = `luci-app-sheepfold-family-internet-control-${expectedVersion}.apk`;
  const routerUrl = `https://github.com/kva4991/luci-app-sheepfold-family-internet-control/releases/download/test/${routerAsset}`;
  mkdirSync(bin, { recursive: true });
  writeFileSync(config, 'config original\n', 'utf8');
  writeFileSync(packageSource, 'fake OpenWrt apk container\n', 'utf8');
  writeFileSync(release, JSON.stringify({
    tag_name: 'test',
    assets: [
      { browser_download_url: 'https://github.com/kva4991/luci-app-sheepfold-family-internet-control/releases/download/test/sheepfold-v9.9.9.apk' },
      { browser_download_url: routerUrl },
    ],
  }, null, 2) + '\n', 'utf8');

  executable(join(bin, 'uci'), `
#!/bin/sh
case "$*" in
  *product_variant*) printf sheepfold ;;
  *language*) printf ru ;;
  *) exit 1 ;;
esac
`);
  executable(join(bin, 'uclient-fetch'), `
#!/bin/sh
output=''
url=''
while [ "$#" -gt 0 ]; do
  case "$1" in
    -O) shift; output="$1" ;;
    http://*|https://*) url="$1" ;;
  esac
  shift
done
printf '%s\n' "$url" >> "$FETCH_LOG"
case "$url" in
  "$UPDATE_API_URL") cp "$RELEASE_SOURCE" "$output" ;;
  "$RELEASE_PACKAGE_URL") cp "$PACKAGE_SOURCE" "$output" ;;
  *) exit 9 ;;
esac
`);
  executable(join(bin, 'apk'), `
#!/bin/sh
printf '%s\n' "$*" >> "$APK_LOG"
case "$1" in
  --print-arch) printf 'aarch64\n' ;;
  info)
    if [ "$2" = '-e' ]; then exit 0; fi
    version='0.1.0-r1'
    [ ! -s "$APK_STATE" ] || version="$(cat "$APK_STATE")"
    printf '[\n  {\n    "version": "%s"\n  }\n]\n' "$version"
    ;;
  version) printf '>\n' ;;
  verify) exit 0 ;;
  adbdump) printf '{"info":{"name":"%s","version":"%s","arch":"noarch"}}\n' "$APK_META_NAME" "$EXPECTED_VERSION" ;;
  add)
    printf 'config changed by apk package\n' > "$CONFIG_FILE"
    printf '%s\n' "$EXPECTED_VERSION" > "$APK_STATE"
    ;;
  *) exit 2 ;;
esac
`);
  executable(jshn, `
#!/bin/sh
json_init() { :; }
json_load_file() { [ -s "$1" ]; }
json_select() { return 0; }
json_get_var() {
  case "$2" in
    name) value="$APK_META_NAME" ;;
    version) value="$EXPECTED_VERSION" ;;
    arch) value='noarch' ;;
    *) value='' ;;
  esac
  eval "$1=\\"\\$value\\""
}
`);

  const path = process.platform === 'win32'
    ? `${bin};C:\\Program Files\\Git\\usr\\bin;C:\\Program Files\\Git\\bin;${process.env.PATH}`
    : `${bin}:${process.env.PATH}`;
  const bash = process.platform === 'win32'
    ? 'C:\\Program Files\\Git\\bin\\bash.exe'
    : 'bash';
  const updateApiUrl = 'https://api.github.com/repos/kva4991/luci-app-sheepfold-family-internet-control/releases/latest';
  const result = spawnSync(bash, [posix(relative(repoRoot, updater)), 'install'], {
    cwd: repoRoot,
    env: {
      ...process.env,
      PATH: path,
      UPDATE_API_URL: updateApiUrl,
      RELEASE_SOURCE: posix(relative(repoRoot, release)),
      RELEASE_PACKAGE_URL: routerUrl,
      PACKAGE_SOURCE: posix(relative(repoRoot, packageSource)),
      APK_LOG: posix(relative(repoRoot, apkLog)),
      APK_STATE: posix(relative(repoRoot, apkState)),
      APK_META_NAME: metadataName,
      EXPECTED_VERSION: expectedVersion,
      FETCH_LOG: posix(relative(repoRoot, fetchLog)),
      CONFIG_FILE: posix(relative(repoRoot, config)),
      SHEEPFOLD_UPDATE_RUNTIME_DIR: posix(relative(repoRoot, runtime)),
      SHEEPFOLD_UPDATE_WORK_DIR: posix(relative(repoRoot, work)),
      SHEEPFOLD_UPDATE_CONFIG_FILE: posix(relative(repoRoot, config)),
      SHEEPFOLD_UPDATE_MIGRATION_BACKUP: posix(relative(repoRoot, join(root, 'missing-migration'))),
      SHEEPFOLD_UPDATE_SERVICE_INIT: posix(relative(repoRoot, join(root, 'missing-service'))),
      SHEEPFOLD_UPDATE_RPCD_INIT: posix(relative(repoRoot, join(root, 'missing-rpcd'))),
      SHEEPFOLD_UPDATE_JSHN_LIBRARY: posix(relative(repoRoot, jshn)),
    },
    encoding: 'utf8',
  });
  return { apkLog, config, fetchLog, result, routerUrl };
}

describe('network transport safety', () => {
  it('preserves a downloader failure code instead of reporting success', () => {
    const root = mkdtempSync(join(testTmp, 'sheepfold-updater-transport-'));
    const bin = join(root, 'bin');
    const runtime = join(root, 'runtime');
    const work = join(root, 'work');
    mkdirSync(bin, { recursive: true });
    executable(join(bin, 'uci'), '#!/bin/sh\nexit 1\n');
    executable(join(bin, 'opkg'), '#!/bin/sh\nexit 1\n');
    executable(join(bin, 'uclient-fetch'), '#!/bin/sh\nexit 7\n');
    const path = process.platform === 'win32'
      ? `${bin};C:\\Program Files\\Git\\usr\\bin;C:\\Program Files\\Git\\bin;${process.env.PATH}`
      : `${bin}:${process.env.PATH}`;
    const bash = process.platform === 'win32'
      ? 'C:\\Program Files\\Git\\bin\\bash.exe'
      : 'bash';

    const result = spawnSync(bash, [posix(relative(repoRoot, updater)), 'check'], {
      cwd: repoRoot,
      env: {
        ...process.env,
        PATH: path,
        SHEEPFOLD_UPDATE_RUNTIME_DIR: posix(relative(repoRoot, runtime)),
        SHEEPFOLD_UPDATE_WORK_DIR: posix(relative(repoRoot, work)),
        SHEEPFOLD_UPDATE_DOWNLOAD_TIMEOUT: '1',
      },
      encoding: 'utf8',
    });

    assert.equal(result.status, 7, result.stderr || result.stdout);
    assert.match(result.stderr, /uclient-fetch.*7/);
  });

  it('bounds updater and Telegram requests and keeps fallback clients', () => {
    const updaterSource = readFileSync(updater, 'utf8');
    const telegramSource = readFileSync(telegram, 'utf8');

    assert.match(updaterSource, /uclient-fetch -q -T "\$DOWNLOAD_TIMEOUT_SECONDS"/);
    assert.match(updaterSource, /curl -fsSL --connect-timeout 15 --max-time "\$DOWNLOAD_TIMEOUT_SECONDS"/);
    assert.match(updaterSource, /wget -q -T "\$DOWNLOAD_TIMEOUT_SECONDS"/);
    assert.match(updaterSource, /MAX_DOWNLOAD_BYTES=.*67108864/);
    assert.doesNotMatch(updaterSource, /fi\s*\n\s*code="\$\?"/);

    assert.match(telegramSource, /TELEGRAM_HTTP_TIMEOUT_SECONDS=.*35/);
    assert.match(telegramSource, /uclient-fetch -q -T "\$TELEGRAM_HTTP_TIMEOUT_SECONDS"/);
    assert.match(telegramSource, /curl -fsSL --connect-timeout 10 --max-time "\$TELEGRAM_HTTP_TIMEOUT_SECONDS"/);
    assert.match(telegramSource, /wget -q -T "\$TELEGRAM_HTTP_TIMEOUT_SECONDS"/);
  });

  it('validates a real IPK and restores settings when opkg fails', () => {
    const { config, opkgLog, result } = runInstallScenario({ installExit: 23 });

    assert.equal(result.status, 23, result.stderr || result.stdout);
    assert.match(result.stderr, /код 23/);
    assert.match(result.stdout, /Предыдущие настройки Sheepfold восстановлены/);
    assert.equal(readFileSync(config, 'utf8'), 'config original\n');
    assert.match(readFileSync(opkgLog, 'utf8'), /^install /m);
  });

  it('rejects a malformed IPK before invoking opkg', () => {
    const root = mkdtempSync(join(testTmp, 'sheepfold-updater-bad-ipk-'));
    const badPackage = join(root, 'bad.ipk');
    writeFileSync(badPackage, 'this is not an ipk\n', 'utf8');
    const { config, opkgLog, result } = runInstallScenario({
      packageSource: badPackage,
      assetName: 'luci-app-sheepfold-family-internet-control_9.9.9-1_all.ipk',
    });

    assert.equal(result.status, 1, result.stderr || result.stdout);
    assert.match(result.stderr, /пакет OpenWrt не прошёл проверку/);
    assert.equal(readFileSync(config, 'utf8'), 'config original\n');
    assert.equal(existsSync(opkgLog), false);
  });

  it('rejects a package URL outside the Sheepfold GitHub release path', () => {
    const { config, opkgLog, result } = runInstallScenario({
      packageUrl: 'https://downloads.example.test/luci-app-sheepfold-family-internet-control_9.9.9-1_all.ipk',
    });

    assert.equal(result.status, 1, result.stderr || result.stdout);
    assert.match(result.stderr, /вне официального раздела релизов Sheepfold/);
    assert.equal(readFileSync(config, 'utf8'), 'config original\n');
    assert.equal(existsSync(opkgLog), false);
  });

  it('restores settings when opkg succeeds but the installed version is not confirmed', () => {
    const { config, result } = runInstallScenario({ installExit: 0 });

    assert.equal(result.status, 1, result.stderr || result.stdout);
    assert.match(result.stderr, /вместо ожидаемой/);
    assert.match(result.stdout, /Предыдущие настройки Sheepfold восстановлены/);
    assert.equal(readFileSync(config, 'utf8'), 'config original\n');
  });

  it('accepts a validated package only after opkg confirms the installed version', () => {
    const { config, result } = runInstallScenario({
      installExit: 0,
      confirmInstalledVersion: true,
    });

    assert.equal(result.status, 0, result.stderr || result.stdout);
    assert.match(result.stdout, /Обновление завершено/);
    assert.equal(readFileSync(config, 'utf8'), 'config changed by failed package\n');
  });

  it('apkUpdaterAcceptsValidatedOpenWrtPackage', () => {
    const { apkLog, config, fetchLog, result, routerUrl } = runApkInstallScenario();

    assert.equal(result.status, 0, result.stderr || result.stdout);
    assert.match(result.stdout, /Обновление завершено/);
    assert.equal(readFileSync(config, 'utf8'), 'config changed by apk package\n');
    assert.match(readFileSync(fetchLog, 'utf8'), new RegExp(routerUrl.replaceAll('.', '\\.')));
    assert.doesNotMatch(readFileSync(fetchLog, 'utf8'), /sheepfold-v9\.9\.9\.apk/);
    assert.match(readFileSync(apkLog, 'utf8'), /^verify --allow-untrusted /m);
    assert.match(readFileSync(apkLog, 'utf8'), /^adbdump --allow-untrusted --format json /m);
    assert.match(readFileSync(apkLog, 'utf8'), /^add --allow-untrusted /m);
  });

  it('apkUpdaterRejectsUnexpectedInternalPackageName', () => {
    const { apkLog, config, result } = runApkInstallScenario({ metadataName: 'not-sheepfold' });

    assert.equal(result.status, 1, result.stderr || result.stdout);
    assert.match(result.stderr, /имя пакета не совпадает/);
    assert.equal(readFileSync(config, 'utf8'), 'config original\n');
    assert.doesNotMatch(readFileSync(apkLog, 'utf8'), /^add /m);
  });
});
