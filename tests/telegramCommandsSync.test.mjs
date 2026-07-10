import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const packageDir = resolve(repoRoot, 'package/luci-app-sheepfold-family-internet-control');

function readProjectFile(path) {
  return readFileSync(resolve(packageDir, path), 'utf8');
}

function overviewCommandNames(source) {
  const block = source.match(/function messengerCommandRows\(\) \{[\s\S]*?return \[([\s\S]*?)\];\s*\}/);
  assert.ok(block, 'messengerCommandRows() must exist in overview.js');

  const names = [];
  const rowPattern = /\['(\/[^']+)'/g;
  let match;
  while ((match = rowPattern.exec(block[1])) !== null) {
    const raw = match[1].replace(/^\//, '');
    names.push(raw.split(/\s+/)[0]);
  }
  return names;
}

function telegramCommandNames(source) {
  const block = source.match(/telegram_commands_json\(\) \{[\s\S]*?cat <<'EOF'[\s\S]*?\[([\s\S]*?)\][\s\S]*?EOF/);
  assert.ok(block, 'telegram_commands_json() must exist in sheepfold-telegram-bot');

  const names = [];
  const commandPattern = /"command":"([^"]+)"/g;
  let match;
  while ((match = commandPattern.exec(block[1])) !== null) {
    names.push(match[1]);
  }
  return names;
}

describe('Telegram command menu sync', () => {
  it('keeps overview.js messengerCommandRows in sync with telegram_commands_json()', () => {
    const overview = readProjectFile('htdocs/luci-static/resources/view/sheepfold/overview.js');
    const bot = readProjectFile('root/usr/libexec/sheepfold/sheepfold-telegram-bot');

    const overviewNames = overviewCommandNames(overview);
    const telegramNames = telegramCommandNames(bot);

    assert.deepEqual(
      telegramNames,
      overviewNames,
      'Telegram setMyCommands list must match LuCI messenger command overview',
    );
  });
});