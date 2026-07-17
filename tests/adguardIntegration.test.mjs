/*
 * Проверяет Sheepfold adapter против локального mock AdGuard Home API: ownership,
 * fallback, ограничения ответов и сохранность чужих фильтров. Стенд временный и не
 * меняет реальный AdGuard Home; совместимость версии/API подтверждает живой роутер.
 */
import {
  chmodSync,
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { createServer } from 'node:http';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn, spawnSync } from 'node:child_process';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const helper = resolve(
  repoRoot,
  'package/luci-app-sheepfold-family-internet-control/root/usr/libexec/sheepfold/sheepfold-adguard',
);
const feedCgi = resolve(
  repoRoot,
  'package/luci-app-sheepfold-family-internet-control/root/www/cgi-bin/sheepfold-adguard-list',
);
const helperSource = readFileSync(helper, 'utf8');
const serviceSource = readFileSync(resolve(
  repoRoot,
  'package/luci-app-sheepfold-family-internet-control/root/usr/libexec/sheepfold/sheepfold-service',
), 'utf8');
const testTmp = resolve(repoRoot, '.build', 'test-tmp');
mkdirSync(testTmp, { recursive: true });
const fakeInstances = new Map();

const shellPath = process.platform === 'win32'
  ? `C:\\Program Files\\Git\\usr\\bin;C:\\Program Files\\Git\\bin;${process.env.PATH}`
  : process.env.PATH;
const posix = (path) => path
  .replaceAll('\\', '/')
  .replace(/^([A-Za-z]):\//, (_, drive) => `/${drive.toLowerCase()}/`);

function executable(path, body) {
  writeFileSync(path, body.replace(/^\n/, ''), 'utf8');
  chmodSync(path, 0o755);
}

function runShell(args, env) {
  return new Promise((resolveRun, rejectRun) => {
    const child = spawn('bash', args, {
      cwd: repoRoot,
      env,
      windowsHide: true,
    });
    let stdout = '';
    let stderr = '';

    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('error', rejectRun);
    child.on('close', (status, signal) => resolveRun({ status, signal, stdout, stderr }));
  });
}

function listen(server) {
  return new Promise((resolveListen, rejectListen) => {
    server.once('error', rejectListen);
    server.listen(0, '127.0.0.1', () => {
      server.off('error', rejectListen);
      resolveListen();
    });
  });
}

function close(server) {
  return new Promise((resolveClose) => server.close(resolveClose));
}

async function fakeAdguard(options = {}) {
  const requests = [];
  const feedRequests = [];
  const filters = [];
  const server = createServer((request, response) => {
    const chunks = [];

    request.on('data', (chunk) => chunks.push(chunk));
    request.on('end', () => {
      const answer = () => {
        const body = Buffer.concat(chunks).toString('utf8');
        if (request.method === 'GET' && request.url.startsWith('/cgi-bin/sheepfold-adguard-list?')) {
          feedRequests.push(request.url);
          const requestUrl = new URL(request.url, 'http://127.0.0.1');
          const expectedToken = options.feedToken || 'c'.repeat(48);
          if (requestUrl.searchParams.get('token') !== expectedToken) {
            response.writeHead(403, { 'Content-Type': 'text/plain' });
            response.end('Forbidden\n');
            return;
          }
          if (options.feedStatusCode) {
            response.writeHead(options.feedStatusCode, { 'Content-Type': 'text/plain' });
            response.end('Unavailable\n');
            return;
          }
          if (!options.feedPath || !existsSync(options.feedPath)) {
            response.writeHead(503, { 'Content-Type': 'text/plain' });
            response.end('Feed is not ready\n');
            return;
          }
          response.writeHead(200, { 'Content-Type': 'text/plain' });
          response.end(readFileSync(options.feedPath));
          return;
        }
        requests.push({
          method: request.method,
          path: request.url,
          authorization: request.headers.authorization || '',
          body,
        });

        if (options.authorization && request.headers.authorization !== options.authorization) {
          response.writeHead(401, { 'Content-Type': 'application/json' });
          response.end('{"error":"unauthorized"}');
          return;
        }
        if (options.statusCode) {
          response.writeHead(options.statusCode, { 'Content-Type': 'application/json' });
          response.end('{"error":"forced"}');
          return;
        }
        if (request.method === 'GET' && request.url === '/control/status') {
          response.writeHead(200, { 'Content-Type': 'application/json' });
          response.end(options.serverStatusBody ?? JSON.stringify({
            dns_addresses: ['127.0.0.1', '192.168.1.1'],
            dns_port: 53,
            http_port: 3000,
            protection_enabled: options.protectionEnabled ?? true,
            protection_disabled_duration: null,
            running: options.running ?? true,
            version: 'v0.107.66',
            language: 'en',
          }));
          return;
        }
        if (request.method === 'GET' && request.url === '/control/dns_info') {
          response.writeHead(options.dnsInfoStatusCode || 200, { 'Content-Type': 'application/json' });
          response.end(options.dnsInfoBody ?? JSON.stringify({
            upstream_dns: ['127.0.0.1:5053', 'https://dns.example/dns-query'],
            fallback_dns: ['1.1.1.1'],
            bootstrap_dns: ['9.9.9.9', '149.112.112.112'],
          }));
          return;
        }
        if (request.method === 'GET' && request.url === '/control/filtering/status') {
          response.writeHead(200, { 'Content-Type': 'application/json' });
          response.end(options.responseBody ?? JSON.stringify({
            enabled: true,
            interval: 24,
            filters,
            whitelist_filters: [],
            user_rules: [],
          }));
          return;
        }
        if (request.method === 'GET' && request.url.startsWith('/control/filtering/check_host?')) {
          const requestUrl = new URL(request.url, 'http://127.0.0.1');
          const name = requestUrl.searchParams.get('name') || '';
          const client = requestUrl.searchParams.get('client') || '';
          let rule = '';

          if (name === 'sheepfold-policy-check.test')
            rule = '||sheepfold-policy-check.test^$important';
          else if (name === 'sheepfold-emergency-check.test')
            rule = '@@||sheepfold-emergency-check.test^$important';
          else if (name === 'sheepfold-strict-check.test' && client)
            rule = `||sheepfold-strict-check.test^$client=${client},important`;

          const defaultBody = {
            reason: name === 'sheepfold-emergency-check.test' ? 'NotFilteredWhiteList' : 'FilteredBlackList',
            rules: rule ? [{
              text: rule,
              filter_list_id: options.checkHostFilterId ?? filters.find((filter) => filter.enabled)?.id ?? filters[0]?.id ?? 1,
            }] : [],
          };
          const checkHostBody = typeof options.checkHostBody === 'function'
            ? options.checkHostBody({ client, defaultBody, filters, name })
            : options.checkHostBody;
          response.writeHead(200, { 'Content-Type': 'application/json' });
          response.end(checkHostBody ?? JSON.stringify(defaultBody));
          return;
        }
        if (request.method === 'POST' && request.url === '/control/filtering/add_url') {
          const data = JSON.parse(body);
          filters.push({
            enabled: true,
            id: filters.length + 1,
            name: data.name,
            rules_count: 0,
            url: data.url,
          });
          response.writeHead(200, { 'Content-Type': 'application/json' });
          response.end('{}');
          return;
        }
        if (request.method === 'POST' && request.url === '/control/filtering/set_url') {
          const data = JSON.parse(body);
          const filter = filters.find((entry) => entry.url === data.url);
          if (filter && !(options.ignoreDisable && data.data.enabled === false))
            Object.assign(filter, data.data);
          response.writeHead(200, { 'Content-Type': 'application/json' });
          response.end('{}');
          return;
        }
        if (request.method === 'POST' && request.url === '/control/filtering/refresh') {
          response.writeHead(200, { 'Content-Type': 'application/json' });
          response.end(options.refreshBody ?? '{"updated":1}');
          return;
        }
        response.writeHead(404, { 'Content-Type': 'application/json' });
        response.end('{"error":"not found"}');
      };

      if (options.delayMs) setTimeout(answer, options.delayMs);
      else answer();
    });
  });

  await listen(server);
  const address = server.address();
  const instance = {
    baseUrl: `http://127.0.0.1:${address.port}`,
    filters,
    options,
    feedRequests,
    requests,
    close: async () => {
      fakeInstances.delete(`http://127.0.0.1:${address.port}`);
      await close(server);
    },
  };
  fakeInstances.set(instance.baseUrl, instance);
  return instance;
}

function jsonHarness(root) {
  const helperPath = join(root, 'json-helper.mjs');
  const libraryPath = join(root, 'jshn.sh');
  const statePath = join(root, 'jshn-state.json');

  writeFileSync(helperPath, `
import { readFileSync, writeFileSync } from 'node:fs';

const [operation, file, rawPath = '', key = '', value = '', type = 'string'] = process.argv.slice(2);
const path = rawPath ? rawPath.split('/') : [];
const read = () => JSON.parse(readFileSync(file, 'utf8'));
const select = (document) => path.reduce((current, part) => current[part], document);

if (operation === 'validate') {
  read();
} else if (operation === 'has') {
  const selected = select(read());
  if (selected === undefined || selected === null) process.exit(1);
} else if (operation === 'keys') {
  process.stdout.write(Object.keys(select(read())).join(' '));
} else if (operation === 'get') {
  const selected = select(read());
  const result = selected?.[key];
  if (typeof result === 'boolean') process.stdout.write(result ? '1' : '0');
  else if (result !== undefined && result !== null) process.stdout.write(String(result));
} else if (operation === 'type') {
  const selected = select(read());
  const result = selected?.[key];
  if (Array.isArray(result)) process.stdout.write('array');
  else if (result === null) process.stdout.write('null');
  else if (typeof result === 'number') process.stdout.write(Number.isInteger(result) ? 'int' : 'double');
  else process.stdout.write(typeof result);
} else if (operation === 'set') {
  const document = read();
  const selected = select(document);
  selected[key] = type === 'object' ? {} : (type === 'boolean' ? value === '1' : value);
  writeFileSync(file, JSON.stringify(document));
} else {
  process.exit(2);
}
`, 'utf8');

  executable(libraryPath, String.raw`
JSHN_TEST_PATH=''

json_init() {
	printf '{}' > "$SHEEPFOLD_TEST_JSON_STATE"
	JSHN_TEST_PATH=''
}

json_load() {
	printf '%s' "$1" > "$SHEEPFOLD_TEST_JSON_STATE"
	node "$SHEEPFOLD_TEST_JSON_HELPER" validate "$SHEEPFOLD_TEST_JSON_STATE" >/dev/null 2>&1 || return 1
	JSHN_TEST_PATH=''
}

json_select() {
	if [ "$1" = '..' ]; then
		case "$JSHN_TEST_PATH" in
			*/*) JSHN_TEST_PATH="${'${JSHN_TEST_PATH%/*}'}" ;;
			*) JSHN_TEST_PATH='' ;;
		esac
		return 0
	fi
	[ -n "$JSHN_TEST_PATH" ] && next_path="$JSHN_TEST_PATH/$1" || next_path="$1"
	node "$SHEEPFOLD_TEST_JSON_HELPER" has "$SHEEPFOLD_TEST_JSON_STATE" "$next_path" >/dev/null 2>&1 || return 1
	JSHN_TEST_PATH="$next_path"
}

json_get_var() {
	target="$1"
	value="$(node "$SHEEPFOLD_TEST_JSON_HELPER" get "$SHEEPFOLD_TEST_JSON_STATE" "$JSHN_TEST_PATH" "$2")" || return 1
	escaped="$(printf '%s' "$value" | sed "s/'/'\\\\''/g")"
	eval "$target='$escaped'"
}

json_get_type() {
	target="$1"
	value="$(node "$SHEEPFOLD_TEST_JSON_HELPER" type "$SHEEPFOLD_TEST_JSON_STATE" "$JSHN_TEST_PATH" "$2")" || return 1
	[ -n "$value" ] || return 1
	eval "$target='$value'"
}

json_get_keys() {
	target="$1"
	value="$(node "$SHEEPFOLD_TEST_JSON_HELPER" keys "$SHEEPFOLD_TEST_JSON_STATE" "$JSHN_TEST_PATH")" || return 1
	eval "$target='$value'"
}

json_add_string() {
	node "$SHEEPFOLD_TEST_JSON_HELPER" set "$SHEEPFOLD_TEST_JSON_STATE" "$JSHN_TEST_PATH" "$1" "$2" string
}

json_add_boolean() {
	node "$SHEEPFOLD_TEST_JSON_HELPER" set "$SHEEPFOLD_TEST_JSON_STATE" "$JSHN_TEST_PATH" "$1" "$2" boolean
}

json_add_object() {
	node "$SHEEPFOLD_TEST_JSON_HELPER" set "$SHEEPFOLD_TEST_JSON_STATE" "$JSHN_TEST_PATH" "$1" '' object || return 1
	[ -n "$JSHN_TEST_PATH" ] && JSHN_TEST_PATH="$JSHN_TEST_PATH/$1" || JSHN_TEST_PATH="$1"
}

json_close_object() {
	json_select ..
}

json_dump() {
	cat "$SHEEPFOLD_TEST_JSON_STATE"
}
`);

  return { helperPath, libraryPath, statePath };
}

function apiScenario(baseUrl, options = {}) {
  const root = mkdtempSync(join(testTmp, 'sheepfold-adguard-api-'));
  const bin = join(root, 'bin');
  const siteLists = join(root, 'site-lists');
  const runtime = join(root, 'runtime');
  const token = join(root, 'feed.token');
  const ownedUrl = join(root, 'owned-feed.url');
  const notificationLog = join(root, 'notifications.log');
  const json = jsonHarness(root);
  mkdirSync(bin, { recursive: true });
  mkdirSync(siteLists, { recursive: true });
  mkdirSync(runtime, { recursive: true });
  writeFileSync(token, `${'c'.repeat(48)}\n`, 'utf8');
  const fakeInstance = fakeInstances.get(baseUrl);
  if (fakeInstance) fakeInstance.options.feedPath = join(runtime, 'filter.txt');
  const uhttpdPort = new URL(baseUrl).port;
  if (options.strictClient)
    writeFileSync(join(siteLists, 'allowlist.domains'), 'school.example\n', 'utf8');

  const strictSections = options.strictClient
    ? `sheepfold.children=group\nsheepfold.child_phone=device`
    : '';
  const strictCases = options.strictClient
    ? `
  *"get sheepfold.children.allowlist_only") printf '1' ;;
  *"get sheepfold.children.name") printf 'Children' ;;
  *"get sheepfold.child_phone.mac") printf 'AA:BB:CC:00:00:01' ;;
  *"get sheepfold.child_phone.ip") printf '${options.strictClient}' ;;
  *"get sheepfold.child_phone.group") printf 'Children' ;;
  *"get sheepfold.child_phone.status") printf 'scheduled' ;;
  *"get sheepfold.child_phone.admin_device") printf '0' ;;`
    : '';

  executable(join(bin, 'uci'), `
#!/bin/sh
case "$*" in
  *"get sheepfold.adguard.url") printf '%s' '${baseUrl}' ;;
  *"get sheepfold.adguard.username") printf '%s' '${options.username || ''}' ;;
  *"get sheepfold.adguard.password") printf '%s' '${options.password || ''}' ;;
  *"get uhttpd.main.listen_http") printf '0.0.0.0:${uhttpdPort}' ;;
  *"get sheepfold.global.site_blocklist_mode") printf 'disabled' ;;
  *"show sheepfold") printf '%s\\n' '${strictSections}' ;;
  ${strictCases}
  *) exit 1 ;;
esac
`);
  executable(join(bin, 'notification'), `
#!/bin/sh
printf '%s\n' "$*" >> '${posix(relative(repoRoot, notificationLog))}'
`);

  return {
    root,
    runtime,
    env: {
      ...process.env,
      PATH: shellPath,
      SHEEPFOLD_SITE_LIST_RUNTIME_DIR: posix(relative(repoRoot, siteLists)),
      SHEEPFOLD_ADGUARD_RUNTIME_DIR: posix(relative(repoRoot, runtime)),
      SHEEPFOLD_ADGUARD_TOKEN_FILE: posix(relative(repoRoot, token)),
      SHEEPFOLD_ADGUARD_OWNED_URL_FILE: posix(relative(repoRoot, ownedUrl)),
      SHEEPFOLD_NOTIFICATION_HELPER: posix(relative(repoRoot, join(bin, 'notification'))),
      SHEEPFOLD_ADGUARD_UCI_HELPER: posix(relative(repoRoot, join(bin, 'uci'))),
      SHEEPFOLD_ADGUARD_JSHN_LIB: posix(relative(repoRoot, json.libraryPath)),
      SHEEPFOLD_TEST_JSON_HELPER: posix(relative(repoRoot, json.helperPath)),
      SHEEPFOLD_TEST_JSON_STATE: posix(relative(repoRoot, json.statePath)),
      SHEEPFOLD_ADGUARD_CONNECT_TIMEOUT: String(options.connectTimeout || 2),
      SHEEPFOLD_ADGUARD_GET_TIMEOUT: String(options.getTimeout || 3),
      SHEEPFOLD_ADGUARD_POST_TIMEOUT: String(options.postTimeout || 3),
      SHEEPFOLD_ADGUARD_MAX_API_BYTES: String(options.maxApiBytes || 65536),
    },
    notificationLog,
    ownedUrl,
    token,
  };
}

async function runApiCommand(scenario, command) {
  return runShell(
    [posix(relative(repoRoot, helper)), command],
    scenario.env,
  );
}

function statusValues(scenario) {
  const text = readFileSync(join(scenario.runtime, 'status'), 'utf8');
  return Object.fromEntries(text.trim().split('\n').map((line) => {
    const separator = line.indexOf('=');
    return [line.slice(0, separator), line.slice(separator + 1)];
  }));
}

function generationScenario() {
  const root = mkdtempSync(join(testTmp, 'sheepfold-adguard-'));
  const bin = join(root, 'bin');
  const siteLists = join(root, 'site-lists');
  const runtime = join(root, 'runtime');
  const token = join(root, 'feed.token');
  mkdirSync(bin, { recursive: true });
  mkdirSync(siteLists, { recursive: true });
  mkdirSync(runtime, { recursive: true });
  writeFileSync(join(siteLists, 'allowlist.domains'), 'school.example\ninvalid domain\n', 'utf8');
  writeFileSync(join(siteLists, 'blocklist.domains'), 'bad.example\nmalware.example\n', 'utf8');
  writeFileSync(token, `${'a'.repeat(48)}\n`, 'utf8');

  executable(join(bin, 'uci'), `
#!/bin/sh
case "$*" in
  *"show sheepfold")
    cat <<'EOF'
sheepfold.children=group
sheepfold.child_phone=device
sheepfold.trusted_child=device
sheepfold.parent_in_child_group=device
sheepfold.parent_phone=device
sheepfold.allowed_tablet=device
sheepfold.essential=emergency_site
EOF
    ;;
  *"get sheepfold.global.site_blocklist_mode") printf 'except_allowlist_admins' ;;
  *"get sheepfold.allowlist.mac") printf 'AA:BB:CC:00:00:03' ;;
  *"get sheepfold.children.allowlist_only") printf '1' ;;
  *"get sheepfold.children.name") printf 'Children' ;;
  *"get sheepfold.child_phone.mac") printf 'AA:BB:CC:00:00:01' ;;
  *"get sheepfold.child_phone.ip") printf '192.168.1.10' ;;
  *"get sheepfold.child_phone.group") printf 'Children' ;;
  *"get sheepfold.child_phone.status") printf 'scheduled' ;;
  *"get sheepfold.child_phone.admin_device") printf '0' ;;
  *"get sheepfold.trusted_child.mac") printf 'AA:BB:CC:00:00:04' ;;
  *"get sheepfold.trusted_child.ip") printf '192.168.1.11' ;;
  *"get sheepfold.trusted_child.group") printf 'Children' ;;
  *"get sheepfold.trusted_child.status") printf 'allow' ;;
  *"get sheepfold.trusted_child.admin_device") printf '0' ;;
  *"get sheepfold.parent_in_child_group.mac") printf 'AA:BB:CC:00:00:05' ;;
  *"get sheepfold.parent_in_child_group.ip") printf '192.168.1.12' ;;
  *"get sheepfold.parent_in_child_group.group") printf 'Children' ;;
  *"get sheepfold.parent_in_child_group.status") printf 'scheduled' ;;
  *"get sheepfold.parent_in_child_group.admin_device") printf '1' ;;
  *"get sheepfold.parent_phone.mac") printf 'AA:BB:CC:00:00:02' ;;
  *"get sheepfold.parent_phone.ip") printf '192.168.1.2' ;;
  *"get sheepfold.parent_phone.group") printf 'Parents' ;;
  *"get sheepfold.parent_phone.status") printf 'allow' ;;
  *"get sheepfold.parent_phone.admin_device") printf '1' ;;
  *"get sheepfold.allowed_tablet.mac") printf 'AA:BB:CC:00:00:03' ;;
  *"get sheepfold.allowed_tablet.ip") printf '192.168.1.3' ;;
  *"get sheepfold.allowed_tablet.group") printf 'Parents' ;;
  *"get sheepfold.allowed_tablet.status") printf 'allow' ;;
  *"get sheepfold.allowed_tablet.admin_device") printf '0' ;;
  *"get sheepfold.essential.enabled") printf '1' ;;
  *"get sheepfold.essential.domain") printf 'gosuslugi.ru' ;;
  *) exit 1 ;;
esac
`);

  const env = {
    ...process.env,
    PATH: shellPath,
    SHEEPFOLD_SITE_LIST_RUNTIME_DIR: posix(relative(repoRoot, siteLists)),
    SHEEPFOLD_ADGUARD_RUNTIME_DIR: posix(relative(repoRoot, runtime)),
    SHEEPFOLD_ADGUARD_TOKEN_FILE: posix(relative(repoRoot, token)),
    SHEEPFOLD_ADGUARD_UCI_HELPER: posix(relative(repoRoot, join(bin, 'uci'))),
  };
  const result = spawnSync('bash', [posix(relative(repoRoot, helper)), 'generate'], {
    cwd: repoRoot,
    env,
    encoding: 'utf8',
  });

  return { result, root, token };
}

describe('AdGuard Home site filtering adapter §dompol', () => {
  it('generates scoped allowlist rules and safe blocklist exemptions', () => {
    const { result } = generationScenario();
    assert.equal(result.status, 0, result.stderr || result.stdout);
    assert.match(result.stdout, /^@@\|\|gosuslugi\.ru\^\$important$/m);
    assert.match(result.stdout, /^\|\|sheepfold-policy-check\.test\^\$important$/m);
    assert.match(result.stdout, /^\|\|sheepfold-emergency-check\.test\^$/m);
    assert.match(result.stdout, /^@@\|\|sheepfold-emergency-check\.test\^\$important$/m);
    assert.match(
      result.stdout,
      /^\|\|sheepfold-strict-check\.test\^\$client=192\.168\.1\.10,important$/m,
    );
    assert.match(result.stdout, /^\|\|\*\^\$client=192\.168\.1\.10$/m);
    assert.match(result.stdout, /^@@\|\|school\.example\^\$client=192\.168\.1\.10,important$/m);
    assert.doesNotMatch(result.stdout, /^\|\|\*\^\$client=.*192\.168\.1\.11/m);
    assert.doesNotMatch(result.stdout, /^\|\|\*\^\$client=.*192\.168\.1\.12/m);
    assert.match(result.stdout, /^\|\|bad\.example\^$/m);
    assert.match(
      result.stdout,
      /^@@\|\|bad\.example\^\$client=192\.168\.1\.11\|192\.168\.1\.12\|192\.168\.1\.2\|192\.168\.1\.3,important$/m,
    );
    assert.doesNotMatch(result.stdout, /invalid domain/);
  });

  it('serves the managed feed only to a loopback client with the secret token', () => {
    const root = mkdtempSync(join(testTmp, 'sheepfold-adguard-cgi-'));
    const tokenPath = join(root, 'feed.token');
    const feedPath = join(root, 'filter.txt');
    const token = 'b'.repeat(48);
    writeFileSync(tokenPath, `${token}\n`, 'utf8');
    writeFileSync(feedPath, '||bad.example^\n', 'utf8');
    const baseEnv = {
      ...process.env,
      PATH: shellPath,
      SHEEPFOLD_ADGUARD_TOKEN_FILE: posix(relative(repoRoot, tokenPath)),
      SHEEPFOLD_ADGUARD_FEED_FILE: posix(relative(repoRoot, feedPath)),
    };
    const allowed = spawnSync('bash', [posix(relative(repoRoot, feedCgi))], {
      cwd: repoRoot,
      env: { ...baseEnv, REMOTE_ADDR: '127.0.0.1', QUERY_STRING: `token=${token}` },
      encoding: 'utf8',
    });
    const denied = spawnSync('bash', [posix(relative(repoRoot, feedCgi))], {
      cwd: repoRoot,
      env: { ...baseEnv, REMOTE_ADDR: '192.168.1.50', QUERY_STRING: `token=${token}` },
      encoding: 'utf8',
    });

    assert.equal(allowed.status, 0, allowed.stderr);
    assert.match(allowed.stdout, /Cache-Control: no-store/);
    assert.match(allowed.stdout, /\|\|bad\.example\^/);
    assert.match(denied.stdout, /403 Forbidden/);
    assert.doesNotMatch(denied.stdout, /bad\.example/);
  });

  it('owns one URL filter instead of replacing the user filtering configuration', () => {
    assert.match(helperSource, /GET:\/control\/status/);
    assert.match(helperSource, /GET:\/control\/dns_info/);
    assert.match(helperSource, /GET:\/control\/filtering\/check_host/);
    assert.match(helperSource, /\/control\/filtering\/add_url/);
    assert.match(helperSource, /\/control\/filtering\/set_url/);
    assert.match(helperSource, /\/control\/filtering\/refresh/);
    assert.doesNotMatch(helperSource, /\/control\/filtering\/set_rules/);
    assert.doesNotMatch(helperSource, /AdGuardHome\.ya?ml/);
    assert.doesNotMatch(helperSource, /--user/);
    assert.match(helperSource, /--config "\$auth_file"/);
    assert.match(helperSource, /json_add_object data/);
    assert.match(helperSource, /json_add_string name "\$FILTER_NAME"/);
    assert.match(helperSource, /api_action_allowed/);
    assert.match(helperSource, /api_action_forbidden/);
    assert.doesNotMatch(helperSource, /\/control\/dns_config/);
    assert.doesNotMatch(helperSource, /\/control\/access\/set/);
    assert.doesNotMatch(helperSource, /\/control\/clients\//);
    assert.doesNotMatch(helperSource, /\/control\/dhcp\//);
    assert.doesNotMatch(helperSource, /\/control\/rewrite\//);
    assert.match(serviceSource, /adguard_health_interval_seconds/);
    assert.match(serviceSource, /handle_adguard_health/);
  });

  it('synchronizes only the owned filter through a real HTTP contract', async () => {
    const authorization = `Basic ${Buffer.from('parent:secret').toString('base64')}`;
    const api = await fakeAdguard({ authorization });
    const scenario = apiScenario(api.baseUrl, { username: 'parent', password: 'secret' });

    try {
      const result = await runApiCommand(scenario, 'sync');
      assert.equal(result.status, 0, result.stderr || result.stdout || JSON.stringify(api.requests, null, 2));
      assert.deepEqual(
        api.requests.map(({ method, path }) => `${method} ${path}`),
        [
          'GET /control/status',
          'GET /control/dns_info',
          'GET /control/filtering/status',
          'POST /control/filtering/add_url',
          'POST /control/filtering/refresh',
          'GET /control/status',
          'GET /control/dns_info',
          'GET /control/filtering/status',
          'GET /control/filtering/check_host?name=sheepfold-policy-check.test&qtype=A',
          'GET /control/filtering/check_host?name=sheepfold-emergency-check.test&qtype=A',
        ],
      );
      assert.ok(api.requests.every((request) => request.authorization === authorization));
      assert.equal(api.filters.length, 1);
      assert.equal(api.filters[0].name, 'Sheepfold family site policy');
      assert.match(api.filters[0].url, /^http:\/\/127\.0\.0\.1:[0-9]+\/cgi-bin\/sheepfold-adguard-list\?token=c{48}$/);
      assert.deepEqual(JSON.parse(api.requests[3].body), {
        name: 'Sheepfold family site policy',
        url: api.filters[0].url,
        whitelist: false,
      });
      assert.deepEqual(JSON.parse(api.requests[4].body), { whitelist: false });
      assert.equal(statusValues(scenario).status, 'active');
      assert.equal(statusValues(scenario).server_running, '1');
      assert.equal(statusValues(scenario).protection_enabled, '1');
      assert.equal(statusValues(scenario).server_version, 'v0.107.66');
      assert.equal(statusValues(scenario).dns_port, '53');
      assert.equal(statusValues(scenario).dns_address_count, '2');
      assert.equal(statusValues(scenario).dns_info_available, '1');
      assert.equal(statusValues(scenario).upstream_count, '2');
      assert.equal(statusValues(scenario).fallback_count, '1');
      assert.equal(statusValues(scenario).bootstrap_count, '2');
      assert.equal(statusValues(scenario).filter_status_checked, '1');
      assert.equal(statusValues(scenario).engine_checked, '1');
      assert.equal(statusValues(scenario).engine_check_reason, 'control_rules_confirmed');
      assert.equal(statusValues(scenario).engine_checks_required, '2');
      assert.equal(statusValues(scenario).engine_checks_passed, '2');
      assert.equal(statusValues(scenario).managed_filter_id, '1');
      assert.equal(statusValues(scenario).dns_path_status, 'not_checked');
      assert.doesNotMatch(readFileSync(join(scenario.runtime, 'status'), 'utf8'), /dns\.example|1\.1\.1\.1/);

      const disableResult = await runApiCommand(scenario, 'disable');
      assert.equal(disableResult.status, 0, disableResult.stderr || disableResult.stdout);
      assert.deepEqual(
        api.requests.slice(10).map(({ method, path }) => `${method} ${path}`),
        [
          'GET /control/status',
          'GET /control/dns_info',
          'GET /control/filtering/status',
          'POST /control/filtering/set_url',
          'GET /control/status',
          'GET /control/dns_info',
          'GET /control/filtering/status',
        ],
      );
      assert.deepEqual(JSON.parse(api.requests[13].body), {
        url: api.filters[0].url,
        whitelist: false,
        data: {
          enabled: false,
          name: 'Sheepfold family site policy',
          url: api.filters[0].url,
        },
      });
      assert.equal(api.filters[0].enabled, false);
      assert.equal(statusValues(scenario).status, 'disabled');
    } finally {
      await api.close();
    }
  });

  it('rolls back a new filter when AdGuard Home does not confirm its control rule', async () => {
    const api = await fakeAdguard({ checkHostFilterId: 999 });
    const scenario = apiScenario(api.baseUrl);
    try {
      const result = await runApiCommand(scenario, 'sync');
      assert.notEqual(result.status, 0);
      assert.equal(statusValues(scenario).reason, 'control_rule_not_confirmed');
      assert.equal(statusValues(scenario).engine_checked, '0');
      assert.equal(statusValues(scenario).engine_checks_required, '1');
      assert.equal(statusValues(scenario).engine_checks_passed, '0');
      assert.equal(statusValues(scenario).engine_check_reason, 'control_rule_not_confirmed');
      assert.equal(api.filters[0].enabled, false);
      assert.deepEqual(
        api.requests.slice(-4).map(({ method, path }) => `${method} ${path}`),
        [
          'POST /control/filtering/set_url',
          'GET /control/status',
          'GET /control/dns_info',
          'GET /control/filtering/status',
        ],
      );
    } finally {
      await api.close();
    }
  });

  it('disables the previously owned URL before installing a filter after token rotation', async () => {
    const api = await fakeAdguard();
    const scenario = apiScenario(api.baseUrl);
    const feedPort = new URL(api.baseUrl).port;
    const oldUrl = `http://127.0.0.1:${feedPort}/cgi-bin/sheepfold-adguard-list?token=${'b'.repeat(48)}`;
    const newUrl = `http://127.0.0.1:${feedPort}/cgi-bin/sheepfold-adguard-list?token=${'c'.repeat(48)}`;
    api.filters.push({
      enabled: true,
      id: 1,
      name: 'Sheepfold family site policy',
      rules_count: 3,
      url: oldUrl,
    });
    writeFileSync(scenario.ownedUrl, `${oldUrl}\n`, 'utf8');

    try {
      const result = await runApiCommand(scenario, 'sync');
      assert.equal(result.status, 0, result.stderr || result.stdout || JSON.stringify(api.requests, null, 2));
      assert.equal(api.filters.find((filter) => filter.url === oldUrl)?.enabled, false);
      assert.equal(api.filters.find((filter) => filter.url === newUrl)?.enabled, true);
      assert.equal(readFileSync(scenario.ownedUrl, 'utf8').trim(), newUrl);
      assert.doesNotMatch(readFileSync(join(scenario.runtime, 'status'), 'utf8'), /token=/);
    } finally {
      await api.close();
    }
  });

  it('rejects duplicate filters with the exact managed URL instead of choosing one arbitrarily', async () => {
    const api = await fakeAdguard();
    const scenario = apiScenario(api.baseUrl);
    const feedPort = new URL(api.baseUrl).port;
    const url = `http://127.0.0.1:${feedPort}/cgi-bin/sheepfold-adguard-list?token=${'c'.repeat(48)}`;
    api.filters.push(
      { enabled: true, id: 1, name: 'Sheepfold family site policy', rules_count: 3, url },
      { enabled: true, id: 2, name: 'Copied Sheepfold filter', rules_count: 3, url },
    );

    try {
      const result = await runApiCommand(scenario, 'sync');
      assert.notEqual(result.status, 0);
      assert.equal(statusValues(scenario).reason, 'duplicate_managed_filter');
      assert.equal(statusValues(scenario).managed_filter_matches, '2');
      assert.equal(api.requests.filter(({ method }) => method === 'POST').length, 0);
    } finally {
      await api.close();
    }
  });

  it('detects an unavailable local feed even when AdGuard Home still has cached rules', async () => {
    const api = await fakeAdguard({ feedStatusCode: 503 });
    const scenario = apiScenario(api.baseUrl);
    const feedPort = new URL(api.baseUrl).port;
    const url = `http://127.0.0.1:${feedPort}/cgi-bin/sheepfold-adguard-list?token=${'c'.repeat(48)}`;
    const feed = [
      '! Generated by Sheepfold. Manual changes are discarded.',
      '! Uses AdGuard Home client modifiers with router-observed IPv4 addresses.',
      '! Control rules use reserved .test domains and never open a real service.',
      '||sheepfold-policy-check.test^$important',
      '||sheepfold-emergency-check.test^',
      '@@||sheepfold-emergency-check.test^$important',
      '',
    ].join('\n');
    writeFileSync(join(scenario.runtime, 'filter.txt'), feed, 'utf8');
    writeFileSync(scenario.ownedUrl, `${url}\n`, 'utf8');
    api.filters.push({
      enabled: true,
      id: 1,
      name: 'Sheepfold family site policy',
      rules_count: 3,
      url,
    });

    try {
      const result = await runApiCommand(scenario, 'sync');
      assert.notEqual(result.status, 0);
      assert.equal(statusValues(scenario).reason, 'feed_unreachable');
      assert.equal(api.feedRequests.length, 1);
      assert.equal(api.requests.filter(({ method }) => method === 'POST').length, 0);
    } finally {
      await api.close();
    }
  });

  it('restores the managed filter name and accepts a valid refresh response with no changed filters', async () => {
    const api = await fakeAdguard({ refreshBody: '{"updated":0}' });
    const scenario = apiScenario(api.baseUrl);
    const feedPort = new URL(api.baseUrl).port;
    const url = `http://127.0.0.1:${feedPort}/cgi-bin/sheepfold-adguard-list?token=${'c'.repeat(48)}`;
    api.filters.push({
      enabled: true,
      id: 1,
      name: 'Renamed by mistake',
      rules_count: 3,
      url,
    });

    try {
      const result = await runApiCommand(scenario, 'sync');
      assert.equal(result.status, 0, result.stderr || result.stdout);
      assert.equal(api.filters[0].name, 'Sheepfold family site policy');
      assert.ok(api.requests.some(({ method, path }) =>
        method === 'POST' && path === '/control/filtering/set_url'));
    } finally {
      await api.close();
    }
  });

  it('notifies after three consecutive failures and once again after recovery', async () => {
    const api = await fakeAdguard({ statusCode: 500 });
    const scenario = apiScenario(api.baseUrl);
    try {
      for (let attempt = 1; attempt <= 3; attempt += 1) {
        const result = await runApiCommand(scenario, 'sync');
        assert.notEqual(result.status, 0);
        assert.equal(statusValues(scenario).consecutive_failures, String(attempt));
      }
      let notifications = readFileSync(scenario.notificationLog, 'utf8');
      assert.match(notifications, /enqueue adguard_unavailable/);
      assert.equal((notifications.match(/adguard_unavailable/g) || []).length, 1);

      api.options.statusCode = undefined;
      const recovered = await runApiCommand(scenario, 'sync');
      assert.equal(recovered.status, 0, recovered.stderr || recovered.stdout);
      notifications = readFileSync(scenario.notificationLog, 'utf8');
      assert.match(notifications, /enqueue adguard_recovered/);
      assert.equal((notifications.match(/adguard_recovered/g) || []).length, 1);
      assert.equal(statusValues(scenario).consecutive_failures, '');
    } finally {
      await api.close();
    }
  });

  it('confirms the strict-device rule with the router-observed client IPv4', async () => {
    const api = await fakeAdguard();
    const scenario = apiScenario(api.baseUrl, { strictClient: '192.168.1.10' });
    try {
      const result = await runApiCommand(scenario, 'sync');
      assert.equal(result.status, 0, result.stderr || result.stdout);
      assert.equal(statusValues(scenario).engine_checked, '1');
      assert.equal(statusValues(scenario).engine_checks_required, '3');
      assert.equal(statusValues(scenario).engine_checks_passed, '3');
      assert.ok(api.requests.some(({ path }) => path ===
        '/control/filtering/check_host?name=sheepfold-strict-check.test&qtype=A&client=192.168.1.10'));
    } finally {
      await api.close();
    }
  });

  it('rejects an unreadable control-rule response', async () => {
    const api = await fakeAdguard({ checkHostBody: '{"reason":"FilteredBlackList","rules":"broken"}' });
    const scenario = apiScenario(api.baseUrl);
    try {
      const result = await runApiCommand(scenario, 'sync');
      assert.notEqual(result.status, 0);
      assert.equal(statusValues(scenario).reason, 'invalid_check_response');
      assert.equal(statusValues(scenario).engine_checked, '0');
      assert.equal(api.filters[0].enabled, false);
    } finally {
      await api.close();
    }
  });

  it('does not report the original rule error as safely cleaned up without read-back confirmation', async () => {
    const api = await fakeAdguard({ checkHostFilterId: 999, ignoreDisable: true });
    const scenario = apiScenario(api.baseUrl);
    try {
      const result = await runApiCommand(scenario, 'sync');
      assert.notEqual(result.status, 0);
      assert.equal(statusValues(scenario).reason, 'filter_disable_not_confirmed');
      assert.equal(statusValues(scenario).engine_check_reason, 'control_rule_not_confirmed');
      assert.equal(api.filters[0].enabled, true);
    } finally {
      await api.close();
    }
  });

  it('rejects a stopped server or disabled global protection before changing filters', async () => {
    const cases = [
      [{ running: false }, 'server_not_running'],
      [{ protectionEnabled: false }, 'protection_disabled'],
    ];

    for (const [options, reason] of cases) {
      const api = await fakeAdguard(options);
      const scenario = apiScenario(api.baseUrl);
      try {
        const result = await runApiCommand(scenario, 'sync');
        assert.notEqual(result.status, 0);
        assert.equal(statusValues(scenario).reason, reason);
        assert.deepEqual(api.requests.map(({ method, path }) => `${method} ${path}`), ['GET /control/status']);
      } finally {
        await api.close();
      }
    }
  });

  it('keeps a confirmed filter working when optional DNS diagnostics are unavailable', async () => {
    const api = await fakeAdguard({ dnsInfoBody: 'not-json' });
    const scenario = apiScenario(api.baseUrl);
    try {
      const result = await runApiCommand(scenario, 'sync');
      assert.equal(result.status, 0, result.stderr || result.stdout);
      assert.equal(statusValues(scenario).status, 'active');
      assert.equal(statusValues(scenario).dns_info_available, '0');
      assert.equal(statusValues(scenario).dns_info_reason, 'invalid_api_response');
      assert.equal(statusValues(scenario).engine_checked, '1');
    } finally {
      await api.close();
    }
  });

  it('can clean up its owned filter while global protection is disabled', async () => {
    const api = await fakeAdguard({ protectionEnabled: false });
    const scenario = apiScenario(api.baseUrl);
    try {
      const result = await runApiCommand(scenario, 'disable');
      assert.equal(result.status, 0, result.stderr || result.stdout);
      assert.equal(statusValues(scenario).status, 'disabled');
      assert.deepEqual(
        api.requests.map(({ method, path }) => `${method} ${path}`),
        ['GET /control/status', 'GET /control/dns_info', 'GET /control/filtering/status'],
      );
    } finally {
      await api.close();
    }
  });

  it('rejects an invalid server status schema', async () => {
    const api = await fakeAdguard({ serverStatusBody: '{"running":"yes","protection_enabled":true}' });
    const scenario = apiScenario(api.baseUrl);
    try {
      const result = await runApiCommand(scenario, 'probe');
      assert.notEqual(result.status, 0);
      assert.equal(statusValues(scenario).reason, 'invalid_api_response');
    } finally {
      await api.close();
    }
  });

  it('classifies API authentication, capability, throttling, and server errors', async () => {
    const cases = [
      [400, 'api_request_rejected'],
      [401, 'authentication_failed'],
      [403, 'authentication_failed'],
      [404, 'api_unsupported'],
      [422, 'api_request_rejected'],
      [429, 'api_rate_limited'],
      [500, 'api_server_error'],
    ];

    for (const [statusCode, reason] of cases) {
      const api = await fakeAdguard({ statusCode });
      const scenario = apiScenario(api.baseUrl);
      try {
        const result = await runApiCommand(scenario, 'probe');
        assert.notEqual(result.status, 0, `HTTP ${statusCode} unexpectedly succeeded`);
        assert.equal(statusValues(scenario).reason, reason);
      } finally {
        await api.close();
      }
    }
  });

  it('rejects invalid or oversized API responses instead of parsing stale data', async () => {
    const cases = [
      ['not-json', 65536, 'invalid_api_response'],
      ['{"enabled":"yes","filters":[]}', 65536, 'invalid_api_response'],
      [`{"enabled":true,"padding":"${'x'.repeat(2048)}"}`, 1024, 'api_response_too_large'],
    ];

    for (const [responseBody, maxApiBytes, reason] of cases) {
      const api = await fakeAdguard({ responseBody });
      const scenario = apiScenario(api.baseUrl, { maxApiBytes });
      writeFileSync(join(scenario.runtime, 'api-status.json'), '{"enabled":true}', 'utf8');
      try {
        const result = await runApiCommand(scenario, 'probe');
        assert.notEqual(result.status, 0);
        assert.equal(statusValues(scenario).reason, reason);
      } finally {
        await api.close();
      }
    }
  });

  it('reports a bounded API timeout', async () => {
    const api = await fakeAdguard({ delayMs: 1400 });
    const scenario = apiScenario(api.baseUrl, { getTimeout: 1 });
    try {
      const result = await runApiCommand(scenario, 'probe');
      assert.notEqual(result.status, 0);
      assert.equal(statusValues(scenario).reason, 'api_timeout');
    } finally {
      await api.close();
    }
  });
});
