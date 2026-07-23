/*
 * Защищает сквозной контракт времени следующего реального изменения доступа:
 * evaluator -> router status -> публичный child API -> Kotlin model -> два экрана.
 * Тест не проверяет часовой пояс живого роутера и визуальную геометрию Android.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

const read = (path) => readFileSync(path, 'utf8');
const evaluator = read('package/luci-app-sheepfold-family-internet-control/root/usr/libexec/sheepfold/sheepfold-schedule-evaluator');
const effectiveStatus = read('package/luci-app-sheepfold-family-internet-control/root/usr/libexec/sheepfold/sheepfold-client-status-effective');
const publicStatus = read('package/luci-app-sheepfold-family-internet-control/root/usr/libexec/sheepfold/sheepfold-api-client-status');
const model = read('android-child/app/src/main/java/com/example/sheepfoldchild/data/ClientStatusResponse.kt');
const repository = read('android-child/app/src/main/java/com/example/sheepfoldchild/data/ClientStatusRepository.kt');
const accessScreen = read('android-child/app/src/main/java/com/example/sheepfoldchild/ui/AccessInfoScreen.kt');
const statusScreen = read('android-child/app/src/main/java/com/example/sheepfoldchild/ui/ChildStatusScreen.kt');

function publicOutput(source) {
  const start = source.indexOf('header_json "200 OK"');
  assert.ok(start >= 0);
  return source.slice(start);
}

describe('child next access change time', () => {
  it('computes only boundaries that alter the effective allow or block result', () => {
    assert.match(evaluator, /schedule_boundaries/);
    assert.match(evaluator, /next_access_change_time/);
    assert.match(evaluator, /candidate_effective/);
    assert.match(evaluator, /\[ "\$candidate_effective" = "\$current_effective" \]/);
    assert.match(effectiveStatus, /sheepfold-schedule-evaluator "\$device_section" "\$fallback_status"/);
    assert.match(effectiveStatus, /print_kv next_change_time/);
  });

  it('passes a validated HH:mm value through the child API', () => {
    assert.match(publicStatus, /"nextAccessChangeTime"/);
    assert.match(model, /val nextAccessChangeTime: String\?/);
    assert.match(repository, /nextAccessChangeTime = value\.optString\("nextAccessChangeTime"\)/);
    assert.ok(repository.includes('Regex("^(?:[01]\\\\d|2[0-3]):[0-5]\\\\d$")'));
  });

  it('shows the exact time without claiming which action will happen', () => {
    assert.match(accessScreen, /status\.nextAccessChangeTime\?\.let \{ changeTime/);
    assert.match(accessScreen, /value = changeTime/);
    assert.match(statusScreen, /text = changeTime/);
    assert.doesNotMatch(accessScreen, /time_remaining/);
    assert.doesNotMatch(statusScreen, /time_remaining/);
  });

  it('does not transport or render the rule that allowed or denied access', () => {
    const output = publicOutput(publicStatus);
    assert.doesNotMatch(output, /"accessMode"|"scheduleConflict"|"personalGroupName"/);
    assert.doesNotMatch(model, /\baccessMode\b|\bscheduleConflict\b/);
    assert.doesNotMatch(repository, /accessMode = value\.optString/);
    assert.doesNotMatch(accessScreen, /status\.accessMode|access_mode_label/);
    assert.match(accessScreen, /val showExplanation = status\.internetState != "enabled"/);
    assert.match(statusScreen, /val showExplanation = !isEnabled/);
    assert.match(output, /if \[ "\$internet_state" = enabled \][\s\S]*"message":null/);
  });
});
