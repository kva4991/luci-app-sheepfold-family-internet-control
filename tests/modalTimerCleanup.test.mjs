/*
 * Поведенчески проверяет освобождение interval модалки конфликта расписаний.
 * Минимальная DOM-модель воспроизводит только контракт LuCI E()/ui.showModal;
 * тест не доказывает геометрию, стили и поведение настоящего браузера. §frontmod §testwhy
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import vm from 'node:vm';
import { describe, it } from 'node:test';

const controllerPath = resolve(
  'package/luci-app-sheepfold-family-internet-control/htdocs/luci-static/resources/sheepfold/features/schedules/controller.js',
);

function textOf(node) {
  if (node == null) return '';
  if (typeof node !== 'object') return String(node);
  return (node.children || []).map(textOf).join('');
}

function flatten(node, result = []) {
  if (node == null || typeof node !== 'object') return result;
  result.push(node);
  for (const child of node.children || []) flatten(child, result);
  return result;
}

function harness() {
  const source = readFileSync(controllerPath, 'utf8').replace(/^'require .*?';\r?\n/gm, '');
  const intervals = new Map();
  const cleared = [];
  let nextTimer = 1;
  let modalNodes = [];

  function E(tag, attributes = {}, children = []) {
    const childList = Array.isArray(children) ? children : [children];
    return Object.assign({
      tag,
      children: childList,
      textContent: childList.map(textOf).join(''),
      isConnected: true,
    }, attributes);
  }

  const ui = {
    showModal(_title, nodes) {
      modalNodes = nodes;
    },
    hideModal() {},
  };
  const window = {
    setInterval(callback) {
      const id = nextTimer++;
      intervals.set(id, callback);
      return id;
    },
    clearInterval(id) {
      cleared.push(id);
      intervals.delete(id);
    },
  };
  const context = {
    module: { exports: {} },
    baseclass: { extend: (value) => value },
    _,
    E,
    ui,
    window,
  };

  function _(value) {
    return value;
  }

  vm.runInNewContext(
    `(function () { ${source.replace('return baseclass.extend(', 'module.exports = baseclass.extend(')} })()`,
    context,
  );

  return {
    controller: context.module.exports.create({}),
    intervals,
    cleared,
    nodes: () => modalNodes.flatMap((node) => flatten(node)),
  };
}

describe('schedule conflict modal timer cleanup §frontmod', () => {
  it('clears the interval when the parent closes the modal with Cancel', () => {
    const test = harness();
    test.controller.showConflict(() => {});
    const cancel = test.nodes().find((node) => node.tag === 'button' && textOf(node) === 'Cancel');

    assert.ok(cancel);
    assert.equal(test.intervals.size, 1);
    cancel.click();
    assert.equal(test.intervals.size, 0);
    assert.deepEqual(test.cleared, [1]);
  });

  it('disposes an externally removed LuCI modal on the next bounded tick', () => {
    const test = harness();
    test.controller.showConflict(() => {});
    const countdown = test.nodes().find((node) => node.tag === 'strong');
    const tick = test.intervals.get(1);

    assert.ok(countdown);
    countdown.isConnected = false;
    tick();
    assert.equal(test.intervals.size, 0);
    assert.deepEqual(test.cleared, [1]);
  });

  it('clears the interval and enables confirmation after ten ticks', () => {
    const test = harness();
    test.controller.showConflict(() => {});
    const confirm = test.nodes().find((node) =>
      node.tag === 'button' && textOf(node) === 'I understand the risk, continue');
    const tick = test.intervals.get(1);

    assert.ok(confirm);
    assert.equal(confirm.disabled, 'disabled');
    for (let index = 0; index < 10; index += 1) tick();
    assert.equal(confirm.disabled, false);
    assert.equal(test.intervals.size, 0);
    assert.deepEqual(test.cleared, [1]);
  });
});
