// Проверяет общую form-urlencoded-границу и JSON-границу AI backend без сети и провайдера.
// Тест ловит повторное ручное экранирование и повреждённый ввод, но не доказывает наличие jshn на целевом роутере.
import { spawnSync } from 'node:child_process';
import { chmodSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const packageRoot = resolve(repoRoot, 'package/luci-app-sheepfold-family-internet-control');
const formHelperPath = resolve(packageRoot, 'root/usr/libexec/sheepfold/sheepfold-lib-form');
const helperPath = resolve(packageRoot, 'root/usr/libexec/sheepfold/sheepfold-lib-json');
const gatePath = resolve(packageRoot, 'root/usr/libexec/sheepfold/sheepfold-ai-gate');
const handlerPath = resolve(packageRoot, 'root/usr/libexec/sheepfold/sheepfold-ai-handler');
const hardeningPath = resolve(packageRoot, 'root/usr/libexec/sheepfold/sheepfold-runtime-hardening');
const variantsPath = resolve(repoRoot, 'scripts/sheepfold_variants.py');
const makefilePath = resolve(packageRoot, 'Makefile');

function posix(path) {
  return path.replaceAll('\\', '/');
}

function runFormGet(body) {
  return spawnSync(
    'sh',
    [
      '-c',
      '. "$1"; sheepfold_form_get message "$2"',
      'sheepfold-form-test',
      posix(relative(repoRoot, formHelperPath)),
      body,
    ],
    { cwd: repoRoot, encoding: 'utf8' },
  );
}

function executable(path, source) {
  writeFileSync(path, source, 'utf8');
  chmodSync(path, 0o755);
}

function runAiGate(body) {
  const fixtureParent = resolve(repoRoot, '.build', 'test-fixtures');
  mkdirSync(fixtureParent, { recursive: true });
  const fixtureRoot = mkdtempSync(resolve(fixtureParent, 'sheepfold-ai-gate-'));
  const rateDir = resolve(fixtureRoot, 'rate');
  const leases = resolve(fixtureRoot, 'dhcp.leases');
  const arp = resolve(fixtureRoot, 'arp');
  const jshn = resolve(fixtureRoot, 'jshn.sh');
  const uci = resolve(fixtureRoot, 'uci');
  const routerControl = resolve(fixtureRoot, 'router-control');
  const deviceId = resolve(fixtureRoot, 'device-id');
  const fixturePath = (path) => posix(relative(repoRoot, path));

  mkdirSync(rateDir);
  writeFileSync(leases, '0 AA:BB:CC:DD:EE:FF 192.168.1.20 parent *\\n', 'utf8');
  writeFileSync(arp, '', 'utf8');
  executable(jshn, [
    'json_init() { :; }',
    'json_add_string() { :; }',
    'json_add_boolean() { :; }',
    'json_add_object() { :; }',
    'json_add_array() { :; }',
    'json_close_object() { :; }',
    'json_close_array() { :; }',
    'json_add_double() { :; }',
    "json_dump() { printf '{\"error\":\"invalid_form_encoding\"}'; }",
    '',
  ].join('\n'));
  executable(uci, `#!/bin/sh
case "$*" in
  "-q show sheepfold") printf "sheepfold.device_parent=device\\n" ;;
  "-q get sheepfold.global.ai_enabled") printf "1\\n" ;;
  "-q get sheepfold.global.ai_rate_limit_requests") printf "20\\n" ;;
  "-q get sheepfold.global.ai_rate_limit_window_seconds") printf "3600\\n" ;;
  "-q get sheepfold.device_parent.mac") printf "AA:BB:CC:DD:EE:FF\\n" ;;
  "-q get sheepfold.device_parent.admin_device") printf "1\\n" ;;
  "-q get sheepfold.device_parent.legacy_ids") exit 1 ;;
  "-q get sheepfold.blocklist.mac") exit 1 ;;
  *) exit 1 ;;
esac
`);
  executable(routerControl, `#!/bin/sh
[ "$1" = check-token ] && [ "$2" = token ] && printf "ok\\n"
`);
  executable(deviceId, `#!/bin/sh
[ "$1" = ensure ] && [ "$2" = device_parent ] && printf "1\\n"
`);

  try {
    return spawnSync('sh', [posix(gatePath)], {
      cwd: repoRoot,
      input: body,
      encoding: 'utf8',
      env: {
        ...process.env,
        REMOTE_ADDR: '192.168.1.20',
        HTTP_AUTHORIZATION: 'Bearer token',
        SHEEPFOLD_AI_RATE_DIR: fixturePath(rateDir),
        SHEEPFOLD_JSON_COMMON: posix(relative(repoRoot, helperPath)),
        SHEEPFOLD_FORM_COMMON: posix(relative(repoRoot, formHelperPath)),
        SHEEPFOLD_JSHN_LIB: fixturePath(jshn),
        SHEEPFOLD_UCI_BIN: fixturePath(uci),
        SHEEPFOLD_ROUTER_CONTROL: fixturePath(routerControl),
        SHEEPFOLD_DEVICE_ID_HELPER: fixturePath(deviceId),
        SHEEPFOLD_DHCP_LEASES: fixturePath(leases),
        SHEEPFOLD_ARP_TABLE: fixturePath(arp),
      },
    });
  } finally {
    rmSync(fixtureRoot, { recursive: true, force: true });
  }
}

describe('AI JSON and form boundary', () => {
  it('decodes UTF-8, spaces, quotes and line breaks without eval or printf percent-b', () => {
    const result = runFormGet(
      'message=%D0%A2%D0%B5%D1%81%D1%82+%22x%22%0Aline&deviceId=7',
    );

    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout, 'Тест "x"\nline');
    const formHelper = readFileSync(formHelperPath, 'utf8');
    assert.match(formHelper, /LC_ALL=C awk/);
    assert.doesNotMatch(formHelper, /\beval\b/);
    assert.doesNotMatch(formHelper, /printf\s+['"]%b/);
  });

  it('rejects malformed percent escapes and NUL instead of decoding ambiguous input', () => {
    for (const body of ['message=bad%QZ', 'message=bad%2', 'message=bad%00tail']) {
      const result = runFormGet(body);
      assert.notEqual(result.status, 0, `Unexpectedly accepted ${body}`);
    }
  });

  it('uses the shared jshn boundary in both AI request stages', () => {
    const helper = readFileSync(helperPath, 'utf8');
    const formHelper = readFileSync(formHelperPath, 'utf8');
    const gate = readFileSync(gatePath, 'utf8');
    const handler = readFileSync(handlerPath, 'utf8');

    assert.match(helper, /\/usr\/share\/libubox\/jshn\.sh/);
    assert.match(helper, /sheepfold-lib-form/);
    assert.match(formHelper, /sheepfold_form_get\(\)/);
    assert.match(helper, /command -v json_add_double/);
    assert.match(helper, /sheepfold_gemini_payload\(\)/);
    assert.match(helper, /sheepfold_chat_payload\(\)/);
    assert.match(gate, /sheepfold_json_require/);
    assert.match(gate, /sheepfold_form_get/);
    assert.match(handler, /sheepfold_gemini_payload/);
    assert.match(handler, /sheepfold_chat_payload/);
    assert.doesNotMatch(handler, /^gemini_payload\(\)|^chat_payload\(\)/m);
    assert.doesNotMatch(gate, /json_escape\(\)|url_decode\(\)|form_get\(\)/);
    assert.doesNotMatch(handler, /json_escape\(\)|url_decode\(\)|form_get\(\)/);
    assert.doesNotMatch(handler, /payload=.*printf '\{/);
  });

  it('runs the authenticated AI gate with every supported form field', () => {
    const result = runAiGate([
      'deviceId=1',
      'clientRole=parent',
      'isAdministrator=1',
      'consentVersion=',
      'includeInfo=0',
      'includeLogs=0',
      'googleAccount=',
      'provider=',
      'model=',
    ].join('&'));

    assert.equal(result.status, 0, result.stderr || result.stdout);
  });

  it('rejects malformed late form fields before executing the request', () => {
    const result = runAiGate([
      'deviceId=1',
      'clientRole=parent',
      'isAdministrator=1',
      'consentVersion=',
      'includeInfo=bad%QZ',
    ].join('&'));

    assert.notEqual(result.status, 0);
    assert.match(result.stdout, /invalid_form_encoding/);
  });

  it('keeps the JSON helper AI-only and hardens shared parser permissions', () => {
    const variants = readFileSync(variantsPath, 'utf8');
    const hardening = readFileSync(hardeningPath, 'utf8');
    const makefile = readFileSync(makefilePath, 'utf8');

    assert.match(variants, /root\/usr\/libexec\/sheepfold\/sheepfold-lib-json/);
    assert.match(hardening, /JSON_COMMON=.*sheepfold-lib-json/);
    assert.match(hardening, /chmod 0644[^\n]*JSON_COMMON/);
    assert.match(makefile, /for library in[\s\S]*sheepfold-lib-json[\s\S]*chmod 0644/);
  });

  it('keeps all changed shell modules syntactically valid', () => {
    for (const path of [formHelperPath, helperPath, gatePath, handlerPath, hardeningPath]) {
      const result = spawnSync('sh', ['-n', path], { encoding: 'utf8' });
      assert.equal(result.status, 0, `${path}\n${result.stderr}`);
    }
  });
});
