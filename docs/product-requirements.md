# Product Requirements

## Final Names

- GitHub repository: `luci-app-sheepfold-family-internet-control`
- OpenWRT package: `luci-app-sheepfold-family-internet-control`
- LuCI EN: `Sheepfold Family Internet Control`
- LuCI RU: `Sheepfold : контроль доступа в интернет для семьи`
- Android app: `Sheepfold`
- Android package: `app.sheepfold.android`

## Product Variants

- `Sheepfold` is the ordinary router package: all family internet-control functions, without AI LuCI UI/backend, provider settings, prompts, or detailed per-device activity collection.
- `Sheepfold - AI Support` is the router package with the identical shared control core plus the AI assistant and explicit opt-in context/activity features.
- Android is distributed as one parent and one child APK for both router packages. Their AI client stays hidden until the router reports the positive capability; no Android AI product flavors are allowed (§prodvar).
- Both products must be built from one shared source repository and one common control implementation. See [`product-variants.ru.md`](product-variants.ru.md) (§prodvar).
- The ordinary administrative/system event journal remains available in both products; it must not be confused with detailed AI activity logs.

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
- Router time settings: country-aware timezone setup, NTP client configuration, and optional router-as-NTP-server mode for LAN clients.
- Router information page in LuCI settings and Android API diagnostics snapshot: current router time, Sheepfold version, internet status, ping to country-profile target, OpenWRT firmware, router model, Wi-Fi modules/statuses, LAN ports, Podkop/AdGuard Home installation and versions, plus basic health values such as uptime/load/memory.
- Administrator devices and Android pairing by QR/manual setup.
- Single parent-facing save action in LuCI instead of separate Save/Apply semantics.
- First-open router root password gate.
- Contextual help for non-obvious settings and risky actions, opened by a visible `?` help control.
- Optional per-device site activity history as a separate opt-in feature, not part of the default administrative log, excluded for administrator devices and allowlisted devices.

## Current Implementation Status

This document is the product target. For the exact current package state, see [Current implementation status](current-implementation-status.md).

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
  - `Sheepfold` as the public Android app name; do not use `Овчарня` in public product text unless the owner explicitly asks to discuss the old/internal name;
  - `Доступ к аварийно-полезным сайтам` / `Access to emergency-useful sites` for the restricted-domain feature.

## Country Profiles

Sheepfold must adapt to the selected router country.

Country profiles should control:

- available AI assistant providers;
- default emergency-useful site suggestions;
- domain descriptions and warnings;
- localization defaults.
- diagnostic ping/DNS/HTTP targets;
- default timezone and NTP server preferences.

Manual user entries must not be deleted when the country changes.

Provider availability must be configuration-driven because legal and network availability can change.

## Router Connectivity And Time

Connectivity diagnostics must be country-aware and configurable. Sheepfold must not depend only on foreign IPs or domains such as `1.1.1.1`, `8.8.8.8`, `google.com`, or Cloudflare/Google endpoints to decide whether the router has internet access.

For the Russia profile, default diagnostics should prefer Russian or Russia-relevant targets. DNS checks should prefer domains such as `ya.ru`, `gosuslugi.ru`, and `ntp1.vniiftri.ru`; foreign targets may exist only as secondary fallback checks.

ICMP ping alone is not enough. The backend should combine WAN `ubus` status, link/default route checks, country-profile DNS resolution, and lightweight HTTP(S) checks where needed.

Sheepfold automatic setup should configure router time:

- set the most suitable timezone from the selected country/region profile;
- for Russia without a more precise region, use `Europe/Moscow` / `MSK-3`;
- enable the router NTP client;
- set default NTP servers to `ntp1.vniiftri.ru`, `ntp2.ntp-servers.net`, and `3.openwrt.pool.ntp.org`;
- provide a setting to make the router an NTP server for LAN clients.

These settings touch OpenWRT `system` UCI config and must be visible in LuCI/export/reporting where practical.

## Parent AI Assistant

The Android app should include a parent AI assistant.

Requirements:

- DeepSeek should be the preferred default provider in countries where it is allowed and reachable;
- users should be able to choose another provider when it is allowed in the selected router country;
- provider options must change according to the selected router country profile;
- Android must not call DeepSeek, Gemini, or other LLM providers directly; AI requests go through the router-side Sheepfold proxy endpoint (§xaji0y6);
- provider API keys must be stored on the router in Sheepfold settings, while Android Keystore is used only for local Android secrets such as the admin Bearer token, pairing data, and local app lock (§dpbhsah);
- MAC addresses, IP addresses, child names, device names, family details, logs, device lists, and router settings must not be sent to the AI provider without a separate explicit confirmation;
- Android may offer a limited router diagnostics snapshot to the AI assistant only after showing the parent a preview. This diagnostics snapshot must not include Wi-Fi passwords, bot tokens, API keys, session cookies, child names, MAC addresses, device lists, or logs.
- the assistant may recommend router/app settings, but must not perform actions without explicit parent confirmation;
- the assistant should help parents move from external control toward child self-control.

## Android Scope

The Android companion app **Sheepfold** should support Android 9.0 Pie / API 28 and newer.

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

The current UX target keeps administrator accounts simple: each administrator has a name and login, and administrator devices are bound from the `Administrators` tab. A visible role selector is not required for the current MVP. A future `owner/admin` permission split may be added later if administrator-management permissions become necessary.

Telegram/VK access must be bound to explicitly approved user IDs or chat IDs. MAX may be added as an experimental adapter, disabled by default. Children/client devices do not get a dedicated control interface by default.

## Administrator Devices And Pairing

Administrator devices are bound from the `Administrators` tab, not from a dangerous action in the general device list.

Requirements:

- when binding administrator-owned devices, LuCI must show all eligible devices except blocklisted devices and devices already bound to another administrator;
- selected administrator devices should be removed from ordinary groups/schedules and added to allowlist-like trusted access so the parent does not lock themselves out;
- blocklisted devices must not be eligible for administrator binding;
- an administrator device is still a normal network device in the UI, but it also becomes eligible for Android app pairing;
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

- one default administrator exists after installation/first setup;
- additional administrators can be created from the `Administrators` tab;
- every administrator has a unique display name, unique login, and password;
- passwords are stored only as salted password hashes;
- a visible role selector is not required for the current MVP;
- if roles are added later, use `owner` and `admin`, and deleting or demoting the last owner must be forbidden.

## Target OpenWRT Scope

The project should target modern OpenWRT installations that use `firewall4` and `nftables`.

There is no need to support old OpenWRT versions based on `firewall3` / `iptables`. The expected routers are relatively modern home routers, for example devices in the class of Xiaomi Mi Router AX3000T.

## Device Rules

The device blocklist is the highest whole-device rule and overrides automatic group assignment, allowlist, temporary access, and schedules. Emergency-useful public domains are a separate, narrowly scoped safety exception when enabled; they do not remove the device from the blocklist. Blocklisted devices always remain unable to access LuCI, SSH, and Sheepfold API. The backend and UI must prevent the same MAC address from being present in both allowlist and blocklist.

Temporary access does not bypass the device blocklist. Future editing of lower-priority rules may be enabled only when the effective-status API and firewall apply the selected order consistently; it must never weaken the router-management denial for blocklisted devices.

New devices policy must be configurable:

```text
allow
restrict_until_configured
```

Default: `allow`.

Global "Block internet" means blocking all devices except administrator devices, allowlisted devices, and devices in the protected `No restrictions` group.

Emergency-useful sites may be allowed even for blocklisted devices if `domain_allowlist_for_blocklist` is enabled. This is for user safety. Blocklisted devices still must not access LuCI, SSH, or the Sheepfold API.

Device groups should be supported for easier management:

- children;
- parents;
- TVs/media devices;
- guests/custom groups;
- no restrictions / `Без ограничений`.
- personal devices / `Персональные устройства`.

`No restrictions` / `Без ограничений` is a trusted service-device group for household infrastructure such as NAS, Home Assistant, AdGuard Home, Proxmox, video recorders, and smart-home hubs. Devices in this group should not be restricted by schedules, temporary restrictions, new-device restrictions, or global internet block.

`Personal devices` / `Персональные устройства` is a protected, non-removable organizational group for confidently recognized phones, tablets, computers, TVs/media players, and smart watches. It grants no allowlist or access-policy bypass. Automatic assignment is allowed only when `auto_configure=1`, does not replace a group selected by a parent, and stops further routine type detection after a confident result (§persdev).

The fixed safe whole-device priority is:

1. device blocklist;
2. administrator devices;
3. no restrictions group;
4. allowlist;
5. global internet block;
6. temporary access;
7. individual-device schedule;
8. group schedule;
9. default access.

Emergency-useful domains are evaluated as a separate domain-level exception and are not a whole-device priority step.

The target order is stored in `sheepfold.global.access_priority`. `Settings → Misc` must keep it read-only until LuCI, effective-status, schedules, and nftables all execute the same configurable order. Router-management access denial for blocklisted devices is a separate invariant and is not weakened by this order.

Strong device detection should use router-side signals such as DHCP/static lease data, hostname, vendor/OUI, open ports, service banners, mDNS/SSDP/UPnP names, and a previously confirmed device fingerprint. Detection by MAC, hostname, or open ports alone is not a cryptographic guarantee, so the UI must show why a device was trusted and allow the parent to correct it.

Sheepfold must assume that a child can use an unregistered or borrowed phone. Administrative
controls belong only to the parent APK. The separately installed child APK is advisory and must
not become an enforcement or identity authority: access control and detection for child devices
continue to rely on router-visible data, not on child-device software or self-reported Android data.

Device types should include a separate `Smart home` / `Умный дом` type for household endpoints such as floor-heating controllers, kettles, irons, light relays/switches, smart sockets, automatic curtains, sensors, and similar devices. These are different from smart-home hubs and servers such as Home Assistant or Zigbee gateways.

Strong detection should be implemented as an optional backend component/package, for example `sheepfold-device-detector`, while the LuCI package stays lightweight and calls Sheepfold backend APIs. The full detector may use existing OpenWRT tools when installed, such as `nmap`/`nmap-ssl` for ports and banners, `avahi-utils` or equivalent mDNS clients, and SSDP/UPnP probes. These must be optional full-mode dependencies, not mandatory dependencies for reduced installations.

The detector must avoid continuous heavy scanning. It should run bounded local-network checks, cache results, expose confidence/explanation to LuCI/Android, and let the parent override the detected type or group.

If a parent manually sets a device type, automatic type classification must stop for that device, while trusted-identity comparison remains active. If automatic detection already produced a clear type with confidence `>= 70`, further type classification may be skipped when the classification fingerprint is unchanged. `No restrictions` still requires score `>= 80` and two independent evidence families (§agfix88, §detlife1).

Operational behavior:

- Sheepfold may run a lightweight resident watcher on the router.
- The watcher detects offline-to-online transitions from current LAN ARP/neighbour, hostapd association, or a recent DHCP hotplug signal. Static leases and stale lease rows alone are not connection events.
- A new connection waits 20 seconds for complementary signals and is analyzed only if still online. At most four event scans run per 10-second service tick by default.
- A missing online signal remains in a 90-second grace state so Wi-Fi sleep and 2.4/5 GHz or mesh roaming do not create a false new connection.
- One online-only safety pass runs after service startup and once per day. Offline devices are never scanned by that fallback.
- Heavy checks such as `nmap` must be bounded by host count, port list, timeout, and a one-day per-device rescan cache by default. A daily safety pass must not imply daily `nmap` for an unchanged confident device (§detload, §detlife1).
- One bounded `hostapd.* get_clients` snapshot may contribute normalized HT/VHT/HE and speed classes as weak type hints. These fields never prove identity, never count as an independent evidence family, and never grant `No restrictions`; raw/current rates remain in RAM and only compact monotonic classes may persist (§detlife1).
- Device-blocklist members retain presence and denied-router-access logging but receive no type detection, identity collection, port scan, or group assignment.
- Classification hashes and trusted identity baselines are separate. Version 2 identity components use HMAC-SHA-256 with a local secret preserved across sysupgrade; they are not Android API credentials. A conflicting strong UUID/serial or two conflicting weak families create an indefinite quarantine overlay; missing one signal does not. `automatic` monitoring blocks that connection at device-blocklist level, while `manual` monitoring restricts it pending a parent decision. Device-allowlist and `No restrictions` privileges are suspended, while the original rights remain stored and return when the original trusted fingerprint reappears. An unresolved alert repeats at most daily (§detlife1).
- A strong identity match or two matching weak families on a different MAC may only create a parent-facing resemblance suggestion. Sheepfold must not link the records or copy administrator rights, lists, groups, schedules, or temporary access automatically (§devident1).
- If the same self-reported UUID appears on two currently online MAC records, the lower numeric device ID remains unchanged and only the newer record receives the indefinite identity quarantine. The parent notification identifies the new IP and older `#ID`; no rights are copied (§devident1, §detlife1).
- Numeric device IDs are permanent audit references: allocate them monotonically, preserve gaps and never reuse or compact an ID after deletion (§deviceid2).
- A future parent-confirmed merge is complete rather than field-by-field: all linked MACs become one logical device with one policy, the lower permanent ID remains primary, the absorbed ID remains an audit alias, and policy conflicts are shown before confirmation. Administrator pairing secrets are revoked and QR pairing is repeated (§merge01).
- Full detection may use a peer-pinned UPnP description and bounded LAN-only WS-Discovery. Ordinary WS-Discovery passes are passive; one active Probe is allowed only for a newly connected device. UPnP LOCATION must use the exact numeric sender IPv4 with no DNS, redirects, router-self access, unbounded body or control URL. WS-Discovery XAddrs must never be fetched. UPnP is self-reported secondary evidence and cannot grant elevated policy by itself. SNMP is outside the product scope (§devident1, §detload).
- Passive traffic must never be presented as revealing a Google, Yandex or other user account. Sheepfold does not perform TLS interception; any future account association requires explicit OAuth consent and is not a LAN identity factor (§devident1).
- Automatic assignment to `No restrictions` is security-sensitive because the group bypasses global shutdown and schedules. It requires strong detection evidence, visible reasoning, and the existing one-time exclusion after a parent removes a device from the group. It never bypasses the device blocklist.
- Smart speakers are excluded from automatic `No restrictions` assignment and remain ordinary managed devices.
- A confident type percentage and an auto-group trust score are separate values. Until two independent evidence families are available for `No restrictions`, detection must continue collecting bounded signals instead of permanently locking the first result. LuCI must explain the exact reason when assignment is skipped (§agfix88).

The LuCI page must fail closed when the router root password is unset or cannot be verified. A non-dismissible overlay links to the standard LuCI password page and prevents Sheepfold settings changes until the check succeeds (§rootgate).

The AI assistant settings expose the parent prompt version. A selected version maps to `usr/share/sheepfold/prompts/parent/<version>/system.txt`; adding a new prompt creates a new directory and never silently replaces an existing reviewed version (§prmvers).

Child devices may optionally show `Request 30 minutes of internet`. The router enables it only when at least one administrator has explicitly opted in. The request is identified from router-side IP/DHCP/ARP data, is rate-limited, only creates a parent notification, and never grants access without a parent action (§child30).

The child status screen shows only the router-local `HH:mm` of the next schedule boundary that actually changes effective access. It does not display a countdown or reveal rule names. Future-boundary evaluation runs on child status requests, not in the minute-by-minute firewall synchronization path (§b5wkq2e).

The explicitly installed child APK may report a best-effort active-SIM snapshot to the home router. LuCI provides `all`, `new_only` (default), and `off` administrator-notification modes. A SIM present in the first valid report is journaled and, when enabled, notified with the explicit note that it was found during app installation. Only an initial report with no active SIM creates a silent empty baseline. Every later detected change is written to the local administrative journal, while phone/messenger delivery follows the selected mode. Android may omit the phone number. Sheepfold keeps at most 16 local subscription fingerprints and 16 fingerprint/available-number history entries; readable export masks this long-term field. Sheepfold must not request ICCID, IMSI, or IMEI and must identify the reporting device from router-side IP/DHCP/ARP data (§simchg1).

Optional child Wi-Fi reports and their phone coordinates expire on the router after 90 days. Raw BSSID is never transmitted; disabling collection clears the pending phone queue, and LuCI provides an explicit history-clear action (§childwifi1).

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

The main Android app is for parent/admin devices only. Sheepfold must not require installing an app on children's phones for enforcement, because router decisions rely on router-visible data. A separate optional `android-child/` client may show only the child's own router-computed status and explicitly allowed helper flows (§z5ck8mv).

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

Administrative log export must open a period selector:

- last hour;
- last week;
- custom range from-to;
- all time.

Internet activity history is a separate sensitive feature, not part of this administrative log.

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

An ordinary device that is neither blocklisted nor in unresolved identity quarantine may reach the
local LuCI login page by default. Authentication, API Bearer tokens, rate limiting and failed-login
logging protect management; blanket network denial for every non-administrator would lock out a
parent using a new device and break legitimate local diagnostics. Unresolved identity quarantine
always denies LuCI, SSH and Sheepfold API regardless of automatic/manual internet treatment.

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

All settings-page controls must use an explicit-save model:

- changing a select, checkbox, radio group, text field, textarea, or time input must only change the local UI draft state;
- settings must not be saved automatically on field blur, select change, checkbox change, or radio change;
- the settings page must show `Save` / `Сохранить` at the top right and again at the bottom of the settings content;
- when settings have unsaved changes, the UI should make that visible in plain parent-facing language;
- risky settings, such as scheduled Wi-Fi disable, may still show an additional confirmation dialog when the parent presses `Save`.

The UI should not expose separate `Apply` and `Save` actions because that distinction is confusing for non-technical users. Internally, Sheepfold may still perform the OpenWRT save/apply steps needed by UCI, firewall, services, cron, backend wrappers, and LuCI, but the parent-facing UI should present it as one deliberate save operation.

When Sheepfold LuCI actions write UCI data immediately, for example allowlist/blocklist edits, administrator-device binding, group changes, or settings save, the implementation must also accept/apply LuCI's own pending-change queue. The standard LuCI banner such as `Unsaved changes` / `Не принятые изменения` must not remain after a successful Sheepfold action. Use a shared save/apply helper that saves the touched configs, applies through the LuCI changes API when available, and falls back to OpenWRT `uci.apply` only when needed.

## Integrations

### Optional feedback channel

LuCI settings and the parent Android app provide `Feedback / suggestions`. Submission goes through the authenticated router API to a configurable Yandex Cloud Function/API Gateway endpoint and Serverless YDB. It is optional, rate-limited, isolated from family-control behavior, and never present in the child APK. Only visible form fields and separately consented minimal router diagnostics may be sent (§feedback).

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

Current Podkop compatibility requires the visible `Disable IPv6 on the router` option to become enabled automatically for `podkop` and `adguard_podkop`. Without Podkop it defaults to disabled and remains user-controlled. Sheepfold must use only its owned sysctl file and restore the kernel values that existed before automatic management (§ipv6pod).

## Helpful External Links

- Podkop and AdGuard Home setup: https://podkop.net/docs/adguard/
- Clearing browser cache after LuCI updates: https://podkop.net/docs/clear-browser-cache/
- OpenWRT router comparison: https://hattabbi4.github.io/openwrt-router-compare/

## Export And Backup

Default export should be a readable JSON/archive without secrets.

Secrets include bot tokens, API keys, sessions, passwords, and other credentials.

If the user wants a full backup including secrets, Sheepfold should require encrypted export with a password. Full unencrypted export with secrets should not be the default.

Live one-time pairing codes are transient state and must not appear in either readable or encrypted backups. A non-secret random router installation ID distinguishes a same-router restore from migration. Migration to another router keeps permanent numeric device IDs, groups, schedules and access lists, but clears identity HMAC values, unresolved identity quarantine and administrator-phone bindings because the local identity secret is intentionally not exported. Administrator accounts remain and their phones must be paired again (§cfgbak1).

Offline known devices should be cleaned after a configurable number of inactive days. Default: `90` days.

## Messaging

- Telegram and VK should both support two-way chat: notifications, status, device search, temporary access, approvals, and confirmed administrative actions.
- Telegram infrastructure actions that can cut connectivity or destroy operational state (`internet_off`, `wifi_off`, `clear_logs`, `update`, `reboot`) require a separate one-time confirmation. Temporary access and device-policy mutations (`grant_time`, `block_device`, `unblock_device`, `allowlist_add`, `blocklist_add`) use the same confirmation and preserve only a validated numeric device ID and bounded duration in pending state. Restoring global connectivity (`internet_on`, `wifi_on`) must remain immediately available (§tgconfirm).
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
