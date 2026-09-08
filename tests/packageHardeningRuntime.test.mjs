/*
 * Runs the real installation hardener against an isolated rootfs copy. Protects
 * delegation-aware checks after shared policy/token refactors. It may chmod and
 * create directories only inside .build; finally removes the copy. Success is
 * not an opkg/apk install, package transaction or real firewall traffic test.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const repo = resolve(import.meta.dirname, '..');
const rootSource = join(repo, 'package/luci-app-sheepfold-family-internet-control/root');
function check(mutate = () => {}) {
  const parent = join(repo, '.build/test-fixtures');
  mkdirSync(parent, { recursive: true });
  const root = mkdtempSync(join(parent, 'hardening-'));
  try {
    cpSync(rootSource, root, { recursive: true });
    const runtime = join(root, 'usr/libexec/sheepfold');
    const edit = (name, change) => { const path = join(runtime, name); writeFileSync(path, change(readFileSync(path, 'utf8'))); };
    mutate({ root, runtime, edit });
    const result = spawnSync('sh', [join(runtime, 'sheepfold-runtime-hardening'), root], { encoding: 'utf8', timeout: 15000 });
    assert.ifError(result.error);
    return result;
  } finally { rmSync(root, { recursive: true, force: true }); }
}

describe('Installed rootfs hardening after shared-helper refactors', () => {
  it('accepts the unmodified package root including the delegated access policy', () => {
    const result = check();
    assert.equal(result.status, 0, result.stderr);
  });
  for (const [name, mutate] of [
    ['missing shared policy', ({ runtime }) => rmSync(join(runtime, 'sheepfold-lib-access-policy'))],
    ['disconnected policy import', ({ edit }) => edit('sheepfold-client-status-effective', (s) => s.replace('. "$POLICY_COMMON"', ':'))],
    ['disconnected policy evaluator', ({ edit }) => edit('sheepfold-client-status-effective', (s) => s.replace('sheepfold_policy_evaluate "$device_section" "$client_mac"', ':'))],
    ['lost global block branch', ({ edit }) => edit('sheepfold-lib-access-policy', (s) => s.replaceAll('global_block', 'missing_reason'))],
    ['broken policy shell syntax', ({ edit }) => edit('sheepfold-lib-access-policy', (s) => s + '\nif then\n')],
    ['disconnected bound token reader', ({ edit }) => edit('sheepfold-router-control', (s) => s.replace('token_load_bound_file "$token_file"', ':'))],
  ]) it(`still rejects ${name}`, () => {
    const result = check(mutate);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /Sheepfold hardening check failed/);
  });
});
