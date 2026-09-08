/*
 * Runs the real token reader, router-control and both CGI authorization boundaries.
 * Only paths, UCI/DHCP and protected-action side effects are isolated in .build.
 * Synthetic credentials never leave the fixture; close() removes all local state.
 * This is not a real uhttpd/TLS/flash/Android test or a concurrent UCI transaction.
 */
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createRouterFixture, runtimeRoot, testMac, testIp } from './routerRuntimeFixture.mjs';
import { installExecutable } from './controlRuntimeFixture.mjs';

export const authBearer = 'synthetic-bearer-never-a-real-credential';
export const authHash = createHash('sha256').update(`Parent:${authBearer}`).digest('hex');
export const authNow = '1700000000';
export const authRecord = (overrides = {}) => Object.entries({ login: 'Parent', device_id: '1',
  mac: testMac, issued_at: '1699999990', expires_at: '0', ...overrides })
  .filter(([, value]) => value !== null).map(([key, value]) => `${key}=${value}\n`).join('');
const posix = (value) => value.replaceAll('\\', '/').replace(/^([A-Za-z]):\//, (_, drive) => `/${drive.toLowerCase()}/`);
export const quote = (value) => `'${String(value).replaceAll("'", "'\\''")}'`;

export function createAuthFixture(record = authRecord(), extra = {}) {
  const fixture = createRouterFixture({
    'sheepfold.admin': 'administrator', 'sheepfold.admin.login': 'Parent',
    'sheepfold.phone': 'device', 'sheepfold.phone.admin_device': '1',
    'sheepfold.phone.id': '1', 'sheepfold.phone.mac': testMac,
    'sheepfold.phone.legacy_ids': 'D-0001', ...extra,
  });
  const persistent = join(fixture.root, 'persistent');
  const store = join(persistent, 'tokens');
  mkdirSync(store, { recursive: true });
  const recordPath = join(store, authHash);
  const actionsPath = join(fixture.root, 'protected-actions');
  writeFileSync(recordPath, record);
  writeFileSync(actionsPath, '');
  const relocate = (body) => body.replaceAll('/usr/libexec/sheepfold', posix(fixture.bin))
    .replaceAll('/etc/sheepfold', posix(persistent)).replaceAll('/tmp/sheepfold', posix(fixture.runtime))
    .replaceAll('/tmp/dhcp.leases', posix(join(fixture.root, 'leases')))
    .replaceAll('/proc/net/arp', posix(join(fixture.root, 'arp')));
  for (const name of ['sheepfold-token-common', 'sheepfold-router-control']) {
    installExecutable(fixture, name, relocate(readFileSync(join(runtimeRoot, name), 'utf8')));
  }
  installExecutable(fixture, 'test-auth-cgi', relocate(readFileSync(join(runtimeRoot,
    '../../../www/cgi-bin/sheepfold-api'), 'utf8')));
  installExecutable(fixture, 'sheepfold-home-network', '#!/bin/sh\nexit 0\n');
  installExecutable(fixture, 'date', `#!/bin/sh\n[ "$1" != +%s ] || { printf '${authNow}'; exit 0; }\nexec /bin/date "$@"\n`);
  installExecutable(fixture, 'sheepfold-router-control-legacy', `#!/bin/sh\nprintf '%s\\n' "$*" >> ${quote(posix(actionsPath))}\nprintf '[]\\n'\n`);
  const run = (command, bearer = authBearer, id = '1', mac = testMac) => fixture.run('sheepfold-router-control',
    command === 'authenticate-token' ? [command, bearer, testIp] : [command, bearer, id, mac]);
  const request = (name = 'test-auth-cgi', bearer = authBearer) => fixture.run(name, [], { env: {
    PATH_INFO: '/devices', HTTP_AUTHORIZATION: `Bearer ${bearer}`, SHEEPFOLD_AUTHENTICATED_ADMIN_LOGIN: '',
  } });
  return { ...fixture, runAuth: run, request, recordPath, actions: () => readFileSync(actionsPath, 'utf8') };
}

// The production digest function is unchanged here; only provider availability,
// provider stdout and return status are controlled (including OpenSSL fallback).
export function runDigestFixture(fixture, { provider = 'sha256sum', output = authHash + '  -', status = 0 } = {}) {
  const control = readFileSync(join(runtimeRoot, 'sheepfold-router-control'), 'utf8');
  const digest = control.slice(control.indexOf('sha256_value()'), control.indexOf('\ncheck_token()'));
  installExecutable(fixture, 'test-digest', `#!/bin/sh
set -eu
command() { [ "$1" = -v ] && [ "$2" = ${quote(provider)} ]; }
sha256sum() { cat >/dev/null; printf '%s\\n' ${quote(output)}; return ${Number(status)}; }
openssl() { cat >/dev/null; printf '%s\\n' ${quote(output)}; return ${Number(status)}; }
${digest}
sha256_value 'synthetic input'
`);
  return fixture.run('test-digest');
}
