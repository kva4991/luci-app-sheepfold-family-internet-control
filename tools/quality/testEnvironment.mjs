/*
 * Keeps Windows test fixtures inside the repository and presents them to Git
 * Bash as relative paths. A fixture may use `..` to reach a sibling directory,
 * but only while the resolved target remains inside its explicit allowed root.
 * Absolute MSYS paths can be denied by a Codex sandbox even when Node can write
 * the same workspace. This helper changes test-only process state and never
 * touches router or application settings. §testenv1
 */
import { mkdirSync } from 'node:fs';
import path from 'node:path';

export const testTempPath = '.build/test-tmp';

export function prepareTestEnvironment(repoRoot, {
  env = process.env,
  platform = process.platform,
  makeDirectory = mkdirSync,
} = {}) {
  const prepared = { ...env };
  if (platform !== 'win32') return prepared;

  const absoluteTempPath = path.resolve(repoRoot, testTempPath);
  makeDirectory(absoluteTempPath, { recursive: true });
  prepared.TEMP = absoluteTempPath;
  prepared.TMP = absoluteTempPath;
  prepared.TMPDIR = absoluteTempPath;
  return prepared;
}

export function applyTestEnvironment(repoRoot, options = {}) {
  const prepared = prepareTestEnvironment(repoRoot, options);
  for (const name of ['TEMP', 'TMP', 'TMPDIR']) {
    if (prepared[name] !== undefined) process.env[name] = prepared[name];
  }
  return prepared;
}

export function shellTestPath(value, {
  cwd = process.cwd(),
  allowedRoot = cwd,
  platform = process.platform,
} = {}) {
  const pathApi = platform === 'win32' ? path.win32 : path.posix;
  const absolute = pathApi.resolve(cwd, value);
  const allowed = pathApi.resolve(allowedRoot);
  const fromAllowed = pathApi.relative(allowed, absolute);
  const insideAllowed = fromAllowed !== '..'
    && !fromAllowed.startsWith(`..${pathApi.sep}`)
    && !pathApi.isAbsolute(fromAllowed);
  const local = pathApi.relative(cwd, absolute);

  if (platform === 'win32' && insideAllowed) return (local || '.').replaceAll('\\', '/');
  if (platform === 'win32')
    return absolute.replaceAll('\\', '/').replace(/^([A-Za-z]):/, (_match, drive) => `/${drive.toLowerCase()}`);
  return absolute;
}
