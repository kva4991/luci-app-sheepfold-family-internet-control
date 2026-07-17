/*
 * Защищает каноническую release-сборку OpenWrt. Тест не запускает Docker SDK,
 * но ловит опасные изменения матрицы, permissions и закрепления Action до push.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const workflowPath = join(root, '.github/workflows/build-openwrt-packages.yml');
const validationWorkflowPath = join(root, '.github/workflows/placeholder.yml');
const workflow = readFileSync(workflowPath, 'utf8');
const validationWorkflow = readFileSync(validationWorkflowPath, 'utf8');

describe('OpenWrt GitHub Actions build §owrtci1', () => {
  it('builds both product editions for current IPK and APK releases', () => {
    assert.equal((workflow.match(/- edition:/g) || []).length, 4);
    assert.match(workflow, /openwrt: 24\.10\.7[\s\S]*packageFormat: ipk/);
    assert.match(workflow, /sdkArch: aarch64_cortex-a53-24\.10\.7/);
    assert.match(workflow, /openwrt: 25\.12\.5[\s\S]*packageFormat: apk/);
    assert.match(workflow, /sdkArch: aarch64_cortex-a53-25\.12\.5/);
    assert.equal((workflow.match(/variant: sheepfold\n/g) || []).length, 2);
    assert.equal((workflow.match(/variant: sheepfoldAi\n/g) || []).length, 2);
  });

  it('pins the official SDK action and validates real APK metadata', () => {
    assert.match(
      workflow,
      /openwrt\/gh-action-sdk@7fc2640243284ecc44f4a9c3f749a61746ee02cb/,
    );
    assert.doesNotMatch(workflow, /openwrt\/gh-action-sdk@(?:main|v\d+)\b/);
    assert.match(workflow, /\/builder\/staging_dir\/host\/bin\/apk/);
    assert.match(workflow, /verify --allow-untrusted \/package\.apk/);
    assert.match(workflow, /adbdump --allow-untrusted --format json/);
    assert.match(workflow, /scripts\/collect-openwrt-package\.py/);
  });

  it('publishes only a complete verified matrix and scopes release writes', () => {
    assert.match(workflow, /^permissions:\n  contents: read$/m);
    assert.match(
      workflow,
      /publish-release:[\s\S]*if: github\.event_name == 'release' && github\.event\.release\.prerelease == false/,
    );
    assert.match(workflow, /publish-release:[\s\S]*permissions:\n      contents: write/);
    assert.match(workflow, /needs: bundle/);
    assert.match(workflow, /scripts\/create-openwrt-release-manifest\.py/);
    assert.match(workflow, /SHA256SUMS/);
    assert.match(workflow, /gh release upload/);
    assert.match(workflow, /OPENWRT_IPK_SIGNING_KEY/);
    assert.match(workflow, /OPENWRT_APK_PRIVATE_KEY/);
  });

  it('uses Node 24 compatible GitHub Actions in every workflow', () => {
    const allWorkflows = `${workflow}\n${validationWorkflow}`;

    // GitHub уже принудительно переводит старые JavaScript Actions на Node 24.
    // Явные свежие major-версии не дают предупреждению снова стать скрытой поломкой CI.
    assert.match(workflow, /actions\/checkout@v7/);
    assert.match(workflow, /actions\/upload-artifact@v7/);
    assert.match(workflow, /actions\/download-artifact@v8/);
    assert.match(validationWorkflow, /actions\/setup-node@v7/);
    assert.match(validationWorkflow, /actions\/setup-java@v5/);
    assert.match(validationWorkflow, /gradle\/actions\/setup-gradle@v6/);
    assert.doesNotMatch(
      allWorkflows,
      /actions\/(?:checkout|setup-node|setup-java|upload-artifact|download-artifact)@v4\b/,
    );
  });
});
