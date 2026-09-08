/*
 * Fault-injection запускает настоящие генератор, writer и полный pair-device.
 * Нужны явные ошибки внутри if/||: set -e здесь не гарантирует остановку.
 * Только .build fixtures, синтетические токены и модель UCI; не power loss/libuci.
 */
import { spawnSync } from 'node:child_process';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, readdirSync, statSync, mkdirSync, symlinkSync, lstatSync } from 'node:fs';
import { join } from 'node:path';
import { createPairingFixture, testCode, testHash, storedToken, shellQuote, shellPath } from './helpers/pairingRuntimeFixture.mjs';
import { installExecutable } from './helpers/controlRuntimeFixture.mjs';
import { parseCgi, testMac, testIp } from './helpers/routerRuntimeFixture.mjs';

const loadPair = '. /usr/libexec/sheepfold/sheepfold-pair-common\n';
const loadToken = '. /usr/libexec/sheepfold/sheepfold-token-common\n';
const writeToken = `token_write_bound_file "$store" '${testHash}' Parent 1 '${testMac}' 1700000000 0`;
function withFixture(action, options) {
  const f = createPairingFixture(options);
  try { return action(f); } finally { f.close(); }
}
function assertNoTemps(f) {
  assert.deepEqual(f.leakedTemps(), [], 'no token fragments after a handled failure');
  assert.deepEqual(readdirSync(f.runtime).filter((name) => name.startsWith('pair-random.')), []);
}
function pair(f) {
  const result = f.run('sheepfold-pair-device', ['Parent', testCode, testIp, 'SyntheticAndroid']);
  assert.ifError(result.error);
  return result;
}
function unconsumed(f) {
  assert.equal(f.values()['sheepfold.admin.pairing_code'], testCode);
  assert.notEqual(f.values()['sheepfold.child.admin_device'], '1');
  assertNoTemps(f);
}

describe('Pairing randomness and digest failure handling', () => {
  for (const length of [32, 40, 64]) {
    it(`produces a valid ${length}-character token on a healthy source`, () => withFixture((f) => {
      const result = f.runShell(loadPair + `pair_random_hex ${length}\n`);
      assert.equal(result.status, 0, result.stderr);
      assert.match(result.stdout.trimEnd(), new RegExp(`^[0-9a-f]{${length}}$`));
      assertNoTemps(f);
    }));
  }
  for (const [name, fault] of [
    ['read failure without output', 'dd() { return 1; }'],
    ['short successful read', `dd() { case "$*" in *of=*) for arg do case "$arg" in of=*) command printf x > "\${arg#of=}";; esac; done;; *) command printf x;; esac; }`],
    ['partial failed read', `dd() { case "$*" in *of=*) for arg do case "$arg" in of=*) command printf x > "\${arg#of=}";; esac; done;; *) command printf x;; esac; return 1; }`],
    ['digest failure with plausible output', `sha256sum() { cat >/dev/null; command printf '%s  -\\n' '${testHash}'; return 1; }`],
  ]) {
    it(`does not issue a token after ${name}`, () => withFixture((f) => {
      const result = f.runShell(loadPair + `${fault}\nif value="$(pair_random_hex 40)"; then printf '%s' "$value"; exit 0; else exit 1; fi\n`);
      assert.notEqual(result.status, 0, 'generator must report failure');
      assert.equal(result.stdout, '', 'no usable output from a failed generator');
      assertNoTemps(f);
    }));
  }
  for (const [name, fault] of [
    ['digest exit failure', `sha256sum() { cat >/dev/null; printf '%s  -\\n' '${testHash}'; return 1; }`],
    ['empty digest', 'sha256sum() { cat >/dev/null; return 0; }'],
    ['truncated digest', "sha256sum() { cat >/dev/null; printf 'aaaa  -\\n'; }"],
  ]) {
    it(`rejects ${name} when binding a token to a login`, () => withFixture((f) => {
      const result = f.runShell(loadPair + `${fault}\nif value="$(pair_sha256 'Parent:synthetic')"; then printf '%s' "$value"; exit 0; else exit 1; fi\n`);
      assert.notEqual(result.status, 0);
      assert.equal(result.stdout, '');
    }));
  }
  it('does not consume the code or grant rights if the entropy source fails', () => withFixture((f) => {
    installExecutable(f, 'dd', '#!/bin/sh\nexit 1\n');
    assert.equal(pair(f).status, 6);
    assert.deepEqual(f.tokens(), []);
    unconsumed(f);
  }));
  for (const providerFails of [false, true]) {
    it(`checks the openssl fallback${providerFails ? ' failure' : ' result'} without sha256sum`, () => withFixture((f) => {
      const tools = join(f.root, 'fallback-bin');
      mkdirSync(tools);
      for (const name of ['mktemp', 'dd', 'wc', 'tr', 'cut', 'rm', 'rmdir', 'cat']) {
        const lookup = spawnSync('sh', ['-c', 'command -v "$1"', 'tool', name], { encoding: 'utf8' });
        assert.equal(lookup.status, 0, `fixture tool missing: ${name}`);
        installExecutable({ bin: tools }, name, `#!/bin/sh\nexec ${shellQuote(lookup.stdout.trim())} "$@"\n`);
      }
      installExecutable({ bin: tools }, 'openssl', `#!/bin/sh\ncat >/dev/null\nprintf 'SHA2-256(stdin)= %s\\n' '${testHash}'\nexit ${providerFails ? 1 : 0}\n`);
      const result = f.runShell(loadPair + `PATH=${shellQuote(shellPath(tools))}\nexport PATH\nif value="$(pair_random_hex 40)"; then printf '%s' "$value"; exit 0; else exit 1; fi\n`);
      assert.equal(result.status, providerFails ? 1 : 0, result.stderr);
      assert.equal(result.stdout, providerFails ? '' : testHash.slice(0, 40));
      assertNoTemps(f);
    }));
  }

});

describe('Bound token publication under checked function calls', () => {
  function store(f, setup = '') {
    return f.runShell(loadToken + `store=${shellQuote(shellPath(f.store))}\n${setup}\nif ${writeToken}; then exit 0; else exit 1; fi\n`);
  }
  it('publishes complete metadata with private permissions', () => withFixture((f) => {
    const result = store(f);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(readFileSync(join(f.store, testHash), 'utf8'), storedToken());
    if (process.platform !== 'win32') assert.equal(statSync(join(f.store, testHash)).mode & 0o777, 0o600);
    assertNoTemps(f);
  }));
  for (const [name, fault] of [
    ['a failed first write', `printf() { case "$1" in login=*) command printf PARTIAL; return 1;; *) command printf "$@";; esac; }`],
    ['a permission-setting failure', 'chmod() { return 1; }'],
    ['a publication failure', 'ln() { return 1; }'],
  ]) {
    it(`does not publish after ${name}`, () => withFixture((f) => {
      assert.notEqual(store(f, fault).status, 0);
      assert.deepEqual(f.tokens(), []);
      assertNoTemps(f);
    }));
  }
  it('rejects malformed timestamps before writing any token record', () => {
    for (const [issued, expires] of [['1:2', '0'], ['1700000000', '0:1'], ['', '0'], ['1700000000', '']]) {
      withFixture((f) => {
        const result = f.runShell(loadToken + `if token_write_bound_file ${shellQuote(shellPath(f.store))} '${testHash}' Parent 1 '${testMac}' ${shellQuote(issued)} ${shellQuote(expires)}; then exit 0; else exit 1; fi\n`);
        assert.notEqual(result.status, 0);
        assert.deepEqual(f.tokens(), []);
        assertNoTemps(f);
      });
    }
  });
  it('preserves an existing record instead of replacing it', () => withFixture((f) => {
    writeFileSync(join(f.store, testHash), storedToken('ExistingParent'));
    assert.notEqual(store(f).status, 0);
    assert.equal(readFileSync(join(f.store, testHash), 'utf8'), storedToken('ExistingParent'));
    assertNoTemps(f);
  }));
  it('does not treat a directory destination as successful publication', () => withFixture((f) => {
    mkdirSync(join(f.store, testHash));
    assert.notEqual(store(f).status, 0);
    assert.deepEqual(readdirSync(join(f.store, testHash)), []);
    assertNoTemps(f);
  }));
  it('preserves a symlink destination and its target', () => withFixture((f) => {
    const target = join(f.root, 'unrelated');
    writeFileSync(target, 'untouched');
    symlinkSync(target, join(f.store, testHash));
    assert.notEqual(store(f).status, 0);
    assert.ok(lstatSync(join(f.store, testHash)).isSymbolicLink());
    assert.equal(readFileSync(target, 'utf8'), 'untouched');
    assertNoTemps(f);
  }));
  it('allows only one concurrent publisher for the same token name', () => withFixture((f) => {
    // Два отдельных shell имеют разные $$; старый mv -f иначе гоняется ещё и
    // за одним временным именем, что делает исходный дефект недетерминированным.
    const worker = `. "$1"; token_write_bound_file "$2" "$3" "$4" 1 '${testMac}' 1700000000 0`;
    const common = shellQuote(shellPath(join(f.bin, 'sheepfold-token-common')));
    const storePath = shellQuote(shellPath(f.store));
    const result = f.runShell(`sh -c ${shellQuote(worker)} worker ${common} ${storePath} '${testHash}' Parent & first=$!\nsh -c ${shellQuote(worker)} worker ${common} ${storePath} '${testHash}' Other & second=$!\na=0; b=0\nwait "$first" || a=$?\nwait "$second" || b=$?\nprintf '%s %s' "$a" "$b"\n`);
    assert.equal(result.status, 0, result.stderr);
    const statuses = result.stdout.trim().split(' ').map(Number);
    assert.equal(statuses.filter((value) => value === 0).length, 1, result.stdout);
    assert.ok([storedToken(), storedToken('Other')].includes(readFileSync(join(f.store, testHash), 'utf8')));
    assertNoTemps(f);
  }));
});

describe('Whole pairing preparation and rollback ownership', () => {
  it('keeps the successful one-time pairing contract', () => withFixture((f) => {
    const result = pair(f);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /token=[0-9a-f]{40}\n/);
    assert.equal(f.values()['sheepfold.child.admin_device'], '1');
    assert.equal(f.values()['sheepfold.admin.pairing_code'], undefined);
    assert.equal(f.tokens().length, 1);
    assert.equal(pair(f).status, 3, 'one-time code must not be reusable');
    assert.equal(f.tokens().length, 1, 'rejected retry must not revoke the existing session');
    assertNoTemps(f);
  }));
  for (const [name, command, script] of [
    ['snapshot copy failure', 'cp', 'exit 1'],
    ['transaction root permission failure', 'chmod', 'case "$*" in *pairing-transactions*) exit 1;; esac\nexec /bin/chmod "$@"'],
    ['transaction delta directory failure', 'mkdir', 'case "$*" in */uci) exit 1;; esac\nexec /bin/mkdir "$@"'],
  ]) {
    it(`stops before token storage or UCI writes after ${name}`, () => withFixture((f) => {
      installExecutable(f, command, '#!/bin/sh\n' + script + '\n');
      assert.equal(pair(f).status, 6);
      assert.equal(f.writes(), '');
      assert.deepEqual(f.tokens(), []);
      unconsumed(f);
    }));
  }
  it('does not delete another record when token-name publication collides', () => withFixture((f) => {
    installExecutable(f, 'sha256sum', `#!/bin/sh\ncat >/dev/null\nprintf '%s  -\\n' '${testHash}'\n`);
    writeFileSync(join(f.store, testHash), storedToken('ExistingParent'));
    assert.equal(pair(f).status, 6);
    assert.equal(readFileSync(join(f.store, testHash), 'utf8'), storedToken('ExistingParent'));
    unconsumed(f);
  }));
  it('keeps the code usable when token chmod fails', () => withFixture((f) => {
    installExecutable(f, 'chmod', '#!/bin/sh\n[ "$1" != 600 ] || exit 1\nexec /bin/chmod "$@"\n');
    assert.equal(pair(f).status, 6);
    assert.deepEqual(f.tokens(), []);
    unconsumed(f);
  }));
  it('completes a real CGI-to-pairing flow with unchanged response fields', () => withFixture((f) => {
    const response = parseCgi(f.request(`login=Parent&code=${encodeURIComponent(testCode)}`));
    assert.equal(response.status, 200);
    assert.equal(response.body.paired, true);
    assert.equal(response.body.adminLogin, 'Parent');
    assert.equal(response.body.deviceId, '1');
    assert.match(response.body.token, /^[0-9a-f]{40}$/);
    assert.equal(f.tokens().length, 1);
    assert.equal(f.values()['sheepfold.admin.pairing_code'], undefined);
    assertNoTemps(f);
  }, { realBackend: true }));
  it('keeps a QR usable after a complete CGI token-storage failure', () => withFixture((f) => {
    installExecutable(f, 'chmod', '#!/bin/sh\n[ "$1" != 600 ] || exit 1\nexec /bin/chmod "$@"\n');
    const response = parseCgi(f.request(`login=Parent&code=${encodeURIComponent(testCode)}`));
    assert.equal(response.status, 500);
    assert.equal(response.body.error, 'token_generation_failed');
    assert.equal(response.body.paired, false);
    assert.deepEqual(f.tokens(), []);
    unconsumed(f);
  }, { realBackend: true }));

});
