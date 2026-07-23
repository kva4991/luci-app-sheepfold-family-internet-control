/*
 * Protects the versioned parent-management API, optimistic UCI transaction and
 * secret-minimizing response. Source-contract checks are appropriate because the
 * real UCI/firewall effects still require the live-router matrix. A passing result
 * does not prove physical Wi-Fi reconnect, wall-clock schedules or SDK packaging.
 * §apicon1 §pairtx1 §roadmap
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

const helperPath = 'package/luci-app-sheepfold-family-internet-control/root/usr/libexec/sheepfold/sheepfold-api-admin-config';
const dispatcherPath = 'package/luci-app-sheepfold-family-internet-control/root/www/cgi-bin/sheepfold-api';
const helper = readFileSync(helperPath, 'utf8');
const dispatcher = readFileSync(dispatcherPath, 'utf8');

test('parent-management shell entrypoints keep valid syntax and AI variant markers', () => {
  for (const path of [helperPath, dispatcherPath]) {
    const result = spawnSync('sh', ['-n', path], { encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr || result.error?.message);
  }
  assert.match(dispatcher, /# SHEEPFOLD_AI_BEGIN[\s\S]*AI_GATE/);
  assert.match(dispatcher, /\/ai-assistant\)/);
  assert.match(dispatcher, /\/api\/v1\/admin-config/);
});

test('dispatcher authenticates and bounds every management request before the helper', () => {
  const routes = dispatcher.slice(dispatcher.indexOf('/api/v1/admin-config'));
  assert.match(routes, /require_admin/);
  assert.match(routes, /enforce_rate_limit admin_read/);
  assert.match(routes, /enforce_rate_limit admin_write/);
  assert.match(dispatcher, /CONTENT_LENGTH/);
  assert.match(dispatcher, /16384/);
  assert.match(dispatcher, /SHEEPFOLD_AUTHENTICATED_ADMIN_LOGIN/);
  assert.match(dispatcher, /token_request_source_matches/);
  assert.match(dispatcher, /token_device_is_admin_paired/);
});

test('helper uses optimistic revision, one kernel lock and verified rollback', () => {
  assert.match(helper, /SCHEMA_VERSION=1/);
  assert.match(helper, /expectedRevision/);
  assert.match(helper, /revision_conflict/);
  assert.match(helper, /sheepfold_lock_acquire/);
  assert.match(helper, /trap 'transaction_cleanup \$\?' EXIT/);
  assert.match(helper, /-t "\$TX_UCI_DIR" -p "\$TX_UCI_DIR"/);
  assert.match(helper, /TX_RESTORE=1[\s\S]*commit sheepfold/);
  assert.match(helper, /schedule_state_is_valid/);
  assert.match(helper, /group_state_is_valid/);
  assert.match(helper, /config_verify_failed/);
  assert.match(helper, /restore_snapshot/);
});

test('helper excludes secrets and rejects administrator policy targets', () => {
  const adminProjection = helper.slice(
    helper.indexOf('json_administrator()'),
    helper.indexOf('wifi_enabled()'),
  );
  assert.doesNotMatch(adminProjection, /password_hash|pairing_code|token/);
  assert.match(helper, /administrator_schedule_forbidden/);
  assert.match(helper, /administrator_group_forbidden/);
  assert.match(helper, /protected_group_name/);
  assert.match(helper, /group_has_schedules/);
  assert.match(helper, /reserved_group_name/);
  assert.match(helper, /duplicate_schedule_target/);
});
