/*
 * Запускает настоящие CLI/CGI со записываемой моделью UCI и отказами nft
 * Меняет только удаляемую .build-папку; пути системных файлов перенесены туда
 * Модель проверяет повтор/отказ команды, а не libuci, Netlink или живые пакеты
 */
import { chmodSync, readFileSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { createRouterFixture, runtimeRoot, basePolicy, childPolicy } from './routerRuntimeFixture.mjs';

const quote = (value) => `'${String(value).replaceAll("'", "'\\''")}'`;
const posix = (value) => value.replaceAll('\\', '/').replace(/^([A-Za-z]):\//, (_, drive) => `/${drive.toLowerCase()}/`);

export function installRuntime(fixture, name) {
  const body = readFileSync(join(runtimeRoot, name), 'utf8')
    .replaceAll('/usr/libexec/sheepfold', posix(fixture.bin))
    .replaceAll('/etc/config', posix(join(fixture.root, 'config')))
    .replaceAll('/tmp/sheepfold', posix(fixture.runtime));
  installExecutable(fixture, name, body);
}
export function installExecutable(fixture, name, body) {
  const path = join(fixture.bin, name);
  writeFileSync(path, body);
  chmodSync(path, 0o755);
}

export function createControlFixture(extra = {}) {
  const fixture = createRouterFixture({ ...basePolicy, ...childPolicy, ...extra });
  const valuesPath = join(fixture.root, 'uci.json');
  const logPath = join(fixture.root, 'uci.log');
  const helperPath = join(fixture.root, 'uciFixture.mjs');
  writeFileSync(valuesPath, JSON.stringify({ ...basePolicy, ...childPolicy, ...extra }));
  writeFileSync(logPath, '');
  // Это модель границы UCI; бизнес-логика команды остаётся в shell-файле проекта
  writeFileSync(helperPath, `import {readFileSync, writeFileSync, appendFileSync} from 'node:fs';
const file = ${JSON.stringify(valuesPath)}, log = ${JSON.stringify(logPath)};
const values = JSON.parse(readFileSync(file, 'utf8'));
const args = process.argv.slice(2).filter((v) => v !== '-q');
const [op, path = ''] = args;
const eq = path.indexOf('='), key = eq < 0 ? path : path.slice(0, eq), value = path.slice(eq + 1);
if (op === 'get') {
  if (!(key in values)) process.exit(1);
  process.stdout.write(values[key]);
} else if (op === 'show') {
  process.stdout.write(Object.entries(values).filter(([k]) => k === key || k.startsWith(key + '.')).map(([k,v]) => k + '=' + v).join('\\n') + '\\n');
} else {
  appendFileSync(log, args.join(' ') + '\\n');
  if (op === 'set') values[key] = value;
  else if (op === 'delete') {
    for (const k of Object.keys(values)) if (k === key || k.startsWith(key + '.')) delete values[k];
  } else if (op === 'add_list') values[key] = [values[key], value].filter(Boolean).join(' ');
  else if (op === 'rename') process.exit(1);
  else if (op !== 'commit') throw new Error('Unsupported UCI fixture operation: ' + op);
  writeFileSync(file, JSON.stringify(values));
}
`);
  installExecutable(fixture, 'uci', `#!/bin/sh\nexec node ${quote(posix(helperPath))} "$@"\n`);
  installExecutable(fixture, 'date', '#!/bin/sh\n[ "$1" != +%s ] || { printf 1700000000; exit 0; }\nexec /bin/date "$@"\n');
  installExecutable(fixture, 'sheepfold-log', '#!/bin/sh\nexit 0\n');
  installRuntime(fixture, 'sheepfold-router-control-legacy');
  installExecutable(fixture, 'sheepfold-router-control', `#!/bin/sh\nexec ${quote(posix(join(fixture.bin, 'sheepfold-router-control-legacy')))} "$@"\n`);
  return { ...fixture,
    values: () => JSON.parse(readFileSync(valuesPath, 'utf8')),
    writes: () => readFileSync(logPath, 'utf8'),
  };
}

export function installNftModel(fixture) {
  const log = join(fixture.root, 'nft-attempts.log');
  const marker = join(fixture.root, 'nft-marker');
  const fail = join(fixture.root, 'nft-failure');
  const missingMarker = join(fixture.root, 'nft-no-marker-chain');
  writeFileSync(log, '');
  installExecutable(fixture, 'nft', `#!/bin/sh
log=${quote(posix(log))}
marker=${quote(posix(marker))}
fail=${quote(posix(fail))}
missing_marker=${quote(posix(missingMarker))}
case "$1" in
  list)
    if [ "$2" = chain ] && [ "$5" = sheepfold_sync_marker ]; then
      [ ! -e "$missing_marker" ] || exit 1
      printf 'chain sheepfold_sync_marker {\\n'
      [ ! -f "$marker" ] || cat "$marker"
      printf '}\\n'
    fi
    exit 0 ;;
  -f)
    printf 'BATCH\\n' >> "$log"
    cat "$2" >> "$log"
    [ ! -e "$fail" ] || exit 1
    cp "$2" "$TEST_NFT_LOG"
    sed -n '/^add rule inet fw4 sheepfold_sync_marker /p' "$2" > "$marker"
    ;;
  flush)
    printf 'DIRECT %s\\n' "$*" >> "$log"
    [ ! -e "$fail" ] || exit 1
    ;;
  *) exit 2 ;;
esac
`);
  return {
    attempts: () => (readFileSync(log, 'utf8').match(/^BATCH$/gm) || []).length,
    log: () => readFileSync(log, 'utf8'),
    marker: () => existsSync(marker) ? readFileSync(marker, 'utf8') : '',
    reload: () => rmSync(marker, { force: true }),
    replaceMarker: (value) => writeFileSync(marker, value),
    removeMarkerChain: () => writeFileSync(missingMarker, ''),
    fail: (enabled = true) => enabled ? writeFileSync(fail, '') : rmSync(fail, { force: true }),
  };
}
