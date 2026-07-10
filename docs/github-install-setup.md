# GitHub Install Setup

Repository:

```text
https://github.com/kva4991/luci-app-sheepfold-family-internet-control
```

Public install command:

```sh
wget -O /tmp/sheepfold-install.sh https://raw.githubusercontent.com/kva4991/luci-app-sheepfold-family-internet-control/main/install.sh
sh /tmp/sheepfold-install.sh
```

Public uninstall command:

```sh
wget -O /tmp/sheepfold-uninstall.sh https://raw.githubusercontent.com/kva4991/luci-app-sheepfold-family-internet-control/main/uninstall.sh
sh /tmp/sheepfold-uninstall.sh
```

## Release Plan

Current package builds are architecture-independent `.ipk` files with `Architecture: all`.

Already implemented locally:

1. Build `.ipk` package artifacts with the repository build script.
2. Publish/test packages through GitHub Releases manually.
3. Ask for application language first and default to `ru`; on first package install the choice is written to `/etc/sheepfold/install.language` and applied to both `sheepfold.global.language` and `luci.main.lang` (see [`docs/localization.ru.md`](localization.ru.md)).
4. Ask for user-agreement consent.
5. Ask whether to apply Sheepfold automatic setup and persist the intended automatic setup values when config exists.
6. Detect existing AdGuard Home and Podkop installations.
7. Apply the recommended Sheepfold `integration_mode` when `/etc/config/sheepfold` already exists.

Still needed for the public one-command installer:

1. Read the latest stable GitHub Release.
2. Download the latest `.ipk`.
3. Install missing dependencies through `opkg`.
4. Install Sheepfold through `opkg install`.
5. Enable and start the service.
6. Restart `rpcd`, `uhttpd`, and `firewall` when needed.

## Update Plan

The installed LuCI "Update app" button and `update.sh` now use `/usr/libexec/sheepfold/sheepfold-updater` when the package is installed.

The updater currently:

1. Check latest GitHub Release.
2. Compare current and latest versions.
3. Download the matching `.ipk` from the release assets.
4. Install it with `opkg install`.
5. Report success, no-update, or failure in localized text.

Still needed:

1. Create a settings backup before update.
2. Restart only the required services after update.
3. Add the Android-side update UI once Android authenticated API is complete.

## Uninstall Plan

The OpenWRT uninstall command should:

1. Create a backup of Sheepfold settings and local data.
2. Stop and disable the Sheepfold service if it exists.
3. Remove the OpenWRT package through `opkg remove`.
4. Keep or restore `/etc/config/sheepfold` so client lists are not lost.
5. Print and save a report of remaining Sheepfold-related UCI settings, files, and nftables rules.
6. Leave manual cleanup decisions to the router administrator.
