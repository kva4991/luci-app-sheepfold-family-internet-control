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
    assert.match(accessScreen, /value = status\.nextAccessChangeTime/);
    assert.match(statusScreen, /text = changeTime/);
    assert.doesNotMatch(accessScreen, /time_remaining/);
    assert.doesNotMatch(statusScreen, /time_remaining/);
  });

  it('does not explain which router rule allowed internet access', () => {
    assert.match(accessScreen, /val showPolicyDetails = status\.internetState != "enabled"/);
    assert.match(accessScreen, /if \(showPolicyDetails\) \{\s*status\.accessMode/s);
    assert.match(accessScreen, /if \(showPolicyDetails\) \{\s*status\.message/s);
    assert.match(statusScreen, /val showPolicyDetails = !isEnabled/);
    assert.match(statusScreen, /if \(showPolicyDetails\) \{\s*status\.message/s);
  });
});
