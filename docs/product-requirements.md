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
- VK/MAX messenger bot.
- Device allowlist.
- Device blocklist.
- Automatically discovered devices.
- Search by MAC, current IP, hostname, and custom name.
- DHCP static lease synchronization.
- Schedules.
- Temporary access tokens.
- Domain allowlist for restricted access mode.
- Import/export of all settings and known clients.
- Optional logging.
- App update and router reboot controls with confirmation.

## Android Scope

The Android companion app **Овчарня** should support Android 9.0 Pie / API 28 and newer.

Older Android versions are intentionally out of scope.

Recommended Android baseline:

- minimum SDK: API 28;
- target SDK: latest stable Android SDK;
- implementation language: Kotlin;
- UI: Jetpack Compose;
- token storage: Android Keystore.

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
- domain allowlist mode can optionally allow selected public domains for blocked devices.

## Integrations

AdGuard Home should remain responsible for DNS-level filtering when enabled.

Podkop should remain responsible for routing after Sheepfold and AdGuard Home have allowed the traffic.
