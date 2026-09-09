/*
 * Запускает штатный Android Lint обоих APK через их закреплённые Gradle Wrapper.
 * Такой уровень ловит ошибки manifest/resources/API без установки APK и не меняет
 * внешнее состояние. Зелёный результат не заменяет сборку и проверку на устройстве.
 */
import { spawnSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const androidProjects = ['android', 'android-child'];
const gradleUserHome = resolve(
  process.env.SHEEPFOLD_GRADLE_USER_HOME || resolve(repoRoot, '.build', 'gradle-user-home'),
);
const defaultTimeoutSeconds = process.platform === 'win32' ? '1800' : '900';
const timeoutSeconds = Number.parseInt(process.env.SHEEPFOLD_ANDROID_LINT_TIMEOUT_SECONDS || defaultTimeoutSeconds, 10);

if (!Number.isInteger(timeoutSeconds) || timeoutSeconds < 60 || timeoutSeconds > 3600) {
  console.error('SHEEPFOLD_ANDROID_LINT_TIMEOUT_SECONDS должен быть целым числом от 60 до 3600.');
  process.exit(2);
}
mkdirSync(gradleUserHome, { recursive: true });

function runGradleLint(projectName) {
  const projectDir = resolve(repoRoot, projectName);
  const isWindows = process.platform === 'win32';
  const wrapperPath = resolve(projectDir, isWindows ? 'gradlew.bat' : 'gradlew');
  const gradleArgs = [
    '-p', projectDir,
    '--no-daemon',
    '-Pkotlin.compiler.execution.strategy=in-process',
    'lintDebug',
    '--stacktrace',
  ];
  const gradleEnvironment = { ...process.env, GRADLE_USER_HOME: gradleUserHome };
  const result = isWindows
    ? spawnSync(process.env.ComSpec || 'cmd.exe', [
        '/d',
        '/s',
        '/c',
        `call "${wrapperPath}" -p "${projectDir}" --no-daemon -Pkotlin.compiler.execution.strategy=in-process lintDebug --stacktrace`,
      ], {
        cwd: repoRoot,
        env: gradleEnvironment,
        stdio: 'inherit',
        timeout: timeoutSeconds * 1000,
        // Иначе Node превращает кавычки пути с пробелами в буквальные \" для cmd.exe
        windowsVerbatimArguments: true,
      })
    : spawnSync(wrapperPath, gradleArgs, {
        cwd: repoRoot,
        env: gradleEnvironment,
        stdio: 'inherit',
        timeout: timeoutSeconds * 1000,
      });

  if (result.error?.code === 'ETIMEDOUT') {
    console.error(`Android Lint ${projectName}: превышен лимит ${timeoutSeconds} сек.`);
    process.exit(124);
  }
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    process.exit(result.status || 1);
  }
}

for (const projectName of androidProjects) {
  console.log(`\nAndroid Lint: ${projectName}`);
  runGradleLint(projectName);
}
