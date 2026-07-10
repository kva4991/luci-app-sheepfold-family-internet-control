import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const securePath = resolve(
  repoRoot,
  'package/luci-app-sheepfold-family-internet-control/htdocs/luci-static/resources/view/sheepfold/overview-secure.js',
);

describe('Secure overview wrapper', () => {
  it('patches the imported overview instance and returns a view.extend delegate', () => {
    const source = readFileSync(securePath, 'utf8');

    assert.match(source, /require view\.sheepfold\.overview as overview/);
    assert.match(source, /var renderSettings = overview\.renderSettings/);
    assert.match(source, /overview\.renderSettings = function\(/);
    assert.match(source, /return view\.extend\(/);
    assert.doesNotMatch(source, /BaseView\.extend\(/);
    assert.doesNotMatch(source, /this\.super\(/);
  });
});