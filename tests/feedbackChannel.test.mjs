import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it } from 'node:test';

const root = resolve(import.meta.dirname, '..');
const pkg = resolve(root, 'package/luci-app-sheepfold-family-internet-control');
const read = (path) => readFileSync(resolve(root, path), 'utf8');
const readPkg = (path) => readFileSync(resolve(pkg, path), 'utf8');

describe('optional feedback channel', () => {
  it('keeps the cloud endpoint behind the authenticated router API', () => {
    const api = readPkg('root/www/cgi-bin/sheepfold-api');
    assert.match(api, /\/feedback\)[\s\S]*require_admin[\s\S]*run_legacy/);
    assert.match(api, /enforce_rate_limit feedback 3 3600/);
  });

  it('validates fields and sends only to Yandex Cloud HTTPS endpoints', () => {
    const backend = readPkg('root/usr/libexec/sheepfold/sheepfold-feedback');
    assert.match(backend, /https:\/\/functions\.yandexcloud\.net/);
    assert.match(backend, /apigw\.yandexcloud\.net/);
    assert.match(backend, /validate_text "\$message" 10 4000/);
    assert.match(backend, /\/usr\/share\/libubox\/jshn\.sh/);
    assert.match(backend, /json_add_string schemaVersion "2"/);
    assert.match(backend, /json_add_object diagnostics/);
    assert.match(backend, /json_add_string deviceCount/);
    assert.doesNotMatch(
      backend,
      /json_add_string (deviceName|macAddress|ipAddress|ssid|password|token|apiKey|journal|browsingHistory)/i
    );
  });

  it('adds LuCI and parent Android tabs but not a child Android tab', () => {
    const overview = readPkg('htdocs/luci-static/resources/view/sheepfold/overview.js');
    const parent = read('android/app/src/main/java/app/sheepfold/android/ui/main/OperationalMainScreen.kt');
    const childNavigation = read('android-child/app/src/main/java/com/example/sheepfoldchild/ui/MainNavigation.kt');
    assert.match(overview, /\['feedback', 'Feedback \/ suggestions'\]/);
    assert.match(parent, /R\.string\.tab_feedback/);
    assert.doesNotMatch(childNavigation, /feedback|отзыв/i);
  });

  it('stores only the declared schema and never logs feedback content', () => {
    const cloud = read('cloud/yandex-feedback/index.py');
    const schema = read('cloud/yandex-feedback/schema.yql');
    assert.match(cloud, /hmac\.new/);
    assert.match(cloud, /MAX_FEEDBACK_PER_HOUR = 5/);
    assert.match(cloud, /ALLOWED_DIAGNOSTICS/);
    assert.match(cloud, /set\(diagnostics\) - ALLOWED_DIAGNOSTICS/);
    assert.doesNotMatch(cloud, /print\([^\n]*(message|contact)/);
    assert.match(schema, /TTL = Interval\("P730D"\) ON created_at/);
    assert.match(schema, /diagnostics_json Utf8/);
    assert.doesNotMatch(schema, /mac|ip_address|device_list|logs/i);
  });

  it('documents the narrow privacy exception and setup path', () => {
    const privacy = read('docs/privacy.ru.md');
    const setup = read('docs/yandex-cloud-ydb-feedback.ru.md');
    assert.match(privacy, /§feedback/);
    assert.match(setup, /API Gateway/);
    assert.match(setup, /functions\.functionInvoker/);
    assert.match(setup, /feedback_endpoint/);
    assert.match(setup, /100 000 запросов API Gateway/);
    assert.match(setup, /не передаются.*полный UCI-конфиг/is);
  });
});
