# GitHub installation and release setup

Repository:

```text
https://github.com/kva4991/luci-app-sheepfold-family-internet-control
```

## Public install

```sh
wget -O /tmp/sheepfold-install.sh https://raw.githubusercontent.com/kva4991/luci-app-sheepfold-family-internet-control/main/install.sh
sh /tmp/sheepfold-install.sh
```

The installer reads the latest stable GitHub Release, asks for Standard or AI
Support, detects the router package manager, and downloads the matching format:

- OpenWrt 24.10 and older: `.ipk` installed by `opkg`;
- OpenWrt 25.12 and newer: a real OpenWrt `.apk` installed by apk-tools v3.

It does not confuse an OpenWrt APK with an Android APK. Package URLs must match
the expected Sheepfold release-asset prefix, format, internal package name,
version, and architecture.

## Public uninstall

```sh
wget -O /tmp/sheepfold-uninstall.sh https://raw.githubusercontent.com/kva4991/luci-app-sheepfold-family-internet-control/main/uninstall.sh
sh /tmp/sheepfold-uninstall.sh
```

The uninstaller removes the package through the current router package manager,
keeps `/etc/config/sheepfold` and client settings, and prints the remaining-state
report.

## Canonical package build

Public OpenWrt packages are built by
`.github/workflows/build-openwrt-packages.yml` through the pinned official
OpenWrt SDK Action (§owrtci1). The matrix contains Standard and AI Support for
OpenWrt 24.10/IPK and 25.12/OpenWrt APK.

Run it in GitHub under `Actions → Build OpenWrt packages → Run workflow`, or:

```powershell
gh workflow run "Build OpenWrt packages" --ref main
gh run watch
```

On PR/push, download the `sheepfold-openwrt-packages` Actions artifact. The
bundle contains four router packages, per-build metadata, `SHA256SUMS`, and an
aggregate manifest. `scripts/build-test-ipk.py` is only a fast local test
builder and must not be used as the canonical public release chain.

Full instructions, signing secrets, pinned SDK versions, and maintenance rules:
[`github-actions-openwrt-build.ru.md`](github-actions-openwrt-build.ru.md).

## Publishing a stable release

1. Merge and verify the intended commit in `main`.
2. Make sure the package release number was increased.
3. Run the full test suite and the OpenWrt workflow manually.
4. Install the resulting package on the test router and verify update/config
   preservation.
5. Create a GitHub Release tag for the verified commit.
6. Publish it as a normal Release, not a draft or Pre-release.
7. Wait for `Build OpenWrt packages` to finish.
8. Verify that the Release has two IPK files, two OpenWrt APK files,
   `SHA256SUMS`, and `openwrt-build-manifest.json`.

Only the release-publishing job receives `contents: write`. A pre-release does
not receive router assets because the updater deliberately follows
`releases/latest`.

## Updating an installed router

```sh
wget -O /tmp/sheepfold-update.sh https://raw.githubusercontent.com/kva4991/luci-app-sheepfold-family-internet-control/main/update.sh
sh /tmp/sheepfold-update.sh
```

The installed updater compares package-manager versions, validates the trusted
GitHub asset path and internal metadata, saves the UCI configuration before the
package-manager transaction, and restores the configuration after a failed
install. This is configuration recovery, not a binary firmware rollback.
