/*
 * Защищает обязательные ESLint и Android Lint проверки от тихого удаления из CI.
 * Статический контракт быстр и не меняет внешнее состояние, но не доказывает, что
 * сами линтеры прошли: для этого по-прежнему запускаются npm lint и GitHub Actions.
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (path) => readFileSync(resolve(repoRoot, path), 'utf8');

describe('Static analysis tooling', () => {
  it('pins ESLint and models the LuCI loader environment', () => {
    const packageJson = JSON.parse(read('package.json'));
    const config = read('eslint.config.js');

    assert.match(packageJson.devDependencies.eslint, /^\d+\.\d+\.\d+$/);
    assert.match(packageJson.scripts['lint:js'], /^eslint /);
    assert.match(config, /globalReturn:\s*true/);
    assert.match(config, /E:\s*'readonly'/);
    assert.match(config, /_:\s*'readonly'/);
    assert.match(config, /view:\s*'readonly'/);
    assert.match(config, /uci:\s*'readonly'/);
    assert.match(config, /'no-unused-vars':\s*\['error'/);
  });

  it('runs JavaScript and both Android linters in CI', () => {
    const workflow = read('.github/workflows/placeholder.yml');
    const runner = read('scripts/runAndroidLint.mjs');

    assert.match(workflow, /Install JavaScript tooling[\s\S]*npm ci/);
    assert.match(workflow, /Run ESLint[\s\S]*npm run lint:js/);
    assert.match(workflow, /Run Android Lint[\s\S]*lintDebug --stacktrace/);
    assert.match(workflow, /android-lint-\$\{\{ matrix\.kind \}\}/);
    assert.match(runner, /\['android', 'android-child'\]/);
    assert.match(runner, /'lintDebug'/);
    assert.match(runner, /windowsVerbatimArguments:\s*true/);
  });
});
