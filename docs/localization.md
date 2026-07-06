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
