<p align="center">
  <img src="docs/assets/sheepfold-logo.png" alt="Sheepfold logo" width="160">
</p>

# Sheepfold Family Internet Control

[Русский](README.ru.md) | English

[Project presentation](docs/project-presentation.md)

[Feedback backend setup: Yandex Cloud + YDB](docs/yandex-cloud-ydb-feedback.ru.md)

[How official IPK and OpenWrt APK packages are built](docs/github-actions-openwrt-build.ru.md)

Sheepfold is a family internet access control system for an OpenWRT router.

It is being built as an OpenWRT router application with a LuCI web interface, backend service, Android companion app named **Sheepfold**, and messenger bot integration for managing household internet access.

## Installation

The installer performs the first-run questions, detects AdGuard Home/Podkop, downloads the matching package from the latest stable release, and installs it with the native OpenWrt package manager: `.ipk` through `opkg` on 24.10 and older, or an OpenWrt `.apk` through apk v3 on 25.12 and newer.
It first asks for application language (`ru` by default, `en` for English), then the Sheepfold product, user-agreement consent, and automatic setup mode. Full automatic setup is the default and may assign confidently detected infrastructure devices to the `No restrictions` group. Reduced mode can be selected explicitly for routers with very little free space; it avoids heavy port checks but can still auto-assign confidently detected infrastructure devices.

```sh
wget -O /tmp/sheepfold-install.sh https://raw.githubusercontent.com/kva4991/luci-app-sheepfold-family-internet-control/main/install.sh
sh /tmp/sheepfold-install.sh
```

## Update

After the OpenWrt package is installed, the update script delegates to the installed Sheepfold updater. The updater checks the latest stable GitHub Release, compares versions, downloads the package format used by the current OpenWrt release, validates its internal metadata, and installs it only when a newer version is available.

```sh
wget -O /tmp/sheepfold-update.sh https://raw.githubusercontent.com/kva4991/luci-app-sheepfold-family-internet-control/main/update.sh
sh /tmp/sheepfold-update.sh
```

## Uninstall From OpenWRT

The uninstaller removes the OpenWRT package, keeps Sheepfold settings and client lists, and prints a report of remaining router settings.

```sh
wget -O /tmp/sheepfold-uninstall.sh https://raw.githubusercontent.com/kva4991/luci-app-sheepfold-family-internet-control/main/uninstall.sh
sh /tmp/sheepfold-uninstall.sh
```

## Project Names

- GitHub repository: `luci-app-sheepfold-family-internet-control`
- OpenWRT package: `luci-app-sheepfold-family-internet-control`
- LuCI EN: `Sheepfold Family Internet Control`
- LuCI RU: `Sheepfold : контроль доступа в интернет для семьи`
- Android app: `Sheepfold`
- Android package: `app.sheepfold.android`

## Goals

- Manage internet access for home devices through an OpenWRT router and its LuCI web interface.
- Provide an Android companion app with quick actions and widgets.
- Support Telegram/VK messenger bot controls, with VK as the default first-run choice and MAX as an experimental adapter.
- Keep device allowlists, blocklists, schedules, temporary access tokens, and access to emergency-useful sites.
- Sync device names and static IP addresses with the OpenWRT router DHCP static leases.
- Work safely with `fw4` / `nftables`.
- Coexist with AdGuard Home and Podkop.

## Target Android Scope

Both Android applications target Android 9.0 Pie / API 28 and newer.

Older Android versions are intentionally out of scope.

## Target OpenWRT Scope

Sheepfold targets modern OpenWRT routers with `firewall4` / `nftables`.

Legacy `firewall3` / `iptables` support is intentionally out of scope. The expected installation targets are reasonably recent routers and firmware builds, for example devices in the class of Xiaomi Mi Router AX3000T.

## Planned Traffic Flow

1. Sheepfold decides whether a device is allowed to access the network.
2. Allowed DNS traffic can continue through AdGuard Home.
3. Allowed and filtered traffic can then continue through Podkop routing.

The project should not break AdGuard Home, Dnsmasq, Podkop, sing-box, or standard OpenWRT firewall rules.

## Rule Priority

1. Blocklisted devices are always blocked.
2. Allowlisted devices are never blocked by global/schedule rules.
3. One device must not be present in both allowlist and blocklist.
4. Temporary access tokens must not bypass the blocklist.
5. Schedules apply only to devices that are not allowlisted or blocklisted.

## Repository Layout

```text
package/luci-app-sheepfold-family-internet-control/  OpenWRT package skeleton
android/                                             Android companion app
bot/                                                 Telegram/VK bot adapters, experimental MAX
docs/                                                Product and technical docs
install.sh                                           Router installer entrypoint
update.sh                                            Router updater entrypoint
uninstall.sh                                         Router uninstaller that preserves settings
```

## Status

This repository is in active experimental development. LuCI uses one guarded runner for mutating router commands; duplicate clicks coalesce and the global internet toggle is confirmed by the backend. UCI, device/DHCP/firewall, Wi-Fi reload, backup rollback, and pairing are split into narrow persistence adapters. The final cleanup removes duplicate forwarding functions from the coordinator without changing runtime ordering. Schedules, groups, settings side effects, and discovery payloads are also separated from the LuCI coordinator. LuCI/backend, nftables enforcement, schedules, secure Android pairing, and a basic Telegram adapter are implemented; stable release still requires the documented live OpenWrt/integration matrix, physical Android validation, production signing, and roadmap limitations.

See:

- [Current implementation status](docs/current-implementation-status.md)
- [Current development roadmap (Russian)](docs/project-development-roadmap.ru.md)
- [Product requirements](docs/product-requirements.md)
- [Direct task for AI developers](docs/developer-task.md)
- [Android/OpenWRT API contract, Russian](docs/android-openwrt-api.ru.md)
- [Parent AI assistant](docs/ai-assistant.md)
- [AI context sharing](docs/ai-context-sharing.md)
- [Parent AI assistant prompt draft, Russian](docs/ai-assistant-prompt-for-support-parent/v1/ai-assistant-prompt.ru.md)
- [Age-based control scenarios](docs/age-scenarios.md)
- [Access schedules](docs/schedules.md)
- [Country profiles](docs/country-profiles.md)
- [Emergency-useful sites planning](docs/domain-allowlist.md)
- [Device passport, monitoring, and control, Russian](docs/device-passport-and-control.ru.md)
- [Device auto-detection notes, Russian](docs/device-detection.ru.md)
- [Integrations](docs/integrations.md)
- [Localization](docs/localization.md)
- [Messaging and notifications](docs/messaging.md)
- [LuCI browser cache and asset versioning](docs/luci-cache.md)
- [GitHub and installer plan](docs/github-install-setup.md)
- [Security model](docs/security.md)
- [User agreement](docs/user-agreement.md)
- [Privacy policy](docs/privacy.md)
- [Donation](docs/donation.md)
- [OpenWRT router comparison](https://hattabbi4.github.io/openwrt-router-compare/)

## Support

If you find Sheepfold useful and want to support development, see [Donation](docs/donation.md).

## License

MIT License.

LuCI `r249` additionally moves shared settings fields, the full Misc/Storage composition, AI presentation, and the device-type selector out of `overview.js`; the coordinator remains the composition root rather than owning those DOM trees.

LuCI `r250` completes the `overview.js` decomposition: the public file is a four-line bootstrap, the explicit composition root lives in `features/overview/application.js`, and domain behavior is owned by focused controllers.

LuCI `r252` is the re-audited finalization of the `overview.js` decomposition: a four-line bootstrap, strict require/dependency/UCI auditing, and honest partial-persistence/refresh outcomes. The hardware firewall/DNS/Wi-Fi matrix remains mandatory before release. §ovaudit5
