/*
 * Ручной сквозной стенд public-клиента и private HTTPS/control service §rsuppeer §testwhy
 * Вход: --peer <доверенный checkout>, Node 20+, openssl; вывод: только счётчики проверок
 * Создаёт случайный temp store/однодневные test certificates и loopback listener, затем удаляет их
 * Не подключается к VPS/роутеру, не читает реальные secrets, не является OpenWrt/FRP gate
 */
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { createHash, generateKeyPairSync, randomBytes, X509Certificate } from 'node:crypto';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { promisify } from 'node:util';
import { ControlClient } from './controlClient.mjs';
import { createLabChannel } from './labChannel.mjs';
import { parseStrictJson } from './strictJson.mjs';
import { controlProfile } from './experimentalPayload.mjs';

const execute = promisify(execFile);
let root; let store; let listener; let stage = 'setup';
try {
  if (process.argv.length !== 4 || process.argv[2] !== '--peer') throw new Error('usage');
  const peer = resolve(process.argv[3]);
  const readModule = (name) => import(pathToFileURL(join(peer, 'src', name + '.mjs')));
  const { SupportStore } = await readModule('supportStore');
  const { SupportControlService } = await readModule('supportControlService');
  const { SupportOperatorAuth, supportTotp } = await readModule('supportOperatorAuth');
  const { SupportOperatorClient } = await readModule('supportOperatorClient');
  const { createSupportControlHttp } = await readModule('supportControlHttp');
  root = await mkdtemp(join(tmpdir(), 'sheepfold-control-peer-'));
  const makeCert = async (name) => {
    const keyPath = join(root, name + '.key'); const certPath = join(root, name + '.crt');
    await execute('openssl', ['req', '-x509', '-newkey', 'ed25519', '-nodes',
      '-keyout', keyPath, '-out', certPath, '-days', '1', '-subj', '/CN=localhost',
      '-addext', 'subjectAltName=DNS:localhost'], { windowsHide: true, timeout: 10000, maxBuffer: 4096 });
    const cert = await readFile(certPath);
    return { cert, key: await readFile(keyPath),
      hash: createHash('sha256').update(new X509Certificate(cert).raw).digest('hex') };
  };
  const serverTls = await makeCert('server'); const operatorTls = await makeCert('operator');
  const serverKey = generateKeyPairSync('ed25519'); const identity = generateKeyPairSync('ed25519');
  const integrityKey = randomBytes(32); const pepper = randomBytes(32); const totpSecret = randomBytes(20);
  let now = 1788000000; let tick = 0; let checks = 0;
  const stateRoot = join(root, 'state');
  store = await new SupportStore(stateRoot, { integrityKey }).start();
  const createService = () => new SupportControlService(store, { signingKey: serverKey.privateKey,
    signingKeyId: 'server-test', pepper, now: () => now });
  let service = await createService().start();
  let auth = new SupportOperatorAuth(store, { certificateHash: operatorTls.hash, totpSecret, now: () => now });
  const startListener = async () => {
    listener = createSupportControlHttp({ service, auth, tls: {
      cert: serverTls.cert, key: serverTls.key, ca: operatorTls.cert,
    } });
    await new Promise((done, reject) => {
      listener.once('error', reject); listener.listen(0, '127.0.0.1', done);
    });
    return 'https://localhost:' + listener.address().port + '/';
  };
  const baseUrl = await startListener();
  const post = createLabChannel({ baseUrl, ca: serverTls.cert, certificateHash: serverTls.hash });
  const client = new ControlClient({ privateKey: identity.privateKey,
    serverKeys: new Map([['server-test', serverKey.publicKey]]), now: () => now, uptime: () => tick });
  const send = async (wire) => client.accept(await post('router', wire));
  const start = client.enrollmentStart({ localConsent: true });
  stage = 'enrollment';
  await send(client.acceptChallenge(await post('enrollment', JSON.stringify(start)))); checks += 1;
  await send(client.capabilities()); checks += 1;
  stage = 'claim';
  const hostKey = 'ssh-ed25519 ' + Buffer.concat([
    Buffer.from('0000000b7373682d6564323535313900000020', 'hex'), randomBytes(32),
  ]).toString('base64');
  const request = client.openClaim({ localConsent: true, routerHostKey: hostKey });
  const opened = await post('router', request);
  const retry = await post('router', client.retry());
  assert.equal(retry, opened); client.accept(retry); checks += 1;
  const sessionId = client.status().sessionId; const code = client.claimCode();
  const snapshot = await readFile(join(stateRoot, 'support-state.json'), 'utf8');
  assert.equal(snapshot.includes(code), false); checks += 1;
  const operator = new SupportOperatorClient({ baseUrl, ca: serverTls.cert,
    cert: operatorTls.cert, key: operatorTls.key, serverCertificateHash: serverTls.hash });
  stage = 'operatorMfa';
  const login = await operator.login({ totp: supportTotp(totpSecret, Math.floor(now / 30)) });
  const claimed = await operator.action('claim', {
    sessionId, code, ticketId: 'SYNTHETIC-1', operationId: randomBytes(16).toString('base64url'),
  }, login.token);
  assert.equal(claimed.state, 'sessionPreparing'); checks += 1;
  stage = 'status';
  await send(client.queryStatus());
  assert.equal(client.claimCode(), null);
  assert.equal(client.status().accessExpiresAt, now + 86400);
  assert.equal(client.status().transportReady, false); checks += 1;
  await assert.rejects(operator.action('prepare', { sessionId }, login.token), { code: 'protocolUnsupported' });
  checks += 1;
  const impostor = new SupportOperatorClient({ baseUrl, ca: serverTls.cert, serverCertificateHash: serverTls.hash });
  await assert.rejects(impostor.action('list', {}, login.token), { code: 'operatorUnauthorized' }); checks += 1;
  const wrongPin = createLabChannel({ baseUrl, ca: serverTls.cert, certificateHash: '0'.repeat(64) });
  stage = 'tlsPin';
  await assert.rejects(wrongPin('enrollment', JSON.stringify(start)), { code: 'serverIdentityInvalid' }); checks += 1;
  const revoked = client.revokeRequest();
  stage = 'revoke';
  const closed = await post('router', revoked);
  now += 1; tick += 1;
  assert.equal(await post('router', client.retry()), closed);
  client.accept(closed); assert.equal(client.status().state, 'revoked'); checks += 1;
  await send(client.queryStatus()); checks += 1;
  await send(client.openClaim({ localConsent: true, routerHostKey: hostKey }));
  stage = 'restart';
  now += 1; tick += 1;
  // Реальный restart state закрывает claim, пока socket и клиент остаются живыми
  listener.closeAllConnections(); await new Promise((done) => listener.close(done));
  await store.close(); store = await new SupportStore(stateRoot, { integrityKey }).start();
  service = await createService().start();
  auth = new SupportOperatorAuth(store, { certificateHash: operatorTls.hash, totpSecret, now: () => now });
  const restartedUrl = await startListener();
  const restartedPost = createLabChannel({ baseUrl: restartedUrl, ca: serverTls.cert, certificateHash: serverTls.hash });
  client.accept(await restartedPost('router', client.queryStatus()));
  assert.equal(client.status().state, 'revoked'); assert.equal(client.claimCode(), null); checks += 1;
  const state = parseStrictJson(Buffer.from(JSON.stringify(client.status())));
  assert.equal(state.transportReady, false);
  process.stdout.write(JSON.stringify({ ok: true, profile: controlProfile, checks,
    tls: true, operatorMfa: true, transportReady: false, immutableRelease: false }) + '\n');
} catch (error) {
  process.stderr.write(JSON.stringify({ ok: false, errorCode: 'supportPeerFailed',
    stage,
    cause: ['ENOENT', 'EPERM', 'EACCES', 'storageBusy'].includes(error.code) ? error.code : 'checkFailed' }) + '\n');
  process.exitCode = 1;
} finally {
  if (listener?.listening) {
    listener.closeAllConnections(); await new Promise((done) => listener.close(done));
  }
  await store?.close();
  if (root) await rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
}
