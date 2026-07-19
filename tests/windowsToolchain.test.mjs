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
    assert.match(setup, /--disable-interactivity/);
    assert.match(setup, /function Add-KnownToolPathsToProcess/);
    assert.match(setup, /function Save-UrlWithProgress/);
    assert.match(setup, /function Ensure-Winget/);
    assert.match(setup, /Repair-WinGetPackageManager/);
    assert.match(setup, /Microsoft\.WinGet\.Client/);
    assert.match(setup, /URL загрузки: \$Uri/);
    assert.match(setup, /Файл будет сохранён: \$OutFile/);
    assert.match(setup, /Временный файл загрузки: \$tempFile/);
    assert.match(setup, /Найдены локальные Android command-line tools archives/);
    assert.match(setup, /Локальный файл прошёл checksum; скачивание не требуется/);
    assert.match(setup, /function Install-AndroidSdkPackages/);
    assert.match(setup, /function Test-AndroidSdkPackageReady/);
    assert.match(setup, /function Assert-SafeAndroidSdkRoot/);
    assert.match(setup, /function Remove-AndroidSdkPathSafely/);
    assert.match(setup, /StartsWith\(\$resolvedRoot, \[StringComparison\]::OrdinalIgnoreCase\)/);
    assert.match(setup, /if \(-not \(Test-AndroidSdkPackageReady -Package \$package\)\)[\s\S]*Clear-AndroidSdkPartialPackage -Package \$package/);
    assert.match(setup, /Clear-AndroidSdkPartialPackage/);
    assert.match(setup, /sdkmanager завершился с кодом \$exitCode после \$maxAttempts попыток/);
    assert.match(setup, /function Warm-GradleWrappers/);
    assert.match(setup, /Get-GradleWrapperDistributionUrl/);
    assert.match(setup, /Gradle distribution URL: \$distributionUrl/);
    assert.match(setup, /Gradle cache dir: \$gradleCache/);
    assert.match(setup, /& \$wrapper -p \$projectRoot --version/);
    assert.match(setup, /winget package id: \$PackageId/);
    assert.match(setup, /Write-Progress -Activity \$Label/);
    assert.match(setup, /\$maxAttempts = 5/);
    assert.match(setup, /function Test-Java17Home/);
    assert.doesNotMatch(setup, /param\(\[string\]\$Home\)/);
    assert.match(setup, /Test-Java17Home -JavaHomePath/);
    assert.match(setup, /Select-Object -First 1/);
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

  it('exports Android artifacts without tracking the shared Windows directory', () => {
    for (const buildFile of ['android/app/build.gradle.kts', 'android-child/app/build.gradle.kts']) {
      const source = read(buildFile);

      assert.match(source, /SHEEPFOLD_APK_OUTPUT_DIR/);
      assert.match(source, /Documents\/pesochnica/);
      assert.match(source, /doNotTrackState/);
      assert.match(source, /listFiles[\s\S]*startsWith\("sheepfold-(?:parent|child)-v"\)[\s\S]*File::delete/);
      assert.doesNotMatch(source, /\/Downloads/);
      assert.doesNotMatch(source, /copy(?:Child)?DebugApkToDownloads/);
    }
  });
});
