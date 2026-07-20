/*
 * Риск: один поддельный hostname или MAC может ошибочно объединить два устройства
 * и подтолкнуть будущий код к переносу прав. Тест проверяет границу сопоставления:
 * один сильный UUID либо два независимых семейства, без allowlist/group действий.
 * Он не доказывает подлинность сетевых объявлений и не заменяет тест на живом LAN.
 */
import { spawnSync } from 'node:child_process';
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { delimiter, dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const packageRoot = resolve(repoRoot, 'package/luci-app-sheepfold-family-internet-control');
const identityPath = resolve(packageRoot, 'root/usr/libexec/sheepfold/sheepfold-device-identity');
const detectorPath = resolve(packageRoot, 'root/usr/libexec/sheepfold/sheepfold-device-detector');
const ssdpPath = resolve(packageRoot, 'root/usr/share/sheepfold/device-ssdp.uc');
const mdnsPath = resolve(packageRoot, 'root/usr/share/sheepfold/device-mdns.uc');
const hashCommonPath = resolve(packageRoot, 'root/usr/libexec/sheepfold/sheepfold-hash-common');
const sysupgradeKeepPath = resolve(packageRoot, 'root/lib/upgrade/keep.d/sheepfold');

function posix(path) {
  return path.replace(/\\/g, '/').replace(/^([A-Za-z]):/, (_, drive) => `/${drive.toLowerCase()}`);
}

function shellPath(path) {
  return posix(relative(repoRoot, path));
}

function compareIdentityKeys(left, right) {
  return spawnSync('sh', [identityPath, 'compare', left, right], { encoding: 'utf8' });
}

function assessIdentityKeys(trusted, current) {
  return spawnSync('sh', [identityPath, 'assess', trusted, current], { encoding: 'utf8' });
}

function identityKeyStrength(keys) {
  return spawnSync('sh', [identityPath, 'strength', keys], { encoding: 'utf8' });
}

describe('device identity matching §devident1', () => {
  it('recognizes an exact strong UUID even when MAC addresses differ', () => {
    const result = compareIdentityKeys('upnp_uuid:abcd1234', 'upnp_uuid:abcd1234');

    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout.trim(), 'strong');
  });

  it('treats a protocol-neutral device UUID as a strong but non-authenticating signal', () => {
    const result = compareIdentityKeys('device_uuid:abcd1234', 'device_uuid:abcd1234');

    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout.trim(), 'strong');
  });

  it('recognizes two matching weak families but rejects one matching hostname', () => {
    const multifactor = compareIdentityKeys(
      'dhcp_client:client123 mdns_host:livingroom',
      'dhcp_client:client123 mdns_host:livingroom',
    );
    const hostnameOnly = compareIdentityKeys('mdns_host:livingroom', 'mdns_host:livingroom');

    assert.equal(multifactor.status, 0, multifactor.stderr);
    assert.equal(multifactor.stdout.trim(), 'multifactor');
    assert.notEqual(hostnameOnly.status, 0);
  });

  it('creates only a parent-facing suggestion and never auto-links a new MAC or inherits access policy', () => {
    const identity = readFileSync(identityPath, 'utf8');

    assert.match(identity, /logical_device_suggestion_id/);
    assert.match(identity, /logical_device_confirmed/);
    assert.match(identity, /multiple_signal_families/);
    assert.match(identity, /delete_if_present "sheepfold\.\$section\.logical_device_id"/);
    assert.match(identity, /device_is_blocklisted "\$section" "\$mac" && continue/);
    assert.doesNotMatch(identity, /uci[^\n]*set[^\n]*(allowlist|blocklist|\.group)/);
  });

  it('quarantines only the newer online record when two MAC addresses announce one UUID', () => {
    const fixture = mkdtempSync(resolve('.build', 'sheepfold-uuid-collision-'));
    const bin = join(fixture, 'bin');
    const actions = join(fixture, 'uci-actions.txt');
    const dirty = join(fixture, 'dirty');
    const presence = join(bin, 'presence');
    const uci = join(bin, 'uci');

    mkdirSync(bin, { recursive: true });
    writeFileSync(presence, `#!/bin/sh
printf '%s\\t%s\\t%s\\n' '00:11:22:33:44:55' '1' 'wifi'
printf '%s\\t%s\\t%s\\n' '00:11:22:33:44:66' '1' 'wifi'
`, 'utf8');
    writeFileSync(uci, `#!/bin/sh
test "\${1:-}" != -q || shift
command="\${1:-}"
argument="\${2:-}"
case "$command:$argument" in
  show:sheepfold)
    printf '%s\\n' 'sheepfold.device_old=device' 'sheepfold.device_new=device'
    ;;
  get:sheepfold.device_old.id) printf '%s\\n' 1 ;;
  get:sheepfold.device_old.mac) printf '%s\\n' '00:11:22:33:44:55' ;;
  get:sheepfold.device_old.detection_identity_keys) printf '%s\\n' 'device_uuid:shared' ;;
  get:sheepfold.device_new.id) printf '%s\\n' 2 ;;
  get:sheepfold.device_new.mac) printf '%s\\n' '00:11:22:33:44:66' ;;
  get:sheepfold.device_new.detection_identity_keys) printf '%s\\n' 'device_uuid:shared' ;;
  get:*) exit 1 ;;
  set:*|delete:*) printf '%s %s\\n' "$command" "$argument" >> "$SHEEPFOLD_TEST_ACTIONS" ;;
esac
`, 'utf8');
    chmodSync(presence, 0o755);
    chmodSync(uci, 0o755);

    const result = spawnSync('sh', [identityPath, 'reconcile-staged'], {
      encoding: 'utf8',
      env: {
        ...process.env,
        PATH: `${bin}${delimiter}${process.env.PATH}`,
        SHEEPFOLD_DEVICE_PRESENCE: shellPath(presence),
        SHEEPFOLD_UCI_DIRTY_FLAG: shellPath(dirty),
        SHEEPFOLD_TEST_ACTIONS: shellPath(actions),
      },
    });
    assert.equal(result.status, 0, result.stderr);
    const changes = readFileSync(actions, 'utf8');
    assert.match(changes, /set sheepfold\.device_new\.identity_uuid_collision_with_id=1/);
    assert.match(changes, /set sheepfold\.device_new\.identity_uuid_collision_pending=1/);
    assert.doesNotMatch(changes, /device_old\.identity_uuid_collision/);
    assert.doesNotMatch(changes, /(allowlist|blocklist|\.group)=/);
    rmSync(fixture, { recursive: true, force: true });
  });

  it('distinguishes a trusted match from strong and multifactor replacement signals', () => {
    const match = assessIdentityKeys('upnp_uuid:a mdns_host:x', 'upnp_uuid:a mdns_host:y');
    const strongMismatch = assessIdentityKeys('upnp_uuid:a', 'upnp_uuid:b');
    const weakMismatch = assessIdentityKeys(
      'dhcp_client:a mdns_host:b',
      'dhcp_client:c mdns_host:d',
    );
    const ambiguous = assessIdentityKeys(
      'dhcp_client:a mdns_host:b',
      'dhcp_client:a mdns_host:c',
    );

    assert.equal(match.stdout.trim(), 'match_strong');
    assert.equal(strongMismatch.stdout.trim(), 'suspicious_strong');
    assert.equal(weakMismatch.stdout.trim(), 'suspicious_multifactor');
    assert.equal(ambiguous.stdout.trim(), 'insufficient');
  });

  it('creates a trusted baseline only from a strong key or two independent weak families', () => {
    assert.equal(identityKeyStrength('mdns_host:livingroom').stdout.trim(), 'insufficient');
    assert.equal(identityKeyStrength('upnp_uuid:station').stdout.trim(), 'strong');
    assert.equal(
      identityKeyStrength('dhcp_client:client123 mdns_host:livingroom').stdout.trim(),
      'multifactor',
    );
  });

  it('does not call a missing announcement a replacement and lets the original fingerprint return', () => {
    const trusted = 'upnp_uuid:original dhcp_client:client123 mdns_host:livingroom';
    const missingSignals = assessIdentityKeys(trusted, 'mdns_host:livingroom');
    const replacement = assessIdentityKeys(trusted, 'upnp_uuid:replacement mdns_host:livingroom');
    const originalReturns = assessIdentityKeys(trusted, 'upnp_uuid:original mdns_host:livingroom');

    assert.equal(missingSignals.stdout.trim(), 'insufficient');
    assert.equal(replacement.stdout.trim(), 'suspicious_strong');
    assert.equal(originalReturns.stdout.trim(), 'match_strong');
  });

  it('prefers two independent matching weak families over unrelated changing metadata', () => {
    const result = assessIdentityKeys(
      'dhcp_client:a mdns_host:b extra_one:c extra_two:d',
      'dhcp_client:a mdns_host:b extra_one:x extra_two:y',
    );

    assert.equal(result.stdout.trim(), 'match_multifactor');
  });

  it('keeps SSDP LAN-bound and never downloads an advertised description URL', () => {
    const ssdp = readFileSync(ssdpPath, 'utf8');

    assert.match(ssdp, /SO_BINDTODEVICE/);
    assert.match(ssdp, /M-SEARCH \* HTTP\/1\.1/);
    assert.match(ssdp, /MAX_RESPONSES = 128/);
    assert.doesNotMatch(ssdp, /!~/);
    assert.doesNotMatch(ssdp, /\\x00/);
    assert.match(ssdp, /ord\(source, offset\)/);
    assert.doesNotMatch(ssdp, /uclient-fetch|curl|wget|URL\.openConnection/);
  });

  it('collects bounded mDNS TXT identity fields and persists only hashed match keys', () => {
    const mdns = readFileSync(mdnsPath, 'utf8');
    const detector = readFileSync(detectorPath, 'utf8');
    const hashCommon = readFileSync(hashCommonPath, 'utf8');
    const sysupgradeKeep = readFileSync(sysupgradeKeepPath, 'utf8');

    assert.match(mdns, /identity_txt/);
    assert.match(mdns, /serialnumber/);
    assert.match(mdns, /deviceid/);
    assert.match(detector, /sheepfold_hmac_sha256_text/);
    assert.match(detector, /trusted_identity_version/);
    assert.match(detector, /current_legacy_identity_keys/);
    assert.match(hashCommon, /sheepfold_hmac_sha256_text/);
    assert.match(hashCommon, /openssl dgst -sha256 -hmac/);
    assert.match(sysupgradeKeep, /^\/etc\/sheepfold\/\.device-identity-hmac$/m);
    assert.match(detector, /detection_identity_keys/);
    assert.match(detector, /key !~ \/\^\(serial\|serialnumber\|device-id\|deviceid\|uuid\|id\)\$\//);
    assert.match(detector, /record = \$2 "\|\|" \$4 "\|"/);
    assert.match(detector, /reconcile-staged/);
  });
});
