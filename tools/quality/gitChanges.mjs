/*
 * Собирает изменённые пути вместе со статусом и переименованием. Модуль не
 * интерпретирует риск: его единственная задача дать анализатору точные данные Git
 * и не потерять старую сторону rename/move. §impact1
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

function runGit(args, cwd = repoRoot) {
  const result = spawnSync('git', args, {
    cwd,
    encoding: 'utf8',
    maxBuffer: 10 * 1024 * 1024,
  });
  if (result.error) throw new Error(`Не удалось запустить git: ${result.error.message}`);
  if (result.status !== 0) {
    throw new Error(String(result.stderr || result.stdout || 'git завершился с ошибкой').trim());
  }
  return String(result.stdout || '');
}

export function parseNameStatus(output) {
  const parts = String(output || '').split('\0').filter(Boolean);
  const changes = [];
  for (let index = 0; index < parts.length;) {
    const status = parts[index++];
    if (/^[RC]\d*$/.test(status)) {
      const previousPath = parts[index++];
      const path = parts[index++];
      if (path) changes.push({ status: status[0], previousPath, path });
    } else {
      const path = parts[index++];
      if (path) changes.push({ status: status[0] || 'M', path });
    }
  }
  return changes;
}

function untrackedChanges(cwd) {
  return runGit(['ls-files', '--others', '--exclude-standard', '-z'], cwd)
    .split('\0')
    .filter(Boolean)
    .map((path) => ({ status: '?', path }));
}

export function isPackageReleaseOnly(path, before, after) {
  if (!/^package\/[^/]+\/Makefile$/.test(String(path || '').replaceAll('\\', '/'))) return false;
  const releasePattern = /^PKG_RELEASE:=[^\r\n]*$/gm;
  const beforeMatches = String(before || '').match(releasePattern) || [];
  const afterMatches = String(after || '').match(releasePattern) || [];
  if (beforeMatches.length !== 1 || afterMatches.length !== 1 || beforeMatches[0] === afterMatches[0]) return false;
  return String(before).replace(releasePattern, 'PKG_RELEASE:=<release>')
    === String(after).replace(releasePattern, 'PKG_RELEASE:=<release>');
}

function revisionSource(spec, cwd) {
  try {
    return runGit(['show', spec], cwd);
  } catch {
    return null;
  }
}

function packageReleaseKind(change, options, cwd) {
  if (change.status !== 'M' || !/^package\/[^/]+\/Makefile$/.test(change.path)) return null;
  const absolutePath = resolve(cwd, change.path);
  let before;
  let after;
  if (options.mode === 'staged') {
    before = revisionSource(`HEAD:${change.path}`, cwd);
    after = revisionSource(`:${change.path}`, cwd);
  } else {
    const revision = options.mode === 'working' ? 'HEAD' : (options.base || 'origin/main');
    before = revisionSource(`${revision}:${change.path}`, cwd);
    after = existsSync(absolutePath) ? readFileSync(absolutePath, 'utf8') : null;
  }
  return before !== null && after !== null && isPackageReleaseOnly(change.path, before, after)
    ? 'packageReleaseOnly'
    : null;
}

export function collectGitChanges(options = {}) {
  const cwd = options.cwd || repoRoot;
  const mode = options.mode || 'base';
  const args = ['diff', '--name-status', '-z', '--find-renames'];

  if (mode === 'staged') args.push('--cached');
  else if (mode === 'base') args.push(options.base || 'origin/main');
  else if (mode !== 'working') throw new Error(`Неизвестный режим Git: ${mode}`);
  args.push('--');

  const tracked = parseNameStatus(runGit(args, cwd)).map((change) => {
    const kind = packageReleaseKind(change, options, cwd);
    return kind ? { ...change, kind } : change;
  });
  const changes = mode === 'staged' ? tracked : [...tracked, ...untrackedChanges(cwd)];
  const unique = new Map();
  for (const change of changes) {
    unique.set(`${change.status}:${change.previousPath || ''}:${change.path}`, change);
  }
  return [...unique.values()].sort((left, right) => left.path.localeCompare(right.path));
}

export function collectGitPaths(base = 'origin/main') {
  return collectGitChanges({ base }).map((change) => change.path);
}
