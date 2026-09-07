/*
 * Защищает отдельный transport wire и RAM-only lifecycle без включения роутерного доступа §rsup001
 * OpenSSL выпускает только синтетические сертификаты в удаляемом OS temp; сеть не открывается
 * Проверки Node не заменяют server CSR proof-of-possession, FRP/SSH и живой OpenWrt manager
 */
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { createHash, createPrivateKey, generateKeyPairSync, randomBytes, sign, X509Certificate } from 'node:crypto';
import { mkdtemp, readFile, writeFile, mkdir, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { TransportClient } from '../tools/remoteSupport/transportClient.mjs';
import { decodeTransportDer, transportProfile, validateTransportMessage } from '../tools/remoteSupport/transportPayload.mjs';
import { createEnvelope, verifyEnvelope } from '../tools/remoteSupport/signedEnvelope.mjs';
import { identityKeyId } from '../tools/remoteSupport/experimentalPayload.mjs';

const execute = promisify(execFile);
const newId = () => randomBytes(16).toString('base64url');
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
const server = generateKeyPairSync('ed25519');
const identity = generateKeyPairSync('ed25519');
const transport = generateKeyPairSync('ed25519');
const another = generateKeyPairSync('ed25519');
const samples = new Map();
let root; let caPem; let csrDer; let issuedAt; let leaseEnd;
const dateString = (seconds) => new Date(seconds * 1000).toISOString().replace(/[-:T]/g, '').slice(2, 14) + 'Z';
// Разбирается только свежая OpenSSL fixture для повторной подписи намеренно испорченных extensions
function fixtureParts(bytes) {
  const parts = []; let offset = 0;
  while (offset < bytes.length) {
    const tag = bytes[offset++]; let length = bytes[offset++];
    if (length >= 128) {
      const count = length & 127; length = 0;
      for (let index = 0; index < count; index++) { length = length * 256 + bytes[offset++]; }
    }
    parts.push({ tag, value: bytes.subarray(offset, offset + length) }); offset += length;
  }
  return parts;
}
function fixtureDer(tag, bytes) {
  const length = bytes.length < 128 ? Buffer.from([bytes.length]) :
    Buffer.from([0x82, bytes.length >> 8, bytes.length & 255]);
  const header = bytes.length >= 128 && bytes.length < 256 ? Buffer.from([0x81, bytes.length]) : length;
  return Buffer.concat([Buffer.from([tag]), header, bytes]);
}
function alteredCertificate(der, caKey, alter) {
  const certificate = fixtureParts(fixtureParts(der)[0].value);
  const tbs = fixtureParts(certificate[0].value);
  const field = tbs.find((entry) => entry.tag === 0xa3);
  const extensions = fixtureParts(fixtureParts(field.value)[0].value);
  field.value = fixtureDer(0x30, Buffer.concat(alter(extensions).map((entry) => fixtureDer(entry.tag, entry.value))));
  const body = fixtureDer(0x30, Buffer.concat(tbs.map((entry) => fixtureDer(entry.tag, entry.value))));
  return fixtureDer(0x30, Buffer.concat([body, fixtureDer(certificate[1].tag, certificate[1].value),
    fixtureDer(3, Buffer.concat([Buffer.from([0]), sign(null, body, caKey)]))]));
}
before(async () => {
  root = await mkdtemp(path.join(os.tmpdir(), 'sheepfold-transport-client-'));
  const openssl = (args) => execute('openssl', args, { cwd: root, windowsHide: true, timeout: 10000, maxBuffer: 4096 });
  await openssl(['req', '-x509', '-newkey', 'ed25519', '-nodes', '-keyout', 'ca.key', '-out', 'ca.crt',
    '-days', '2', '-subj', '/CN=Synthetic transport CA', '-addext', 'basicConstraints=critical,CA:TRUE']);
  caPem = await readFile(path.join(root, 'ca.crt'), 'utf8');
  issuedAt = Math.floor(Date.now() / 1000) + 2; leaseEnd = issuedAt + 90;
  for (const [name, key] of [['transport', transport], ['other', another]]) {
    await writeFile(path.join(root, name + '.key'), key.privateKey.export({ format: 'pem', type: 'pkcs8' }), { mode: 0o600 });
    await openssl(['req', '-new', '-key', name + '.key', '-out', name + '.csr', '-subj', '/CN=Sheepfold temporary support']);
  }
  await openssl(['req', '-in', 'transport.csr', '-outform', 'DER', '-out', 'request.der']);
  csrDer = await readFile(path.join(root, 'request.der'));
  const variants = [
    ['valid', 'transport', 'clientAuth', false, leaseEnd, 'Sheepfold temporary support'],
    ['wrongKey', 'other', 'clientAuth', false, leaseEnd, 'Sheepfold temporary support'],
    ['wrongEku', 'transport', 'serverAuth', false, leaseEnd, 'Sheepfold temporary support'],
    ['extraEku', 'transport', 'clientAuth,serverAuth', false, leaseEnd, 'Sheepfold temporary support'],
    ['caLeaf', 'transport', 'clientAuth', true, leaseEnd, 'Sheepfold temporary support'],
    ['longLeaf', 'transport', 'clientAuth', false, leaseEnd + 1, 'Sheepfold temporary support'],
    ['wrongSubject', 'transport', 'clientAuth', false, leaseEnd, 'Other support'],
    ['extraKu', 'transport', 'clientAuth', false, leaseEnd, 'Sheepfold temporary support', 'digitalSignature,keyCertSign'],
    ['sanLeaf', 'transport', 'clientAuth', false, leaseEnd, 'Sheepfold temporary support', 'digitalSignature',
      'subjectAltName=DNS:synthetic.invalid'],
    ['aiaLeaf', 'transport', 'clientAuth', false, leaseEnd, 'Sheepfold temporary support', 'digitalSignature',
      'authorityInfoAccess=OCSP;URI:https://synthetic.invalid/ocsp'],
  ];
  for (const [name, key, eku, ca, end, subject, usage = 'digitalSignature', extra = ''] of variants) {
    const directory = path.join(root, name); await mkdir(directory);
    await writeFile(path.join(directory, 'index'), ''); await writeFile(path.join(directory, 'serial'), '01\n');
    const config = `[ca]\ndefault_ca=issuer\n[issuer]\ndatabase=${name}/index\nnew_certs_dir=${name}\n` +
      `certificate=ca.crt\nprivate_key=ca.key\nserial=${name}/serial\ndefault_md=default\npolicy=subject\n` +
      `[subject]\ncommonName=supplied\n[leaf]\nbasicConstraints=critical,CA:${ca ? 'TRUE' : 'FALSE'}\n` +
      `keyUsage=critical,${usage}\nextendedKeyUsage=${eku}\n${extra}\n`;
    await writeFile(path.join(directory, 'issuer.cnf'), config);
    await openssl(['ca', '-batch', '-notext', '-config', name + '/issuer.cnf', '-in', key + '.csr',
      '-out', name + '/leaf.pem', '-extensions', 'leaf', '-subj', '/CN=' + subject,
      '-startdate', dateString(issuedAt), '-enddate', dateString(end)]);
    samples.set(name, new X509Certificate(await readFile(path.join(directory, 'leaf.pem'))).raw);
  }
  const caKey = createPrivateKey(await readFile(path.join(root, 'ca.key')));
  const isConstraint = (entry) => fixtureParts(entry.value)[0].value.equals(Buffer.from('551d13', 'hex'));
  samples.set('duplicateExtension', alteredCertificate(samples.get('valid'), caKey,
    (entries) => [...entries, entries.find(isConstraint)]));
  samples.set('missingConstraint', alteredCertificate(samples.get('valid'), caKey,
    (entries) => entries.filter((entry) => !isConstraint(entry))));
  samples.set('explicitFalse', alteredCertificate(samples.get('valid'), caKey, (entries) => entries.map((entry) => {
    if (!isConstraint(entry)) { return entry; }
    const parts = fixtureParts(entry.value); parts.at(-1).value = Buffer.from('3003010100', 'hex');
    return { tag: entry.tag, value: Buffer.concat(parts.map((part) => fixtureDer(part.tag, part.value))) };
  })));
  for (const [name, oid] of [['noncriticalConstraint', '551d13'], ['noncriticalUsage', '551d0f']]) {
    samples.set(name, alteredCertificate(samples.get('valid'), caKey, (entries) => entries.map((entry) => {
      const parts = fixtureParts(entry.value);
      if (parts[0].value.toString('hex') !== oid) { return entry; }
      return { tag: entry.tag, value: Buffer.concat(parts.filter((part) => part.tag !== 0x01)
        .map((part) => fixtureDer(part.tag, part.value))) };
    })));
  }
});
after(async () => { if (root) { await rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 }); } });

function fixture(changes = {}) {
  const time = { wall: issuedAt, tick: 100 };
  const options = { identityPrivateKey: identity.privateKey, serverKeys: new Map([['server-test', server.publicKey]]),
    routerId: newId(), sessionId: newId(), accessExpiresAt: issuedAt + 3600,
    transportPublicKey: transport.publicKey, transportCaCertificate: caPem,
    now: () => time.wall, uptime: () => time.tick, ...changes };
  const client = new TransportClient(options);
  const request = client.request(csrDer); const envelope = JSON.parse(request);
  const keyId = identityKeyId(identity.publicKey.export({ format: 'der', type: 'spki' }).subarray(-32).toString('base64url'));
  const { payload: message } = verifyEnvelope({ envelope, publicKeys: new Map([[keyId, identity.publicKey]]), now: time.wall });
  const payload = { profile: transportProfile, sessionId: options.sessionId, csrSha256: sha256(csrDer),
    leaseId: newId(), accessExpiresAt: options.accessExpiresAt, leaseExpiresAt: leaseEnd,
    certificateDer: samples.get('valid').toString('base64url'), proxyName: 'support-' + 'a'.repeat(32),
    proxyPort: 22001, token: 'b'.repeat(64) };
  const reply = (updates = {}, outer = {}, key = server.privateKey) => JSON.stringify(createEnvelope({
    keyId: 'server-test', privateKey: key, payloadBytes: Buffer.from(JSON.stringify({
      messageType: 'transportGrant', routerId: options.routerId, streamId: message.streamId, messageId: newId(),
      sequence: 0, issuedAt, notBefore: issuedAt, expiresAt: issuedAt + 60,
      payload: { ...payload, ...updates }, ...outer,
    })),
  }));
  return { client, options, time, request, message, payload, reply };
}

test('transport request uses distinct one-shot stream, original CSR bytes and exact RAM retry', () => {
  const f = fixture();
  validateTransportMessage(f.message);
  assert.equal(f.message.messageType, 'transportRequest'); assert.equal(f.message.sequence, 0);
  assert.notEqual(f.message.streamId, f.options.sessionId);
  assert.deepEqual(decodeTransportDer(f.message.payload.csrDer), csrDer);
  assert.equal(f.client.retry(), f.request);
  assert.throws(() => f.client.request(csrDer), { code: 'stateConflict' });
  assert.equal(JSON.stringify(f.client), '{}');
});

test('CA signed exact leaf grants a clone without claiming SSH readiness or leaking status', () => {
  const f = fixture(); const wire = f.reply();
  const status = f.client.accept(wire);
  assert.equal(status.state, 'grantReady'); assert.equal(status.transportReady, false);
  assert.equal(status.credentialsAvailable, true); assert.equal(status.pendingResponse, false);
  assert.equal(JSON.stringify(status).includes(f.payload.token), false);
  assert.equal(JSON.stringify(status).includes(f.payload.certificateDer), false);
  const grant = f.client.credentials(); assert.deepEqual(grant, f.payload); grant.token = 'changed';
  assert.equal(f.client.credentials().token, f.payload.token);
  assert.deepEqual(f.client.accept(wire), status);
  assert.throws(() => f.client.retry(), { code: 'stateConflict' });
});

test('foreign signed identity, stream, CSR, session, deadline and changed duplicate revoke the grant', () => {
  for (const [payload, outer] of [
    [{ sessionId: newId() }, {}], [{ csrSha256: 'c'.repeat(64) }, {}],
    [{ accessExpiresAt: issuedAt + 3599 }, {}], [{}, { routerId: newId() }],
    [{}, { streamId: newId() }], [{}, { sequence: 1 }], [{}, { messageType: 'statusQuery' }],
  ]) {
    const f = fixture(); assert.throws(() => f.client.accept(f.reply(payload, outer)));
    assert.equal(f.client.status().state, 'securityBlocked'); assert.throws(() => f.client.credentials());
  }
  const f = fixture(); f.client.accept(f.reply());
  assert.throws(() => f.client.accept(f.reply()), { code: 'sequenceReplay' });
  assert.throws(() => f.client.credentials(), { code: 'sessionRevoked' });
});

test('untrusted signature and every unsuitable X509 leaf fail closed', () => {
  const forged = fixture();
  assert.throws(() => forged.client.accept(forged.reply({}, {}, another.privateKey)), { code: 'signatureInvalid' });
  for (const name of ['wrongKey', 'wrongEku', 'extraEku', 'caLeaf', 'longLeaf', 'wrongSubject',
    'duplicateExtension', 'missingConstraint', 'explicitFalse', 'extraKu', 'sanLeaf', 'aiaLeaf',
    'noncriticalConstraint', 'noncriticalUsage']) {
    const f = fixture();
    assert.throws(() => f.client.accept(f.reply({ certificateDer: samples.get(name).toString('base64url') })),
      { code: 'serverIdentityInvalid' }, name);
    assert.equal(f.client.status().credentialsAvailable, false);
  }
  const f = fixture(); const corrupt = Buffer.from(samples.get('valid')); corrupt[corrupt.length - 1] ^= 1;
  assert.throws(() => f.client.accept(f.reply({ certificateDer: corrupt.toString('base64url') })), { code: 'serverIdentityInvalid' });
});

test('local revoke before or after reply prevents resurrection and removes pending bytes', () => {
  for (const accepted of [false, true]) {
    const f = fixture(); const wire = f.reply(); if (accepted) { f.client.accept(wire); }
    assert.equal(f.client.localRevoke().state, 'revoked');
    assert.throws(() => f.client.accept(wire), { code: 'sessionRevoked' });
    assert.throws(() => f.client.retry(), { code: 'sessionRevoked' });
    assert.throws(() => f.client.credentials(), { code: 'sessionRevoked' });
    assert.equal(f.client.status().pendingResponse, false);
  }
});

test('request expiry, response expiry and lease expiry never renew saved credentials', () => {
  const pending = fixture(); pending.time.wall += 60; pending.time.tick += 60;
  assert.equal(pending.client.status().state, 'sessionExpired');
  assert.throws(() => pending.client.accept(pending.reply()), { code: 'sessionRevoked' });
  const expired = fixture(); const wire = expired.reply({}, { expiresAt: issuedAt + 20 }); expired.client.accept(wire);
  expired.time.wall += 20; expired.time.tick += 20;
  assert.equal(expired.client.credentials().leaseExpiresAt, leaseEnd);
  assert.throws(() => expired.client.accept(wire), { code: 'messageExpired' });
  assert.throws(() => expired.client.credentials(), { code: 'sessionRevoked' });
  const lease = fixture(); lease.client.accept(lease.reply()); lease.time.tick += 90;
  assert.equal(lease.client.status().state, 'sessionExpired');
  assert.throws(() => lease.client.credentials(), { code: 'sessionRevoked' });
});

test('clock faults latch and ordinary local revoke cannot restore an earlier grant', () => {
  for (const fault of [NaN, Infinity, -1, -0, Number.MAX_SAFE_INTEGER + 1, 'time', null, issuedAt - 1]) {
    const f = fixture(); const wire = f.reply(); f.client.accept(wire); f.time.wall = fault;
    assert.throws(() => f.client.credentials(), { code: 'clockUntrusted' });
    f.time.wall = issuedAt;
    assert.equal(f.client.localRevoke().state, 'securityBlocked');
    assert.throws(() => f.client.accept(wire), { code: 'clockUntrusted' });
  }
  const f = fixture(); f.time.tick = 99;
  assert.throws(() => f.client.retry(), { code: 'clockUntrusted' });
});

test('forward wall jump rebases monotonic expiry even if wall time subsequently stalls', () => {
  const f = fixture(); f.time.wall += 40;
  f.client.accept(f.reply()); assert.equal(f.client.status().state, 'grantReady');
  f.time.tick += 49;
  assert.equal(f.client.status().state, 'grantReady');
  f.time.tick += 1;
  assert.equal(f.client.status().state, 'sessionExpired');
  assert.throws(() => f.client.credentials(), { code: 'sessionRevoked' });
});

test('malformed transport payloads reject coercion, accessors, extensions and noncanonical DER', () => {
  const f = fixture();
  const message = JSON.parse(Buffer.from(JSON.parse(f.reply()).signedPayload, 'base64url'));
  for (const changes of [{ token: new String('a'.repeat(64)) }, { token: ['a'.repeat(64)] },
    { proxyName: new String('support-' + 'a'.repeat(32)) }, { csrSha256: ['a'.repeat(64)] },
    { token: 'A'.repeat(64) }, { proxyPort: '22001' }, { proxyPort: 1023 }, { proxyPort: 65536 },
    { endpoint: 'https://not-allowed.invalid' }, { certificateDer: message.payload.certificateDer + '=' },
    { leaseExpiresAt: issuedAt + 121 }, { leaseExpiresAt: issuedAt + 59 }, { accessExpiresAt: -0 },
    { accessExpiresAt: issuedAt + 86401 }]) {
    assert.throws(() => validateTransportMessage({ ...message, payload: { ...message.payload, ...changes } }));
  }
  const payload = { ...message.payload }; let accessed = false;
  Object.defineProperty(payload, 'token', { enumerable: true, get() { accessed = true; return message.payload.token; } });
  assert.throws(() => validateTransportMessage({ ...message, payload })); assert.equal(accessed, false);
  for (const bytes of [Buffer.alloc(4097), Buffer.from([0x30, 0x80, 1, 0]), Buffer.from([0x30, 0x81, 1, 0]),
    Buffer.concat([csrDer, Buffer.from([0])]), Buffer.from([0x30, 0])]) {
    assert.throws(() => decodeTransportDer(bytes.toString('base64url')));
  }
});

test('malformed and oversized wire or CSR remain bounded and never expose credentials', () => {
  for (const wire of ['{', '{"a":1,"a":2}', 'x'.repeat(24577), Buffer.alloc(24577),
    Buffer.from([0xff]), null, [], {}]) {
    const f = fixture(); assert.throws(() => f.client.accept(wire));
    assert.equal(f.client.status().state, 'securityBlocked');
    assert.equal(f.client.status().credentialsAvailable, false);
  }
  const options = fixture().options;
  for (const csr of [null, [], csrDer.toString('base64url'), Buffer.alloc(4097), Buffer.from([0x30, 0])]) {
    const client = new TransportClient(options);
    assert.throws(() => client.request(csr), { code: 'messageMalformed' });
    assert.equal(client.status().state, 'idle');
  }
});

test('constructor rejects shared identity/transport key, malformed options and unknown CA', () => {
  const f = fixture();
  for (const changes of [{ transportPublicKey: identity.publicKey }, { routerId: 'bad' },
    { accessExpiresAt: issuedAt }, { accessExpiresAt: issuedAt + 86401 }, { transportCaCertificate: samples.get('valid') },
    { now: null }, { serverKeys: new Map() }, { transportPublicKey: another.privateKey }]) {
    assert.throws(() => new TransportClient({ ...f.options, ...changes }), TypeError);
  }
});

test('transport schema fields match executable request and grant without enabling the old control profile', async () => {
  const schema = JSON.parse(await readFile(new URL('../tools/remoteSupport/schemas/experimental-transport-message-v1.schema.json', import.meta.url)));
  const common = JSON.parse(await readFile(new URL('../tools/remoteSupport/schemas/signed-payload-v1.schema.json', import.meta.url)));
  const f = fixture(); const branches = schema.allOf[1].oneOf;
  assert.equal(schema.allOf[1].properties.sequence.const, 0);
  for (const [type, payload] of [['transportRequest', f.message.payload], ['transportGrant', f.payload]]) {
    const branch = branches.find((entry) => entry.properties.messageType.const === type);
    assert.equal(branch.properties.payload.additionalProperties, false);
    assert.deepEqual(branch.properties.payload.required.toSorted(), Object.keys(payload).toSorted());
    assert.deepEqual(Object.keys(branch.properties.payload.properties).toSorted(), Object.keys(payload).toSorted());
    assert.ok(common.properties.messageType.enum.includes(type));
  }
});
