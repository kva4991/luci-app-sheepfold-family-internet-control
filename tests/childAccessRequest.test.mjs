/*
 * Проверяет добровольный запрос ребёнка на дополнительные 30 минут от LuCI до
 * обоих APK. Это контрактный тест исходников: доставку уведомления на физический
 * телефон и сетевую идентификацию ребёнка надо отдельно проверять на роутере.
 */
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

const read = (path) => readFileSync(path, 'utf8');
const overview = read('package/luci-app-sheepfold-family-internet-control/htdocs/luci-static/resources/view/sheepfold/overview.js');
const administratorEditor = read('package/luci-app-sheepfold-family-internet-control/htdocs/luci-static/resources/sheepfold/features/administrators/editor.js');
const accessRequest = read('package/luci-app-sheepfold-family-internet-control/root/usr/libexec/sheepfold/sheepfold-access-request');
const api = read('package/luci-app-sheepfold-family-internet-control/root/www/cgi-bin/sheepfold-api');
const clientStatus = read('package/luci-app-sheepfold-family-internet-control/root/usr/libexec/sheepfold/sheepfold-api-client-status');
const childRepository = read('android-child/app/src/main/java/com/example/sheepfoldchild/data/ClientStatusRepository.kt');
const childScreen = read('android-child/app/src/main/java/com/example/sheepfoldchild/ui/ChildStatusScreen.kt');
const parentClient = read('android/app/src/main/java/app/sheepfold/android/router/RouterAdminClient.kt');
const worker = read('android/app/src/main/java/app/sheepfold/android/notifications/AccessRequestWorker.kt');
const hardening = read('package/luci-app-sheepfold-family-internet-control/root/usr/libexec/sheepfold/sheepfold-runtime-hardening');

describe('Optional child request for 30 minutes', () => {
  it('is disabled per administrator by default and is visible in LuCI settings', () => {
    assert.match(overview, /allow_child_access_requests/);
    assert.match(overview, /allowChildAccessRequests: false/);
    assert.match(administratorEditor, /never grants internet automatically/);
  });

  it('identifies the child from router-side network data and only creates a request', () => {
    assert.match(accessRequest, /mac_for_ip/);
    assert.match(accessRequest, /\/tmp\/dhcp\.leases/);
    assert.match(accessRequest, /\/proc\/net\/arp/);
    assert.match(accessRequest, /allow_child_access_requests/);
    assert.match(accessRequest, /STATE_DIR="\/tmp\/sheepfold\/access-requests"/);
    assert.doesNotMatch(accessRequest, /grant[-_ ]temporary|temp-access/);
  });

  it('publishes rate-limited child and authenticated parent endpoints', () => {
    assert.match(api, /\/access-request\)/);
    assert.match(api, /enforce_rate_limit access_request 3 300/);
    assert.match(api, /\/access-requests\)/);
    assert.match(api, /require_admin/);
    assert.match(clientStatus, /"canRequestAccessExtension"/);
  });

  it('connects both Android applications to the router queue', () => {
    assert.match(childRepository, /ACCESS_REQUEST_ENDPOINT/);
    assert.match(childScreen, /access_request_30_minutes/);
    assert.match(parentClient, /loadChildAccessRequests/);
    assert.match(worker, /PeriodicWorkRequestBuilder<AccessRequestWorker>/);
    assert.match(worker, /notifyAccessRequestOnce/);
  });

  it('ships and validates the router helper through common hardening', () => {
    assert.match(hardening, /ACCESS_REQUEST=.*sheepfold-access-request/);
    assert.match(hardening, /"\$STATUS_API" "\$ACCESS_REQUEST"/);
  });
});
