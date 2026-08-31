/*
 * Исполняет настоящий shell/awk агрегатор detector на маленьких TSV-fixtures:
 * hostname, пустые поля и выбор live IP. Не запускает сеть/UCI/nmap, временные
 * файлы удаляются; успех не доказывает достоверность сетевых сигналов. §devpas1 §testwhy
 */
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { applyTestEnvironment, shellTestPath } from '../tools/quality/testEnvironment.mjs';

const root = process.cwd();
applyTestEnvironment(root);
const source = readFileSync('package/luci-app-sheepfold-family-internet-control/root/usr/libexec/sheepfold/sheepfold-device-detector', 'utf8');
const start = source.indexOf('aggregate_router_devices() {');
const end = source.indexOf('\nscan_ports() {', start);
assert.ok(start >= 0 && end > start);
const aggregate = source.slice(start, end);

function run(rows, parse = false, scriptTail = '') {
  const directory = mkdtempSync(join(tmpdir(), 'deviceInventory-'));
  try {
    const file = join(directory, 'observations.tsv');
    writeFileSync(file, rows.map(row => row.join('\t')).join('\n') + '\n');
    const read = parse ? ` | while IFS="$(printf '\\t')" read -r mac ip name sources; do
      printf '%s|%s|%s|%s\\n' "$mac" "$ip" "$name" "$sources"
    done` : '';
    const result = spawnSync('sh', ['-s', '--', shellTestPath(file, { cwd: root })], {
      cwd: root, input: `${aggregate}\nRAW_FILE="$1"\n${scriptTail || `aggregate_router_devices${read}`}\n`,
      encoding: 'utf8', timeout: 5_000,
    });
    assert.ifError(result.error);
    assert.equal(result.status, 0, result.stderr);
    return result.stdout.trim().split('\n');
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

test('reserved source names are filtered case-insensitively without losing real hostnames', () => {
  const output = run([
    ['02:00:00:00:00:01', '192.168.4.10', 'DHCP', 'dhcp'],
    ['02:00:00:00:00:01', '192.168.4.10', 'Kitchen-Switch', 'static'],
    ['02:00:00:00:00:01', '192.168.4.10', '*', 'neighbor'],
    ['02:00:00:00:00:02', '192.168.4.11', 'ARP', 'dhcp'],
    ['02:00:00:00:00:02', '192.168.4.11', 'STATIC', 'static'],
  ]);
  assert.deepEqual(output, [
    '02:00:00:00:00:01\t192.168.4.10\tKitchen-Switch\tdhcp,static,neighbor',
    '02:00:00:00:00:02\t192.168.4.11\t*\tdhcp,static',
  ]);
});

test('collectors are unnecessary when the selected target is offline or blocklisted', () => {
  const online = source.slice(source.indexOf('sources_confirm_online() {'), source.indexOf('\nsignal_file_for_mac() {'));
  const eligible = source.slice(source.indexOf('has_detection_targets() {'), source.indexOf('\nscan_devices() {'));
  const check = priority => `${online}\n${eligible}
    valid_mac() { [ -n "$1" ]; }
    section_for_mac() { printf '%s' "$1"; }
    device_is_blocklisted() { [ "$2" = '02:00:00:00:00:02' ]; }
    if has_detection_targets "$RAW_FILE" '${priority}'; then printf 'yes\\n'; else printf 'no\\n'; fi`;
  const rows = [
    ['02:00:00:00:00:01', '192.168.4.10', '*', 'dhcp,static'],
    ['02:00:00:00:00:02', '192.168.4.11', '*', 'wifi'],
    ['02:00:00:00:00:03', '192.168.4.12', '*', 'neighbor,wifi'],
  ];
  assert.deepEqual(run(rows, false, check('02:00:00:00:00:01')), ['no']);
  assert.deepEqual(run(rows, false, check('02:00:00:00:00:02')), ['no']);
  assert.deepEqual(run(rows, false, check('02:00:00:00:00:03')), ['yes']);
  assert.deepEqual(run(rows, false, check('')), ['yes']);
  assert.deepEqual(run(rows.slice(0, 2), false, check('')), ['no']);
  const scan = source.slice(source.indexOf('scan_devices() {'));
  assert.ok(scan.indexOf('aggregate_router_devices >') < scan.indexOf('if has_detection_targets'));
  assert.ok(scan.indexOf('if has_detection_targets') < scan.indexOf('collect_mdns'));
  assert.match(source, /\[ "\$ip" != "\*" \] \|\| ip=""/);
  assert.match(source, /\[ "\$effective_mode" = "full" \] && \[ -n "\$ip" \]/);
});

test('a Wi-Fi association without an address retains its online source through shell read', () => {
  assert.deepEqual(run([['02:00:00:00:00:01', '', '*', 'wifi']], true), [
    '02:00:00:00:00:01|*|*|wifi',
  ]);
});

test('a missing observed hostname preserves the stored name but not reserved legacy labels', () => {
  const process = source.slice(source.indexOf('process_detected_device() {'), source.indexOf('\nhas_detection_targets() {'));
  const reserved = source.slice(source.indexOf('is_reserved_device_name() {'), source.indexOf('\nappend_router_devices() {'));
  const script = `${process}\n${reserved}
    section_for_mac() { printf device1; }
    backfill_first_seen_at() { :; }
    uci() { printf '%s' "$stored_name"; }
    device_is_blocklisted() { return 0; }
    write_blocklisted_device_observation() { printf 'name=%s\\n' "$3"; }
    stored_name=Kitchen-Switch
    process_detected_device 02:00:00:00:00:01 '*' '*' wifi 100 reduced 70 1
    stored_name=ARP
    process_detected_device 02:00:00:00:00:01 '*' '*' wifi 100 reduced 70 1`;
  assert.deepEqual(run([], false, script), ['name=Kitchen-Switch', 'name=']);
});

test('current LAN evidence overrides stale lease IP without duplicating sources', () => {
  const output = run([
    ['02:00:00:00:00:01', '192.168.4.10', 'Phone', 'dhcp'],
    ['02:00:00:00:00:01', '192.168.4.25', '*', 'neighbor,wifi'],
    ['02:00:00:00:00:01', '192.168.4.10', 'Phone', 'static'],
    ['02:00:00:00:00:01', '', '*', 'wifi'],
  ]);
  assert.deepEqual(output, ['02:00:00:00:00:01\t192.168.4.25\tPhone\tdhcp,neighbor,wifi,static']);
});
