/*
 * Проверяет исправления внешнего shell-аудита без AdGuard/роутера: переносимость
 * awk между mawk и BusyBox, приватную модель детского статуса и единый журнал времени.
 * Статические границы и sh -n не доказывают применение UCI, firewall или реальную доставку API.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { describe, it } from 'node:test';

const root = 'package/luci-app-sheepfold-family-internet-control/root/usr/libexec/sheepfold';
const read = (name) => readFileSync(`${root}/${name}`, 'utf8');
const adguard = read('sheepfold-adguard');
const simMonitor = read('sheepfold-sim-monitor');
const clientStatus = read('sheepfold-api-client-status');
const timeControl = read('sheepfold-time-control');
const firewall = read('sheepfold-firewall');
const luciAction = read('sheepfold-luci-action');
const googleDrive = read('sheepfold-google-drive');
const yandexDisk = read('sheepfold-yandex-disk');

function functionBody(source, name, nextName) {
  const start = source.indexOf(`${name}()`);
  const end = source.indexOf(`\n${nextName}()`, start);
  assert.ok(start >= 0 && end > start, `Function boundary missing: ${name}`);
  return source.slice(start, end);
}

describe('portable shell and child-status audit corrections §awkport1', () => {
  it('keeps interval regex validation outside awk dialect differences', () => {
    const emitRules = functionBody(adguard, 'emit_domain_rules', 'generate_feed');
    const phoneHistory = functionBody(simMonitor, 'merge_phone_history', 'report_snapshot');
    const formattingAwk = emitRules.slice(emitRules.indexOf('\n\tawk'));

    assert.match(emitRules, /grep -E/);
    assert.match(emitRules, /\{2,63\}/);
    assert.doesNotMatch(formattingAwk, /\{2,63\}/);
    assert.match(phoneHistory, /length\(digits\) >= 3 && length\(digits\) <= 20/);
    assert.doesNotMatch(phoneHistory, /\{3,20\}/);
  });

  it('does not disclose the allowing rule and preserves safe registration explanations', () => {
    assert.doesNotMatch(clientStatus, /access_mode=|schedule_conflict=/);
    assert.doesNotMatch(clientStatus, /Интернет разрешён действующим расписанием|Интернет разрешён настройкой/);
    assert.match(clientStatus, /allow\|allowed\|enabled\|online\)[\s\S]*internet_state=enabled[\s\S]*message=""/);
    assert.match(clientStatus, /disabled[\s\S]*Интернет сейчас отключён семейными правилами/);
    assert.match(clientStatus, /device_not_configured\) message="Правила доступа для устройства не определены\."/);
  });

  it('attributes time changes and removes misleading dead shell alternatives', () => {
    assert.match(timeControl, /SHEEPFOLD_ACTION_ACTOR[\s\S]*logger -t sheepfold/);
    assert.match(timeControl, /log_event "Настройки времени сохранены:/);
    assert.doesNotMatch(firewall, /^NFT_TABLE=/m);
    assert.doesNotMatch(luciAction, /\*"not found"\*\|\*"was not found"\*/);
    assert.doesNotMatch(googleDrive, /\/tmp\/\*\|\/tmp\/sheepfold\/\*/);
    assert.doesNotMatch(yandexDisk, /\/tmp\/\*\|\/tmp\/sheepfold\/\*/);
  });

  it('keeps every changed shell module valid for sh parsing', () => {
    for (const name of [
      'sheepfold-adguard',
      'sheepfold-sim-monitor',
      'sheepfold-api-client-status',
      'sheepfold-time-control',
      'sheepfold-firewall',
      'sheepfold-luci-action',
      'sheepfold-google-drive',
      'sheepfold-yandex-disk',
    ]) {
      const result = spawnSync('sh', ['-n', `${root}/${name}`], { encoding: 'utf8' });
      assert.equal(result.status, 0, `${name}\n${result.stderr}`);
    }
  });
});
