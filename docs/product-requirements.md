# Product Requirements

## Final Names

- GitHub repository: `luci-app-sheepfold-family-internet-control`
- OpenWRT package: `luci-app-sheepfold-family-internet-control`
- LuCI EN: `Sheepfold Family Internet Control`
- LuCI RU: `Овчарня : контроль доступа в интернет для семьи`
- Android app: `Овчарня`
- Android package: `app.sheepfold.android`

## Core Features

- Manage family internet access through an OpenWRT router and its LuCI web interface.
- Android companion app.
- Telegram or MAX two-way messenger bot.
- Only one messenger adapter can be active on one router at a time.
- Parent AI assistant with country-aware provider selection.
- Device allowlist.
- Device blocklist.
- Automatically discovered devices.
- Search by MAC, current IP, hostname, and custom name.
- DHCP static lease synchronization.
- Schedules.
- Temporary access tokens.
- Access to emergency-useful sites for restricted mode.
- Import/export of all settings and known clients.
- Optional logging.
- App update and router reboot controls with confirmation.
- OpenWRT uninstall command that removes the package but preserves Sheepfold settings and client lists, then shows a report of remaining router settings.

## Localization

Sheepfold must support Russian and English UI text and should be ready for generated translations into popular languages.

Requirements:

- keep UI strings in localization resources, not hardcoded directly in LuCI JS or Android code;
- provide Russian as the primary wording source;
- keep English as the required fallback language;
- generate and maintain translations for all LuCI, Android, bot, and documentation-facing menu labels;
- planned generated languages: Spanish, German, French, Portuguese (Brazil), Italian, Polish, Turkish, Ukrainian, Chinese Simplified, Japanese, Korean, Arabic, Hindi, Indonesian, and Vietnamese;
- keep terminology consistent:
  - `Sheepfold` as the project name;
  - `Овчарня` only for the Android app name and Russian LuCI display name;
  - `Доступ к аварийно-полезным сайтам` / `Access to emergency-useful sites` for the restricted-domain feature.

## Country Profiles

Sheepfold must adapt to the selected router country.

Country profiles should control:

- available AI assistant providers;
- default emergency-useful site suggestions;
- domain descriptions and warnings;
- localization defaults.

Manual user entries must not be deleted when the country changes.

Provider availability must be configuration-driven because legal and network availability can change.

## Parent AI Assistant

The Android app should include a parent AI assistant.

Requirements:

- DeepSeek should be the preferred default provider in countries where it is allowed and reachable;
- users should be able to choose another provider when it is allowed in the selected router country;
- provider options must change according to the selected router country profile;
- API keys must be stored securely on Android;
- the assistant may recommend router/app settings, but must not perform actions without explicit parent confirmation;
- the assistant should help parents move from external control toward child self-control.

## Android Scope

The Android companion app **Овчарня** should support Android 9.0 Pie / API 28 and newer.

Older Android versions are intentionally out of scope.

Recommended Android baseline:

- minimum SDK: API 28;
- target SDK: latest stable Android SDK;
- implementation language: Kotlin;
- UI: Jetpack Compose;
- token storage: Android Keystore.

Android app local authentication:

- ask for app-lock method during first setup;
- recommend password or PIN by default;
- allow fingerprint/face unlock if supported, but do not recommend it as the safest parental-control default;
- show a short warning that biometric unlock may be less safe because a child may try to unlock the app while the parent is asleep.

## Target OpenWRT Scope

The project should target modern OpenWRT installations that use `firewall4` and `nftables`.

There is no need to support old OpenWRT versions based on `firewall3` / `iptables`. The expected routers are relatively modern home routers, for example devices in the class of Xiaomi Mi Router AX3000T.

## Device Rules

Blocklisted devices are always blocked. Allowlisted devices are never blocked by global blocking or schedules. The backend and UI must prevent the same MAC address from being present in both lists.

Temporary access must never bypass the blocklist.

## Router Interface Access

The application should include security settings for local router access:

- blocklisted devices cannot access the OpenWRT router LuCI interface, SSH, or the Sheepfold local API;
- globally blocked devices may access the router only if `allow_router_for_blocked` is enabled;
- emergency-useful sites mode can optionally allow selected public domains for blocked devices.

## Integrations

AdGuard Home should remain responsible for DNS-level filtering when enabled.

Podkop should remain responsible for routing after Sheepfold and AdGuard Home have allowed the traffic.

LuCI must include a setting:

```text
Use together with / Использование совместно с
```

Allowed values:

- `none`;
- `adguard`;
- `podkop`;
- `adguard_podkop`.

When a mode is selected, the UI must show integration-specific notes and ask for confirmation before any automatic router changes. Sheepfold should create/export a backup before applying integration-related changes.

During installation, Sheepfold must detect whether AdGuard Home and/or Podkop are already installed on the router. The installer should choose the matching default `integration_mode`:

- no detected integration -> `none`;
- AdGuard Home only -> `adguard`;
- Podkop only -> `podkop`;
- AdGuard Home and Podkop -> `adguard_podkop`.

The installer may automatically write Sheepfold-owned UCI values for this mode, but must not rewrite AdGuard Home or Podkop configuration without an explicit separate confirmation.

## Helpful External Links

- Podkop and AdGuard Home setup: https://podkop.net/docs/adguard/
- Clearing browser cache after LuCI updates: https://podkop.net/docs/clear-browser-cache/
- OpenWRT router comparison: https://hattabbi4.github.io/openwrt-router-compare/

## Messaging

- Telegram and MAX should both support two-way chat: notifications, status, device search, temporary access, approvals, and confirmed administrative actions.
- A router can enable only one messenger adapter at a time: Telegram or MAX.
- Messenger integrations must go through the same Sheepfold API used by LuCI and Android.
