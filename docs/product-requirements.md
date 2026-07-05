# Product Requirements

## Final Names

- GitHub repository: `luci-app-sheepfold-family-internet-control`
- OpenWRT package: `luci-app-sheepfold-family-internet-control`
- LuCI EN: `Sheepfold Family Internet Control`
- LuCI RU: `Sheepfold : контроль доступа в интернет для семьи`
- Android app: `Овчарня`
- Android package: `app.sheepfold.android`

## Core Features

- Manage family internet access through an OpenWRT router and its LuCI web interface.
- Android companion app.
- Telegram or VK two-way messenger bot, with VK as the default first-run choice and MAX kept as an optional experimental adapter disabled by default.
- Only one messenger adapter can be active on one router at a time.
- Parent/admin roles configured on the router.
- Parent AI assistant with country-aware provider selection.
- Age-based guidance scenarios for parents, without automatic application.
- Device allowlist.
- Device blocklist.
- Automatically discovered devices.
- LuCI user lists navigation: one top-level `User lists` / `Списки пользователей` tab with nested `All devices`, `Allowlist`, and `Blocklist`; `All devices` is the default nested tab.
- Search by MAC, current IP, hostname, and custom name.
- Device groups: children, parents, TVs/media devices, guests/custom.
- DHCP static lease synchronization.
- Quick allowlist add by Wi-Fi QR and newly connected device candidates.
- Schedules.
- Temporary access tokens.
- Access to emergency-useful sites for restricted mode.
- Import/export of all settings and known clients.
- Optional logging.
- App update and router reboot controls with confirmation.
- LuCI browser-cache busting through one project-level asset version.
- OpenWRT uninstall command that removes the package but preserves Sheepfold settings and client lists, then shows a report of remaining router settings.
- User agreement and data-processing consent shown before Android first setup and OpenWRT installation.
- Privacy policy describing local storage, Android data, messenger data, AI-provider data sharing, logs, masking, export, and deletion.
- Common Wi-Fi settings for 2.4 GHz and 5 GHz networks: SSID, password, security mode, and channel.
- Administrator devices and Android pairing by QR/manual setup.
- Single parent-facing save action in LuCI instead of separate Save/Apply semantics.
- First-open router root password gate.

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
  - `Овчарня` only for the Android app name; LuCI Russian UI keeps the product word as `Sheepfold`;
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
- MAC addresses, IP addresses, child names, device names, family details, logs, device lists, and router settings must not be sent to the AI provider without a separate explicit confirmation;
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

- first setup screen order must be: agreement, home Wi-Fi connection, real Wi-Fi MAC check/guidance, router connection setup by QR/manual entry, then local app password/PIN;
- before continuing setup, require agreement checkbox: `Я принимаю пользовательское соглашение и даю согласие на обработку персональных и технических данных, необходимых для работы Sheepfold.`;
- ask for app-lock method after successful router pairing;
- recommend password or PIN by default;
- allow fingerprint/face unlock if supported, but do not recommend it as the safest parental-control default;
- show a short warning that biometric unlock may be less safe because a child may try to unlock the app while the parent is asleep.

Android connectivity:

- local router connection is the default full-interface mode;
- Telegram/VK bot is the remote command and notification path;
- full Android/LuCI management must remain local-network only;
- do not support or document full remote management through WireGuard, VPN tunnels, or any other tunnel to the router;
- outside the local network, remote management is limited to short confirmed commands and notifications through the single configured messenger adapter;
- without a developer-operated cloud service, the Android app must not promise full remote router management outside the local network.
- first Android pairing should be initiated locally from LuCI by an owner/admin using a QR code or manual settings;
- the pairing payload must contain a short-lived one-time token scoped to one administrator and one admin device, never a router root password.

Android Wi-Fi MAC check:

- during first pairing, after the phone is connected to the home Wi-Fi, the Android app should check whether the phone is visible to the router as the same MAC address that Sheepfold will manage;
- if Android uses a randomized/private MAC for this Wi-Fi network, the app should explain the problem and guide the parent to the system Wi-Fi network settings;
- the app may open Android Wi-Fi settings when public APIs allow it, but must not promise that it can automatically disable randomized MAC on every device/manufacturer build;
- first pairing must not continue until the home Wi-Fi network uses the real device MAC and Sheepfold verifies that router-side data matches the selected admin device.

## Administrators

Sheepfold must support parent/admin users configured on the router.

Minimum roles:

- `owner`: full control and administrator management;
- `admin`: device, schedule, temporary access, Wi-Fi shortcut, and emergency-useful sites management.

Telegram/VK access must be bound to explicitly approved user IDs or chat IDs. MAX may be added as an experimental adapter, disabled by default. Children/client devices do not get a dedicated control interface by default.

## Administrator Devices And Pairing

Any detected device can be marked as an administrator device.

Requirements:

- when making a device administrator-owned, LuCI must ask which administrator owns it;
- the administrator must be selected from the configured administrator list;
- an administrator device is still a normal network device for allowlist/blocklist/schedule purposes, but it also becomes eligible for Android app pairing;
- the device table should show a special admin-device icon and a `Pairing` / `Сопряжение` action;
- the icon should follow the idea of FontAwesome `laptop-mobile`, but must be bundled locally or implemented as a local asset/SVG, not hotlinked from a CDN;
- pressing `Pairing` opens a modal with a QR code for the Android app and the same settings in text form for manual setup;
- QR/manual setup must include router address/API URL, administrator login or identifier, pairing token/code, token lifetime, and Wi-Fi MAC guidance;
- pairing tokens must be one-time, short-lived, revocable, and stored only as hashes or otherwise non-reusable secrets on the router;
- once a pairing token/code is successfully used, the router must immediately mark it as consumed and reject every later attempt to use the same QR/manual code;
- token consumption must be enforced on the router backend. Android and LuCI frontend may display state, but they must not be trusted to prevent token reuse;
- manual pairing codes should be easy to transfer by hand but hard to guess. The router backend must generate them with a cryptographically secure random source: 10 random characters from safe lowercase letters `abcdefghkmnpqrstuvwxyz`, safe uppercase letters `ABCDEFGHKMNPQRSTUVWXYZ`, safe digits `2456789`, and safe special characters `+-*()[]{}<>?@#$%^&:;.,`, with at most 3 special characters;
- pairing must not expose router root credentials, LuCI session cookies, bot tokens, AI keys, or other unrelated secrets;
- pairing events must be written to the administrative action log with masking.

The LuCI interface must include an `Administrators` tab.

Administrator requirements:

- one default owner exists after installation/first setup;
- additional administrators can be created by the owner;
- every administrator has a unique display name, unique login, role, and password;
- passwords are stored only as salted password hashes;
- minimum roles remain `owner` and `admin`;
- deleting or demoting the last owner must be forbidden.

## Target OpenWRT Scope

The project should target modern OpenWRT installations that use `firewall4` and `nftables`.

There is no need to support old OpenWRT versions based on `firewall3` / `iptables`. The expected routers are relatively modern home routers, for example devices in the class of Xiaomi Mi Router AX3000T.

## Device Rules

Blocklisted devices are always blocked. Allowlisted devices are never blocked by global blocking or schedules. The backend and UI must prevent the same MAC address from being present in both lists.

Temporary access must never bypass the blocklist.

New devices policy must be configurable:

```text
allow
restrict_until_configured
```

Default: `allow`.

Global "Block internet" means blocking all devices except allowlisted devices.

Emergency-useful sites may be allowed even for blocklisted devices if `domain_allowlist_for_blocklist` is enabled. This is for user safety. Blocklisted devices still must not access LuCI, SSH, or the Sheepfold API.

Device groups should be supported for easier management:

- children;
- parents;
- TVs/media devices;
- guests/custom groups;
- no restrictions / `Без ограничений`.

`No restrictions` / `Без ограничений` is a trusted service-device group for household infrastructure such as NAS, Home Assistant, AdGuard Home, Proxmox, video recorders, and smart-home hubs. Devices in this group should not be restricted by schedules, temporary restrictions, new-device restrictions, or global internet block.

This group must not override the blocklist. Priority is:

1. blocklist;
2. allowlist;
3. no restrictions group;
4. temporary access;
5. schedule;
6. general rules.

Strong device detection should use router-side signals such as DHCP/static lease data, hostname, vendor/OUI, open ports, service banners, mDNS/SSDP/UPnP names, and a previously confirmed device fingerprint. Detection by MAC, hostname, or open ports alone is not a cryptographic guarantee, so the UI must show why a device was trusted and allow the parent to correct it.

Device types should include a separate `Smart home` / `Умный дом` type for household endpoints such as floor-heating controllers, kettles, irons, light relays/switches, smart sockets, automatic curtains, sensors, and similar devices. These are different from smart-home hubs and servers such as Home Assistant or Zigbee gateways.

Strong detection should be implemented as an optional backend component/package, for example `sheepfold-device-detector`, while the LuCI package stays lightweight and calls Sheepfold backend APIs. The full detector may use existing OpenWRT tools when installed, such as `nmap`/`nmap-ssl` for ports and banners, `avahi-utils` or equivalent mDNS clients, and SSDP/UPnP probes. These must be optional full-mode dependencies, not mandatory dependencies for reduced installations.

The detector must avoid continuous heavy scanning. It should run bounded local-network checks, cache results, expose confidence/explanation to LuCI/Android, and let the parent override the detected type or group.

Operational behavior:

- Sheepfold may run a lightweight resident watcher on the router.
- The watcher should react to DHCP lease changes, especially when a device receives or updates an IP address.
- A rare control scan is allowed as a safety net for router reboot, manual DHCP edits, or clients that behave unusually. Default control interval: 15 minutes.
- Heavy checks such as `nmap` must be bounded by host count, port list, and timeout.
- Blocklist always has higher priority than automatic detection and automatic `No restrictions` assignment.

Installer mode:

- the OpenWRT installer must ask `Apply Sheepfold automatic setup?` / `Применить автонастройку программы?`;
- full automatic setup is the default because it is the useful path for most families;
- if the parent/admin presses Enter or answers `yes`, `y`, or `да`, set `auto_configure=1`, `detection_mode=full`, and `no_restrictions_auto_assign=1`;
- full automatic setup may add confidently detected infrastructure devices to the `No restrictions` group automatically;
- if the parent/admin explicitly answers `no`, `n`, or `нет`, set or keep `auto_configure=1`, `detection_mode=reduced`, and `no_restrictions_auto_assign=1`;
- reduced mode uses only lightweight metadata detection and avoids heavy port checks, but it may still auto-assign confidently detected infrastructure devices to the `No restrictions` group.

Update checks:

- General settings must include `Update check and installation`;
- allowed values: daily, weekly, monthly, never;
- default: weekly;
- only stable releases should be used;
- installation must require confirmation before applying an update.

Allowlist quick add:

- the Allowlist tab should include a `Quick add to allowlist` / `Быстрое добавление в белый список` button;
- pressing it opens a modal with a Wi-Fi QR code, a separate one-time allowlist request QR/link, and a list of newly connected devices;
- the one-time allowlist request link should be short enough for the current LuCI QR renderer, for example `/q/{quickAllowlistToken}`;
- the router backend must consume the quick allowlist token, detect the phone MAC from router-side DHCP/ARP/neighbor data, and reject token reuse;
- the modal starts a 30 second connection window;
- the `Connection allowed` / `Разрешено подключение` button should show a decreasing status bar for the 30 second window;
- when the timer expires, the button turns grey but stays clickable;
- clicking the grey button starts a new 30 second window;
- only devices that connect after the current window starts should be listed as candidates;
- every candidate row must include name/hostname if known, current IP, MAC, connection time, and an `Add` / `Добавить` button;
- quick add must not silently allowlist all new devices; the parent must press `Add` for each candidate;
- backend validation must still prevent adding a MAC that is in the blocklist.

Schedules must support weekdays, time ranges, enabled/disabled state, device or group targets, intervals that cross midnight, and both block and allow rules.

Temporary access quick buttons:

```text
+15 minutes
+30 minutes
+1 hour
+2 hours
+3 hours
+5 hours
until end of day
until bedtime
```

Default bedtime: `21:00`. Bedtime should be configurable in schedule settings.

The Android app is for parent/admin devices only. Sheepfold should not require installing an app on children's phones.

An optional client-facing blocked-page placeholder should be served locally by the router instead of endless page loading. This is not a child control interface; it is only a simple explanation that internet access is currently unavailable. The placeholder text must be configurable by the parent/admin. Non-browser clients must also receive a bounded response: POST/PUT/PATCH/DELETE requests should get a machine-readable 403 JSON response when possible, and game consoles, robot vacuums, speakers, and other IoT devices should get a short predictable response instead of hanging indefinitely.

## Age-Based Guidance

Age-based scenarios are guidance for parents, not automatic enforcement.

Suggested levels:

- around 6 years old: high parent control, short windows, simple rules;
- around 10 years old: schedules, temporary access, emergency-useful sites, clear explanations;
- around 14 years old: joint planning, fewer surprise blocks, more responsibility;
- around 17 years old: light controls, self-regulation, family agreements, focus on sleep, school, and safety.

The parent AI assistant may use age to suggest a style, but no age scenario may be applied without explicit confirmation.

## Logs

Logging must support these retention values:

```text
6m
3m
1m
14d
7d
3d
1d
12h
3h
1h
off
```

Default retention: `3d`.

Default maximum log size: `1024 KB`.

Logs must support a clear-log action and masked export. Masked export is enabled by default.

## Wi-Fi Settings

Sheepfold may expose common OpenWRT Wi-Fi settings to make family router management easier.

Required LuCI/Android controls:

- 2.4 GHz SSID;
- 2.4 GHz password;
- 5 GHz SSID;
- 5 GHz password.

2.4 GHz and 5 GHz names/passwords must be editable separately.

Advanced collapsible controls:

- security mode;
- channel;
- optional channel width when OpenWRT exposes it safely.

Changing Wi-Fi settings must require confirmation because it can disconnect current users. Sheepfold must not hide or remove standard OpenWRT wireless settings; it only provides a simpler family-facing shortcut.

## Router Interface Access

The application should include security settings for local router access:

- blocklisted devices cannot access the OpenWRT router LuCI interface, SSH, or the Sheepfold local API;
- globally blocked devices may access the router only if `allow_router_for_blocked` is enabled;
- emergency-useful sites mode can optionally allow selected public domains for blocked devices.

Emergency-useful sites may also be enabled for blocklisted devices by a separate setting, but this must not grant access to LuCI, SSH, or Sheepfold API.

## First-Open Router Password Gate

Before opening Sheepfold settings in LuCI, Sheepfold must check whether the OpenWRT root password is configured.

Requirements:

- if the root password is empty/not configured, block access to Sheepfold settings;
- show a concise warning that router password protection must be enabled first;
- provide a button/link to the standard OpenWRT password/administration page;
- do not create or ship default Sheepfold admin passwords;
- first Sheepfold setup must force the owner to set their own Sheepfold password.

## LuCI Save Behavior

Sheepfold LuCI should show one clear `Save` / `Сохранить` action for parents.

The UI should not expose separate `Apply` and `Save` actions because that distinction is confusing for non-technical users. Internally, Sheepfold may still perform the OpenWRT save/apply steps needed by UCI, firewall, services, and LuCI, but the parent-facing UI should present it as one confirmed save operation.

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

## Export And Backup

Default export should be a readable JSON/archive without secrets.

Secrets include bot tokens, API keys, sessions, passwords, and other credentials.

If the user wants a full backup including secrets, Sheepfold should require encrypted export with a password. Full unencrypted export with secrets should not be the default.

Offline known devices should be cleaned after a configurable number of inactive days. Default: `90` days.

## Messaging

- Telegram and VK should both support two-way chat: notifications, status, device search, temporary access, approvals, and confirmed administrative actions.
- VK is the default first-run messenger choice. The installed config should keep messenger `active` disabled until credentials and at least one approved administrator are configured.
- A router can enable only one messenger adapter at a time: Telegram, VK, or experimental MAX.
- MAX may remain as an optional experimental adapter until its public Bot API is confirmed for router-side use. It must be disabled by default and must not block the first stable Telegram/VK release.
- Messenger integrations must go through the same Sheepfold API used by LuCI and Android.

## LuCI Asset Versioning

Sheepfold LuCI frontend resources must support browser-cache busting.

Requirements:

- keep one asset version for all Sheepfold LuCI JS, CSS, images, fonts, and static resources;
- derive the canonical value from OpenWRT package `PKG_VERSION-PKG_RELEASE` through `SHEEPFOLD_UI_ASSET_VERSION`;
- expose the runtime value as `ui_asset_version` or an equivalent generated LuCI config value;
- append it to asset URLs as a query suffix, for example `?v=0.1.0-1`;
- never hardcode separate asset versions inside individual JS/CSS files;
- bump the package version or release whenever LuCI frontend files change;
- keep manual browser-cache clearing documentation only as troubleshooting.
