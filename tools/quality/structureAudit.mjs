/*
 * Показывает рост крупных изменённых исходников относительно выбранной базы.
 * Это advisory-сигнал, а не автоматический запрет: большой файл может быть оправдан,
 * но его рост должен быть осознанным и сопровождаться планом разделения. §qassist
 */
import { existsSync, readFileSync } from 'node:fs';
import { extname, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { repoRoot } from './gitChanges.mjs';

const thresholds = Object.freeze({
  '.css': 1_800,
  '.js': 700,
  '.mjs': 500,
  '.kt': 700,
  '.kts': 500,
  '.ps1': 700,
  '.py': 600,
  '.sh': 700,
  '.uc': 600,
  '.xml': 800,
});

function lineCount(source) {
  if (!source) return 0;
  return source.split(/\r?\n/).length - (source.endsWith('\n') ? 1 : 0);
}

export function sourceThreshold(path) {
  const extension = extname(path).toLowerCase();
  if (thresholds[extension]) return thresholds[extension];
  if (path.includes('/root/usr/libexec/sheepfold/')) return 900;
  return null;
}

export function assessStructure(rows) {
  return rows.map((row) => {
    const delta = row.baseLines === null ? null : row.currentLines - row.baseLines;
    let status = 'ok';
    if (row.currentLines > row.threshold) {
      if (delta === null || delta > 0) status = 'warning';
      else if (delta < 0) status = 'improved';
      else status = 'notice';
    }
    return { ...row, delta, status };
  });
}

function baseSource(base, path, cwd) {
  const result = spawnSync('git', ['show', `${base}:${path}`], {
    cwd,
    encoding: 'utf8',
    maxBuffer: 20 * 1024 * 1024,
  });
  return result.status === 0 ? String(result.stdout || '') : null;
}

export function inspectStructure(changes, options = {}) {
  const cwd = options.cwd || repoRoot;
  const base = options.base || 'origin/main';
  const rows = [];
  for (const change of changes) {
    const path = String(change.path || change).replaceAll('\\', '/');
    const threshold = sourceThreshold(path);
    const absolutePath = resolve(cwd, path);
    if (!threshold || !existsSync(absolutePath)) continue;
    const previousPath = change.previousPath || path;
    const previousSource = baseSource(base, previousPath, cwd);
    rows.push({
      path,
      threshold,
      currentLines: lineCount(readFileSync(absolutePath, 'utf8')),
      baseLines: previousSource === null ? null : lineCount(previousSource),
    });
  }
  return assessStructure(rows).sort((left, right) => right.currentLines - left.currentLines);
}

export function formatStructureAudit(rows) {
  if (!rows.length) return 'Изменённых исходников для структурного аудита нет.';
  const lines = ['Структурный аудит изменённых исходников:'];
  for (const row of rows) {
    const delta = row.delta === null ? 'new' : `${row.delta >= 0 ? '+' : ''}${row.delta}`;
    lines.push(`  ${row.status.padEnd(8)} ${String(row.currentLines).padStart(5)} (${delta}) / ${row.threshold}: ${row.path}`);
  }
  return lines.join('\n');
}
