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

1. Build `.ipk` packages in GitHub Actions.
2. Publish packages to GitHub Releases.
3. Teach `install.sh` to detect OpenWRT architecture.
4. Detect existing AdGuard Home and Podkop installations.
5. Download the matching `.ipk`.
6. Install dependencies through `opkg`.
7. Install Sheepfold through `opkg install`.
8. Apply the recommended Sheepfold `integration_mode`.
9. Enable and start the service.
10. Restart `rpcd`, `uhttpd`, and `firewall` when needed.

## Update Plan

The LuCI and Android "Update app" buttons should:

1. Check latest GitHub Release.
2. Compare current and latest versions.
3. Create a settings backup.
4. Download the matching `.ipk`.
5. Install it.
6. Restart required services.
7. Report success or failure.

## Uninstall Plan

The OpenWRT uninstall command should:

1. Create a backup of Sheepfold settings and local data.
2. Stop and disable the Sheepfold service if it exists.
3. Remove the OpenWRT package through `opkg remove`.
4. Keep or restore `/etc/config/sheepfold` so client lists are not lost.
5. Print and save a report of remaining Sheepfold-related UCI settings, files, and nftables rules.
6. Leave manual cleanup decisions to the router administrator.
