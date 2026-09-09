/*
 * Исполняет настоящий router-control и token-common с перенесёнными путями.
 * Ошибки cp/ln/rm моделируются только внутри удаляемой .build fixture.
 * Проверяет сохранность файлов/коды возврата, не живую аутентификацию телефона
 * и не конкуренцию нескольких процессов сопряжения.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readFileSync, readdirSync, lstatSync, readlinkSync, writeFileSync, statSync, symlinkSync } from 'node:fs';
import { join } from 'node:path';
import { createRouterFixture, runtimeRoot } from './helpers/routerRuntimeFixture.mjs';
import { installExecutable, installRuntime } from './helpers/controlRuntimeFixture.mjs';

const quote = (value) => `'${String(value).replaceAll("'", "'\\''")}'`;
const token = (login = 'Parent', id = '1') => `login=${login}\ndevice_id=${id}\nmac=02:00:00:00:00:11\nissued_at=1700000000\nexpires_at=0\n`;

function createTokenFixture() {
  const fixture = createRouterFixture();
  const persistent = join(fixture.root, 'persistent');
  const store = join(persistent, 'tokens');
  const legacy = join(fixture.runtime, 'tokens');
  const events = join(fixture.root, 'events');
  mkdirSync(store, { recursive: true });
  writeFileSync(events, '');
  installRuntime(fixture, 'sheepfold-token-common');
  let routerControl = readFileSync(join(runtimeRoot, 'sheepfold-router-control'), 'utf8')
    .replaceAll('/usr/libexec/sheepfold', fixture.shellPath(fixture.bin))
    .replaceAll('/etc/sheepfold', fixture.shellPath(persistent))
    .replaceAll('/tmp/sheepfold', fixture.shellPath(fixture.runtime));
  // Migration requires native POSIX symlink semantics and is exercised by
  // Linux CI. On Windows, keep the revocation suite useful without requiring
  // Developer Mode or elevated symlink privileges.
  if (process.platform === 'win32')
    routerControl = routerControl.replace('\nensure_token_storage\n', '\n: # storage link is covered by Linux CI\n');
  installExecutable(fixture, 'sheepfold-router-control', routerControl);
  installExecutable(fixture, 'sheepfold-log', `#!/bin/sh\nprintf '%s\\n' "$*" >> ${quote(fixture.shellPath(events))}\n`);
  return { ...fixture, store, legacy, events,
    prepareLegacy: (files) => {
      mkdirSync(legacy, { recursive: true });
      for (const [name, body] of Object.entries(files)) writeFileSync(join(legacy, name), body);
    },
    stored: (name, body = token()) => writeFileSync(join(store, name), body),
    initialize: () => fixture.run('sheepfold-router-control', ['check-token', '']),
  };
}

function failRemoval(fixture, name) {
  installExecutable(fixture, 'rm', `#!/bin/sh
for item do
  [ "$item" != ${quote(fixture.shellPath(join(fixture.store, name)))} ] || exit 1
done
exec /bin/rm "$@"
`);
}

function noPublishedFragments(fixture) {
  assert.deepEqual(readdirSync(fixture.store), [], 'failed migration must not publish a token or leave a visible fragment');
}

describe('Persistent administrator token migration', {
  skip: process.platform === 'win32'
    ? 'requires native POSIX hard-link and symlink semantics; covered by Linux CI'
    : false,
}, () => {
  it('migrates complete files before replacing the legacy directory with a link', () => {
    const f = createTokenFixture();
    try {
      f.prepareLegacy({ first: token(), second: token('Other', '2') });
      assert.equal(f.initialize().status, 0);
      assert.equal(readFileSync(join(f.store, 'first'), 'utf8'), token());
      assert.equal(readFileSync(join(f.store, 'second'), 'utf8'), token('Other', '2'));
      assert.ok(lstatSync(f.legacy).isSymbolicLink());
      assert.equal(readlinkSync(f.legacy), f.shellPath(f.store));
      if (process.platform !== 'win32') assert.equal(statSync(join(f.store, 'first')).mode & 0o777, 0o600);
    } finally { f.close(); }
  });
  it('retains the source and hides incomplete output when copying fails', () => {
    const f = createTokenFixture();
    try {
      f.prepareLegacy({ first: token() });
      installExecutable(f, 'cp', `#!/bin/sh
while [ "$#" -gt 2 ]; do shift; done
source="$1"; target="$2"
[ ! -d "$target" ] || target="$target/\${source##*/}"
printf 'PARTIAL' > "$target"
exit 1
`);
      assert.notEqual(f.initialize().status, 0);
      assert.ok(lstatSync(f.legacy).isDirectory());
      assert.equal(readFileSync(join(f.legacy, 'first'), 'utf8'), token());
      noPublishedFragments(f);
    } finally { f.close(); }
  });
  it('retains the source when publishing the checked copy fails', () => {
    const f = createTokenFixture();
    try {
      f.prepareLegacy({ first: token() });
      installExecutable(f, 'ln', '#!/bin/sh\n[ "$1" != -s ] || exec /bin/ln "$@"\nexit 1\n');
      assert.notEqual(f.initialize().status, 0);
      assert.equal(readFileSync(join(f.legacy, 'first'), 'utf8'), token());
      assert.ok(lstatSync(f.legacy).isDirectory());
      noPublishedFragments(f);
    } finally { f.close(); }
  });
  it('does not overwrite a different token already present in persistent storage', () => {
    const f = createTokenFixture();
    try {
      f.prepareLegacy({ first: token() });
      f.stored('first', token('NewParent', '3'));
      assert.notEqual(f.initialize().status, 0);
      assert.equal(readFileSync(join(f.store, 'first'), 'utf8'), token('NewParent', '3'));
      assert.ok(lstatSync(f.legacy).isDirectory());
      assert.equal(readFileSync(join(f.legacy, 'first'), 'utf8'), token());
    } finally { f.close(); }
  });
  it('finishes an interrupted migration when the existing copy is identical', () => {
    const f = createTokenFixture();
    try {
      f.prepareLegacy({ first: token() });
      f.stored('first');
      assert.equal(f.initialize().status, 0);
      assert.equal(readFileSync(join(f.store, 'first'), 'utf8'), token());
      assert.ok(lstatSync(f.legacy).isSymbolicLink());
    } finally { f.close(); }
  });
  it('retries a failed copy without losing the old token', () => {
    const f = createTokenFixture();
    try {
      f.prepareLegacy({ first: token() });
      installExecutable(f, 'cp', '#!/bin/sh\nexit 1\n');
      assert.notEqual(f.initialize().status, 0);
      installExecutable(f, 'cp', '#!/bin/sh\nexec /bin/cp "$@"\n');
      assert.equal(f.initialize().status, 0);
      assert.equal(readFileSync(join(f.store, 'first'), 'utf8'), token());
    } finally { f.close(); }
  });
  it('does not delete the legacy directory after copy verification fails', () => {
    const f = createTokenFixture();
    try {
      f.prepareLegacy({ first: token() });
      installExecutable(f, 'cmp', '#!/bin/sh\nexit 1\n');
      assert.notEqual(f.initialize().status, 0);
      assert.ok(lstatSync(f.legacy).isDirectory());
      assert.equal(readFileSync(join(f.legacy, 'first'), 'utf8'), token());
      noPublishedFragments(f);
    } finally { f.close(); }
  });
  it('does not delete unsupported entries in the legacy directory', () => {
    const f = createTokenFixture();
    try {
      f.prepareLegacy({});
      mkdirSync(join(f.legacy, 'unexpected'));
      writeFileSync(join(f.legacy, 'unexpected', 'data'), 'preserve');
      assert.notEqual(f.initialize().status, 0);
      assert.equal(readFileSync(join(f.legacy, 'unexpected', 'data'), 'utf8'), 'preserve');
    } finally { f.close(); }
  });
  it('does not follow a symbolic link during legacy migration', () => {
    const f = createTokenFixture();
    try {
      f.prepareLegacy({});
      const outside = join(f.root, 'outside-token');
      writeFileSync(outside, token());
      symlinkSync(outside, join(f.legacy, 'first'));
      assert.notEqual(f.initialize().status, 0);
      assert.ok(lstatSync(join(f.legacy, 'first')).isSymbolicLink());
      assert.equal(readFileSync(outside, 'utf8'), token());
      noPublishedFragments(f);
    } finally { f.close(); }
  });
  it('preserves a token that arrives after copying instead of recursively deleting the directory', () => {
    const f = createTokenFixture();
    try {
      f.prepareLegacy({ first: token() });
      installExecutable(f, 'rmdir', `#!/bin/sh
printf '%s' ${quote(token('Late', '7'))} > ${quote(f.shellPath(join(f.legacy, 'late')))}
exec /bin/rmdir "$@"
`);
      assert.notEqual(f.initialize().status, 0);
      assert.equal(readFileSync(join(f.legacy, 'late'), 'utf8'), token('Late', '7'));
      assert.equal(readFileSync(join(f.store, 'first'), 'utf8'), token());
    } finally { f.close(); }
  });
  it('does not overwrite a destination created between initial check and publication', () => {
    const f = createTokenFixture();
    try {
      f.prepareLegacy({ first: token() });
      installExecutable(f, 'ln', `#!/bin/sh
[ "$1" != -s ] || exec /bin/ln "$@"
[ "$1" != -T ] || shift
printf '%s' ${quote(token('NewParent', '3'))} > "$2"
exec /bin/ln -T "$@"
`);
      assert.notEqual(f.initialize().status, 0);
      assert.equal(readFileSync(join(f.store, 'first'), 'utf8'), token('NewParent', '3'));
      assert.equal(readFileSync(join(f.legacy, 'first'), 'utf8'), token());
    } finally { f.close(); }
  });

  for (const kind of ['directory', 'symlink']) {
    it(`does not publish inside a competing destination ${kind}`, () => {
      const f = createTokenFixture();
      try {
        f.prepareLegacy({ first: token() });
        const other = join(f.root, 'other-directory');
        mkdirSync(other);
        const collision = kind === 'directory' ? 'mkdir "$2"'
          : `/bin/ln -s ${quote(f.shellPath(other))} "$2"`;
        installExecutable(f, 'ln', `#!/bin/sh
[ "$1" != -s ] || exec /bin/ln "$@"
[ "$1" != -T ] || shift
${collision}
exec /bin/ln -T "$@"
`);
        assert.notEqual(f.initialize().status, 0);
        assert.equal(readFileSync(join(f.legacy, 'first'), 'utf8'), token());
        assert.deepEqual(readdirSync(kind === 'directory' ? join(f.store, 'first') : other), []);
      } finally { f.close(); }
    });
  }
  it('retains an unknown file in place of the legacy storage directory', () => {
    const f = createTokenFixture();
    try {
      writeFileSync(f.legacy, 'unexpected data');
      assert.notEqual(f.initialize().status, 0);
      assert.equal(readFileSync(f.legacy, 'utf8'), 'unexpected data');
    } finally { f.close(); }
  });
  it('initializes an empty legacy directory without creating token records', () => {
    const f = createTokenFixture();
    try {
      f.prepareLegacy({});
      assert.equal(f.initialize().status, 0);
      assert.deepEqual(readdirSync(f.store), []);
      assert.ok(lstatSync(f.legacy).isSymbolicLink());
    } finally { f.close(); }
  });

});

describe('Token revocation failure reporting', () => {
  for (const selector of [[], ['Parent']]) {
    it(`reports a failed deletion for ${selector.length ? 'one administrator' : 'all administrators'}`, () => {
      const f = createTokenFixture();
      try {
        f.stored('first');
        failRemoval(f, 'first');
        const result = f.run('sheepfold-router-control', ['revoke-tokens', ...selector]);
        assert.notEqual(result.status, 0);
        assert.ok(existsSync(join(f.store, 'first')));
        assert.match(result.stdout, /^revoked=0$/m);
        assert.match(result.stdout, /^failed=1$/m);
        assert.doesNotMatch(readFileSync(f.events, 'utf8'), /завершены все телефонные сеансы/);
        assert.doesNotMatch(result.stderr, /login=|issued_at=|mac=/);
      } finally { f.close(); }
    });
  }
  it('continues revoking other matching tokens but does not acknowledge partial success as complete', () => {
    const f = createTokenFixture();
    try {
      f.stored('first'); f.stored('second'); f.stored('third', token('Other', '9'));
      failRemoval(f, 'first');
      const result = f.run('sheepfold-router-control', ['revoke-tokens', 'Parent']);
      assert.notEqual(result.status, 0);
      assert.match(result.stdout, /^revoked=1$/m);
      assert.match(result.stdout, /^failed=1$/m);
      assert.ok(existsSync(join(f.store, 'first')));
      assert.ok(!existsSync(join(f.store, 'second')));
      assert.ok(existsSync(join(f.store, 'third')));
    } finally { f.close(); }
  });
  it('propagates device-token deletion failure while still revoking its other sessions', () => {
    const f = createTokenFixture();
    try {
      f.stored('first'); f.stored('second'); f.stored('third', token('Parent', '2'));
      failRemoval(f, 'first');
      assert.notEqual(f.run('sheepfold-router-control', ['revoke-device-tokens', '1']).status, 0);
      assert.ok(existsSync(join(f.store, 'first')));
      assert.ok(!existsSync(join(f.store, 'second')));
      assert.ok(existsSync(join(f.store, 'third')));
    } finally { f.close(); }
  });
  it('retries partial revocation and counts only the remaining successfully removed token', () => {
    const f = createTokenFixture();
    try {
      f.stored('first'); f.stored('second');
      failRemoval(f, 'first');
      assert.notEqual(f.run('sheepfold-router-control', ['revoke-tokens', 'Parent']).status, 0);
      installExecutable(f, 'rm', '#!/bin/sh\nexec /bin/rm "$@"\n');
      const retry = f.run('sheepfold-router-control', ['revoke-tokens', 'Parent']);
      assert.equal(retry.status, 0, retry.stderr);
      assert.match(retry.stdout, /^revoked=1$/m);
      assert.deepEqual(readdirSync(f.store), []);
    } finally { f.close(); }
  });
  it('keeps unrelated administrators and returns the existing success contract', () => {
    const f = createTokenFixture();
    try {
      f.stored('first'); f.stored('other', token('Other', '2'));
      const result = f.run('sheepfold-router-control', ['revoke-tokens', 'Parent']);
      assert.equal(result.status, 0);
      assert.equal(result.stdout, 'revoked=1\n');
      assert.ok(!existsSync(join(f.store, 'first')));
      assert.ok(existsSync(join(f.store, 'other')));
    } finally { f.close(); }
  });
  it('allows a successful device revocation without changing the old empty stdout contract', () => {
    const f = createTokenFixture();
    try {
      f.stored('first');
      const result = f.run('sheepfold-router-control', ['revoke-device-tokens', '1']);
      assert.equal(result.status, 0);
      assert.equal(result.stdout, '');
      assert.ok(!existsSync(join(f.store, 'first')));
    } finally { f.close(); }
  });
});
