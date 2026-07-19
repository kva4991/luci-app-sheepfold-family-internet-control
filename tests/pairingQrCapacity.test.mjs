/*
 * Проверяет реальную ёмкость LuCI QR, а не короткую демонстрационную строку.
 * Без этого теста добавление 64-символьного TLS SPKI снова может оставить
 * рабочую модалку сопряжения без изображения QR. §qrcap1
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const qrSource = readFileSync(resolve(
  root,
  'package/luci-app-sheepfold-family-internet-control/htdocs/luci-static/resources/sheepfold/features/pairing/qr.js',
), 'utf8');

function element(tag, attributes, children) {
  return { tag, attributes: attributes || {}, children };
}

function loadQrModule() {
  const moduleFactory = new Function('baseclass', 'E', 'window', 'TextEncoder', qrSource);
  return moduleFactory(
    { extend: (value) => value },
    element,
    { TextEncoder },
    TextEncoder,
  );
}

describe('LuCI administrator pairing QR capacity §qrcap1', () => {
  it('renders the full protected SF2 payload used by a real router', () => {
    const qr = loadQrModule();
    const payload = [
      'SF2|h=192.168.4.1',
      'p=5201',
      'u=SuperParent',
      'c=Ab2+Cd4@Ef',
      `spki=${'a'.repeat(64)}`,
    ].join('|');

    assert.ok(new TextEncoder().encode(payload).length > 106);
    const rendered = qr.render(payload, { errorLabel: 'QR payload' });

    assert.equal(rendered.attributes.class, 'sf-qr');
    assert.match(rendered.attributes.style, /repeat\(41, 1fr\)/);
    assert.equal(rendered.children.length, 41 * 41);
  });

  it('keeps the smaller QR for payloads that fit version 5', () => {
    const rendered = loadQrModule().render('x'.repeat(106));

    assert.equal(rendered.attributes.class, 'sf-qr');
    assert.match(rendered.attributes.style, /repeat\(37, 1fr\)/);
    assert.equal(rendered.children.length, 37 * 37);
  });

  it('shows an explicit error instead of an empty QR for unsupported payloads', () => {
    const rendered = loadQrModule().render('x'.repeat(135), { errorLabel: 'QR payload' });

    assert.equal(rendered.attributes.class, 'sf-qr-error');
    assert.match(rendered.children, /QR payload is too long/);
  });
});
