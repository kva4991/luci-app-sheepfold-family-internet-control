/*
 * Дешёвый guard standalone native-helper: отдельный package, строгий JSON, проверка tag
 * до stdout, отсутствие shell/network и ручной cross-runtime gate. Не компилирует C
 * и не доказывает криптографию или target ABI; для этого нужен nativeCrypto.test.mjs. §testwhy
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const root = 'package/sheepfold-message-relay-crypto';
const read = path => readFileSync(path, 'utf8');
const main = read(`${root}/src/sheepfold-message-relay-crypto.c`);
const json = read(`${root}/src/relayJson.c`);

test('native package links structured JSON and standard crypto without shell transport', () => {
  const make = read(`${root}/Makefile`);
  assert.match(make, /-lcrypto -ljansson -lm/);
  assert.match(make, /-U_FORTIFY_SOURCE -D_FORTIFY_SOURCE=2/);
  assert.match(make, /relayJson\.c/);
  assert.match(make, /USERID:=sheepfold-relay:sheepfold-relay/);
  assert.doesNotMatch(main + json, /\b(system|popen|execv|socket|connect)\s*\(/);
  assert.match(json, /JSON_REJECT_DUPLICATES/);
  assert.match(main, /EVP_CipherFinal_ex/);
  assert.ok(main.indexOf('EVP_CipherFinal_ex') < main.indexOf('puts(output)'));
  assert.match(main, /OPENSSL_cleanse/);
  assert.match(main, /setrlimit\(RLIMIT_CORE/);
});

test('manual runtime gate has bounds and never silently skips a missing binary', () => {
  const gate = read('tools/messageRelay/nativeCrypto.test.mjs');
  assert.match(gate, /isAbsolute\(binary\)/);
  assert.match(gate, /timeout: 3_000, maxBuffer: 32_768, shell: false/);
  assert.match(gate, /assert\.equal\(result\.stdout, ''/);
  assert.match(read('tools/messageRelay/runNativeCryptoTests.sh'), /-fsanitize=address,undefined/);
  assert.match(read(`${root}/README.ru.md`), /clientsReady=no/);
});
