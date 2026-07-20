/*
 * Запускает штатный Android Lint обоих APK через их закреплённые Gradle Wrapper.
 * Такой уровень ловит ошибки manifest/resources/API без установки APK и не меняет
 * внешнее состояние. Зелёный результат не заменяет сборку и проверку на устройстве.
 */
import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const androidProjects = ['android', 'android-child'];

function runGradleLint(projectName) {
  const projectDir = resolve(repoRoot, projectName);
  const isWindows = process.platform === 'win32';
  const wrapperPath = resolve(projectDir, isWindows ? 'gradlew.bat' : 'gradlew');
  const gradleArgs = ['-p', projectDir, 'lintDebug', '--stacktrace'];
  const result = isWindows
    ? spawnSync(process.env.ComSpec || 'cmd.exe', [
        '/d',
        '/s',
        '/c',
        `call "${wrapperPath}" -p "${projectDir}" lintDebug --stacktrace`,
      ], {
        cwd: repoRoot,
        stdio: 'inherit',
        // Иначе Node превращает кавычки пути с пробелами в буквальные \" для cmd.exe
        windowsVerbatimArguments: true,
      })
    : spawnSync(wrapperPath, gradleArgs, { cwd: repoRoot, stdio: 'inherit' });

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
