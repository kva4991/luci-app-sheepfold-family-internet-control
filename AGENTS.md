# Agent Guidelines

These rules apply to the whole repository.

## Project Naming

- Use `Sheepfold` as the main project and product name in English and Russian text.
- Use `Овчарня` only when referring to the Android app name or the Russian LuCI display name.
- Do not use `Овчарня` as the generic Russian name for the whole project outside direct app/interface naming.

Correct examples:

- `Sheepfold — система семейного управления доступом...`
- `Android-приложение: Овчарня`
- `LuCI RU: Овчарня : контроль доступа в интернет для семьи`

Avoid:

- `Овчарня — система...`
- `Если Овчарня окажется полезной...`

## User-Facing Wording

- Prefer clear router-based wording over internal-only LuCI wording.
- In Russian, write `через OpenWRT-роутер и его веб-интерфейс LuCI` instead of only `через LuCI`.
- Keep README files approachable for non-developers.
- Keep user-facing strings localizable. Do not hardcode menu labels, validation messages, or bot replies when a localization resource should be used.

## README Layout

- Keep installation, update, and uninstall instructions near the top of both `README.md` and `README.ru.md`, before long product explanations.
- Keep the English and Russian README files structurally similar where practical.
- Keep `install.sh`, `update.sh`, and `uninstall.sh` suitable for running directly on an OpenWRT router.
- The uninstall command must remove the package without clearing Sheepfold client lists or user settings, then print a report of remaining router settings that may require manual cleanup.
- When changing installation, update, or uninstall commands, update both README files and `docs/github-install-setup.md` if relevant.

## Emergency-Useful Sites

- The user-facing feature name is:
  - RU: `Доступ к аварийно-полезным сайтам`
  - EN: `Access to emergency-useful sites`
- Do not call this feature `белый список доменов` in user-facing Russian UI copy.
- Use one editable domain list, not built-in presets. AdGuard Home already has filtering presets; Sheepfold should not duplicate them.
- Every automatically suggested site entry must include:
  - domain;
  - user-visible display name;
  - short explanation of why the site may be needed;
  - optional warning;
  - source, for example `starter`, `manual`, `imported`, or `integration`.
- Emergency-useful sites are for restricted access: enough for necessary services, not enough for normal entertainment browsing.

## Yandex Domains

- Do not add broad `yandex.ru` to any default, starter, auto-generated, auto-imported, or "safe minimum" emergency-useful sites list.
- Do not silently include broad Yandex domains when creating examples, onboarding defaults, first-run suggestions, import templates, generated configs, tests, fixtures, or screenshots.
- If Yandex search is needed by default, prefer `ya.ru`.
- If maps are needed by default, prefer `2gis.ru`.
- Add broad Yandex domains only when the parent/admin explicitly adds them manually or selects an advanced option with a clear warning.
- Always explain the reason: broad Yandex domains can open much more than maps or search, including video, music, games, feeds, entertainment pages, and other Yandex services. Yandex Maps may require shared Yandex/static domains, so narrow allowance can be difficult.

## Messaging

- Telegram and MAX are both two-way chat/control channels.
- A router can enable only one messenger adapter at a time: Telegram or MAX.
- Do not design flows that require Telegram and MAX to be active simultaneously on the same router.
- Messenger integrations must use the same Sheepfold API as LuCI and Android.
- Administrative bot actions such as reboot, update, import, global block, and list changes must require explicit confirmation.

## AdGuard Home And Podkop Integrations

- The LuCI setting is `Use together with` / `Использование совместно с`.
- Supported integration modes are `none`, `adguard`, `podkop`, and `adguard_podkop`.
- Do not model AdGuard Home and Podkop as mutually exclusive; they can be used together.
- The installer must detect existing AdGuard Home and Podkop installations and choose the matching Sheepfold `integration_mode`.
- Show integration-specific notes before applying changes.
- Automatic router changes require explicit confirmation and should create/export a backup first.
- Automatic install-time changes may write only Sheepfold-owned UCI options unless the user explicitly confirms broader router changes.
- Do not overwrite AdGuard Home or Podkop configs blindly.
- Do not modify Podkop-managed Dnsmasq, nftables, sing-box, or routing state unless the change is explicitly designed and documented.

## Localization

- Russian is the primary product wording source.
- English is the required fallback language.
- Translation files are small; keep them in the repository/package by default instead of downloading them separately.
- Planned generated UI languages include Spanish, German, French, Portuguese (Brazil), Italian, Polish, Turkish, Ukrainian, Chinese Simplified, Japanese, Korean, Arabic, Hindi, Indonesian, and Vietnamese.

## AI Assistant And Country Profiles

- The Android parent assistant must use an abstract provider layer. Do not hardcode DeepSeek or any other provider as the only global option.
- DeepSeek can be the preferred default provider only in country profiles where it is allowed and reachable.
- Provider availability is country-profile configuration, not a permanent legal claim in code.
- The selected router country controls visible AI providers and suggested emergency-useful sites.
- Manual user entries must survive country changes.
- The assistant may suggest settings but must not apply router actions without explicit parent confirmation.
- Keep long assistant prompts in separate prompt documents, not buried inside architecture docs.
- Assistant prompts are drafts until reviewed by the project owner and, for family/psychology guidance, a qualified family psychologist.

## Android App Security Copy

- During first setup, Android app local authentication should recommend password or PIN.
- Fingerprint and face unlock may be offered, but should not be described as the safest default for a parental-control app.
- Use concise wording: biometric unlock can be less safe because a child may try to unlock the app while the parent is asleep.

## Platform Scope

- Target modern OpenWRT with `firewall4` / `nftables`.
- Do not add legacy `firewall3` / `iptables` support unless explicitly requested later.
- Target Android 9.0 Pie / API 28 and newer.

## Repository Hygiene

- Keep `README.md` in English.
- Keep `README.ru.md` in Russian.
- Keep shell scripts and OpenWRT package files LF-only.
- Do not commit secrets, tokens, router passwords, or local environment files.
