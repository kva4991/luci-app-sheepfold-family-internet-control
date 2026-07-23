import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readOverviewApplication } from '../tools/quality/overviewApplicationSource.mjs';

const overview = readOverviewApplication('package/luci-app-sheepfold-family-internet-control/htdocs/luci-static/resources/view/sheepfold/overview.js');
const pageShell = readFileSync('package/luci-app-sheepfold-family-internet-control/htdocs/luci-static/resources/sheepfold/features/page/shell.js', 'utf8');
const routerControl = readFileSync('package/luci-app-sheepfold-family-internet-control/root/usr/libexec/sheepfold/sheepfold-router-control', 'utf8');
const styles = readFileSync('package/luci-app-sheepfold-family-internet-control/htdocs/luci-static/resources/sheepfold/sheepfold.css', 'utf8');

describe('LuCI root password gate', () => {
  it('checks the root shadow entry on the router', () => {
    assert.match(routerControl, /root_password_status\(\)/);
    assert.match(routerControl, /\/etc\/shadow/);
    assert.match(routerControl, /root-password-status/);
  });

  it('fails closed and blocks the settings page without a password', () => {
    assert.match(overview, /require sheepfold\.features\.page\.shell as pageShellModel/);
    assert.match(pageShell, /loadRootPasswordStatus\(\)/);
    assert.match(pageShell, /if \(!deps\.store\.rootPassword\(\)\.set\)/);
    assert.match(pageShell, /aria-modal': 'true'/);
    assert.match(pageShell, /L\.url\('admin\/system\/admin'\)/);
    assert.match(styles, /\.sf-root-password-gate[\s\S]*position: fixed[\s\S]*z-index: 10000/);
  });
});
