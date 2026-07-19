/*
 * Проверяет границу безопасности UPnP/WS-Discovery: роутер может прочитать
 * небольшое описание только у ответившего LAN-узла и никогда не следует по
 * произвольным URL из multicast-ответов. Тест использует локальные заглушки,
 * не выходит в сеть и не доказывает совместимость socket API живого OpenWrt.
 */
import { spawnSync } from 'node:child_process';
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { delimiter, dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const packageRoot = resolve(repoRoot, 'package/luci-app-sheepfold-family-internet-control');
const upnpDescriptionPath = resolve(packageRoot, 'root/usr/libexec/sheepfold/sheepfold-device-upnp-description');
const hashCommonPath = resolve(packageRoot, 'root/usr/libexec/sheepfold/sheepfold-hash-common');
const wsdSourcePath = resolve(packageRoot, 'root/usr/share/sheepfold/device-ws-discovery.uc');
const wsdWrapperPath = resolve(packageRoot, 'root/usr/libexec/sheepfold/sheepfold-device-ws-discovery');
const detectorPath = resolve(packageRoot, 'root/usr/libexec/sheepfold/sheepfold-device-detector');
const temporaryDirectories = [];

function posix(path) {
  return path.replace(/\\/g, '/').replace(/^([A-Za-z]):/, (_, drive) => `/${drive.toLowerCase()}`);
}

function shellPath(path) {
  return posix(relative(repoRoot, path));
}

function createUpnpFixture({ httpStatus = '200' } = {}) {

  mkdirSync(resolve('.build'), { recursive: true });
  const root = mkdtempSync(resolve('.build', 'sheepfold-upnp-security-'));
  const bin = join(root, 'bin');
  const cache = join(root, 'cache');
  const curlArgs = join(root, 'curl-args.txt');
  const ubus = join(bin, 'ubus');
  const ip = join(bin, 'ip');
  const curl = join(bin, 'curl');
  const jshn = join(root, 'jshn.sh');

  temporaryDirectories.push(root);
  mkdirSync(bin, { recursive: true });
  mkdirSync(cache, { recursive: true });
  writeFileSync(ubus, `#!/bin/sh
printf '%s\\n' '{"l3_device":"br-lan","ipv4-address":[{"address":"192.168.1.1"}]}'
`, 'utf8');
  writeFileSync(jshn, `#!/bin/sh
json_load() { return 0; }
json_get_var() {
  case "$2" in
    l3_device) eval "$1='br-lan'" ;;
    device) eval "$1=''" ;;
  esac
}
json_cleanup() { :; }
`, 'utf8');
  writeFileSync(ip, `#!/bin/sh
case "$*" in
  '-4 -o addr show dev br-lan') printf '%s\\n' '2: br-lan inet 192.168.1.1/24 scope global br-lan' ;;
  '-4 neigh show dev br-lan') printf '%s\\n' '192.168.1.20 dev br-lan lladdr 00:11:22:33:44:55 REACHABLE' ;;
esac
`, 'utf8');
  writeFileSync(curl, `#!/bin/sh
printf '%s\\n' "$@" > "$SHEEPFOLD_TEST_CURL_ARGS"
output=''
while test "$#" -gt 0; do
  if test "$1" = --output; then shift; output="$1"; fi
  shift
done
test -z "$output" || printf '%s' '<root><device><deviceType>urn:schemas-upnp-org:device:MediaRenderer:1</deviceType><friendlyName>Living room</friendlyName><manufacturer>Example</manufacturer><modelName>Speaker One</modelName><serialNumber>SERIAL-1234</serialNumber><UDN>uuid:shared-device</UDN></device></root>' > "$output"
printf '%s' '${httpStatus}'
`, 'utf8');
  for (const file of [ubus, ip, curl, jshn])
    chmodSync(file, 0o755);

  return {
    cache,
    curlArgs,
    env: {
      ...process.env,
      PATH: `${bin}${delimiter}${process.env.PATH}`,
      SHEEPFOLD_HASH_COMMON: shellPath(hashCommonPath),
      SHEEPFOLD_UPNP_CACHE_DIR: shellPath(cache),
      SHEEPFOLD_UBUS_BIN: shellPath(ubus),
      SHEEPFOLD_IP_BIN: shellPath(ip),
      SHEEPFOLD_CURL_BIN: shellPath(curl),
      SHEEPFOLD_UPNP_JSHN_LIB: shellPath(jshn),
      SHEEPFOLD_TEST_CURL_ARGS: shellPath(curlArgs),
    },
  };
}

function runUpnp(location, fixture, peerIp = '192.168.1.20') {
  return spawnSync('sh', [upnpDescriptionPath, peerIp, location, '900'], {
    cwd: repoRoot,
    env: fixture.env,
    encoding: 'utf8',
  });
}

afterEach(() => {
  while (temporaryDirectories.length)
    rmSync(temporaryDirectories.pop(), { recursive: true, force: true });
});

describe('bounded LAN discovery §devident1', () => {
  it('fetches one peer-pinned UPnP description with strict transport limits', () => {
    const fixture = createUpnpFixture();
    const result = runUpnp('http://192.168.1.20:1400/device.xml', fixture);

    assert.equal(result.status, 0, result.stderr);
    const curlArgs = readFileSync(fixture.curlArgs, 'utf8');
    const cache = readFileSync(join(fixture.cache, '192_168_1_20.tsv'), 'utf8');
    const helper = readFileSync(upnpDescriptionPath, 'utf8');

    assert.match(curlArgs, /--interface\nbr-lan/);
    assert.match(curlArgs, /--noproxy\n\*/);
    assert.match(curlArgs, /--proto\n=http/);
    assert.match(curlArgs, /--max-redirs\n0/);
    assert.match(curlArgs, /--max-filesize\n65536/);
    assert.doesNotMatch(curlArgs, /--location/);
    assert.match(helper, /jshn\.sh/);
    assert.doesNotMatch(helper, /\|\s*jsonfilter\b/);
    assert.match(cache, /MediaRenderer/);
    assert.match(cache, /SERIAL-1234/);
  });

  it('rejects foreign hosts, router addresses, userinfo and non-HTTP schemes before curl', () => {
    const rejectedLocations = [
      'https://192.168.1.20/device.xml',
      'http://192.168.1.1/device.xml',
      'http://127.0.0.1/device.xml',
      'http://example.com/device.xml',
      'http://192.168.1.20@127.0.0.1/device.xml',
    ];

    for (const location of rejectedLocations) {
      const fixture = createUpnpFixture();
      const result = runUpnp(location, fixture);

      assert.notEqual(result.status, 0, `Опасный LOCATION прошёл проверку: ${location}`);
      assert.throws(() => readFileSync(fixture.curlArgs, 'utf8'));
    }

    const ambiguousIpFixture = createUpnpFixture();
    const ambiguousIpResult = runUpnp(
      'http://0192.168.1.20/device.xml',
      ambiguousIpFixture,
      '0192.168.1.20',
    );
    assert.notEqual(ambiguousIpResult.status, 0);
    assert.throws(() => readFileSync(ambiguousIpFixture.curlArgs, 'utf8'));
  });

  it('rejects non-success HTTP responses and never follows WS-Discovery XAddrs', () => {
    const fixture = createUpnpFixture({ httpStatus: '302' });
    const result = runUpnp('http://192.168.1.20/device.xml', fixture);
    const wsd = readFileSync(wsdSourcePath, 'utf8');
    const wsdWrapper = readFileSync(wsdWrapperPath, 'utf8');
    const detector = readFileSync(detectorPath, 'utf8');

    assert.notEqual(result.status, 0);
    assert.match(wsd, /SO_BINDTODEVICE/);
    assert.match(wsd, /IP_ADD_MEMBERSHIP/);
    assert.match(wsd, /MAX_MESSAGES = 96/);
    assert.match(wsd, /MAX_POLLS = 10/);
    assert.match(wsd, /ACTIVE_PROBE/);
    assert.match(wsd, /clock\(\)/);
    assert.match(wsdWrapper, /SHEEPFOLD_WSD_ACTIVE_PROBE="\$FORCE"/);
    assert.equal((wsd.match(/sock\.send\(/g) || []).length, 1);
    assert.match(wsd, /if \(ACTIVE_PROBE\)\s*sock\.send/);
    assert.doesNotMatch(wsd, /uclient-fetch|curl|wget|URL\.openConnection/);
    assert.match(detector, /record = \$3 "\|" \$4/);
    assert.doesNotMatch(detector, /detection_wsd_profile[^\n]*\$5/);
  });
});
