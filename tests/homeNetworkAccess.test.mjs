/*
 * Исполняет production shell-правила домашнего доступа на синтетическом netifd/ARP.
 * Не меняет сеть хоста. Реальную сборку nft, TLS/root isolation и переход телефона
 * между двумя Wi-Fi проверяет отдельный живой стенд (§homen01).
 */
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { test, after } from 'node:test';
import vm from 'node:vm';
import { shellTestPath } from '../tools/quality/testEnvironment.mjs';

const root = process.cwd();
const packageRoot = 'package/luci-app-sheepfold-family-internet-control/';
const read = (path) => readFileSync(resolve(root, packageRoot, path), 'utf8');
mkdirSync(resolve(root, '.build'), { recursive: true });
const fixture = mkdtempSync(resolve(root, '.build/home-network-test-'));
after(() => rmSync(fixture, { recursive: true, force: true }));
const script = join(fixture, 'home-network.sh');
writeFileSync(script, read('root/usr/libexec/sheepfold/sheepfold-home-network')
  .split('\ncase "${1:-status}" in')[0]
  .replace('. /usr/share/libubox/jshn.sh', ':'));

const stubs = `
json_load() { :; }
json_select() { :; }
json_get_keys() { export "$1=1"; }
json_get_var() {
  case "$2" in
    up) export "$1=1" ;; proto) export "$1=$test_proto" ;;
    l3_device) export "$1=$test_device" ;; address) export "$1=$test_address" ;;
    mask) export "$1=$test_prefix" ;; target) export "$1=0.0.0.0" ;;
    nexthop) export "$1=$test_gateway" ;;
  esac
  [ "$1" != mask ] || mask=0
}
ubus() { printf '{}'; }
ip() { printf '%s dev %s lladdr %s REACHABLE\\n' "$5" "$test_device" "$test_mac"; }
uci() { case "$*" in *enabled) echo 1 ;; *fingerprint) echo "$test_saved" ;; *app_port) echo 5201 ;; *home_network_global) echo home_network ;; esac; }
test_proto=dhcp; test_device=wan; test_address=192.168.2.179; test_prefix=24
test_gateway=192.168.2.1; test_mac=02:11:22:33:44:55; test_saved=''
`;

function run(body) {
  const result = spawnSync('sh', ['-c', `. '${shellTestPath(script)}'\n${stubs}\n${body}`], {
    cwd: root, encoding: 'utf8', timeout: 10000,
  });
  assert.ifError(result.error);
  return result;
}

test('homeNetworkAcceptsOnlyPrivateDirectWanWithARealGateway', () => {
  assert.equal(run('read_candidate && test -n "$candidate"').status, 0);
  for (const mutation of [
    'test_proto=pppoe', 'test_device="wan;echo unsafe"', 'test_address=8.8.8.8',
    'test_address=100.64.1.2', 'test_address=127.0.0.1', 'test_prefix=8',
    'test_prefix=33', 'test_gateway=192.168.3.1', 'test_mac=missing',
    'test_address=192.168.002.179',
  ]) assert.notEqual(run(`${mutation}; read_candidate`).status, 0, mutation);
});

test('homeNetworkTrustDoesNotFollowANewAddressInterfaceOrGateway', () => {
  for (const mutation of [
    '', 'test_address=192.168.2.180', 'test_device=eth1', 'test_prefix=25',
    'test_gateway=192.168.2.2', 'test_mac=02:11:22:33:44:66',
  ]) {
    const result = run(`read_candidate; test_saved="$candidate"; ${mutation || ':'}; trusted_candidate`);
    assert.equal(result.status === 0, mutation === '', mutation);
  }
});

test('homeNetworkChecksSourceBeforeAnyChildReportOrAdminAction', () => {
  for (const [source, path, expected] of [
    ['192.168.2.45', '/devices', true], ['192.168.2.1', '/devices', false],
    ['192.168.3.45', '/devices', false], ['192.168.2.179', '/pair', false],
    ['192.168.2.45', '/sim-report', false], ['192.168.2.45', '/client-status', false],
    ['192.168.2.45', '/wifi-network-report', false], ['192.168.2.45', '/access-request', false],
    ['192.168.2.45', '/pair', false], ['192.168.2.45', '/ai-assistant', false],
    ['192.168.2.45', '/future-child-action', false], ['192.168.2.45', '/admin-config/wifi/save', true],
  ]) {
    const result = run(`STATE='${shellTestPath(fixture)}'; touch "$STATE/running"
source_is_lan() { return 1; }
read_candidate; test_saved="$candidate"
neighbor_mac() { case "$1" in 192.168.2.1) echo "$test_mac" ;; *) echo 02:aa:bb:cc:dd:ee ;; esac; }
check_request '${source}' '${path}'`);
    assert.equal(result.status === 0, expected, `${source} ${path}: ${result.stderr}`);
  }
  assert.notEqual(run(`STATE='${shellTestPath(fixture)}'; touch "$STATE/running"
source_is_lan() { return 1; }; read_candidate; test_saved="$candidate"
check_request 192.168.2.45 /devices`).status, 0, 'a gateway MAC is never a phone');
});

test('homeNetworkRulesAreAppliedWithManagementBlocksInOneTransaction', () => {
  const firewall = read('root/usr/libexec/sheepfold/sheepfold-firewall');
  const nft = read('root/usr/share/nftables.d/table-pre/30-sheepfold.nft');
  assert.ok(nft.lastIndexOf('jump sheepfold_home_input') > nft.indexOf('comment "Sheepfold router access block"'));
  assert.match(firewall, /write_add_command mac sheepfold_management_block_macs[\s\S]*printf '%s\\n' "\$home_rules"[\s\S]*> "\$batch"/);
  assert.match(firewall, /home-refresh\) sync_sets 0 1/);
  assert.match(read('root/usr/libexec/sheepfold/sheepfold-home-firewall'), /SHEEPFOLD_FIREWALL_RELOADING/);
  const init = read('root/etc/init.d/sheepfold');
  assert.match(init, /-D -h \/tmp\/sheepfold\/api-www/);
  assert.doesNotMatch(init, /-h \/www\s/);
  assert.match(init, /sheepfold-home-network stop/);
  assert.match(read('root/etc/hotplug.d/iface/90-sheepfold-home-network'), /INTERFACE:-.*wan/);
});

test('homeNetworkBuildsOnlyOneScopedApiRuleAndClosesOnChangedContext', () => {
  const result = run(`STATE='${shellTestPath(fixture)}'; touch "$STATE/running"
read_candidate; test_saved="$candidate"; firewall_rules
test_address=192.168.2.180; firewall_rules`);
  assert.equal(result.status, 0, result.stderr);
  assert.equal((result.stdout.match(/add rule/g) || []).length, 1);
  assert.match(result.stdout, /iifname "wan" ip saddr 192\.168\.2\.179\/24 ip daddr 192\.168\.2\.179 tcp dport 5201/);
  assert.equal(result.stdout.trim().split('\n').at(-1), 'flush chain inet fw4 sheepfold_home_input');
});

test('homeNetworkCgiRequiresBothSourceApprovalAndTheExistingAdminToken', () => {
  const helpers = join(fixture, 'cgi-helpers');
  mkdirSync(helpers);
  const helper = (name, body) => writeFileSync(join(helpers, name), `#!/bin/sh\n${body}\n`, { mode: 0o755 });
  helper('sheepfold-token-common', ':');
  // Квота проверяется настоящим limiter в apiRateLimitRuntime, здесь — только source/auth.
  helper('sheepfold-api-rate-limit', 'exit 0');
  helper('sheepfold-home-network', `case "$1" in
check-request) [ "$TEST_SOURCE_DENIED" != 1 ] ;;
endpoints) printf 'https://192.168.4.1:5201/cgi-bin/sheepfold-api,https://192.168.2.179:5201/cgi-bin/sheepfold-api' ;;
esac`);
  helper('sheepfold-router-control', `printf 'auth\\n' >> "$TEST_TRACE"
[ "$1" = authenticate-token ] && [ "$2" = synthetic-valid-token ] || exit 1
printf 'login=testParent\\ndevice_id=test-device\\nmac=02:00:00:00:00:11\\n'`);
  helper('sheepfold-api-legacy', `[ "$SHEEPFOLD_AUTHENTICATED_ADMIN_DEVICE_ID" = test-device ] || exit 1
printf 'legacy\\n' >> "$TEST_TRACE"
printf 'Status: 200 OK\\r\\nContent-Type: application/json\\r\\n\\r\\n{"ok":true}\\n'`);
  const cgi = join(fixture, 'api.cgi');
  const trace = join(fixture, 'cgi.trace');
  writeFileSync(cgi, read('root/www/cgi-bin/sheepfold-api')
    .replaceAll('/usr/libexec/sheepfold/', `${shellTestPath(helpers)}/`));
  for (const [path, method, bearer, denied, status, steps] of [
    ['/devices', 'GET', '', '0', '401 Unauthorized', ''],
    ['/devices', 'GET', 'synthetic-wrong-token', '0', '401 Unauthorized', 'auth\n'],
    ['/devices', 'GET', 'synthetic-valid-token', '1', '403 Forbidden', ''],
    ['/global-block', 'POST', 'synthetic-valid-token', '1', '403 Forbidden', ''],
    ['/devices', 'GET', 'synthetic-valid-token', '0', '200 OK', 'auth\nlegacy\n'],
    ['/global-block', 'POST', 'synthetic-valid-token', '0', '200 OK', 'auth\nlegacy\n'],
  ]) {
    writeFileSync(trace, '');
    const result = spawnSync('sh', [shellTestPath(cgi)], {
      cwd: root, encoding: 'utf8', timeout: 10000,
      env: { ...process.env, PATH_INFO: path, REQUEST_METHOD: method, REMOTE_ADDR: '192.168.2.45',
        HTTP_AUTHORIZATION: bearer ? `Bearer ${bearer}` : '', TEST_SOURCE_DENIED: denied, TEST_TRACE: shellTestPath(trace) },
    });
    assert.ifError(result.error);
    assert.equal(result.status, 0, result.stderr);
    assert.ok(result.stdout.includes(`Status: ${status}`), result.stdout);
    assert.equal(readFileSync(trace, 'utf8'), steps);
    // Git Bash на Windows может нормализовать CRLF при передаче stdout дочернего процесса
    const [headers, body] = result.stdout.replace(/\r\n/g, '\n').split('\n\n');
    assert.equal(headers.includes('X-Sheepfold-Home-Endpoints:'), status === '200 OK');
    assert.equal(JSON.parse(body).ok, status === '200 OK');
  }
});

test('homeNetworkUiDoesNotGrantAccessUntilExplicitSave', async () => {
  const nodes = [];
  const calls = [];
  let saver;
  const status = { enabled: false, state: 'available', address: '192.168.2.179', prefix: '24', gateway: '192.168.2.1', candidate: 'a'.repeat(64) };
  const model = vm.runInNewContext(`(function () { ${read('htdocs/luci-static/resources/sheepfold/features/settings/home-network.js')} })()`, {
    baseclass: { extend: (value) => value }, _: (value) => value, ui: {},
    E(tag, attrs, children) {
      const node = { tag, attrs, children, disabled: Boolean(attrs?.disabled),
        replaceChildren(...values) { this.children = values; },
        querySelector() { return this.children.find((child) => child.attrs?.value === '1'); },
      };
      nodes.push(node);
      return node;
    },
  });
  model.render({
    icon: () => null, changed: () => {}, registerSaver: (value) => { saver = value; },
    run: async (args) => {
      calls.push([...args]);
      return { code: 0, stdout: JSON.stringify(args[0] === 'home-network-configure' ? { ...status, enabled: true, state: 'trusted' } : status) };
    },
  });
  await new Promise((done) => setImmediate(done));
  const select = nodes.find((node) => node.tag === 'select');
  assert.equal(saver.isChanged(), false);
  select.value = '1';
  select.attrs.change();
  assert.deepEqual(calls, [['home-network-status']]);
  assert.equal(saver.isChanged(), true);
  await saver.save();
  saver.accept();
  assert.deepEqual(calls[1], ['home-network-configure', '1', status.candidate]);
  assert.equal(saver.isChanged(), false);
});
