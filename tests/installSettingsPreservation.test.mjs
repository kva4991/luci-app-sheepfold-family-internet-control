/**
 * Защищает повторную установку Sheepfold от тихого сброса пользовательского
 * языка, редакции Standard/AI Support и подчинённых параметров автоматизации.
 * Это статический контракт BusyBox-скрипта; фактическую замену пакета отдельно
 * проверяет тестовый роутер, потому что Node не воспроизводит UCI и apk/opkg.
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const installer = readFileSync(resolve(repoRoot, 'install.sh'), 'utf8');

describe('Install settings preservation', () => {
  it('betaParticipationDefaultsOffWithoutOverwritingAnExistingChoice', () => {
    const prefix = 'package/luci-app-sheepfold-family-internet-control/';
    const defaults = readFileSync(resolve(repoRoot, prefix, 'root/usr/share/sheepfold/sheepfold.uci.defaults'), 'utf8');
    const makefile = readFileSync(resolve(repoRoot, prefix, 'Makefile'), 'utf8');
    const builder = readFileSync(resolve(repoRoot, 'scripts/build-test-ipk.py'), 'utf8');
    assert.match(defaults, /option beta_testing '0'/);
    for (const code of [makefile, builder]) {
      assert.match(code, /ensure_global_option beta_testing '0'/);
      assert.doesNotMatch(code, /beta_testing(?:=|\s+)'?1/);
    }
  });

  it('uses current language and product as defaults for an existing installation', () => {
    assert.match(installer, /DEFAULT_APP_LANGUAGE=.*sheepfold\.global\.language/);
    assert.match(installer, /""\)\s*\n\s*APP_LANGUAGE="\$DEFAULT_APP_LANGUAGE"/);
    assert.match(installer, /DEFAULT_PRODUCT_VARIANT=.*sheepfold\.global\.product_variant/);
    assert.match(installer, /sheepfold-ai-handler/);
    assert.match(installer, /opkg status "\$LEGACY_AI_PACKAGE"/);
    assert.match(installer, /sheepfoldAi\) DEFAULT_PRODUCT_CHOICE='2'/);
    assert.match(installer, /PRODUCT_CHOICE="\$DEFAULT_PRODUCT_CHOICE"/);
  });

  it('preserves selective subordinate choices but normalizes the maximum profile', () => {
    assert.match(installer, /DEFAULT_AUTOMATION_MODE=.*sheepfold\.global\.automation_mode/);
    assert.match(installer, /AUTO_CONFIGURE=.*sheepfold\.global\.auto_configure/);
    assert.match(installer, /PERSONAL_DEVICES_AUTO_ASSIGN=.*sheepfold\.global\.personal_devices_auto_assign/);
    assert.ok(
      installer.indexOf('AUTO_CONFIGURE="$(uci -q get sheepfold.global.auto_configure') <
        installer.indexOf('DEFAULT_AUTOMATION_MODE="$(uci -q get sheepfold.global.automation_mode'),
      'subordinate settings must be read before deriving the legacy automation mode'
    );
    assert.match(
      installer,
      /automation_profile_matches_maximum\(\)[\s\S]*NEW_DEVICE_POLICY[\s\S]*DEVICE_MONITORING_MODE/
    );
    assert.match(
      installer,
      /DEFAULT_AUTOMATION_MODE=.*\|\| true[\s\S]*""\)[\s\S]*automation_profile_matches_maximum[\s\S]*DEFAULT_AUTOMATION_MODE='selective'/
    );
    assert.match(
      installer,
      /case "\$NEW_DEVICE_POLICY" in[\s\S]*restrict\) NEW_DEVICE_POLICY='restrict_until_configured'/
    );
    assert.match(installer, /selective\|SELECTIVE\|Selective[\s\S]*AUTOMATION_MODE="selective"/);
    assert.doesNotMatch(
      installer,
      /selective\|SELECTIVE\|Selective[^;]*\)[\s\S]{0,300}DETECTION_MODE="reduced"/
    );
    assert.match(
      installer,
      /maximum\|MAXIMUM\|Maximum[\s\S]*PERSONAL_DEVICES_AUTO_ASSIGN=1[\s\S]*NEW_DEVICE_POLICY="allow"[\s\S]*DEVICE_MONITORING_MODE="automatic"/
    );
    assert.match(installer, /personal_devices_auto_assign="\$\{PERSONAL_DEVICES_AUTO_ASSIGN\}"/);
  });
});
