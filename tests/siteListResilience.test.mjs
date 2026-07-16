import {
  chmodSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { gzipSync } from 'node:zlib';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const updater = resolve(
  repoRoot,
  'package/luci-app-sheepfold-family-internet-control/root/usr/libexec/sheepfold/sheepfold-site-lists',
);
const api = readFileSync(
  resolve(repoRoot, 'package/luci-app-sheepfold-family-internet-control/root/www/cgi-bin/sheepfold-api'),
  'utf8',
);
const testTmp = join(repoRoot, '.build', 'test-tmp');
mkdirSync(testTmp, { recursive: true });
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

function writeTarGzip(path, entryName, contents) {
  const data = Buffer.from(contents, 'utf8');
  const header = Buffer.alloc(512);
  const writeOctal = (offset, length, value) => {
    const encoded = value.toString(8).padStart(length - 1, '0');
    header.write(encoded, offset, length - 1, 'ascii');
    header[offset + length - 1] = 0;
  };
  header.write(entryName, 0, 100, 'ascii');
  writeOctal(100, 8, 0o644);
  writeOctal(108, 8, 0);
  writeOctal(116, 8, 0);
  writeOctal(124, 12, data.length);
  writeOctal(136, 12, 0);
  header.fill(0x20, 148, 156);
  header[156] = '0'.charCodeAt(0);
  header.write('ustar\0', 257, 6, 'ascii');
  header.write('00', 263, 2, 'ascii');
  const checksum = header.reduce((sum, byte) => sum + byte, 0).toString(8).padStart(6, '0');
  header.write(checksum, 148, 6, 'ascii');
  header[154] = 0;
  header[155] = 0x20;
  const padding = Buffer.alloc((512 - (data.length % 512)) % 512);
  writeFileSync(path, gzipSync(Buffer.concat([header, data, padding, Buffer.alloc(1024)])));
}

function runUpdater(command, env, input = '') {
  const commandArgs = Array.isArray(command) ? command : [command];
  return spawnSync('bash', [posix(relative(repoRoot, updater)), ...commandArgs], {
    cwd: repoRoot,
    // На Windows первым нужен GNU/BusyBox-совместимый sort из Git Bash, а не System32/sort.exe.
    env: { ...process.env, PATH: shellPath, ...env },
    input,
    encoding: 'utf8',
  });
}

describe('site list updater resilience', () => {
  it('keeps valid domains while ignoring malformed individual entries', () => {
    const root = mkdtempSync(join(testTmp, 'sheepfold-list-normalize-'));
    const result = runUpdater('normalize', {
      SHEEPFOLD_SITE_LIST_RUNTIME_DIR: posix(relative(repoRoot, join(root, 'runtime'))),
      SHEEPFOLD_SITE_LIST_STATE_DIR: posix(relative(repoRoot, join(root, 'state'))),
    }, [
      '# comment',
      '0.0.0.0 Example.COM',
      '203.0.113.7 Mirror.Example',
      '||ads.example.org^',
      'address=/router.example.net/0.0.0.0',
      '192.168.1.1',
      'this is not a domain',
      'bad_domain.example',
      '',
    ].join('\n'));

    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(result.stdout.trim().split(/\r?\n/), [
      'example.com',
      'mirror.example',
      'ads.example.org',
      'router.example.net',
    ]);
  });

  it('retains source caches, retries failures, and notifies after three failed cycles', () => {
    const root = mkdtempSync(join(testTmp, 'sheepfold-list-update-'));
    const bin = join(root, 'bin');
    const fixtures = join(root, 'fixtures');
    const runtime = join(root, 'runtime');
    const state = join(root, 'state');
    const notifyLog = join(root, 'notifications.log');
    mkdirSync(bin, { recursive: true });
    mkdirSync(fixtures, { recursive: true });

    const allowV1 = join(fixtures, 'allow-v1.txt');
    const blockAV1 = join(fixtures, 'block-a-v1.txt');
    const blockAUpdated = join(fixtures, 'block-a-updated.tar.gz');
    const blockBV1 = join(fixtures, 'block-b-v1.txt');
    const html = join(fixtures, 'error.html');
    writeFileSync(allowV1, 'school.example\ninvalid_domain\nSCHOOL.EXAMPLE\n', 'utf8');
    writeFileSync(blockAV1, 'ads-old.example\n', 'utf8');
    writeTarGzip(blockAUpdated, 'block-a/domains', 'ads-new.example\ncorrupt row here\n');
    writeFileSync(blockBV1, 'malware.example\n', 'utf8');
    writeFileSync(html, '<!doctype html><html><body>temporary error</body></html>\n', 'utf8');

    const uci = join(bin, 'uci');
    const fetcher = join(bin, 'fetch-list');
    const notifier = join(bin, 'notify-admin');
    const logger = join(bin, 'log-event');
    executable(uci, `
#!/bin/sh
case "$*" in
  *site_allowlist_sources*) printf '%s\n' 'Allow source | https://lists.test/allow' ;;
  *site_blocklist_sources*)
    [ "\${RECOVERY_ONLY:-0}" = 1 ] || printf '%s\n' 'Block A | https://lists.test/block-a; Broken source | file://bad; Block B | https://lists.test/block-b'
    ;;
  *) exit 1 ;;
esac
`);
    executable(fetcher, `
#!/bin/sh
case "$1" in
  https://lists.test/allow) source_file="$ALLOW_FILE" ;;
  https://lists.test/block-a) source_file="$BLOCK_A_FILE" ;;
  https://lists.test/block-b) source_file="$BLOCK_B_FILE" ;;
  *) exit 1 ;;
esac
[ "$source_file" != FAIL ] || exit 1
cp "$source_file" "$2"
`);
    executable(notifier, `
#!/bin/sh
printf '%s\n' "$*" >> "$NOTIFY_LOG"
`);
    executable(logger, '#!/bin/sh\nexit 0\n');

    const commonEnv = {
      SHEEPFOLD_SITE_LIST_RUNTIME_DIR: posix(relative(repoRoot, runtime)),
      SHEEPFOLD_SITE_LIST_STATE_DIR: posix(relative(repoRoot, state)),
      SHEEPFOLD_SITE_LIST_FETCHER: posix(relative(repoRoot, fetcher)),
      SHEEPFOLD_SITE_LIST_UCI_HELPER: posix(relative(repoRoot, uci)),
      SHEEPFOLD_SITE_LIST_SORT_HELPER: process.platform === 'win32' ? '/usr/bin/sort' : 'sort',
      SHEEPFOLD_NOTIFICATION_HELPER: posix(relative(repoRoot, notifier)),
      SHEEPFOLD_LOG_HELPER: posix(relative(repoRoot, logger)),
      SHEEPFOLD_SITE_LIST_DOWNLOAD_ATTEMPTS: '1',
      SHEEPFOLD_SITE_LIST_DOWNLOAD_RETRY_DELAY: '0',
      NOTIFY_LOG: posix(relative(repoRoot, notifyLog)),
    };
    mkdirSync(join(runtime, 'sources'), { recursive: true });
    mkdirSync(state, { recursive: true });
    writeFileSync(join(runtime, 'sources', 'allowlist-3702190265.domains'), 'school.example\n');
    writeFileSync(join(runtime, 'sources', 'blocklist-1844081459.domains'), 'ads-old.example\n');
    writeFileSync(join(runtime, 'sources', 'blocklist-520170720.domains'), 'malware.example\n');
    writeFileSync(join(runtime, 'allowlist.domains'), 'school.example\n');
    writeFileSync(join(runtime, 'blocklist.domains'), 'ads-old.example\nmalware.example\n');
    const oldFailure = (kind, label, reason) => [
      'count=2',
      'first_failed_at=1000',
      'last_failed_at=1000',
      'next_retry_at=1000',
      'notified=0',
      `kind=${kind}`,
      `label=${label}`,
      `reason=${reason}`,
      '',
    ].join('\n');
    writeFileSync(
      join(state, 'allowlist-3702190265.state'),
      oldFailure('allowlist', 'Allow source', 'html_document'),
    );
    writeFileSync(
      join(state, 'blocklist-520170720.state'),
      oldFailure('blocklist', 'Block B', 'download_failed'),
    );

    const failedEnv = {
      ...commonEnv,
      ALLOW_FILE: posix(relative(repoRoot, html)),
      BLOCK_A_FILE: posix(relative(repoRoot, blockAUpdated)),
      BLOCK_B_FILE: 'FAIL',
    };
    const result = runUpdater('update', failedEnv);
    assert.equal(result.status, 1, result.stderr || result.stdout);
    assert.match(result.stdout, /^blocklist_sources=3$/m);
    assert.match(result.stdout, /^blocklist_succeeded=1$/m);
    assert.match(result.stdout, /^blocklist_failed=2$/m);

    // Block A обновился, но старые allow и Block B остались в итоговых файлах.
    assert.equal(readFileSync(join(runtime, 'allowlist.domains'), 'utf8'), 'school.example\n');
    assert.equal(
      readFileSync(join(runtime, 'blocklist.domains'), 'utf8'),
      'ads-new.example\nmalware.example\n',
    );
    const notifications = readFileSync(notifyLog, 'utf8');
    assert.match(notifications, /Allow source/);
    assert.match(notifications, /Block B/);
    assert.match(notifications, /три раза подряд/);
    assert.equal(readdirSync(state).filter((name) => name.endsWith('.state')).length, 3);
    assert.match(readFileSync(join(state, 'allowlist-3702190265.state'), 'utf8'), /^count=3$/m);

    const recovered = runUpdater('update', {
      ...commonEnv,
      RECOVERY_ONLY: '1',
      ALLOW_FILE: posix(relative(repoRoot, allowV1)),
      BLOCK_A_FILE: posix(relative(repoRoot, blockAUpdated)),
      BLOCK_B_FILE: posix(relative(repoRoot, blockBV1)),
    });
    assert.equal(recovered.status, 0, recovered.stderr || recovered.stdout);
    const recoveredNotifications = readFileSync(notifyLog, 'utf8');
    assert.match(recoveredNotifications, /site_list_recovered/);
    assert.match(recoveredNotifications, /снова успешно обновляется/);
    assert.equal(readdirSync(state).filter((name) => name.endsWith('.state')).length, 0);
  });

  it('rejects an unexpectedly shortened source until an administrator accepts it', () => {
    const root = mkdtempSync(join(testTmp, 'sheepfold-list-shrink-'));
    const bin = join(root, 'bin');
    const runtime = join(root, 'runtime');
    const state = join(root, 'state');
    const largeList = join(root, 'large.txt');
    const shortList = join(root, 'short.txt');
    mkdirSync(bin, { recursive: true });
    writeFileSync(
      largeList,
      Array.from({ length: 20 }, (_, index) => `entry-${index}.example`).join('\n') + '\n',
      'utf8',
    );
    writeFileSync(shortList, 'entry-1.example\nentry-2.example\n', 'utf8');

    const uci = join(bin, 'uci');
    const fetcher = join(bin, 'fetch-list');
    const logger = join(bin, 'log-event');
    executable(uci, `
#!/bin/sh
case "$*" in
  *site_allowlist_sources*) printf '%s\n' 'School list | https://lists.test/school' ;;
  *site_blocklist_sources*) printf '' ;;
  *) exit 1 ;;
esac
`);
    executable(fetcher, '#!/bin/sh\ncp "$LIST_FILE" "$2"\n');
    executable(logger, '#!/bin/sh\nexit 0\n');

    const commonEnv = {
      SHEEPFOLD_SITE_LIST_RUNTIME_DIR: posix(relative(repoRoot, runtime)),
      SHEEPFOLD_SITE_LIST_STATE_DIR: posix(relative(repoRoot, state)),
      SHEEPFOLD_SITE_LIST_FETCHER: posix(relative(repoRoot, fetcher)),
      SHEEPFOLD_SITE_LIST_UCI_HELPER: posix(relative(repoRoot, uci)),
      SHEEPFOLD_SITE_LIST_SORT_HELPER: process.platform === 'win32' ? '/usr/bin/sort' : 'sort',
      SHEEPFOLD_LOG_HELPER: posix(relative(repoRoot, logger)),
      SHEEPFOLD_SITE_LIST_DOWNLOAD_ATTEMPTS: '1',
      SHEEPFOLD_SITE_LIST_DOWNLOAD_RETRY_DELAY: '0',
      SHEEPFOLD_SITE_LIST_SHRINK_CHECK_MIN_DOMAINS: '10',
      SHEEPFOLD_SITE_LIST_MIN_RETAINED_PERCENT: '50',
    };

    const initial = runUpdater('update', {
      ...commonEnv,
      LIST_FILE: posix(relative(repoRoot, largeList)),
    });
    assert.equal(initial.status, 0, initial.stderr || initial.stdout);
    const cache = join(runtime, 'allowlist.domains');
    assert.equal(readFileSync(cache, 'utf8').trim().split(/\r?\n/).length, 20);

    const rejected = runUpdater('update', {
      ...commonEnv,
      LIST_FILE: posix(relative(repoRoot, shortList)),
    });
    assert.equal(rejected.status, 1, rejected.stderr || rejected.stdout);
    assert.equal(readFileSync(cache, 'utf8').trim().split(/\r?\n/).length, 20);
    const failures = readdirSync(state)
      .filter((name) => name.endsWith('.state'))
      .map((name) => readFileSync(join(state, name), 'utf8'));
    assert.ok(failures.some((entry) => /^reason=suspicious_shrink$/m.test(entry)));

    const accepted = runUpdater(['update', '--accept-shrink'], {
      ...commonEnv,
      LIST_FILE: posix(relative(repoRoot, shortList)),
    });
    assert.equal(accepted.status, 0, accepted.stderr || accepted.stdout);
    assert.equal(readFileSync(cache, 'utf8'), 'entry-1.example\nentry-2.example\n');
  });

  it('keeps the previous aggregate when valid sources exceed the router budget', () => {
    const root = mkdtempSync(join(testTmp, 'sheepfold-list-budget-'));
    const bin = join(root, 'bin');
    const runtime = join(root, 'runtime');
    const state = join(root, 'state');
    mkdirSync(bin, { recursive: true });
    mkdirSync(runtime, { recursive: true });
    writeFileSync(join(root, 'one.txt'), 'one.example\n', 'utf8');
    writeFileSync(join(root, 'two.txt'), 'two.example\n', 'utf8');
    writeFileSync(join(runtime, 'blocklist.domains'), 'previous.example\n', 'utf8');

    const uci = join(bin, 'uci');
    const fetcher = join(bin, 'fetch-list');
    const logger = join(bin, 'log-event');
    executable(uci, `
#!/bin/sh
case "$*" in
  *site_allowlist_sources*) printf '' ;;
  *site_blocklist_sources*) printf '%s\n' 'One | https://lists.test/one; Two | https://lists.test/two' ;;
  *) exit 1 ;;
esac
`);
    executable(fetcher, `
#!/bin/sh
case "$1" in
  https://lists.test/one) cp "$ONE_FILE" "$2" ;;
  https://lists.test/two) cp "$TWO_FILE" "$2" ;;
  *) exit 1 ;;
esac
`);
    executable(logger, '#!/bin/sh\nexit 0\n');

    const result = runUpdater('update', {
      SHEEPFOLD_SITE_LIST_RUNTIME_DIR: posix(relative(repoRoot, runtime)),
      SHEEPFOLD_SITE_LIST_STATE_DIR: posix(relative(repoRoot, state)),
      SHEEPFOLD_SITE_LIST_FETCHER: posix(relative(repoRoot, fetcher)),
      SHEEPFOLD_SITE_LIST_UCI_HELPER: posix(relative(repoRoot, uci)),
      SHEEPFOLD_SITE_LIST_SORT_HELPER: process.platform === 'win32' ? '/usr/bin/sort' : 'sort',
      SHEEPFOLD_LOG_HELPER: posix(relative(repoRoot, logger)),
      SHEEPFOLD_SITE_LIST_DOWNLOAD_ATTEMPTS: '1',
      SHEEPFOLD_SITE_LIST_DOWNLOAD_RETRY_DELAY: '0',
      SHEEPFOLD_SITE_LIST_MAX_TOTAL_DOMAINS: '1',
      ONE_FILE: posix(relative(repoRoot, join(root, 'one.txt'))),
      TWO_FILE: posix(relative(repoRoot, join(root, 'two.txt'))),
    });

    assert.equal(result.status, 1, result.stderr || result.stdout);
    assert.match(result.stdout, /^blocklist_succeeded=2$/m);
    assert.match(result.stdout, /^blocklist_failed=1$/m);
    assert.equal(readFileSync(join(runtime, 'blocklist.domains'), 'utf8'), 'previous.example\n');
    const failures = readdirSync(state)
      .filter((name) => name.endsWith('.state'))
      .map((name) => readFileSync(join(state, name), 'utf8'));
    assert.ok(failures.some((entry) => /^reason=too_many_total_domains$/m.test(entry)));
  });

  it('exposes system notifications only through the authenticated administrator API', () => {
    const route = api.slice(api.indexOf('/notifications)'), api.indexOf('/router-info'));
    const androidClient = readFileSync(
      resolve(repoRoot, 'android/app/src/main/java/app/sheepfold/android/router/RouterAdminClient.kt'),
      'utf8',
    );
    const worker = readFileSync(
      resolve(repoRoot, 'android/app/src/main/java/app/sheepfold/android/notifications/AccessRequestWorker.kt'),
      'utf8',
    );
    const queue = readFileSync(
      resolve(repoRoot, 'package/luci-app-sheepfold-family-internet-control/root/usr/libexec/sheepfold/sheepfold-admin-notification'),
      'utf8',
    );

    assert.match(route, /require_admin/);
    assert.match(route, /ADMIN_NOTIFICATION.*list/);
    assert.match(androidClient, /loadAdminNotifications/);
    assert.match(androidClient, /request\("GET", "\/notifications"\)/);
    assert.match(worker, /notifyAdminEventOnce/);
    assert.match(queue, /MAX_NOTIFICATIONS=100/);
    assert.match(queue, /MAX_AGE_SECONDS=2592000/);
  });

  it('bootstraps volatile caches and ships machine-readable default URLs', () => {
    const init = readFileSync(
      resolve(repoRoot, 'package/luci-app-sheepfold-family-internet-control/root/etc/init.d/sheepfold'),
      'utf8',
    );
    const defaults = readFileSync(
      resolve(repoRoot, 'package/luci-app-sheepfold-family-internet-control/root/usr/share/sheepfold/sheepfold.uci.defaults'),
      'utf8',
    );
    const builder = readFileSync(resolve(repoRoot, 'scripts/build-test-ipk.py'), 'utf8');

    assert.match(init, /sheepfold-site-lists bootstrap/);
    assert.match(readFileSync(updater, 'utf8'), /bootstrap\) bootstrap_missing/);
    assert.match(defaults, /blacklists\/download\/child\.tar\.gz/);
    assert.match(defaults, /adblock\/nsfw\.txt/);
    assert.match(defaults, /downloads\/hostfile\//);
    assert.doesNotMatch(defaults, /blacklists\/index_en\.php|https:\/\/github\.com\/hagezi\/dns-blocklists;/);
    assert.match(builder, /default_site_allowlist_sources=.*child\.tar\.gz/);
    assert.match(builder, /install_sheepfold_cron/);
    assert.match(readFileSync(updater, 'utf8'), /MAX_TOTAL_DOMAINS=.*500000/);
    assert.match(readFileSync(updater, 'utf8'), /uclient-fetch -q -T "\$DOWNLOAD_TIMEOUT_SECONDS"/);
    assert.match(readFileSync(updater, 'utf8'), /curl -fsSL --connect-timeout 15 --max-time "\$DOWNLOAD_TIMEOUT_SECONDS"/);
    assert.match(readFileSync(updater, 'utf8'), /SHRINK_CHECK_MIN_DOMAINS=.*1000/);
    assert.match(readFileSync(updater, 'utf8'), /MIN_RETAINED_PERCENT=.*25/);
  });
});
