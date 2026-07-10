import { mkdtempSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const buildScript = resolve(repoRoot, 'scripts/build-test-ipk.py');

function buildTestIpk() {
  const testOutDir = mkdtempSync(join(tmpdir(), 'sheepfold-ipk-'));
  const result = spawnSync('python', [buildScript, '--out-dir', testOutDir], {
    cwd: repoRoot,
    encoding: 'utf8',
  });

  assert.equal(result.status, 0, result.stderr || result.stdout);
  const line = String(result.stdout).trim().split(/\r?\n/).find((entry) => entry.endsWith('.ipk'));
  assert.ok(line, 'build-test-ipk.py must print the generated .ipk path');
  return line.trim();
}

describe('test IPK i18n bundle', () => {
  it('ships sheepfold.ru.lmo so gettext _() can render Russian', () => {
    const ipkPath = buildTestIpk();
    const list = spawnSync('python', ['-c', `
import gzip, io, sys, tarfile
path = sys.argv[1]
raw = gzip.decompress(open(path, 'rb').read())
with tarfile.open(fileobj=io.BytesIO(raw), mode='r:') as outer:
    data = outer.extractfile('./data.tar.gz')
    with gzip.open(data, 'rb') as gz:
        with tarfile.open(fileobj=gz, mode='r:') as inner:
            names = [name for name in inner.getnames() if 'sheepfold.ru.lmo' in name]
            print('\\n'.join(names))
`, ipkPath], { encoding: 'utf8' });

    assert.equal(list.status, 0, list.stderr || list.stdout);
    assert.match(list.stdout, /usr\/lib\/lua\/luci\/i18n\/sheepfold\.ru\.lmo/);
  });
});