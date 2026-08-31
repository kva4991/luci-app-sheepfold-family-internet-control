/*
 * Проверяет вычисляемый контраст основной Android-палитры и кнопок управления.
 * Тест разбирает реальные Kotlin-цвета и проверяет нейтральную серую палитру
 * неактивных команд: наличие Color(...) само по себе не замечает слияние с фоном.
 * Он ничего не изменяет, но не доказывает правильную отрисовку, размеры и
 * отсутствие системных перекрытий: перед релизом всё ещё нужен снимок устройства.
 * §uicontrast
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (path) => readFileSync(resolve(repoRoot, path), 'utf8');
const theme = read('android/app/src/main/java/app/sheepfold/android/ui/theme/Theme.kt');
const controls = read('android/app/src/main/java/app/sheepfold/android/ui/main/ControlMenuTabs.kt');
const setup = read('android/app/src/main/java/app/sheepfold/android/ui/setup/SafeRouterSetupScreen.kt');

function rgb(hex) {
  const value = hex.replace('#', '');
  return [0, 2, 4].map((offset) => Number.parseInt(value.slice(offset, offset + 2), 16) / 255);
}

function relativeLuminance(color) {
  return color
    .map((channel) => (
      channel <= 0.04045
        ? channel / 12.92
        : ((channel + 0.055) / 1.055) ** 2.4
    ))
    .reduce((sum, channel, index) => sum + channel * [0.2126, 0.7152, 0.0722][index], 0);
}

function contrastRatio(foreground, background) {
  const foregroundLuminance = relativeLuminance(foreground);
  const backgroundLuminance = relativeLuminance(background);
  return (
    (Math.max(foregroundLuminance, backgroundLuminance) + 0.05) /
    (Math.min(foregroundLuminance, backgroundLuminance) + 0.05)
  );
}

function requireMatch(source, expression, description) {
  const match = source.match(expression);
  assert.ok(match, `Не найден цветовой контракт: ${description}`);
  return match;
}

function parseThemeConstants() {
  const constants = { White: '#FFFFFF', Black: '#000000' };
  for (const match of theme.matchAll(/private val (\w+)\s*=\s*Color\(0xFF([0-9A-F]{6})\)/gi)) {
    constants[match[1]] = `#${match[2]}`;
  }
  return constants;
}

function parseScheme(name, constants) {
  const body = requireMatch(
    theme,
    new RegExp(`private val ${name} = (?:light|dark)ColorScheme\\(([\\s\\S]*?)\\n\\)`),
    name,
  )[1];
  const colors = {};
  for (const match of body.matchAll(/^\s*(\w+)\s*=\s*(Color\.(?:White|Black)|Color\(0xFF([0-9A-F]{6})\)|\w+),?\s*$/gim)) {
    const token = match[2];
    colors[match[1]] = match[3]
      ? `#${match[3]}`
      : constants[token.replace('Color.', '')];
    assert.ok(colors[match[1]], `Не удалось разрешить ${name}.${match[1]} = ${token}`);
  }
  return colors;
}

function assertContrast(label, foreground, background, minimum) {
  const ratio = contrastRatio(foreground, background);
  assert.ok(
    ratio >= minimum,
    `${label}: контраст ${ratio.toFixed(2)}:1 ниже требуемого ${minimum}:1`,
  );
}

describe('Android UI contrast', () => {
  it('keeps the next arrow and disabled outline visible in both themes', () => {
    const button = setup.slice(setup.indexOf('internal fun RoundNextButton'));
    assert.match(button, /R\.drawable\.ic_action_next/);
    for (const [property, token] of [
      ['containerColor', 'primary'], ['contentColor', 'onPrimary'],
      ['disabledContainerColor', 'surfaceVariant'], ['disabledContentColor', 'onSurfaceVariant'],
    ]) assert.ok(button.includes(`${property} = MaterialTheme.colorScheme.${token}`));
    assert.match(button, /border\(1\.dp, MaterialTheme\.colorScheme\.outline, CircleShape\)/);
    assert.doesNotMatch(setup, /Alignment\.BottomCenter|wrapContentSize|Text\("›"/);
    const constants = parseThemeConstants();
    for (const name of ['LightColors', 'DarkColors']) {
      const colors = parseScheme(name, constants);
      assertContrast(`${name}.next`, rgb(colors.onPrimary), rgb(colors.primary), 4.5);
      assertContrast(`${name}.nextDisabled`, rgb(colors.onSurfaceVariant), rgb(colors.surfaceVariant), 4.5);
      assertContrast(`${name}.nextOutline`, rgb(colors.outline), rgb(colors.background), 3);
    }
  });
  it('keeps text and icons distinct in both application themes', () => {
    const constants = parseThemeConstants();
    for (const schemeName of ['LightColors', 'DarkColors']) {
      const scheme = parseScheme(schemeName, constants);
      for (const [foreground, background] of [
        ['onBackground', 'background'],
        ['onSurface', 'surface'],
        ['onSurfaceVariant', 'surfaceVariant'],
      ]) {
        assertContrast(
          `${schemeName}.${foreground}/${background}`,
          rgb(scheme[foreground]),
          rgb(scheme[background]),
          4.5,
        );
      }
      for (const [foreground, background] of [
        ['onPrimary', 'primary'],
        ['onPrimaryContainer', 'primaryContainer'],
        ['onSecondary', 'secondary'],
        ['onSecondaryContainer', 'secondaryContainer'],
        ['onError', 'error'],
      ]) {
        assertContrast(
          `${schemeName}.${foreground}/${background}`,
          rgb(scheme[foreground]),
          rgb(scheme[background]),
          3,
        );
      }
      assertContrast(
        `${schemeName}.refreshIcon`,
        rgb(scheme.primary),
        rgb(scheme.primaryContainer),
        3,
      );
    }
  });

  it('keeps the available action bright and disabled commands neutral and readable', () => {
    for (const [action, blocked] of [['on', 'true'], ['off', 'false']]) {
      const body = requireMatch(
        controls,
        new RegExp(`Button\\(\\s*onClick = \\{ onBlock\\(${blocked === 'true' ? 'false' : 'true'}\\) \\},([\\s\\S]*?)R\\.string\\.router_turn_internet_${action}`),
        `internet_${action}`,
      )[1];
      assert.ok(body.includes(`enabled = !isLoading && globalBlocked == ${blocked}`));
      const colors = requireMatch(
        body,
        /containerColor = Color\(0xFF([0-9A-F]{6})\),\s*contentColor = Color\.White,\s*disabledContainerColor = Color\(0xFF([0-9A-F]{6})\),\s*disabledContentColor = Color\(0xFF([0-9A-F]{6})\)/i,
        `internet_${action} palette`,
      );
      const background = rgb(`#${colors[2]}`);
      const foreground = rgb(`#${colors[3]}`);
      for (const color of [background, foreground]) {
        assert.equal(color[0], color[1], 'Disabled commands must be neutral gray');
        assert.equal(color[1], color[2], 'Disabled commands must be neutral gray');
      }
      assertContrast(`${action}.active`, rgb('#FFFFFF'), rgb(`#${colors[1]}`), 4.5);
      assertContrast(`${action}.disabled`, foreground, background, 4.5);
    }
  });
});
