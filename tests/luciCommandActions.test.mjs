/*
 * Verifies the shared LuCI mutation boundary without a browser or router. Runtime
 * fixtures prove coalescing, control restoration and structured shell errors;
 * actual UCI/nftables effects remain live-router evidence. §frontmod §apicon1
 */
import assert from 'node:assert/strict';
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { describe, it } from 'node:test';

const read = (path) => readFileSync(path, 'utf8');
const packageRoot = 'package/luci-app-sheepfold-family-internet-control';
const actionsPath = `${packageRoot}/htdocs/luci-static/resources/sheepfold/core/backend/actions.js`;
const routerPath = `${packageRoot}/htdocs/luci-static/resources/sheepfold/core/backend/router.js`;
const wrapperPath = `${packageRoot}/root/usr/libexec/sheepfold/sheepfold-luci-action`;
const actionsSource = read(actionsPath);
const routerSource = read(routerPath);
const overview = read(`${packageRoot}/htdocs/luci-static/resources/sheepfold/features/overview/application.js`);
const secure = read(`${packageRoot}/htdocs/luci-static/resources/view/sheepfold/overview-secure.js`);
const pageShell = read(`${packageRoot}/htdocs/luci-static/resources/sheepfold/features/page/shell.js`);
const deviceController = read(`${packageRoot}/htdocs/luci-static/resources/sheepfold/features/devices/controller.js`);
const scheduleController = read(`${packageRoot}/htdocs/luci-static/resources/sheepfold/features/schedules/controller.js`);
const settingsController = read(`${packageRoot}/htdocs/luci-static/resources/sheepfold/features/settings/controller.js`);
const feedback = read(`${packageRoot}/htdocs/luci-static/resources/sheepfold/features/feedback/panel.js`);
const notifications = read(`${packageRoot}/htdocs/luci-static/resources/sheepfold/features/notifications/settings.js`);
const scheduleView = read(`${packageRoot}/htdocs/luci-static/resources/sheepfold/features/schedules/view.js`);
const scheduleEditor = read(`${packageRoot}/htdocs/luci-static/resources/sheepfold/features/schedules/editor.js`);
const detectionTools = read(`${packageRoot}/htdocs/luci-static/resources/sheepfold/features/devices/detection-tools.js`);
const acl = read(`${packageRoot}/root/usr/share/rpcd/acl.d/luci-app-sheepfold-family-internet-control.json`);
const makefile = read(`${packageRoot}/Makefile`);
const eslint = read('eslint.config.js');

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((onResolve, onReject) => {
    resolve = onResolve;
    reject = onReject;
  });
  return { promise, resolve, reject };
}

function fakeButton(text = 'Run', initiallyDisabled = false) {
  const attributes = new Map();
  const classes = new Set();
  return {
    disabled: initiallyDisabled,
    textContent: text,
    classList: {
      add: (value) => classes.add(value),
      remove: (value) => classes.delete(value),
      contains: (value) => classes.has(value),
    },
    getAttribute: (name) => attributes.has(name) ? attributes.get(name) : null,
    setAttribute: (name, value) => attributes.set(name, String(value)),
    removeAttribute: (name) => attributes.delete(name),
  };
}

function loadActions(documentImpl = { querySelectorAll: () => [] }) {
  return new Function('baseclass', 'document', actionsSource)(
    { extend: (value) => value },
    documentImpl,
  );
}

function createRunner(run, notifications = [], extra = {}) {
  return loadActions().create({
    run,
    notify: (message, level) => notifications.push({ message, level }),
    ...extra,
  });
}

function loadRouter(fsImpl) {
  return new Function('baseclass', 'fs', '_', 'window', routerSource)(
    { extend: (value) => value },
    fsImpl,
    (value) => value,
    { setTimeout, clearTimeout },
  );
}

describe('LuCI command actions §apicon1', () => {
  it('coalesces one mutation key and restores every linked control exactly', async () => {
    const pending = deferred();
    const calls = [];
    const firstButton = fakeButton('Apply');
    const secondButton = fakeButton('Apply elsewhere', true);
    const linkedButton = fakeButton('Linked action');
    linkedButton.setAttribute('data-sf-action-key', 'device:7:block');
    const model = loadActions({ querySelectorAll: () => [linkedButton] }).create({
      run: (args) => {
        calls.push(args);
        return pending.promise;
      },
      notify: () => {},
    });

    const first = model.execute({
      key: 'device:7:block',
      args: ['device-block', 'AA:BB:CC:DD:EE:FF'],
      button: firstButton,
      busyText: 'Applying…',
      silent: true,
    });
    const second = model.execute({
      key: 'device:7:block',
      args: ['device-block', 'AA:BB:CC:DD:EE:FF'],
      button: secondButton,
      busyText: 'Applying…',
      silent: true,
    });

    assert.strictEqual(first, second);
    assert.equal(calls.length, 0, 'execution starts in a microtask');
    assert.equal(firstButton.disabled, true);
    assert.equal(secondButton.disabled, true);
    assert.equal(linkedButton.disabled, true);
    assert.equal(firstButton.textContent, 'Applying…');
    assert.equal(firstButton.getAttribute('aria-busy'), 'true');
    assert.equal(firstButton.classList.contains('sf-command-busy'), true);

    await Promise.resolve();
    assert.equal(calls.length, 1);
    pending.resolve({ code: 0, stdout: 'OK\n', stderr: '' });
    await first;

    assert.equal(firstButton.disabled, false);
    assert.equal(secondButton.disabled, true, 'pre-existing disabled state is restored');
    assert.equal(firstButton.textContent, 'Apply');
    assert.equal(secondButton.textContent, 'Apply elsewhere');
    assert.equal(linkedButton.disabled, false);
    assert.equal(linkedButton.textContent, 'Linked action');
    assert.equal(firstButton.getAttribute('aria-busy'), null);
    assert.deepEqual(model.activeKeys(), []);
  });

  it('rejects JSON and key=value failures even when the process exit code is zero', async () => {
    const jsonModel = createRunner(async () => ({
      code: 0,
      stdout: '{"ok":false,"error":{"code":"revision_conflict","message":"Reload data"}}',
      stderr: '',
    }));
    await assert.rejects(
      jsonModel.execute({ key: 'json', args: ['json'], silent: true }),
      (error) => error.errorCode === 'revision_conflict' && error.message === 'Reload data',
    );

    const kvModel = createRunner(async () => ({
      code: 0,
      stdout: 'status=error\nerror_code=invalid_timezone\nmessage=Choose another timezone\n',
      stderr: '',
    }));
    await assert.rejects(
      kvModel.execute({ key: 'kv', args: ['kv'], parse: 'kv', silent: true }),
      (error) => error.errorCode === 'invalid_timezone' && error.status === 'error',
    );
  });

  it('runs the subject callback and one local refresh before one success notification', async () => {
    const order = [];
    const notificationsLog = [];
    const model = createRunner(
      async () => ({ code: 0, stdout: 'status=ok\nmessage=done\n', stderr: '' }),
      notificationsLog,
    );

    const response = await model.execute({
      key: 'refresh',
      args: ['schedule-sync'],
      parse: 'kv',
      successMessage: 'Saved',
      onSuccess: async (value) => {
        assert.equal(value.data.status, 'ok');
        order.push('success');
      },
      refresh: async (value) => {
        assert.equal(value.data.status, 'ok');
        order.push('refresh');
      },
    });
    order.push('returned');

    assert.equal(response.data.message, 'done');
    assert.deepEqual(order, ['success', 'refresh', 'returned']);
    assert.deepEqual(notificationsLog, [{ message: 'Saved', level: 'info' }]);
  });

  it('emits one contextual error notification and restores the initiating button', async () => {
    const notificationsLog = [];
    const button = fakeButton();
    const model = createRunner(async () => ({
      code: 9,
      stdout: '',
      stderr: 'backend refused the mutation',
    }), notificationsLog);

    await assert.rejects(
      model.execute({
        key: 'failed',
        args: ['device-block'],
        button,
        errorMessage: 'Could not block device.',
      }),
      /backend refused the mutation/,
    );

    assert.equal(button.disabled, false);
    assert.deepEqual(notificationsLog, [
      { message: 'Could not block device. backend refused the mutation', level: 'warning' },
    ]);
  });

  it('requires a stable key for composite tasks and keeps independent keys concurrent', async () => {
    const left = deferred();
    const right = deferred();
    const model = createRunner((args) => args[0] === 'left' ? left.promise : right.promise);

    assert.throws(() => model.execute({ task: async () => null }), /stable key/);
    assert.throws(() => model.execute({ silent: true }), /command arguments or a stable key/);
    const leftPromise = model.execute({ key: 'left', args: ['left'], silent: true });
    const rightPromise = model.execute({ key: 'right', args: ['right'], silent: true });
    await Promise.resolve();
    assert.deepEqual(model.activeKeys().sort(), ['left', 'right']);

    left.resolve({ code: 0, stdout: 'OK', stderr: '' });
    right.resolve({ code: 0, stdout: 'OK', stderr: '' });
    await Promise.all([leftPromise, rightPromise]);
  });

  it('preserves legacy stdout and adds bounded machine-readable shell errors', () => {
    const root = mkdtempSync(join(tmpdir(), 'sheepfold-luci-action-'));
    const control = join(root, 'router-control');
    writeFileSync(control, `#!/bin/sh
[ "$1" = --luci ] || exit 90
shift
command="$1"; shift
case "$command" in
  success) printf 'status=ok\\nmessage=done\\n'; printf 'legacy warning\\n' >&2 ;;
  invalid) printf 'Invalid MAC: bad\\n' >&2; exit 2 ;;
  admin) printf 'Administrator device cannot be blocked.\\n' >&2; exit 3 ;;
  blocked) printf 'Device is in blocklist. Temporary access cannot override blocklist.\\n' >&2; exit 3 ;;
  *) printf 'unexpected failure\\n' >&2; exit 7 ;;
esac
`);
    chmodSync(control, 0o755);
    const run = (command, ...args) => spawnSync('sh', [wrapperPath, command, ...args], {
      encoding: 'utf8',
      env: {
        ...process.env,
        SHEEPFOLD_ROUTER_CONTROL: control,
        SHEEPFOLD_LUCI_ACTION_RUNTIME_DIR: join(root, 'runtime'),
      },
    });

    try {
      const success = run('success', 'secret-value');
      assert.equal(success.status, 0, success.stderr);
      assert.equal(success.stdout, 'status=ok\nmessage=done\n');
      assert.match(success.stderr, /actionStatus=ok/);
      assert.match(success.stderr, /^actionErrorCode=$/m);
      assert.match(success.stderr, /actionCommand=success/);
      assert.match(success.stderr, /legacy warning/);
      assert.doesNotMatch(success.stderr, /secret-value/);

      const invalid = run('invalid');
      assert.equal(invalid.status, 2);
      assert.match(invalid.stderr, /actionErrorCode=invalid_mac/);
      const admin = run('admin');
      assert.match(admin.stderr, /actionErrorCode=administrator_device/);
      const blocked = run('blocked');
      assert.match(blocked.stderr, /actionErrorCode=device_blocklisted/);
      const generic = run('generic');
      assert.match(generic.stderr, /actionErrorCode=backend_exit_7/);

      const unavailable = spawnSync('sh', [wrapperPath, 'success'], {
        encoding: 'utf8',
        env: {
          ...process.env,
          SHEEPFOLD_ROUTER_CONTROL: join(root, 'missing-router-control'),
          SHEEPFOLD_LUCI_ACTION_RUNTIME_DIR: join(root, 'runtime-missing'),
        },
      });
      assert.equal(unavailable.status, 127);
      assert.match(unavailable.stderr, /actionErrorCode=runtime_unavailable/);
      const missingRuntime = spawnSync('sh', [wrapperPath, 'success'], {
        encoding: 'utf8',
        env: {
          ...process.env,
          SHEEPFOLD_ROUTER_CONTROL: join(root, 'missing-router-control'),
          SHEEPFOLD_LUCI_ACTION_RUNTIME_DIR: join(root, 'missing-runtime'),
        },
      });
      assert.equal(missingRuntime.status, 127);
      assert.match(missingRuntime.stderr, /actionErrorCode=runtime_unavailable/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('maps helper metadata to stable LuCI errors without changing key=value stdout', () => {
    const router = loadRouter({ exec: async () => ({ code: 0, stdout: '' }) });
    const result = {
      code: 3,
      stdout: 'status=error\n',
      stderr: [
        'actionStatus=error',
        'actionCommand=device-temp-access',
        'actionErrorCode=device_blocklisted',
        'actionExitCode=3',
        'actionMessage=Device is in blocklist.',
        'Device is in blocklist. Temporary access cannot override blocklist.',
      ].join('\n'),
    };

    assert.deepEqual(router.parseKeyValues(result.stdout), { status: 'error' });
    assert.equal(router.actionMetadata(result).errorCode, 'device_blocklisted');
    assert.equal(router.errorText({ result, errorCode: 'device_blocklisted' }, 'fallback'), 'Remove the device from the blocklist first.');
    assert.throws(
      () => router.ensureOk(result, 'fallback'),
      (error) => error.errorCode === 'device_blocklisted' && error.command === 'device-temp-access',
    );
  });

  it('wires high-risk LuCI actions through the shared runner and helper ACL', () => {
    assert.match(overview, /require sheepfold\.core\.backend\.actions as commandActionsModel/);
    assert.match(overview, /var commandActions = commandActionsModel\.create/);
    assert.match(overview, /function runCommand\(args, options\)[\s\S]*commandActions\.run/);
    assert.match(pageShell, /key: 'global-internet-toggle'/);
    assert.match(pageShell, /args: \[command\]/);
    assert.match(deviceController, /key: 'device-temp-access:' \+ mac/);
    assert.match(deviceController, /key: 'device-list-batch:' \+ targetStatus/);
    assert.match(deviceController, /key: 'manual-device:' \+ mac/);
    assert.match(scheduleController, /key = 'schedule-save:' \+ String\(ownName \|\| 'new'\)/);
    assert.match(scheduleController, /key: 'schedule-state:' \+ section\['\.name'\]/);
    assert.match(scheduleController, /key: 'schedule-delete:' \+ section\['\.name'\]/);
    assert.match(settingsController, /key: 'child-wifi-history-clear'/);
    assert.match(secure, /require sheepfold\.core\.backend\.actions as commandActionsModel/);
    assert.doesNotMatch(secure, /fs\.exec\('\/usr\/libexec\/sheepfold\/sheepfold-router-control'/);
    assert.match(feedback, /deps\.runAction\(\[/);
    assert.match(settingsController, /renderFeedback[\s\S]*runAction: deps\.run[\s\S]*runCommand: deps\.run/);
    assert.doesNotMatch(feedback, /button\.disabled = true|routerBackend\.withTimeout/);
    assert.match(notifications, /deps\.clearWifiHistory\(event\.currentTarget\)/);
    assert.match(scheduleView, /deps\.setEnabled\(section, event\.currentTarget\.checked, event\.currentTarget\)/);
    assert.match(scheduleView, /deps\.remove\(section, event\.currentTarget\)/);
    assert.match(scheduleEditor, /deps\.persist\(draft, ownName, button\)/);
    assert.match(detectionTools, /data-sf-action-key': 'device-detection-install-nmap/);
    assert.match(acl, /sheepfold-luci-action/);
    assert.match(eslint, /commandActionsModel: 'readonly'/);
    const release = Number(makefile.match(/^PKG_RELEASE:=(\d+)$/m)?.[1] || 0);
    assert.ok(release >= 252);
  });
});
