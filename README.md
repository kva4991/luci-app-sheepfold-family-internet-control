<p align="center">
  <img src="docs/assets/sheepfold-logo.png" alt="Sheepfold logo" width="160">
</p>

# Sheepfold Family Internet Control

[Русский](README.ru.md) | English

Sheepfold is a family internet access control system for an OpenWRT router.

It is planned as an OpenWRT router application with a LuCI web interface, backend service, Android companion app named **Ovcharnya** / **Овчарня**, and messenger bot integration for managing household internet access.

## Installation

The installer is a placeholder until the first package release is published.
It first asks for application language (`ru` by default, `en` for English), then asks for user-agreement consent and offers automatic setup. Full automatic setup is the default and may assign confidently detected infrastructure devices to the `No restrictions` group. Reduced mode can be selected explicitly for routers with very little free space.

```sh
wget -O /tmp/sheepfold-install.sh https://raw.githubusercontent.com/kva4991/luci-app-sheepfold-family-internet-control/main/install.sh
sh /tmp/sheepfold-install.sh
```

## Update

The updater is a placeholder until GitHub Releases are configured.

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
- Android app: `Овчарня`
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

The Android companion app targets Android 9.0 Pie / API 28 and newer.

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

This repository is in the planning/scaffolding stage.

See:

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
- [Integrations](docs/integrations.md)
- [Localization](docs/localization.md)
- [Messaging and notifications](docs/messaging.md)
- [LuCI browser cache and asset versioning](docs/luci-cache.md)
- [GitHub and installer plan](docs/github-install-setup.md)
- [Security model](docs/security.md)
- [User agreement](docs/user-agreement.md)
- [Privacy policy](docs/privacy.md)
- [OpenWRT router comparison](https://hattabbi4.github.io/openwrt-router-compare/)

## Support

If you find Sheepfold useful and want to support development, donation links will be added here before the first public release.

Suggested support channels:

- GitHub Sponsors for international donations;
- Boosty or YooMoney for Russian-speaking users.

## License

MIT License.
