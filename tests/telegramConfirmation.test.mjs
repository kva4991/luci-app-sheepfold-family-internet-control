/*
 * Риск: случайная или повторно отправленная команда Telegram может отключить
 * интернет/Wi-Fi, изменить доступ отдельного устройства либо выполнить обслуживание
 * роутера. Тест проверяет локальный shell-контракт без сети Telegram и роутера.
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const botPath = resolve(
  repoRoot,
  'package/luci-app-sheepfold-family-internet-control/root/usr/libexec/sheepfold/sheepfold-telegram-bot',
);
const bot = readFileSync(botPath, 'utf8');

function shellFunction(name) {
  const match = bot.match(new RegExp(`${name}\\(\\) \\{[\\s\\S]*?\\n\\}`));
  assert.ok(match, `${name}() must exist`);
  return match[0];
}

describe('Telegram dangerous-command confirmation §tgconfirm', () => {
  it('routes internet and Wi-Fi shutdown through the same one-time confirmation', () => {
    assert.match(bot, /\/internet_off\*[\s\S]*request_confirmation "\$chat_id" internet_off/);
    assert.match(bot, /\/wifi_off\*[\s\S]*request_confirmation "\$chat_id" wifi_off/);
    assert.match(bot, /internet_off\)[\s\S]*"\$ROUTER_CONTROL" internet-disable/);
    assert.match(bot, /wifi_off\)[\s\S]*"\$ROUTER_CONTROL" wifi-disable/);
    assert.match(bot, /clear_logs\)[\s\S]*update\)[\s\S]*reboot\)/);
  });

  it('requires confirmation for every device-policy mutation', () => {
    assert.match(bot, /\/grant_time\*[\s\S]*request_device_confirmation "\$chat_id" grant_time/);
    assert.match(bot, /\/block_device\*[\s\S]*request_device_confirmation "\$chat_id" device_block/);
    assert.match(bot, /\/unblock_device\*[\s\S]*request_device_confirmation "\$chat_id" device_unblock/);
    assert.match(bot, /\/allowlist_add\*[\s\S]*request_device_confirmation "\$chat_id" allowlist_add/);
    assert.match(bot, /\/blocklist_add\*[\s\S]*request_device_confirmation "\$chat_id" blocklist_add/);
    assert.match(bot, /grant_time\)[\s\S]*grant_time_by_query "#\$action_arg1" "\$action_arg2"/);
    assert.match(bot, /device_block\)[\s\S]*set_device_status_by_query "#\$action_arg1" blocked/);
  });

  it('creates six-digit codes from secure randomness without a clock fallback', () => {
    const source = shellFunction('confirmation_code');
    assert.match(source, /dd if=\/dev\/urandom bs=32 count=1/);
    assert.match(source, /sha256sum/);
    assert.match(source, /openssl rand -hex 16/);
    assert.doesNotMatch(source, /date \+%s|\bod\b/);
    assert.match(source, /raw_value" -lt 16200000/);
    assert.match(source, /printf '%06d'/);

    const script = `${source}\nfor i in 1 2 3 4 5 6 7 8; do confirmation_code || exit 1; echo; done\n`;
    const result = spawnSync('bash', ['-c', script], { encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
    const codes = result.stdout.trim().split(/\s+/);
    assert.equal(codes.length, 8);
    assert.ok(codes.every((code) => /^\d{6}$/.test(code)));
    assert.ok(new Set(codes).size > 1, 'secure random samples unexpectedly repeated every code');
  });

  it('stores one pending action atomically and consumes it before execution', () => {
    const request = shellFunction('request_confirmation');
    const handle = shellFunction('handle_confirmation');
    assert.match(bot, /chmod 700 "\$RUNTIME_DIR"/);
    assert.match(request, /umask 077/);
    assert.match(request, /pending_file="\$\{file\}\.tmp\.\$\$"/);
    assert.match(request, /mv -f "\$pending_file" "\$file"/);
    assert.match(handle, /rm -f "\$file"[\s\S]*run_confirmed_action/);
    assert.match(handle, /Код подтверждения устарел/);
    assert.match(handle, /Код подтверждения не совпал/);
  });

  it('accepts the advertised six-digit code and preserves action arguments', () => {
    const confirmationFile = shellFunction('confirmation_file');
    const handle = shellFunction('handle_confirmation');
    const tempPath = '.build/telegram-confirmation-test';
    const script = `
set -eu
RUNTIME_DIR="$1"
mkdir -p "$RUNTIME_DIR"
${confirmationFile}
send_message_to() { printf 'message=%s\n' "$2"; }
run_confirmed_action() { printf 'executed=%s|%s|%s|%s\n' "$1" "$2" "$3" "$4"; }
${handle}
printf 'grant_time\\t3\\t45\\t123456\\t9999999999\\n' > "$(confirmation_file 42)"
handle_confirmation 42 'подтверждаю 123456'
test ! -e "$(confirmation_file 42)"
rmdir "$RUNTIME_DIR"
`;
    const result = spawnSync('bash', ['-c', script, 'bash', tempPath], {
      cwd: repoRoot,
      encoding: 'utf8',
    });
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /executed=42\|grant_time\|3\|45/);
  });
});
