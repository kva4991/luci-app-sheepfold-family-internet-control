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

  it('runs impacted JavaScript checks and both Android linters in CI', () => {
    const workflow = read('.github/workflows/placeholder.yml');
    const androidWorkflow = read('.github/workflows/validate-android.yml');
    const qualityRunner = read('scripts/runQualityChecks.mjs');
    const runner = read('scripts/runAndroidLint.mjs');

    assert.match(workflow, /Install JavaScript tooling[\s\S]*npm ci/);
    assert.match(workflow, /Verify POSIX lock test dependency[\s\S]*command -v flock[\s\S]*flock --version/);
    assert.doesNotMatch(workflow, /apt-get (?:update|install)/);
    assert.match(workflow, /fetch-depth:\s*0/);
    assert.match(workflow, /Run impacted quality checks[\s\S]*runQualityChecks\.mjs --git "\$base" --skip-android --strict/);
    assert.ok(workflow.indexOf('Run impacted quality checks') < workflow.indexOf('Validate runtime hardening invariants'));
    assert.doesNotMatch(workflow, /node --test tests\/\*\.test\.mjs/);
    assert.match(qualityRunner, /lintJavaScript\(changes, options\.full\)/);
    assert.match(androidWorkflow, /Run Android Lint[\s\S]*lintDebug --stacktrace/);
    assert.match(androidWorkflow, /android-lint-\$\{\{ matrix\.kind \}\}/);
    assert.equal((androidWorkflow.match(/- 'android\/\*\*'/g) || []).length, 2);
    assert.equal((androidWorkflow.match(/- 'android-child\/\*\*'/g) || []).length, 2);
    assert.match(runner, /\['android', 'android-child'\]/);
    assert.match(runner, /'lintDebug'/);
    assert.match(runner, /windowsVerbatimArguments:\s*true/);
    assert.match(runner, /GRADLE_USER_HOME:\s*gradleUserHome/);
    assert.match(runner, /--no-daemon/);
    assert.match(runner, /kotlin\.compiler\.execution\.strategy=in-process/);
    assert.match(runner, /SHEEPFOLD_GRADLE_USER_HOME/);
    assert.match(runner, /SHEEPFOLD_ANDROID_LINT_TIMEOUT_SECONDS/);
    assert.match(runner, /result\.error\?\.code === 'ETIMEDOUT'/);
  });
});
