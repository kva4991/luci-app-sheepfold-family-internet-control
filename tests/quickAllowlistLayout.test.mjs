/*
 * Защищает модалку быстрого белого списка от переполнения: системная LuCI
 * модалка часто уже viewport, поэтому внутренние минимальные колонки не должны
 * задавать ей скрытую ширину. Визуальную проверку дополняет browser test. §frontmod
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

const styles = readFileSync(
  'package/luci-app-sheepfold-family-internet-control/htdocs/luci-static/resources/sheepfold/sheepfold.css',
  'utf8',
);

function rule(selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = styles.match(new RegExp(`${escaped}\\s*\\{([\\s\\S]*?)\\}`));
  assert.ok(match, `${selector} CSS rule must exist`);
  return match[1];
}

describe('Quick allowlist responsive modal', () => {
  it('uses two shrinkable QR columns and a full-width status row', () => {
    assert.match(rule('.sf-modal-quick'), /width:\s*100%/);
    assert.match(rule('.sf-modal-quick'), /min-width:\s*0/);
    assert.match(rule('.sf-modal-quick'), /max-width:\s*100%/);
    assert.match(rule('.sf-modal-quick-top'), /grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/);
    assert.match(rule('.sf-modal-quick-top'), /min-width:\s*0/);
    assert.match(rule('.sf-modal-quick-top > *'), /min-width:\s*0/);
    assert.match(rule('.sf-quick-side'), /grid-column:\s*1\s*\/\s*-1/);
  });

  it('allows the candidate table containers to shrink inside LuCI', () => {
    assert.match(rule('.sf-quick-candidates'), /min-width:\s*0/);
    assert.match(rule('.sf-quick-candidates-wrap'), /min-width:\s*0/);
    assert.match(rule('.sf-quick-table'), /width:\s*100%/);
    assert.match(rule('.sf-quick-table'), /table-layout:\s*fixed/);
  });
});
