/*
 * Проверяет единый adapter opkg/apk на подставных командах, не обращаясь к сети
 * и не меняя пакеты хоста. Это защищает различия OpenWrt 24.10 и 25.12, которые
 * внешне выглядят похоже, но используют разные базы и синтаксис. §packagemanager
 */
import {
  chmodSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
function toShellPath(path) {
  return path
    .replace(/^([A-Za-z]):/, (_, drive) => `/${drive.toLowerCase()}`)
    .replaceAll('\\', '/');
}

const helperPath = toShellPath(resolve(
  repoRoot,
  'package/luci-app-sheepfold-family-internet-control/root/usr/libexec/sheepfold/sheepfold-package-manager',
));
const temporaryDirectories = [];

function makeFakeBin(files) {
  const directory = mkdtempSync(join(tmpdir(), 'sheepfold-package-manager-'));
  temporaryDirectories.push(directory);
  for (const [name, contents] of Object.entries(files)) {
    const path = join(directory, name);
    writeFileSync(path, contents, 'utf8');
    chmodSync(path, 0o755);
  }
  return directory;
}

function runHelper(fakeBin, ...args) {
  return spawnSync(
    'sh',
    [
      '-c',
      'PATH="$1:$PATH"; export PATH; shift; helper="$1"; shift; sh "$helper" "$@"',
      'sh',
      toShellPath(fakeBin),
      helperPath,
      ...args,
    ],
    { encoding: 'utf8' },
  );
}

afterEach(() => {
  while (temporaryDirectories.length)
    rmSync(temporaryDirectories.pop(), { recursive: true, force: true });
});

describe('OpenWrt package-manager adapter §pkgmgr1', () => {
  it('prefers opkg when an older router also has an optional apk command', () => {
    const fakeBin = makeFakeBin({
      opkg: '#!/bin/sh\nexit 0\n',
      apk: '#!/bin/sh\nexit 0\n',
    });

    const result = runHelper(fakeBin, 'manager');

    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout.trim(), 'opkg');
  });

  it('uses apk v3 queries and local-package installation on OpenWrt 25.12', () => {
    const fakeBin = makeFakeBin({
      apk: `#!/bin/sh
case "$1" in
  info)
    if [ "$2" = '-e' ]; then [ "$3" = 'demo' ]; exit; fi
    printf '[\\n  {\\n    "version": "2.0-r1"\\n  }\\n]\\n'
    ;;
  version)
    [ "$2" = '-t' ] || exit 2
    printf '>\\n'
    ;;
  add)
    printf '%s\\n' "$*" > "$SHEEPFOLD_PM_LOG"
    ;;
  *) exit 2 ;;
esac
`,
    });
    const packageFile = join(fakeBin, 'demo.apk');
    const logFile = join(fakeBin, 'calls.log');
    const packagePath = toShellPath(packageFile);
    const logPath = toShellPath(logFile);
    writeFileSync(packageFile, 'test package', 'utf8');

    const manager = runHelper(fakeBin, 'manager');
    const version = runHelper(fakeBin, 'version', 'demo');
    const newer = runHelper(fakeBin, 'newer', '2.0-r1', '1.0-r1');
    const install = spawnSync(
      'sh',
      [
        '-c',
        'PATH="$1:$PATH"; SHEEPFOLD_PM_LOG="$2"; export PATH SHEEPFOLD_PM_LOG; sh "$3" install-file "$4" 1',
        'sh',
        toShellPath(fakeBin),
        logPath,
        helperPath,
        packagePath,
      ],
      { encoding: 'utf8' },
    );

    assert.equal(manager.stdout.trim(), 'apk');
    assert.equal(version.status, 0, version.stderr);
    assert.equal(version.stdout.trim(), '2.0-r1');
    assert.equal(newer.status, 0, newer.stderr);
    assert.equal(install.status, 0, install.stderr);
    assert.equal(
      readFileSync(logFile, 'utf8').trim(),
      `add --allow-untrusted --force-reinstall ${packagePath}`,
    );
  });

  it('fails clearly when neither system package manager exists', () => {
    const fakeBin = makeFakeBin({});
    const result = spawnSync(
      'sh',
      ['-c', 'PATH="$1"; export PATH; /bin/sh "$2" manager', 'sh', toShellPath(fakeBin), helperPath],
      { encoding: 'utf8' },
    );

    assert.equal(result.status, 127);
  });
});
