import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (path) => readFileSync(resolve(repoRoot, path), 'utf8');

describe('Windows repository toolchain', () => {
  it('pins the required tools and Android SDK packages', () => {
    const manifest = JSON.parse(read('tools/toolchain.json'));
    const ids = manifest.windowsPackages.map((entry) => entry.wingetId);

    assert.deepEqual(ids, [
      'Git.Git',
      'Python.Python.3.13',
      'OpenJS.NodeJS.LTS',
      'EclipseAdoptium.Temurin.17.JDK',
      'GitHub.cli',
      '7zip.7zip',
      'BurntSushi.ripgrep.MSVC',
    ]);
    assert.equal(manifest.gradleWrapperVersion, '8.10.2');
    assert.deepEqual(manifest.androidSdk.packages, [
      'platform-tools',
      'platforms;android-35',
      'build-tools;35.0.0',
    ]);
    assert.deepEqual(manifest.windowsPackages.find((entry) => entry.command === '7z').versionArguments, ['i']);
    assert.deepEqual(manifest.windowsPackages.find((entry) => entry.command === 'rg').disallowedPathFragments, ['\\OpenAI\\Codex\\bin\\']);
  });

  it('keeps installation explicit, verified and environment-aware', () => {
    const setup = read('tools/windows/setup.ps1');
    const check = read('tools/windows/check.ps1');

    assert.match(setup, /\[switch\]\$AcceptAndroidLicenses/);
    assert.match(setup, /repository2-1\.xml|androidSdk\.repositoryUrl/);
    assert.match(setup, /Get-FileHash/);
    assert.match(setup, /System\.IO\.Compression\.ZipFile.*ExtractToDirectory/s);
    assert.match(setup, /GetTempPath/);
    assert.doesNotMatch(setup, /Expand-Archive\s+-LiteralPath/);
    assert.match(setup, /Set-UserEnvironmentVariable -Name 'JAVA_HOME'/);
    assert.match(setup, /Set-UserEnvironmentVariable -Name 'ANDROID_HOME'/);
    assert.match(setup, /Add-UserPathEntry/);
    assert.match(setup, /Find-WingetCommand/);
    assert.match(setup, /Microsoft\\WinGet\\Links/);
    assert.match(setup, /disallowedPathFragments/);
    assert.match(setup, /foreach \(\$attempt in 1\.\.2\)/);
    assert.match(setup, /--disable-interactivity/);
    assert.match(check, /Android Platform 35/);
    assert.match(check, /Gradle Wrapper: \$project/);
  });

  it('ships a Gradle wrapper for both Android projects and uses it in CI', () => {
    for (const project of ['android', 'android-child']) {
      const wrapperJar = resolve(repoRoot, project, 'gradle/wrapper/gradle-wrapper.jar');
      const properties = read(`${project}/gradle/wrapper/gradle-wrapper.properties`);

      assert.ok(existsSync(wrapperJar), `${project} wrapper jar must exist`);
      assert.ok(statSync(wrapperJar).size > 30_000, `${project} wrapper jar looks truncated`);
      assert.match(properties, /gradle-8\.10\.2-bin\.zip/);
      assert.ok(existsSync(resolve(repoRoot, project, 'gradlew')));
      assert.ok(existsSync(resolve(repoRoot, project, 'gradlew.bat')));
    }

    const workflow = read('.github/workflows/placeholder.yml');
    assert.match(workflow, /\.\/\$\{\{ matrix\.project \}\}\/gradlew/);
    assert.doesNotMatch(workflow, /gradle-version:\s*['"]8\.9/);
  });
});
