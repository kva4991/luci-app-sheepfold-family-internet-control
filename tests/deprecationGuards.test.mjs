import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const packageDir = resolve(repoRoot, 'package/luci-app-sheepfold-family-internet-control');

function readProjectFile(path) {
  return readFileSync(resolve(packageDir, path), 'utf8');
}

describe('Deprecation guards', () => {
  it('keeps LuCI wrappers off BaseView.extend', () => {
    for (const file of [
      'htdocs/luci-static/resources/view/sheepfold/overview-secure.js',
      'htdocs/luci-static/resources/view/sheepfold/overview-personal.js',
    ]) {
      const source = readProjectFile(file);
      assert.doesNotMatch(source, /BaseView\.extend\(/, `${file} must not use BaseView.extend`);
      assert.match(source, /return view\.extend\(/, `${file} must return a view.extend delegate`);
    }
  });

  it('rejects oversized legacy API request bodies before reading stdin', () => {
    const apiLegacy = readProjectFile('root/usr/libexec/sheepfold/sheepfold-api-legacy');

    assert.match(apiLegacy, /MAX_REQUEST_BODY_BYTES=65536/);
    assert.match(apiLegacy, /read_request_body_checked/);
    assert.match(apiLegacy, /request_too_large/);
    assert.match(apiLegacy, /413 Payload Too Large/);
    assert.match(apiLegacy, /body="\$\(read_request_body\)" \|\| status=\$\?/);
    assert.doesNotMatch(apiLegacy, /body="\$\(read_request_body_checked\)" \|\| status=\$\?/);
  });

  it('blocks deprecated HTTP routes inside api-legacy and CGI', () => {
    const apiLegacy = readProjectFile('root/usr/libexec/sheepfold/sheepfold-api-legacy');
    const cgi = readProjectFile('root/www/cgi-bin/sheepfold-api');

    assert.match(apiLegacy, /blocked_public_path/);
    assert.match(apiLegacy, /\/pair-token\)/);
    assert.match(apiLegacy, /\/settings\/save\)/);
    assert.match(apiLegacy, /query_token_forbidden/);
    assert.doesNotMatch(apiLegacy, /generate_pair_token_json/);
    assert.doesNotMatch(apiLegacy, /settings_save_json/);
    assert.doesNotMatch(apiLegacy, /bearer="\$\(form_get token/);
    assert.match(
      apiLegacy,
      /form_get token "\$QUERY_STRING"\)[\s\S]*query_token_forbidden/,
      'query token must be rejected, not accepted as auth',
    );

    assert.match(cgi, /\/pair-token/);
    assert.match(cgi, /404 Not Found/);
    assert.match(cgi, /legacy_settings_writer_disabled/);
  });

  it('documents that legacy filenames are facade backends, not old releases', () => {
    const rules = readFileSync(resolve(repoRoot, 'CODING_RULES.md'), 'utf8');
    const routerLegacy = readProjectFile('root/usr/libexec/sheepfold/sheepfold-router-control-legacy');

    assert.match(rules, /8\.4\. Имена `\*-legacy` в Sheepfold/);
    assert.match(routerLegacy, /основной корпус CLI-команд/);
  });
});
