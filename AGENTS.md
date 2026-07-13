# Agent Guidelines

These rules apply to the whole repository.

## Project Naming

- Use `Sheepfold` as the main project and product name in English and Russian text.
- Use `Sheepfold` as the public Android app name too.
- In LuCI Russian UI headings, keep the product word in English: `Sheepfold`.
- Do not use `Овчарня` in public product text unless the owner explicitly asks to discuss the old/internal name.

Correct examples:

- `Sheepfold — система семейного управления доступом...`
- `Android-приложение: Sheepfold`
- `LuCI RU: Sheepfold : контроль доступа в интернет для семьи`

Avoid:

- `Овчарня — система...`
- `Если Овчарня окажется полезной...`
- `Android-приложение Овчарня`
- `Овчарня : контроль доступа в интернет для семьи` in the LuCI header

## User-Facing Wording

- Prefer clear router-based wording over internal-only LuCI wording.
- In Russian, write `через OpenWRT-роутер и его веб-интерфейс LuCI` instead of only `через LuCI`.
- Keep README files approachable for non-developers.
- Keep user-facing strings localizable. Do not hardcode menu labels, validation messages, or bot replies when a localization resource should be used.
- In Sheepfold LuCI settings, all setting changes must be saved only after the parent presses the explicit `Save` / `Сохранить` button. Do not autosave settings on field blur, select change, checkbox change, or radio change. The settings page must show this save action at least twice: at the top right of the settings panel and again at the bottom after the settings content. Internally, Sheepfold may still perform OpenWRT `save`/`apply`, service restart, cron update, or backend wrapper calls, but the parent-facing model is one deliberate save action.
- Do not expose separate `Apply` and `Save` actions unless OpenWRT internals force it; if both exist technically, hide or merge `Apply` in the Sheepfold UI so parents are not asked to understand the distinction.
- After Sheepfold changes UCI from LuCI actions, the implementation must also apply/accept LuCI's own pending-change queue so the standard LuCI banner like "Unsaved changes" / `Не принятые изменения` does not remain visible. Prefer a shared helper that saves configs and then uses the LuCI changes API when available, with an OpenWRT `uci apply` fallback.
- In Sheepfold LuCI, keep `All devices`, `Allowlist`, and `Blocklist` as nested tabs inside the top-level `User lists` / `Списки пользователей` tab. `All devices` must be the default nested tab.
- Design the interface for a normal busy parent, not for a network engineer. Reuse the same visual pattern, wording, icon meaning, button placement, and confirmation style for the same action everywhere, so the parent can recognize behavior quickly without studying every screen.
- Sheepfold UI must actively strive to be intuitive for a weak/uncertain PC user. Instructions, warnings, errors, confirmations, and notifications must be written in plain user language: what happened, why it matters, what will happen after the button press, and how to undo or fix it.
- If a feature appears in LuCI, Android, and bot/messenger flows, keep the user-facing names and mental model aligned across all of them unless the platform truly requires different wording.
- For every non-obvious feature, setting, status, or risky action, add contextual help opened by a visible `?` button or equivalent help icon. Keep the screen itself clean, but provide a short step-by-step explanation like the Telegram setup guide. See `docs/contextual-help.ru.md`.

## Coding Style

- Use camelCase for JavaScript/Kotlin variables, functions, object fields, and UI state names whenever the surrounding platform does not require another convention.
- Keep OpenWRT/UCI/package keys in their native format, usually snake_case or uppercase Make variables, for example `app_port`, `ui_asset_version`, `PKG_RELEASE`, and `SHEEPFOLD_UI_ASSET_VERSION`.
- Do not convert external API fields, UCI options, package metadata, Android resource names, or documented protocol keys to camelCase unless the external contract itself uses camelCase.
- When fixing non-obvious code in this repository, leave short Russian comments explaining why the fix is needed and why this approach is used. Do not comment obvious assignments or noise.
- When a subtle implementation choice is intentionally correct, add a short Russian comment near that code so future agents do not "simplify" it away.

## README Layout

- Keep installation, update, and uninstall instructions near the top of both `README.md` and `README.ru.md`, before long product explanations.
- Keep the English and Russian README files structurally similar where practical.
- Keep `install.sh`, `update.sh`, and `uninstall.sh` suitable for running directly on an OpenWRT router.
- Test `.ipk` packages must follow OpenWrt `ipkg-build` style: a gzip-compressed tar archive containing `debian-binary`, `data.tar.gz`, and `control.tar.gz`; do not publish ad-hoc `ar` archives for OpenWrt test packages.
- After building local test packages such as `.ipk` or `.apk`, always copy the finished artifact to `C:\Users\User\Downloads` for easy manual installation. Do not commit generated package artifacts.
- Default artifact output for this Windows workspace: `C:\Users\User\Downloads`. Test IPK builders write the package there directly; do not use `dist\` as the default output directory.
- The uninstall command must remove the package without clearing Sheepfold client lists or user settings, then print a report of remaining router settings that may require manual cleanup.
- When changing installation, update, or uninstall commands, update both README files and `docs/github-install-setup.md` if relevant.

## Router Connectivity, DNS, Time, And NTP

- Connectivity checks must be country-aware and configurable. Do not depend only on foreign IPs/domains such as `1.1.1.1`, `8.8.8.8`, `google.com`, or Cloudflare/Google endpoints to decide whether the router has internet.
- For the Russia country profile, prefer Russian or Russia-relevant targets for default ping/DNS/HTTP diagnostics. DNS probes should prefer domains such as `ya.ru`, `gosuslugi.ru`, and `ntp1.vniiftri.ru`; fallback foreign targets may exist only as secondary configurable fallback checks.
- ICMP ping alone is not enough because many hosts block it. Use a small ordered diagnostic chain: WAN link/ubus state, default route/gateway, DNS resolution of country-profile domains, and then lightweight HTTP(S) checks where needed.
- Sheepfold automatic setup must include router time setup. Add/keep settings for making the router an NTP server for the LAN, configuring the router NTP client, and choosing the router timezone.
- Default NTP client servers for the Russia-oriented profile: `ntp1.vniiftri.ru`, `ntp2.ntp-servers.net`, `3.openwrt.pool.ntp.org`.
- Router timezone must be changed to the most suitable value during installation/automatic setup. For Russia without a more specific region selection, use Moscow time (`Europe/Moscow`, POSIX `MSK-3`) as the default.
- Because NTP/timezone changes touch OpenWRT system settings, preserve previous values in export/reporting where practical and show the setting clearly in LuCI.
- The LuCI `Information` settings tab and Android `/cgi-bin/sheepfold-api/router-info` diagnostics snapshot may include router health and integration metadata, but must not include Wi-Fi passwords, bot/API tokens, session cookies, child names, client MAC addresses, client device lists, or logs. Android must show a preview and ask for explicit parent confirmation before sending this diagnostics snapshot to an AI provider.

## Operational Gotchas And Documentation

- Non-obvious product, installer, router, LuCI, i18n, grouping, or environment findings must be maintained in focused docs in the same change session — not only left in code comments or chat.
- Use `docs/agent-gotchas.ru.md` as the index: **add** new one-line entries, **update** wording when behavior changes, and **remove** entries when the trap is fixed or the setting becomes visible in UI.
- Put full explanations in the topic doc (for example `docs/localization.ru.md`, `docs/hidden-settings.ru.md`, `docs/device-detection.ru.md`).
- Programming-style rules, deprecations, LuCI view patterns, and review checklists belong in `CODING_RULES.md`, not in product docs.
- Do not dump long technical gotchas into README files; keep README user-facing.
- If no suitable focused doc exists, create one under `docs/` and link it from `docs/developer-task.ru.md` and `docs/agent-gotchas.ru.md`.

## Implementation Entry Point

- When continuing work on `editsByClaude` before its merge into `main`, first read `docs/merge-readiness-plan.ru.md`. It records the exact stopping point, unresolved blockers, reasons for every required check, and the recommended reading route for a fresh chat.
- Before running builds or tests in a fresh local Codex Desktop chat on the user's Windows PC, read `docs/agent-environment.ru.md`. It records the Windows/Codex tooling setup, required programs, common build commands, IPK/APK build notes, and the verification commands that have already worked for this repository. For Linux, WSL, macOS, or GitHub Actions, keep the intent but adapt paths and shell syntax.
- Read `docs/agent-gotchas.ru.md` when debugging surprising LuCI, i18n, default-group, detector, or test-IPK behavior so earlier traps are not rediscovered from scratch.
- Future AI developers should start with `docs/developer-task.ru.md`, then read `docs/product-requirements.md` and the relevant focused docs.
- For broad feature work, future AI developers must also read `docs/agent-playbook.ru.md`; it is the detailed implementation playbook that captures product decisions from the planning discussion.
- Keep `docs/developer-task.ru.md` updated when project-level decisions change.
- Do not replace the focused docs with the developer task; it is an entrypoint and summary, not the source of every detail.

## Agent Playbook

- `docs/agent-playbook.ru.md` is the detailed repository-wide task brief for AI agents.
- Keep it synchronized with `AGENTS.md`, `docs/product-requirements.md`, and `docs/developer-task.ru.md` whenever core product decisions change.
- If an agent is unsure whether to add a feature, prefer the stricter/smaller interpretation until the project owner explicitly expands scope.
- Never implement a convenience feature that weakens privacy, opens entertainment/marketplace access by default, bypasses the blocklist, adds hidden child-device behavior, or introduces full remote router management.

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
- Emergency-useful sites may be allowed for blocklisted devices only through a separate explicit setting. This must not grant access to LuCI, SSH, or Sheepfold API.
- Do not add marketplaces, shopping services, super-app storefronts, food delivery catalogs, entertainment catalogs, app stores, or broad "everything" portals to default, starter, auto-generated, auto-imported, or "safe minimum" emergency-useful sites lists.

## Yandex Domains

- Do not add broad `yandex.ru` to any default, starter, auto-generated, auto-imported, or "safe minimum" emergency-useful sites list.
- Do not silently include broad Yandex domains when creating examples, onboarding defaults, first-run suggestions, import templates, generated configs, tests, fixtures, or screenshots.
- If Yandex search is needed by default, prefer `ya.ru`.
- If maps are needed by default, prefer `2gis.ru`.
- Add broad Yandex domains only when the parent/admin explicitly adds them manually or selects an advanced option with a clear warning.
- Always explain the reason: broad Yandex domains can open much more than maps or search, including video, music, games, feeds, entertainment pages, and other Yandex services. Yandex Maps may require shared Yandex/static domains, so narrow allowance can be difficult.
- Yandex Go, Yandex Taxi, Yandex Market, Yandex Food, Yandex Lavka, Yandex Delivery, and similar Yandex super-app surfaces must not be added to default emergency-useful site lists. They may be offered only as manually enabled transport/taxi suggestions with a clear warning that Yandex Go can also expose marketplace, food, delivery, carsharing, scooter, and other non-emergency services.

## Site Lists And AdGuard Home

- Sheepfold built-in site allow/block lists are a fallback for routers without AdGuard Home.
- If AdGuard Home is detected on the router, Sheepfold should explain that domain allow/block lists can be configured more flexibly in AdGuard Home and can be disabled in Sheepfold.
- During installation or first setup, when AdGuard Home is installed, prefer not to enable Sheepfold duplicate site filtering silently. Show a clear user-facing notice instead.
- Keep device access control in Sheepfold; do not move Sheepfold device allowlist/blocklist semantics into AdGuard Home. This rule is about domain/site lists only.

## User Agreement And Privacy

- Keep the full Russian user agreement in `docs/user-agreement.ru.md`.
- Keep `docs/user-agreement.md` as the English routing/summary document until a full English legal text is prepared.
- Keep the full Russian privacy policy in `docs/privacy.ru.md`.
- Keep `docs/privacy.md` as the English routing/summary document until a full English privacy policy is prepared.
- Android first setup must require a checkbox before use: `Я принимаю пользовательское соглашение и даю согласие на обработку персональных и технических данных, необходимых для работы Sheepfold.`
- OpenWRT installer must show a link to the full agreement and require explicit `yes`, `y`, or `да` input before applying installation or configuration changes.
- The OpenWRT installer must ask for application language before the agreement prompt. Use a simple console prompt: `Choose application language / Выберите язык приложения: Русский ru, English en`, with `ru` as the default.
- The agreement must be visible before first use in LuCI/Android when practical.
- Do not claim that the agreement is final legal advice; production releases should be reviewed by a qualified lawyer.
- Sheepfold is self-hosted for family use by default. Do not introduce a developer-operated cloud dependency unless explicitly requested later.
- The main Android app in `android/` is for parent/admin devices only. A separate child app in `android-child/` is allowed only as an explicitly installed status/helper client without administrative functions; never design hidden child-phone installation flows (§z5ck8mv).
- If app-store publication is added later, prepare store-specific privacy disclosures before release.
- Do not collect website visit history as part of the normal administrative log. If per-device site activity history is added later, it must be a separate opt-in feature, off by default, excluded for administrator devices and allowlisted devices, and documented in privacy/legal text. See `docs/site-activity-logs.ru.md`.

## Messaging

- Telegram and VK are both two-way chat/control channels.
- VK is the default first-run messenger choice.
- Keep `active` disabled until the parent/admin enters valid credentials and binds at least one approved administrator.
- MAX remains an experimental adapter, not a first-release requirement.
- A router can enable only one messenger adapter at a time: Telegram, VK, or experimental MAX.
- Do not design flows that require multiple messenger adapters to be active simultaneously on the same router.
- Messenger integrations must use the same Sheepfold API as LuCI and Android.
- Messenger access must be bound to explicitly approved parent/admin users configured on the router.
- On OpenWRT, prefer outbound HTTPS long polling for Telegram instead of webhooks, so the router does not need an inbound public HTTPS endpoint.
- If MAX is implemented, keep it clearly marked as experimental until current public MAX Bot API behavior is confirmed for router-side use.
- Administrative bot actions such as reboot, update, import, global block, and list changes must require explicit confirmation.

## Remote Access Scope

- Do not design, document, or promise full Android/LuCI management through WireGuard, VPN tunnels, or any other tunnel to the router.
- Full Android and LuCI management is local-network only.
- Remote management outside the home network is limited to short confirmed commands and notifications through the single configured messenger adapter.
- Do not add VPN setup helpers, WireGuard profiles, tunnel health checks, or VPN-based onboarding unless the project owner explicitly reverses this decision later.

## Administrators And Roles

- Do not show an administrator role selector in the current MVP unless the project owner explicitly asks for roles again.
- If a future permission split is added, use `owner` and `admin`: `owner` can manage administrators; `admin` can manage family internet rules but must not remove the owner.
- Do not add hidden child/client roles or child-facing control interfaces with administrative power. The existing separate `android-child/` client may show only its own router-computed status and allowed child AI helper flows; it must not manage router rules (§z5ck8mv).
- Administrative logs should record who changed what, when, and with what result, without storing secrets.
- LuCI must include a separate `Administrators` tab.
- A default administrator account must exist after installation/first setup.
- Additional administrators must have unique display names, unique logins, and passwords stored as salted hashes.
- Bind administrator devices only from the `Administrators` tab through the `Link devices` / `Привязать устройства` action.
- Do not expose a `Make admin` action in the general device list.
- Blocklisted devices must not be available for administrator binding.
- When a device is bound to an administrator, remove ordinary group/schedule assignments and make sure the parent does not lock themselves out.
- Admin devices should show a special local icon inspired by FontAwesome `laptop-mobile`; do not hotlink FontAwesome or any external CDN asset from LuCI.
- Admin device rows must expose a `Pairing` / `Сопряжение` action that opens QR/manual Android setup.
- Pairing payloads must use short-lived one-time tokens scoped to one administrator and one device. Never include router root passwords, LuCI session cookies, bot tokens, AI keys, or unrelated secrets in QR codes.
- One-time pairing token consumption must be enforced by the router backend, not by Android or LuCI frontend state. After successful pairing, the backend must mark the token/code as consumed and reject every later reuse.
- Manual pairing codes must be generated by the router backend with a cryptographically secure random source. Use 10 random characters from safe lowercase `abcdefghkmnpqrstuvwxyz`, safe uppercase `ABCDEFGHKMNPQRSTUVWXYZ`, safe digits `2456789`, and safe special characters `+-*()[]{}<>?@#$%^&:;.,`, with no more than 3 special characters.
- Pairing tokens must be revocable and stored only as hashes or non-reusable secrets on the router.
- Pairing actions must be logged with masking.

## Android Pairing And Wi-Fi MAC

- Keep exactly one Android build root: `android/`.
- `android/app/` is the application module inside that build, not a second project.
- Do not add root-level Gradle files for Android unless the project owner explicitly changes the repository layout.
- Run Android builds from `android/`, for example `gradle :app:assembleDebug`.
- First Android setup should be initiated locally from LuCI by scanning an admin-device pairing QR code or entering manual settings.
- Android first setup screen order is: agreement, home local network connection, real Wi-Fi MAC check/guidance when applicable, router setup by QR/manual entry, then local app password/PIN.
- Android first setup must require Wi-Fi or wired Ethernet/local network access to the router. Do not allow continuing setup over cellular/mobile data.
- If the active network is wired Ethernet, skip Wi-Fi-specific randomized MAC instructions but warn that the router sees the Ethernet adapter MAC, not the phone Wi-Fi MAC.
- The OpenWRT backend must expose a Sheepfold-specific local discovery endpoint so Android can detect that the current Wi-Fi network contains a Sheepfold router before asking the parent to confirm the home network manually.
- Discovery must not rely on a generic HTTP/LuCI response. It must verify a Sheepfold marker and return structured JSON with package/app marker, version, router name, and API base URL.
- Supported discovery endpoints should include `/cgi-bin/luci/admin/services/sheepfold/api/ping`, `/cgi-bin/luci/admin/sheepfold/api/ping`, or `/.well-known/sheepfold.json`.
- Manual settings shown next to QR must include router address/API URL, administrator login or identifier, pairing code/token, token lifetime, and Wi-Fi MAC guidance.
- Android must check whether the phone is visible to the router under the MAC address Sheepfold will manage.
- If randomized/private MAC is enabled for the home Wi-Fi, guide the parent to Android Wi-Fi network settings and explain why Sheepfold needs the real device MAC.
- Do not continue first pairing until the parent switches this Wi-Fi network to the real device MAC and Sheepfold can verify it from router-side data.
- Do not promise automatic disabling of randomized/private MAC on Android. Public APIs and manufacturer builds may prevent reliable automatic switching.

## Router Password Gate

- On first opening Sheepfold in LuCI, check whether the OpenWRT root password is set.
- If the root password is empty/not configured, do not allow Sheepfold settings to open.
- Show a clear warning and route the user to the OpenWRT password/administration page.
- Do not create default Sheepfold administrator passwords. First setup must force the owner to set their own password.

## Device Defaults

- New device behavior is configurable: `allow` by default, or `restrict_until_configured`.
- Global "Block internet" blocks every device except allowlisted devices.
- Device groups should include children, parents, TVs/media devices, guests/custom groups, and a special `No restrictions` / `Без ограничений` group.
- The `No restrictions` group is a group-level trusted service-device rule: it may bypass schedules, temporary restrictions, new-device restrictions, and global block, but it must never override the blocklist. Blocklist remains the highest priority.
- Strong device detection may suggest or confirm `No restrictions` for infrastructure devices such as NAS, Home Assistant, AdGuard Home, Proxmox, video recorders, and smart-home hubs.
- Keep end smart-home devices as a separate device type `Smart home` / `Умный дом`: floor-heating controllers, kettles, irons, light relays/switches, smart sockets, automatic curtains, sensors, and similar household endpoints. Do not confuse them with smart-home hubs/servers.
- Full detection should combine several router-side signals such as DHCP/static lease data, hostname, vendor/OUI when available, open ports, service banners, mDNS/SSDP/UPnP names, and previously confirmed device fingerprints. Treat port/banner checks as confidence signals, not as cryptographic identity.
- Sheepfold must assume children may use unregistered or borrowed phones. Do not trust child-device apps, self-reported phone data, or Android-side state for enforcement. Child-device decisions must be based on router-side data and clearly marked confidence.
- If a parent manually sets a device type, stop further automatic type detection for that device. The router may still update IP/name/lease observations, but must not run type classification or overwrite the manual type.
- If automatic detection has already identified a device type with confidence `>= 80`, further automatic type detection for that device may be skipped. Devices below `80` must be shown as `Unknown device type` / `Неизвестный тип` until clarified or manually set.
- Implement strong device detection as a separate optional backend/package, for example `sheepfold-device-detector`, not inside the LuCI-only package. The LuCI package should call a Sheepfold backend API and remain lightweight.
- The detector may use existing OpenWRT tools when available, such as `nmap`/`nmap-ssl` for port and banner detection, `avahi-utils` or equivalent mDNS clients for service discovery, and SSDP/UPnP probes. These tools must be optional/full-mode dependencies, not mandatory dependencies for reduced installations.
- Do not run heavy scans continuously. Use bounded local-network scans, cache results, explain detector confidence in UI, and let the parent correct the result.
- Prefer event-driven detection: watch DHCP lease changes and run detection when a device receives/updates an IP address. Keep a rare control scan only as a fallback for router reboot, manual DHCP changes, or unusual clients. Default control interval: 15 minutes.
- Blocklist always overrides automatic detection, automatic grouping, and the `No restrictions` group.
- Full automatic setup is the default because it is the useful path for most families. Reduced mode is for routers with very little free space or constrained resources.
- The OpenWRT installer must ask `Apply Sheepfold automatic setup?` / `Применить автонастройку программы?`. If the parent/admin presses Enter or answers `yes`, `y`, or `да`, set `auto_configure=1`, `detection_mode=full`, and `no_restrictions_auto_assign=1`.
- Full automatic setup may place confidently detected infrastructure devices into `No restrictions` automatically. The UI should still make this visible and explain why the device was trusted, so the parent can correct mistakes.
- If the parent/admin explicitly selects reduced mode with `no`, `n`, or `нет`, set or keep `auto_configure=1`, `detection_mode=reduced`, and `no_restrictions_auto_assign=1`. Reduced mode avoids heavy port checks but still may auto-assign confidently detected infrastructure devices to `No restrictions`.
- The General settings page must expose `Update check and installation` with values daily, weekly, monthly, and never. Default is weekly. Updates must use stable releases only and require confirmation before installation.
- Offline known devices should be cleaned after a configurable number of inactive days; default is 90 days.
- Blocked-page placeholder text must be configurable by the parent/admin.
- Allowlist should support quick add mode: a parent opens a 30 second connection window, sees a Wi-Fi QR code and devices that connected after the window started, then explicitly presses `Add` / `Добавить` for each candidate.
- Quick add must collect candidates, not silently add every new device to the allowlist.
- The quick add button may turn grey when the 30 second window expires, but it must remain clickable to restart the timer.

## Wi-Fi Settings

- Sheepfold may expose common 2.4 GHz and 5 GHz Wi-Fi settings: SSID, password, security mode, and channel.
- Wi-Fi changes must require confirmation because the current admin may be disconnected.
- Do not hide or replace standard OpenWRT wireless pages; Sheepfold only provides a simpler family-facing shortcut.
- Do not add guest-network features unless explicitly requested again.

## LuCI Browser Cache

- LuCI frontend assets must use one cache-busting version value.
- The canonical source is the OpenWRT package version: `PKG_VERSION-PKG_RELEASE`.
- The package Makefile should expose it as `SHEEPFOLD_UI_ASSET_VERSION` and write it to `ui_asset_version` during install/update.
- Default UCI may expose this as `ui_asset_version`, but individual JS/CSS files must not hardcode their own versions.
- Append the same version to Sheepfold JS/CSS/static asset URLs as a query suffix such as `?v=0.1.0-1`.
- Bump the package version/release when LuCI frontend files change.
- After changing LuCI asset versioning, run `node --test tests/*.test.mjs`. On Windows PowerShell, prefer this direct command or `npm.cmd test` if `npm.ps1` is blocked by Execution Policy.
- Keep manual browser-cache clearing as troubleshooting, not the normal update path.
- Clear LuCI index/module cache from install/update hooks when the menu or LuCI view structure changes.

## LuCI Architecture

- Use a Podkop-like structure for the real LuCI implementation: a small entrypoint with `form.Map("sheepfold")`, `tabbed = true`, and separate modules for devices, allowlist, blocklist, schedules, emergency-useful sites, Wi-Fi, integrations, messaging, logs, diagnostics, and settings.
- Podkop is the implementation style reference for LuCI structure, backend JSON methods, diagnostics, ACL discipline, install/update flow, and cache handling. Do not copy Podkop routing/sing-box responsibilities into Sheepfold.
- Keep the visual prototype separate from the future production architecture; do not keep growing one huge `overview.js`.
- In the family-facing LuCI navigation, keep `Emergency-useful sites`, `Integrations`, and `Messenger` inside the `Settings` page. The current settings content belongs under a `General` subtab, and import/export/update/reboot actions belong under a `Misc` subtab.
- LuCI must call a narrow backend command/API layer such as `/usr/bin/sheepfold <method>` instead of building arbitrary shell commands.
- rpcd ACL must explicitly allow only the Sheepfold files, UCI configs, ubus objects, and executable commands required by the UI.
- Put diagnostics in a dedicated tab and return structured JSON for checks.

## UCI Config Hygiene

- When changing UCI schema, package `postinst`, or defaults, read `docs/uci-config-migration.ru.md` first. Do not ship `/etc/config/sheepfold` in the `.ipk` payload; use `sheepfold.uci.defaults` plus `postinst` migrations.
- Keep UCI section names unique inside `/etc/config/sheepfold`.
- Only the main application section may be named `global`: `config sheepfold 'global'`.
- Helper sections must use explicit names such as `messenger_global`, `export_global`, `wifi_control_global`, and `pairing_global`.
- Do not add several `config ... 'global'` sections in the same UCI file. LuCI and commands like `uci get sheepfold.global.*` can otherwise read or write the wrong section.
- When renaming UCI sections, add an install/update migration in `postinst` so existing routers are fixed automatically.

## OpenWRT Test Package Builds

- Test `.ipk` files for this project must be built in the OpenWRT/ipkg-compatible format used by `opkg`: a gzip-compressed tar containing `./debian-binary`, `./data.tar.gz`, and `./control.tar.gz`.
- Do not switch the local test builder to Debian `ar` container format unless it is verified on the target OpenWRT `opkg`; the Xiaomi AX3000T test router rejected that format as `Malformed package file`.

## Export And Backup

- Default export must be readable JSON/archive without secrets.
- Full export with bot tokens, API keys, sessions, passwords, or other secrets must require encrypted export with a password.

## Schedules

- Schedules apply only to devices that are not in the allowlist or blocklist.
- Temporary access may override a schedule, but must never override the blocklist.
- Schedule UI must support weekdays, time ranges, enabled/disabled state, allow/block actions, and intervals crossing midnight.
- Temporary access quick buttons are +15 minutes, +30 minutes, +1 hour, +2 hours, +3 hours, +5 hours, until end of day, and until bedtime.
- If schedule rules conflict, show a warning and keep backend behavior deterministic.

## AdGuard Home And Podkop Integrations

- The LuCI setting is `Use together with` / `Использование совместно с`.
- Supported integration modes are `none`, `adguard`, `podkop`, and `adguard_podkop`.
- Keep this setting: it defines the Sheepfold compatibility plan for DNS/routing diagnostics and safe apply-time behavior, not merely whether third-party packages are installed.
- Do not model AdGuard Home and Podkop as mutually exclusive; they can be used together.
- The installer must detect existing AdGuard Home and Podkop installations and choose the matching Sheepfold `integration_mode`.
- LuCI should show AdGuard Home status through its local API when credentials are configured. For Podkop, use conservative local package/service/config detection until a stable Sheepfold-facing API exists.
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
- AI context sharing must use an explicit preview/confirmation step. Do not send MAC/IP/device names/child names/family details/logs/device lists/router settings automatically.
- The assistant may suggest settings but must not apply router actions without explicit parent confirmation.
- Keep long assistant prompts in separate prompt documents, not buried inside architecture docs.
- Assistant prompts are drafts until reviewed by the project owner and, for family/psychology guidance, a qualified family psychologist.
- The assistant may propose router setting changes through Android only after an explicit preview and confirmation. Examples: static DHCP lease, emergency-useful site addition, group/schedule changes, whitelist-only group mode, temporary access, and activity-journal toggles.
- The assistant may help compose bug reports, feature requests, and feedback for the developer. It must anonymize sensitive data, ask before sending, and may include a rough value/impact percentage as a subjective prioritization hint.

## Site List Sources

- Do not manually compile or maintain a huge built-in “safe child websites” list in the repository.
- Use updateable external list sources and store them as configurable sources. See `docs/site-list-sources.ru.md`.
- LuCI must expose `Whitelist sources` / `Источники белых списков` and `Site blacklist sources` / `Источники чёрного списка сайтов` in Settings -> Misc.
- Groups may enable a “whitelist sources only” mode. This is different from device allowlist and must not override the device blocklist.
- Site blacklist mode values: disabled, enabled for everyone, enabled for everyone except allowlist and administrators.
- Sheepfold must clearly explain that external category lists can contain mistakes and are not a legal or safety guarantee.

## Activity Journal

- Internet activity journal is separate from the administrative action log.
- It must be off by default and can be enabled per group or per device.
- Do not collect activity journal data for administrator devices, device allowlist, or device blocklist.
- Show only a visible badge/size/status in ordinary UI; do not display raw browsing history by default.
- AI analysis of activity logs requires an explicit data-preview confirmation. The assistant should summarize patterns and risks, not hand the parent a raw list of sites to confront the child with.
- Router-visible data is the boundary. DNS alone does not provide video titles, descriptions, or comments; collect such metadata only through a separate explicit mechanism and say when it is unavailable.

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
