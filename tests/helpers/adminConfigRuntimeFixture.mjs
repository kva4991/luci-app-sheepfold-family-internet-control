/*
 * Настоящие admin-config CLI/CGI и библиотеки с изолированной моделью UCI.
 * Модель поддерживает отдельную staging-запись, commit, чтение и управляемые
 * отказы; это не libuci, flash, uhttpd или проверка физического Wi-Fi.
 */
import { spawnSync } from 'node:child_process';
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { shellTestPath } from '../../tools/quality/testEnvironment.mjs';

const repoRoot = resolve(import.meta.dirname, '../..');
const sourceRoot = process.env.SHEEPFOLD_ADMIN_TEST_SOURCE || repoRoot;
const packageRoot = join(sourceRoot, 'package/luci-app-sheepfold-family-internet-control/root');
const hasBusybox = spawnSync('busybox', ['ash', '-c', 'true']).status === 0;
const hasFlock = spawnSync('sh', ['-c', 'command -v flock >/dev/null 2>&1']).status === 0;
const pathDelimiter = process.platform === 'win32' ? ';' : ':';
const python = process.env.PYTHON_EXECUTABLE || (process.platform === 'win32' ? 'python' : 'python3');
export const quote = (value) => `'${String(value).replaceAll("'", "'\\''")}'`;
export const initialConfig = {
  'sheepfold.global': 'global', 'sheepfold.global.bedtime': '21:00',
  'sheepfold.global.sim_change_notifications': 'new_only',
  'sheepfold.global.child_wifi_network_notifications': 'off',
  'sheepfold.family': 'group', 'sheepfold.family.name': 'Family',
  'sheepfold.family.description': 'Test group', 'sheepfold.family.color': '#123456',
  'sheepfold.family.personal': '0', 'sheepfold.family.protected': '0',
  'sheepfold.family.allowlist_only': '0',
  'sheepfold.child': 'device', 'sheepfold.child.id': '42',
  'sheepfold.child.group': 'Family', 'sheepfold.child.mac': '02:00:00:00:00:42',
  'sheepfold.child.admin_device': '0',
  'sheepfold.daily': 'schedule', 'sheepfold.daily.name': 'Evening',
  'sheepfold.daily.description': 'Schedule', 'sheepfold.daily.enabled': '1',
  'sheepfold.daily.action': 'block', 'sheepfold.daily.target_type': 'group',
  'sheepfold.daily.targets': ['family'], 'sheepfold.daily.weekdays': ['mon'],
  'sheepfold.daily.time_ranges': ['21:00-22:00'],
};
const wirelessConfig = {
  'wireless.radio0': 'wifi-device', 'wireless.radio0.channel': 'auto', 'wireless.radio0.band': '2g',
  'wireless.default_radio0': 'wifi-iface', 'wireless.default_radio0.device': 'radio0',
  'wireless.default_radio0.mode': 'ap', 'wireless.default_radio0.ssid': 'Test network',
  'wireless.default_radio0.key': 'synthetic-password', 'wireless.default_radio0.encryption': 'psk2',
};

export function createAdminFixture(extra = {}, wirelessExtra = {}) {
  const parent = join(repoRoot, '.build/test-fixtures');
  mkdirSync(parent, { recursive: true });
  const root = mkdtempSync(join(parent, 'admin-config-'));
  const bin = join(root, 'bin'), configs = join(root, 'config'), cwd = join(root, 'cwd');
  const runtime = join(root, 'runtime'), actions = join(root, 'actions');
  const shellPath = (value) => shellTestPath(value, { cwd, allowedRoot: root });
  for (const dir of [bin, configs, cwd, runtime]) mkdirSync(dir, { recursive: true });
  writeFileSync(join(configs, 'sheepfold'), JSON.stringify({ ...initialConfig, ...extra }));
  writeFileSync(join(configs, 'wireless'), JSON.stringify({ ...wirelessConfig, ...wirelessExtra }));
  writeFileSync(actions, '');
  const put = (name, body) => { const file = join(bin, name); writeFileSync(file, body); chmodSync(file, 0o755); };
  for (const name of ['sheepfold-api-admin-config', 'sheepfold-lock-common', 'sheepfold-lib-form',
    ...['model', 'common', 'groups', 'schedules', 'wifi', 'notifications', 'devices'].map((name) => `sheepfold-lib-admin-config-${name}`)]) {
    put(name, readFileSync(join(packageRoot, 'usr/libexec/sheepfold', name), 'utf8'));
  }
  put('test-admin-cgi', readFileSync(join(packageRoot, 'www/cgi-bin/sheepfold-api'), 'utf8')
    .replaceAll('/usr/libexec/sheepfold', shellPath(bin)).replaceAll('/tmp/sheepfold', shellPath(runtime)));
  put('sheepfold-token-common', '# Authentication replaced only at this fixture boundary.\n');
  put('sheepfold-home-network', '#!/bin/sh\nexit 0\n');
  put('sheepfold-api-rate-limit', '#!/bin/sh\nexit 0\n');
  put('sheepfold-log', '#!/bin/sh\nexit 0\n');
  // Git Bash on Windows has no flock. These fixtures do not test contention;
  // lockCommon.test.mjs keeps the real helper contract and skips only its live
  // contention scenario when the host lacks the package.
  if (!hasFlock) put('flock', '#!/bin/sh\nexit 0\n');
  put('sheepfold-router-control', `#!/bin/sh
case "$1" in authenticate-token) printf 'login=Parent\\ndevice_id=1\\nmac=02:00:00:00:00:11\\n'; exit 0 ;; esac
printf 'runtime %s\\n' "$*" >> ${quote(shellPath(actions))}
exit 0\n`);
  put('wifi', `#!/bin/sh\nprintf 'wifi %s\\n' "$*" >> ${quote(shellPath(actions))}\nexit 0\n`);
  put('uci-model.py', `#!/usr/bin/env python3
import json, os, sys
from pathlib import Path
args=sys.argv[1:]; stage=None
while args and args[0].startswith('-'):
    opt=args.pop(0)
    if opt in ('-t','-p','-P','-c'):
        val=args.pop(0)
        if opt=='-t': stage=Path(val)
op=args[0]; expr=args[1] if len(args)>1 else ''
key, sep, value=expr.partition('='); config=key.split('.')[0]
file=Path(${JSON.stringify(configs)}) / config
staged=(stage/(config+'.json')) if stage else None
readfile=staged if staged and staged.exists() else file
if not readfile.exists(): sys.exit(1)
values=json.loads(readfile.read_text(encoding='utf-8'))
text=lambda v: ' '.join(v) if isinstance(v,list) else str(v)
if op=='show':
    fault=os.environ.get('TEST_FAIL_SHOW')==config
    if not fault or os.environ.get('TEST_PARTIAL_SHOW')=='1':
        for k,v in values.items():
            if k==key or k.startswith(key+'.'):
                fields=v if isinstance(v,list) else [v]
                formatted=' '.join(repr(s) for s in fields) if k.count('.')>1 else str(v)
                print(k+'='+formatted)
    sys.exit(1 if fault else 0)
if op=='changes':
    sys.exit(0)
if op=='get':
    if key not in values: sys.exit(1)
    sys.stdout.write(text(values[key])); sys.exit(0)
with open(${JSON.stringify(actions)},'a',encoding='utf-8') as log: log.write(op+' '+expr+'\\n')
if op=='set': values[key]=value
elif op=='add_list':
    previous=values.get(key,[])
    if not isinstance(previous,list): previous=[previous]
    values[key]=previous+[value]
elif op=='del_list':
    previous=values.get(key,[])
    if not isinstance(previous,list): previous=[previous]
    if value not in previous: sys.exit(1)
    values[key]=[v for v in previous if v!=value]
elif op=='delete':
    matching=[k for k in values if k==key or k.startswith(key+'.')]
    if not matching: sys.exit(1)
    for k in matching: del values[k]
elif op!='commit': raise RuntimeError('Unsupported fixture operation: '+op)
target=file if op=='commit' or not staged else staged
target.write_text(json.dumps(values, ensure_ascii=False), encoding='utf-8')
`);
  put('uci', `#!/bin/sh\nexec ${quote(python)} -S ${quote(shellPath(join(bin, 'uci-model.py')))} "$@"\n`);
  if (process.env.SHEEPFOLD_ADMIN_TEST_BUSYBOX_TOOLS === '1') {
    if (!hasBusybox) throw new Error('BusyBox required for explicit applet repeat');
    for (const tool of ['awk', 'sed', 'grep', 'sha256sum', 'cat', 'tr', 'dd', 'chmod', 'cp', 'mv', 'rm', 'mkdir']) {
      put(tool, `#!/bin/sh\nexec /usr/bin/busybox ${tool} "$@"\n`);
    }
  }
  const env = (extraEnv = {}) => ({ ...process.env, PATH: `${bin}${pathDelimiter}${process.env.PATH}`,
    PYTHONIOENCODING: 'utf-8', PYTHONUTF8: '1',
    SHEEPFOLD_UCI_BIN: shellPath(join(bin, 'uci')), SHEEPFOLD_AUTHENTICATED_ADMIN_LOGIN: 'Parent',
    SHEEPFOLD_CONFIG_FILE: shellPath(join(configs, 'sheepfold')),
    SHEEPFOLD_WIRELESS_CONFIG_FILE: shellPath(join(configs, 'wireless')),
    SHEEPFOLD_ADMIN_CONFIG_LOCK: shellPath(join(root, 'admin.lock')),
    SHEEPFOLD_ADMIN_CONFIG_TX_ROOT: shellPath(join(runtime, 'tx')),
    SHEEPFOLD_LOCK_COMMON: shellPath(join(bin, 'sheepfold-lock-common')),
    SHEEPFOLD_FORM_COMMON: shellPath(join(bin, 'sheepfold-lib-form')),
    SHEEPFOLD_ROUTER_CONTROL: shellPath(join(bin, 'sheepfold-router-control')),
    SHEEPFOLD_WIFI_BIN: shellPath(join(bin, 'wifi')),
    SHEEPFOLD_LOG_HELPER: shellPath(join(bin, 'sheepfold-log')),
    ...Object.fromEntries(['model','common','groups','schedules','wifi','notifications','devices'].map((name) =>
      [`SHEEPFOLD_ADMIN_CONFIG_${name.toUpperCase()}`, shellPath(join(bin, `sheepfold-lib-admin-config-${name}`))])),
    REQUEST_METHOD: 'GET', PATH_INFO: '/api/v1/admin-config', REMOTE_ADDR: '192.168.7.20',
    HTTP_AUTHORIZATION: 'Bearer synthetic-not-real', CONTENT_LENGTH: '0', ...extraEnv });
  const run = (name, args, body = '', extraEnv = {}) => spawnSync(hasBusybox ? 'busybox' : 'sh',
    [...(hasBusybox ? ['ash'] : []), '-c',
      'PATH="$1:$PATH"; export PATH; shift; exec "$@"', 'sheepfold-admin-fixture',
      shellPath(bin), shellPath(join(bin, name)), ...args],
    { cwd, env: env(extraEnv), encoding: 'utf8', input: body, timeout: process.platform === 'win32' ? 120000 : 25000 });
  return { root, bin, cwd, configs, put, shellPath,
    run: (action = 'get', body = '', extraEnv = {}) => run('sheepfold-api-admin-config', [action], body, extraEnv),
    cgi: (body = '', extraEnv = {}) => run('test-admin-cgi', [], body, {
      CONTENT_LENGTH: String(Buffer.byteLength(body)), CONTENT_TYPE: 'application/x-www-form-urlencoded', ...extraEnv }),
    shell: (body, extraEnv = {}) => {
      put('test-model', `#!/bin/sh\nset -eu\nUCI_BIN="$SHEEPFOLD_UCI_BIN"\n. "$SHEEPFOLD_ADMIN_CONFIG_MODEL"\n${body}\n`);
      return run('test-model', [], '', extraEnv);
    },
    values: (config = 'sheepfold') => JSON.parse(readFileSync(join(configs, config), 'utf8')),
    actions: () => readFileSync(actions, 'utf8'),
    file: (name) => writeFileSync(join(cwd, name), ''),
    close: () => rmSync(root, { recursive: true, force: true }) };
}
