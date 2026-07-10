import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const buildScript = resolve(repoRoot, 'scripts/build-test-ipk.py');
const testOutDir = resolve(repoRoot, '.build/test-ipk-out');

function buildTestIpk() {
  const result = spawnSync('python', [buildScript, '--out-dir', testOutDir], {
    cwd: repoRoot,
    encoding: 'utf8',
  });

  assert.equal(result.status, 0, result.stderr || result.stdout);
  const line = String(result.stdout).trim().split(/\r?\n/).find((entry) => entry.endsWith('.ipk'));
  assert.ok(line, 'build-test-ipk.py must print the generated .ipk path');
  return line.trim();
}

function tarMode(ipkPath, memberPath) {
  const list = spawnSync('python', ['-c', `
import gzip, io, stat, sys, tarfile
path = sys.argv[1]
target = sys.argv[2]
raw = gzip.decompress(open(path, 'rb').read())
with tarfile.open(fileobj=io.BytesIO(raw), mode='r:') as outer:
    data = outer.extractfile('./data.tar.gz')
    with gzip.open(data, 'rb') as gz:
        with tarfile.open(fileobj=gz, mode='r:') as inner:
            member = inner.getmember(target)
            print(oct(member.mode & 0o777))
`, ipkPath, memberPath], { encoding: 'utf8' });

  assert.equal(list.status, 0, list.stderr || list.stdout);
  return list.stdout.trim();
}

describe('test IPK executable permissions', () => {
  it('ships router-control-legacy as executable in data.tar.gz', () => {
    const ipkPath = buildTestIpk();
    const mode = tarMode(
      ipkPath,
      './usr/libexec/sheepfold/sheepfold-router-control-legacy',
    );

    assert.equal(mode, '0o755');
  });

  it('postinst chmods all libexec helpers after install', () => {
    const buildPy = readFileSync(buildScript, 'utf8');
    const buildSh = readFileSync(resolve(repoRoot, 'scripts/build-test-ipk.sh'), 'utf8');
    const makefile = readFileSync(
      resolve(repoRoot, 'package/luci-app-sheepfold-family-internet-control/Makefile'),
      'utf8',
    );

    assert.match(buildPy, /find \/usr\/libexec\/sheepfold -type f -exec chmod 0755/);
    assert.match(buildSh, /find \/usr\/libexec\/sheepfold -type f -exec chmod 0755/);
    assert.match(makefile, /find \/usr\/libexec\/sheepfold -type f -exec chmod 0755/);
  });
});