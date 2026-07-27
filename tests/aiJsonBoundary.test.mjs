// Проверяет общую границу form-urlencoded/JSON AI backend без сети и реального провайдера.
// Тест ловит повторное ручное экранирование и повреждённый ввод, но не доказывает наличие jshn на целевом роутере.
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const packageRoot = resolve(repoRoot, 'package/luci-app-sheepfold-family-internet-control');
const helperPath = resolve(packageRoot, 'root/usr/libexec/sheepfold/sheepfold-lib-json');
const gatePath = resolve(packageRoot, 'root/usr/libexec/sheepfold/sheepfold-ai-gate');
const handlerPath = resolve(packageRoot, 'root/usr/libexec/sheepfold/sheepfold-ai-handler');
const hardeningPath = resolve(packageRoot, 'root/usr/libexec/sheepfold/sheepfold-runtime-hardening');
const variantsPath = resolve(repoRoot, 'scripts/sheepfold_variants.py');
const makefilePath = resolve(packageRoot, 'Makefile');

function posix(path) {
  return path.replaceAll('\\', '/');
}

function runFormGet(body) {
  return spawnSync(
    'sh',
    [
      '-c',
      '. "$1"; sheepfold_form_get message "$2"',
      'sheepfold-form-test',
      posix(relative(repoRoot, helperPath)),
      body,
    ],
    { cwd: repoRoot, encoding: 'utf8' },
  );
}

describe('AI JSON and form boundary', () => {
  it('decodes UTF-8, spaces, quotes and line breaks without eval or printf percent-b', () => {
    const result = runFormGet(
      'message=%D0%A2%D0%B5%D1%81%D1%82+%22x%22%0Aline&deviceId=7',
    );

    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout, 'Тест "x"\nline');
    const helper = readFileSync(helperPath, 'utf8');
    assert.doesNotMatch(helper, /\beval\b/);
    assert.doesNotMatch(helper, /printf\s+['"]%b/);
  });

  it('rejects malformed percent escapes and NUL instead of decoding ambiguous input', () => {
    for (const body of ['message=bad%QZ', 'message=bad%2', 'message=bad%00tail']) {
      const result = runFormGet(body);
      assert.notEqual(result.status, 0, `Unexpectedly accepted ${body}`);
    }
  });

  it('uses the shared jshn boundary in both AI request stages', () => {
    const helper = readFileSync(helperPath, 'utf8');
    const gate = readFileSync(gatePath, 'utf8');
    const handler = readFileSync(handlerPath, 'utf8');

    assert.match(helper, /\/usr\/share\/libubox\/jshn\.sh/);
    assert.match(helper, /command -v json_add_double/);
    assert.match(helper, /sheepfold_gemini_payload\(\)/);
    assert.match(helper, /sheepfold_chat_payload\(\)/);
    assert.match(gate, /sheepfold_json_require/);
    assert.match(gate, /sheepfold_form_get/);
    assert.match(handler, /sheepfold_gemini_payload/);
    assert.match(handler, /sheepfold_chat_payload/);
    assert.doesNotMatch(handler, /^gemini_payload\(\)|^chat_payload\(\)/m);
    assert.doesNotMatch(gate, /json_escape\(\)|url_decode\(\)|form_get\(\)/);
    assert.doesNotMatch(handler, /json_escape\(\)|url_decode\(\)|form_get\(\)/);
    assert.doesNotMatch(handler, /payload=.*printf '\{/);
  });

  it('keeps the helper inside the AI-only package boundary and hardens its permissions', () => {
    const variants = readFileSync(variantsPath, 'utf8');
    const hardening = readFileSync(hardeningPath, 'utf8');
    const makefile = readFileSync(makefilePath, 'utf8');

    assert.match(variants, /root\/usr\/libexec\/sheepfold\/sheepfold-lib-json/);
    assert.match(hardening, /JSON_COMMON=.*sheepfold-lib-json/);
    assert.match(hardening, /chmod 0644[^\n]*JSON_COMMON/);
    assert.match(makefile, /for library in[\s\S]*sheepfold-lib-json[\s\S]*chmod 0644/);
  });

  it('keeps all changed shell modules syntactically valid', () => {
    for (const path of [helperPath, gatePath, handlerPath, hardeningPath]) {
      const result = spawnSync('sh', ['-n', path], { encoding: 'utf8' });
      assert.equal(result.status, 0, `${path}\n${result.stderr}`);
    }
  });
});
