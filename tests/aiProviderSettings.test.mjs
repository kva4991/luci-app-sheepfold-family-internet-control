import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const packageDir = resolve(repoRoot, 'package/luci-app-sheepfold-family-internet-control');
const overviewPath = resolve(packageDir, 'htdocs/luci-static/resources/view/sheepfold/overview.js');
const defaultsPath = resolve(packageDir, 'root/usr/share/sheepfold/sheepfold.uci.defaults');
const makefilePath = resolve(packageDir, 'Makefile');
const aiHandlerPath = resolve(packageDir, 'root/usr/libexec/sheepfold/sheepfold-ai-handler');
const parentPromptV1Path = resolve(packageDir, 'root/usr/share/sheepfold/prompts/parent/v1/system.txt');
const parentPromptV2Path = resolve(packageDir, 'root/usr/share/sheepfold/prompts/parent/v2/system.txt');

function readProjectFile(path) {
  return readFileSync(path, 'utf8');
}

describe('AI provider settings', () => {
  it('defaults to not configured and hides provider fields until selected', () => {
    const overview = readProjectFile(overviewPath);
    const defaults = readProjectFile(defaultsPath);
    const makefile = readProjectFile(makefilePath);

    assert.match(defaults, /option ai_provider 'none'/);
    assert.match(makefile, /ensure_global_option ai_provider 'none'/);
    assert.match(overview, /function aiSettingsBox/);
    assert.match(overview, /\['none', _\('Not set up'\)\]/);
    assert.match(overview, /settingValue\('ai_provider', 'none'\)/);
    assert.match(overview, /if \(provider === 'deepseek'\)/);
    assert.match(overview, /else if \(provider === 'gemini'\)/);
    assert.match(overview, /else if \(provider === 'grok'\)/);
    assert.match(defaults, /option grok_api_url 'https:\/\/api\.x\.ai\/v1\/chat\/completions'/);
    assert.match(makefile, /ensure_global_option grok_api_key ''/);
    assert.match(overview, /return aiSettingsBox\(\)/);
    assert.match(overview, /AI assistant prompt version/);
    assert.match(overview, /parent_ai_prompt_version/);
    assert.match(overview, /Version 2 \(recommended\)/);
  });

  it('does not fall back to DeepSeek on the router when provider is unset', () => {
    const aiHandler = readProjectFile(aiHandlerPath);

    assert.doesNotMatch(aiHandler, /ai_provider.*printf deepseek/);
  });

  it('loads versioned prompts and sends Grok through the router proxy', () => {
    const aiHandler = readProjectFile(aiHandlerPath);

    assert.match(aiHandler, /load_system_prompt/);
    assert.match(aiHandler, /parent_ai_prompt_version/);
    assert.match(aiHandler, /child_ai_prompt_version/);
    assert.match(aiHandler, /grok\)/);
    assert.match(aiHandler, /grok_api_key_missing/);
    assert.ok(readProjectFile(parentPromptV1Path).trim().length > 300);
    assert.ok(readProjectFile(parentPromptV2Path).trim().length > 300);
  });
});
