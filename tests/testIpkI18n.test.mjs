import { existsSync, mkdtempSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { gunzipSync } from 'node:zlib';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const buildScript = resolve(repoRoot, 'scripts/build-test-ipk.py');

function buildTestIpk() {
  const preparedIpk = process.env.SHEEPFOLD_TEST_IPK || '';
  if (preparedIpk) {
    assert.ok(existsSync(preparedIpk), `SHEEPFOLD_TEST_IPK does not exist: ${preparedIpk}`);
    return preparedIpk;
  }
  const testOutDir = mkdtempSync(join(tmpdir(), 'sheepfold-ipk-'));
  const result = spawnSync('python', [buildScript, '--out-dir', testOutDir], {
    cwd: repoRoot,
    encoding: 'utf8',
  });

  assert.equal(result.status, 0, result.error?.message || result.stderr || result.stdout);
  const line = String(result.stdout).trim().split(/\r?\n/).find((entry) => entry.endsWith('.ipk'));
  assert.ok(line, 'build-test-ipk.py must print the generated .ipk path');
  return line.trim();
}

function tarEntries(buffer) {
  const entries = new Map();
  for (let offset = 0; offset + 512 <= buffer.length;) {
    const header = buffer.subarray(offset, offset + 512);
    if (header.every((byte) => byte === 0)) break;
    const text = (start, length) => header.subarray(start, start + length)
      .toString('utf8').replace(/\0.*$/s, '').trim();
    const name = text(0, 100).replace(/^\.\//, '');
    const size = Number.parseInt(text(124, 12) || '0', 8);
    const dataStart = offset + 512;
    entries.set(name, buffer.subarray(dataStart, dataStart + size));
    offset = dataStart + Math.ceil(size / 512) * 512;
  }
  return entries;
}

describe('test IPK i18n bundle', () => {
  it('ships sheepfold.ru.lmo and client-side ru.json for Sheepfold gettext', () => {
    const ipkPath = buildTestIpk();
    const outer = tarEntries(gunzipSync(readFileSync(ipkPath)));
    const dataArchive = outer.get('data.tar.gz');
    assert.ok(dataArchive, 'IPK does not contain data.tar.gz');
    const names = [...tarEntries(gunzipSync(dataArchive)).keys()].join('\n');

    assert.match(names, /usr\/lib\/lua\/luci\/i18n\/sheepfold\.ru\.lmo/);
    assert.match(names, /www\/luci-static\/resources\/sheepfold\/i18n\/ru\.json/);
  });
});
