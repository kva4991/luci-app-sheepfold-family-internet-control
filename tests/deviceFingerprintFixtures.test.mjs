/*
 * Запускает настоящий shell-classifier на обезличенных regression-отпечатках.
 * Тест не обращается в сеть и не использует домашние идентификаторы, но зависит
 * от POSIX shell и потому относится к долгой policySimulation-категории. §testwhy
 */
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const classifierPath = resolve(
  repoRoot,
  'package/luci-app-sheepfold-family-internet-control/root/usr/libexec/sheepfold/sheepfold-device-classifier',
);
const fixtures = JSON.parse(readFileSync(resolve(repoRoot, 'tests/fixtures/deviceFingerprints.json'), 'utf8'));

function classify(input) {
  const values = input || {};
  const result = spawnSync('sh', [
    classifierPath,
    values.name || '',
    values.ports || '',
    values.staticName || '',
    '',
    values.mac || '02:00:00:00:00:01',
    values.mdnsServices || '',
    values.mdnsProfile || '',
    values.ssdpProfile || '',
    values.wsdProfile || '',
  ], { encoding: 'utf8' });
  const parts = result.stdout.trimEnd().split('\t');

  assert.equal(result.status, 0, result.stderr || `classifier failed for ${values.name || 'fixture'}`);
  return {
    type: parts[0],
    confidence: Number(parts[1]),
    targetGroup: parts[2],
    autoScore: Number(parts[4]),
    evidenceCount: Number(parts[6]),
    hardDeny: parts[7] === '1',
  };
}

describe('device fingerprint regression fixtures', () => {
  for (const fixture of fixtures) {
    it(fixture.caseId, () => {
      const actual = classify(fixture.input);
      const expected = fixture.expected;

      assert.equal(actual.type, expected.type);
      if (Object.hasOwn(expected, 'targetGroup')) assert.equal(actual.targetGroup, expected.targetGroup);
      if (Object.hasOwn(expected, 'hardDeny')) assert.equal(actual.hardDeny, expected.hardDeny);
      if (Object.hasOwn(expected, 'minEvidenceCount')) {
        assert.ok(actual.evidenceCount >= expected.minEvidenceCount);
      }
      if (Object.hasOwn(expected, 'minAutoScore')) assert.ok(actual.autoScore >= expected.minAutoScore);
      if (Object.hasOwn(expected, 'maxAutoScore')) assert.ok(actual.autoScore <= expected.maxAutoScore);
    });
  }
});
