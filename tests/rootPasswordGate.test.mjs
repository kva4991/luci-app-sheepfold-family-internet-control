import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

const overview = readFileSync('package/luci-app-sheepfold-family-internet-control/htdocs/luci-static/resources/view/sheepfold/overview.js', 'utf8');
const routerControl = readFileSync('package/luci-app-sheepfold-family-internet-control/root/usr/libexec/sheepfold/sheepfold-router-control', 'utf8');
const styles = readFileSync('package/luci-app-sheepfold-family-internet-control/htdocs/luci-static/resources/sheepfold/sheepfold.css', 'utf8');

describe('LuCI root password gate', () => {
  it('checks the root shadow entry on the router', () => {
    assert.match(routerControl, /root_password_status\(\)/);
    assert.match(routerControl, /\/etc\/shadow/);
    assert.match(routerControl, /root-password-status/);
  });

  it('fails closed and blocks the settings page without a password', () => {
    assert.match(overview, /var rootPasswordIsSet = false/);
    assert.match(overview, /loadRootPasswordStatus\(\)/);
    assert.match(overview, /if \(!rootPasswordIsSet\)/);
    assert.match(overview, /aria-modal': 'true'/);
    assert.match(overview, /L\.url\('admin\/system\/admin'\)/);
    assert.match(styles, /\.sf-root-password-gate[\s\S]*position: fixed[\s\S]*z-index: 10000/);
  });
});
