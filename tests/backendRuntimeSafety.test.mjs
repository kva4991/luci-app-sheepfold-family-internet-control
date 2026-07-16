import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

const read = (path) => readFileSync(path, 'utf8');

describe('Backend runtime input bounds', () => {
  it('validates the HTTPS API port everywhere it is consumed', () => {
    const init = read('package/luci-app-sheepfold-family-internet-control/root/etc/init.d/sheepfold');
    const api = read('package/luci-app-sheepfold-family-internet-control/root/usr/libexec/sheepfold/sheepfold-api-legacy');
    const discovery = read('package/luci-app-sheepfold-family-internet-control/root/www/.well-known/sheepfold.json.sh');
    const testBuilder = read('scripts/build-test-ipk.py');

    assert.match(init, /valid_port/);
    for (const source of [init, api, discovery, testBuilder]) {
      assert.match(source, /-ge 1/);
      assert.match(source, /-le 65535/);
    }
  });

  it('bounds nmap time, retries, port-list length, and host count', () => {
    const detector = read('package/luci-app-sheepfold-family-internet-control/root/usr/libexec/sheepfold/sheepfold-device-detector');

    assert.match(detector, /max_seconds.*-le 60/);
    assert.match(detector, /\$\{#ports\}.*-le 256/);
    assert.match(detector, /--max-retries 1/);
    assert.match(detector, /max_hosts.*-le 64/);
  });

  it('rejects an unknown global-block value instead of disabling protection', () => {
    const api = read('package/luci-app-sheepfold-family-internet-control/root/usr/libexec/sheepfold/sheepfold-api-legacy');
    const globalBlock = api.slice(
      api.indexOf('global_block_json() {'),
      api.indexOf('log_json() {'),
    );

    assert.match(globalBlock, /1\|true\|on/);
    assert.match(globalBlock, /0\|false\|off/);
    assert.match(globalBlock, /invalid_global_block_value/);
    assert.doesNotMatch(globalBlock, /\*\)\s*\n\s*ctrl_result=.*global-block-off/);
  });
});
