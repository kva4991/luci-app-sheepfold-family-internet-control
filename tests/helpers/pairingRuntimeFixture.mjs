/*
 * Исполняет настоящие pairing CGI/helper и token-common с переносом всех путей
 * в удаляемую .build fixture. UCI, DHCP, журнал и применение firewall моделируются.
 * Это проверка отказов и границ сохранения, не libuci, TLS, телефона или power loss.
 */
import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync, readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { createRouterFixture, runtimeRoot, testMac, testIp } from './routerRuntimeFixture.mjs';
import { installExecutable } from './controlRuntimeFixture.mjs';

export const shellQuote = (value) => `'${String(value).replaceAll("'", "'\\''")}'`;
export const shellPath = (value) => value.replaceAll('\\', '/').replace(/^([A-Za-z]):\//, (_, drive) => `/${drive.toLowerCase()}/`);
const busybox = process.platform !== 'win32' && spawnSync('busybox', ['ash', '-c', 'true']).status === 0;
export const testHash = 'a'.repeat(64);
export const testCode = 'Valid+Code';
export const storedToken = (login = 'Parent') => `login=${login}\ndevice_id=1\nmac=${testMac}\nissued_at=1700000000\nexpires_at=0\n`;

export function createPairingFixture({ realBackend = false } = {}) {
  const fixture = createRouterFixture();
  const persistent = join(fixture.root, 'persistent');
  const store = join(persistent, 'tokens');
  const config = join(fixture.root, 'config');
  const writes = join(fixture.root, 'uci-writes.log');
  const calls = join(fixture.root, 'pair-calls.jsonl');
  for (const path of [store, config]) mkdirSync(path, { recursive: true });
  for (const path of [writes, calls]) writeFileSync(path, '');
  const configFile = join(config, 'sheepfold');
  writeFileSync(configFile, JSON.stringify({
    'sheepfold.admin': 'administrator', 'sheepfold.admin.login': 'Parent',
    'sheepfold.admin.display_name': 'Родитель', 'sheepfold.admin.pairing_code': testCode,
    'sheepfold.admin.pairing_code_expires': '2000000000',
    'sheepfold.child': 'device', 'sheepfold.child.id': '1', 'sheepfold.child.mac': testMac,
  }));
  const relocate = (source) => source
    .replaceAll('/usr/libexec/sheepfold', shellPath(fixture.bin))
    .replaceAll('/etc/sheepfold', shellPath(persistent))
    .replaceAll('/etc/config', shellPath(config))
    .replaceAll('/tmp/sheepfold', shellPath(fixture.runtime))
    .replaceAll('/tmp/dhcp.leases', shellPath(join(fixture.root, 'leases')))
    .replaceAll('/proc/net/arp', shellPath(join(fixture.root, 'arp')))
    .replace(/^#!\/bin\/sh/, busybox ? '#!/usr/bin/env -S busybox ash' : '#!/bin/sh');
  for (const name of ['sheepfold-pair-common', 'sheepfold-pair-device', 'sheepfold-api-pair',
    'sheepfold-token-common', 'sheepfold-lib-form']) {
    installExecutable(fixture, name, relocate(readFileSync(join(runtimeRoot, name), 'utf8')));
  }
  if (existsSync(join(runtimeRoot, 'sheepfold-pair-attempt-common'))) {
    installExecutable(fixture, 'sheepfold-pair-attempt-common',
      relocate(readFileSync(join(runtimeRoot, 'sheepfold-pair-attempt-common'), 'utf8')));
  }
  installExecutable(fixture, 'sheepfold-pair-diagnostics', 'pair_diag_event() { :; }\n');
  installExecutable(fixture, 'sheepfold-log', '#!/bin/sh\nexit 0\n');
  installExecutable(fixture, 'sheepfold-firewall', '#!/bin/sh\nexit 0\n');
  installExecutable(fixture, 'date', '#!/bin/sh\n[ "$1" != +%s ] || { printf 1700000000; exit 0; }\nexec /bin/date "$@"\n');
  const uciHelper = join(fixture.root, 'uciPairing.mjs');
  writeFileSync(uciHelper, `import {readFileSync, writeFileSync, appendFileSync, existsSync} from 'node:fs';
const config = ${JSON.stringify(configFile)}, log = ${JSON.stringify(writes)};
const args = process.argv.slice(2); let saved = '';
while (args[0]?.startsWith('-')) {
  const flag = args.shift();
  if (flag === '-t') saved = args.shift() + '/delta';
  else if (flag === '-p') args.shift();
  else if (flag !== '-q') throw new Error('unsupported fixture UCI flag ' + flag);
}
const [op, path = ''] = args;
const values = JSON.parse(readFileSync(saved && existsSync(saved) ? saved : config, 'utf8'));
const eq = path.indexOf('='), key = eq < 0 ? path : path.slice(0, eq), value = path.slice(eq + 1);
if (op === 'get') {
  if (key === 'system.@system[0].hostname') process.stdout.write('SyntheticRouter');
  else { if (!(key in values)) process.exit(1); process.stdout.write(values[key]); }
} else if (op === 'show') {
  process.stdout.write(Object.entries(values).filter(([k]) => k === key || k.startsWith(key + '.')).map(([k,v]) => k + '=' + v).join('\\n') + '\\n');
} else {
  appendFileSync(log, args.join(' ') + '\\n');
  if (op === 'set') values[key] = value;
  else if (op === 'delete') {
    if (!(key in values)) process.exit(1);
    for (const k of Object.keys(values)) if (k === key || k.startsWith(key + '.')) delete values[k];
  } else if (op === 'add_list') values[key] = [values[key], value].filter(Boolean).join(' ');
  else if (op !== 'commit') throw new Error('unsupported UCI fixture operation ' + op);
  writeFileSync(op === 'commit' ? config : (saved || config), JSON.stringify(values));
}
`);
  installExecutable(fixture, 'uci', `#!/bin/sh\nexec node ${shellQuote(shellPath(uciHelper))} "$@"\n`);
  const backendHelper = join(fixture.root, 'pairBackend.mjs');
  writeFileSync(backendHelper, `import {appendFileSync} from 'node:fs';
appendFileSync(${JSON.stringify(calls)}, JSON.stringify(process.argv.slice(2)) + '\\n');
process.stdout.write('paired=1\\nadmin_login=Parent\\nadmin_name=Parent\\ndevice_id=1\\ndevice_name=Synthetic\\nmac=${testMac}\\nip=${testIp}\\ntoken=' + 'b'.repeat(40) + '\\n');
`);
  installExecutable(fixture, 'sheepfold-router-control', realBackend
    ? `#!/bin/sh\n[ "$1" = pair-admin-device ] || exit 2\nshift\nexec ${shellQuote(shellPath(join(fixture.bin, 'sheepfold-pair-device')))} "$@"\n`
    : `#!/bin/sh\nexec node ${shellQuote(shellPath(backendHelper))} "$@"\n`);
  function runShell(body, options = {}) {
    installExecutable(fixture, 'test-pair-shell', '#!/bin/sh\nset -eu\n' + relocate(body));
    return fixture.run('test-pair-shell', [], options);
  }
  return { ...fixture, store, configFile, relocate, runShell,
    values: () => JSON.parse(readFileSync(configFile, 'utf8')),
    writes: () => readFileSync(writes, 'utf8'),
    pairCalls: () => readFileSync(calls, 'utf8').trim().split('\n').filter(Boolean).map((line) => JSON.parse(line)),
    tokens: () => readdirSync(store).filter((name) => !name.startsWith('.')),
    leakedTemps: () => readdirSync(store).filter((name) => name.startsWith('.') || name.includes('.tmp.')),
    request: (body, env = {}) => fixture.run('sheepfold-api-pair', [], {
      input: body, env: { REQUEST_METHOD: 'POST', CONTENT_LENGTH: String(Buffer.byteLength(body)),
        HTTP_X_SHEEPFOLD_CLIENT: 'android-admin-v1', ...env },
    }),
    fileExists: (path) => existsSync(join(fixture.root, path)),
  };
}
