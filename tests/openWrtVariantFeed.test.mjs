/*
 * Проверяет feed, который получает официальный OpenWrt SDK. Это отдельный слой
 * от тестового IPK: корректный тестовый архив не доказывает корректность SDK feed.
 */
import assert from 'node:assert/strict';
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { describe, it } from 'node:test';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const packageName = 'luci-app-sheepfold-family-internet-control';

function prepareFeed(variant, providedPath) {
  if (providedPath) return resolve(providedPath);
  const output = mkdtempSync(join(tmpdir(), `sheepfold-${variant}-sdk-feed-`));
  const result = spawnSync(
    process.platform === 'win32' ? 'python' : 'python3',
    ['scripts/prepare-openwrt-sdk-feed.py', '--variant', variant, '--out-dir', output],
    { cwd: root, encoding: 'utf8' },
  );
  assert.equal(result.status, 0, result.error?.message || result.stderr || result.stdout);
  return output;
}

function allTextFiles(directory) {
  const files = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...allTextFiles(path));
    else files.push(path);
  }
  return files;
}

describe('OpenWrt SDK variant feed §owrtci1 §prodvar', () => {
  it('prepares physically distinct editions with one internal package identity', () => {
    const providedStandard = process.env.SHEEPFOLD_TEST_STANDARD_SDK_FEED || '';
    const providedAi = process.env.SHEEPFOLD_TEST_AI_SDK_FEED || '';
    const standardFeed = prepareFeed('sheepfold', providedStandard);
    const aiFeed = prepareFeed('sheepfoldAi', providedAi);
    try {
      const standard = join(standardFeed, packageName);
      const ai = join(aiFeed, packageName);
      const standardMakefile = readFileSync(join(standard, 'Makefile'), 'utf8');
      const aiMakefile = readFileSync(join(ai, 'Makefile'), 'utf8');
      const standardDefaults = readFileSync(
        join(standard, 'root/usr/share/sheepfold/sheepfold.uci.defaults'),
        'utf8',
      );
      const aiDefaults = readFileSync(
        join(ai, 'root/usr/share/sheepfold/sheepfold.uci.defaults'),
        'utf8',
      );
      const standardHardening = readFileSync(
        join(standard, 'root/usr/libexec/sheepfold/sheepfold-runtime-hardening'),
        'utf8',
      );
      const aiHardening = readFileSync(
        join(ai, 'root/usr/libexec/sheepfold/sheepfold-runtime-hardening'),
        'utf8',
      );

      assert.match(standardMakefile, /^PKG_NAME:=luci-app-sheepfold-family-internet-control$/m);
      assert.match(aiMakefile, /^PKG_NAME:=luci-app-sheepfold-family-internet-control$/m);
      assert.match(standardMakefile, /^SHEEPFOLD_PRODUCT_VARIANT:=sheepfold$/m);
      assert.match(aiMakefile, /^SHEEPFOLD_PRODUCT_VARIANT:=sheepfoldAi$/m);
      assert.doesNotMatch(standardMakefile, /ai_enabled|sheepfold-activity-log/);
      assert.match(aiMakefile, /ai_enabled/);
      assert.match(aiMakefile, /sheepfold-activity-log/);
      assert.match(standardDefaults, /option product_variant 'sheepfold'/);
      assert.doesNotMatch(standardDefaults, /deepseek_|gemini_|grok_|activity_log_enabled/);
      assert.match(aiDefaults, /option product_variant 'sheepfoldAi'/);
      assert.ok(!existsSync(join(standard, 'root/usr/libexec/sheepfold/sheepfold-ai-handler')));
      assert.ok(existsSync(join(ai, 'root/usr/libexec/sheepfold/sheepfold-ai-handler')));
      assert.ok(!existsSync(join(standard, 'htdocs/luci-static/resources/view/sheepfold/ai.js')));
      assert.ok(existsSync(join(ai, 'htdocs/luci-static/resources/view/sheepfold/ai.js')));
      assert.ok(existsSync(join(standard, 'po/zh_Hans/sheepfold.po')));
      assert.match(standardHardening, /sheepfold-access-request/);
      assert.match(aiHardening, /sheepfold-access-request/);
      assert.match(standardHardening, /pair_store_token/);
      assert.match(aiHardening, /device_identity_mismatch/);
      assert.doesNotMatch(standardHardening, /AI_GATE|ACTIVITY_LOG|OPENSSL_ENSURE/);

      for (const file of [...allTextFiles(standard), ...allTextFiles(ai)]) {
        const content = readFileSync(file);
        if (content.includes(0)) continue;
        assert.doesNotMatch(
          content.toString('utf8'),
          /SHEEPFOLD_(?:AI|STANDARD)_(?:BEGIN|END)/,
          `variant marker remains in ${file}`,
        );
      }
    } finally {
      if (!providedStandard) rmSync(standardFeed, { recursive: true, force: true });
      if (!providedAi) rmSync(aiFeed, { recursive: true, force: true });
    }
  });
});
