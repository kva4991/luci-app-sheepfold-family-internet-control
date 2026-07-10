# Localization

Sheepfold should be localization-ready from the beginning.

## Principles

- Do not hardcode user-facing strings in LuCI JS, Android Kotlin, bot messages, or shell output when those strings are part of the UI.
- Use stable translation keys.
- Keep Russian as the primary product wording source.
- Keep English as the required fallback language.
- Generate translations for popular languages, then allow community review and corrections.
- If a translation is missing, fall back to English.
- Translation files are small and should live in the repository/package by default instead of being downloaded separately.

## Required Languages

These languages should be maintained as first-class translations:

| Locale | Language |
| --- | --- |
| `ru` | Russian |
| `en` | English |

## Planned Popular Languages

These languages are planned for generated UI translations:

| Locale | Language |
| --- | --- |
| `es` | Spanish |
| `de` | German |
| `fr` | French |
| `pt-BR` | Portuguese (Brazil) |
| `it` | Italian |
| `pl` | Polish |
| `tr` | Turkish |
| `uk` | Ukrainian |
| `zh-Hans` | Chinese (Simplified) |
| `ja` | Japanese |
| `ko` | Korean |
| `ar` | Arabic |
| `hi` | Hindi |
| `id` | Indonesian |
| `vi` | Vietnamese |

## Translation Scope

Translate:

- LuCI menu labels;
- LuCI forms and tabs;
- Android screens;
- Android widgets;
- bot commands and replies;
- validation errors;
- confirmation dialogs;
- help text and tooltips;
- emergency-useful sites descriptions.

Do not translate:

- package name: `luci-app-sheepfold-family-internet-control`;
- project name: `Sheepfold`;
- Android app package: `app.sheepfold.android`;
- domain names;
- MAC/IP examples;
- shell commands.

## Naming Notes

- Use `Sheepfold` as the project name in every language.
- Use `Sheepfold` as the public Android app name and LuCI product word. Do not use `Овчарня` in public product text unless the owner explicitly asks to discuss the old/internal name.
- The feature `Доступ к аварийно-полезным сайтам` should be translated by meaning, not word-for-word, for each language.

## LuCI: gettext, `.po`, and `.lmo`

### JavaScript strings

- Use LuCI `_('...')` only; do not use a local `T()` dictionary.
- The string inside `_('...')` must be **English** (msgid and fallback).
- Translations live in `po/<lang>/sheepfold.po`; template in `po/templates/sheepfold.pot`.
- Regenerate catalogs with `xgettext.sh` / `msgmerge.sh` (see `CODING_RULES.md` §8.2).

### Binary catalog on the router

LuCI loads translations from `/usr/lib/lua/luci/i18n/sheepfold.<lang>.lmo`.

Without `sheepfold.ru.lmo` on the router, the UI stays in English msgids even when Russian is selected. This is not a browser-cache issue.

Test IPK builds compile `.lmo` via `scripts/po2lmo.py` (`scripts/build-test-ipk.py`). Guard: `tests/testIpkI18n.test.mjs`.

### Two different “language” settings

| Setting | Source | Effect |
| --- | --- | --- |
| `sheepfold.global.language` | Installer (`install.sh`), app settings | Default group names on first install, some backend wording |
| `luci.main.lang` | Installer, Sheepfold settings, LuCI system | Which `.lmo` LuCI loads for `_()` |
| `sheepfold.global.luci_language_synced` | `postinst`, installer | One-time flag: install-time LuCI language was synced |

Russian LuCI UI requires **both**: LuCI language `ru` **and** `sheepfold.ru.lmo` on the router.

### First install

1. `install.sh` writes `/etc/sheepfold/install.language`.
2. `sheepfold-default-groups apply` sets `sheepfold.global.language`, `luci.main.lang`, and `luci_language_synced=1`.
3. English UI uses English msgids in `overview.js`; Russian needs `sheepfold.ru.lmo`.

Regression test: `tests/installLanguage.test.mjs`.

Installer “Application language” is synced to LuCI on first install (since 0.1.0-157). Changing language later: Sheepfold settings → Save, or manual `uci set luci.main.lang=…`.

### Do not gettext-translate

- UCI group display names (`sheepfold.no_restrictions.name`, etc.) — user entities; see `docs/default-groups.ru.md`.
- Detector source tags (`arp`, `dhcp`, `static`) — not device names.
