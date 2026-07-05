#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PKG_DIR="$ROOT_DIR/package/luci-app-sheepfold-family-internet-control"
OUT_DIR="${SHEEPFOLD_OUT_DIR:-$ROOT_DIR/dist}"
BUILD_DIR="$ROOT_DIR/.build/test-ipk"
PKG_NAME="luci-app-sheepfold-family-internet-control"
PKG_VERSION="$(sed -n 's/^PKG_VERSION:=//p' "$PKG_DIR/Makefile" | head -n 1)"
PKG_RELEASE="$(sed -n 's/^PKG_RELEASE:=//p' "$PKG_DIR/Makefile" | head -n 1)"
ARCH="all"
IPK="$OUT_DIR/${PKG_NAME}_${PKG_VERSION}-${PKG_RELEASE}_${ARCH}.ipk"

resolve_downloads_dir() {
        if [ -n "${SHEEPFOLD_DOWNLOADS_DIR:-}" ]; then
                printf '%s\n' "$SHEEPFOLD_DOWNLOADS_DIR"
                return 0
        fi

        if command -v cygpath >/dev/null 2>&1 && [ -n "${USERPROFILE:-}" ]; then
                cygpath -u "$USERPROFILE/Downloads"
                return 0
        fi

        if [ -n "${USERPROFILE:-}" ] && [ -d "$USERPROFILE/Downloads" ]; then
                printf '%s\n' "$USERPROFILE/Downloads"
                return 0
        fi

        if [ -n "${HOME:-}" ] && [ -d "$HOME/Downloads" ]; then
                printf '%s\n' "$HOME/Downloads"
                return 0
        fi

        return 1
}

rm -rf "$BUILD_DIR"
mkdir -p "$BUILD_DIR/control" "$BUILD_DIR/data/www" "$OUT_DIR"
trap 'rm -rf "$BUILD_DIR"; rmdir "$ROOT_DIR/.build" 2>/dev/null || true' EXIT

cp -R "$PKG_DIR/root/." "$BUILD_DIR/data/"
cp -R "$PKG_DIR/htdocs/." "$BUILD_DIR/data/www/"
chmod 0755 "$BUILD_DIR/data/etc/init.d/sheepfold"
chmod 0755 "$BUILD_DIR/data/etc/uci-defaults/50_luci-sheepfold"
chmod 0755 "$BUILD_DIR/data/etc/hotplug.d/button/90-sheepfold-wps"
chmod 0755 "$BUILD_DIR/data/usr/libexec/sheepfold/sheepfold-service"
chmod 0755 "$BUILD_DIR/data/usr/libexec/sheepfold/sheepfold-device-detector"
chmod 0755 "$BUILD_DIR/data/usr/libexec/sheepfold/sheepfold-log"
chmod 0755 "$BUILD_DIR/data/usr/libexec/sheepfold/sheepfold-updater"
chmod 0755 "$BUILD_DIR/data/usr/libexec/sheepfold/sheepfold-router-control"
chmod 0755 "$BUILD_DIR/data/www/cgi-bin/sheepfold-blocked"

cat > "$BUILD_DIR/control/control" <<CONTROL
Package: $PKG_NAME
Version: $PKG_VERSION-$PKG_RELEASE
Architecture: $ARCH
Maintainer: kva4991
Depends: luci-base, firewall4, rpcd, uci, uclient-fetch, ca-bundle, uhttpd
Section: luci
Priority: optional
Installed-Size: 10240
Description: Visual test build of Sheepfold Family Internet Control LuCI app.
CONTROL

cat > "$BUILD_DIR/control/conffiles" <<CONFFILES
/etc/config/sheepfold
CONFFILES

cat > "$BUILD_DIR/control/postinst" <<POSTINST
#!/bin/sh
[ -n "\${IPKG_INSTROOT}" ] && exit 0
uci -q get sheepfold.global >/dev/null || uci -q set sheepfold.global='sheepfold'
ensure_global_option() {
        option="\$1"
        value="\$2"
        [ -n "\$(uci -q get sheepfold.global.\$option 2>/dev/null)" ] || uci -q set sheepfold.global.\$option="\$value"
}
ensure_global_option enabled '0'
ensure_global_option language 'ru'
ensure_global_option block_on_boot '0'
ensure_global_option new_device_policy 'allow'
ensure_global_option auto_configure '1'
ensure_global_option detection_mode 'full'
ensure_global_option no_restrictions_auto_assign '1'
ensure_global_option detector_watch_interval_seconds '10'
ensure_global_option detector_interval_seconds '900'
ensure_global_option detector_max_hosts_per_scan '16'
ensure_global_option detector_min_no_restrictions_confidence '80'
ensure_global_option detector_nmap_host_timeout_seconds '20'
ensure_global_option update_check_install_mode 'weekly'
ensure_global_option active_messenger 'none'
ensure_global_option vk_access_token ''
ensure_global_option vk_community_id ''
ensure_global_option vk_admin_user_id ''
ensure_global_option telegram_bot_token ''
ensure_global_option telegram_admin_chat_id ''
ensure_global_option wifi_auto_enable_mode 'never'
ensure_global_option wifi_auto_enable_time '07:00'
ensure_global_option wifi_auto_disable_mode 'never'
ensure_global_option wifi_auto_disable_time '23:00'
ensure_global_option wps_short_press_action 'router_default'
ensure_global_option wps_long_press_action 'router_default'
ensure_global_option router_led_control 'router_default'
ensure_global_option blocked_page_enabled '1'
ensure_global_option blocked_page_text 'Интернет временно недоступен по семейным правилам. Если это ошибка, обратитесь к родителю.'
ensure_global_option blocked_page_port '5202'
ensure_global_option domain_allowlist_for_blocklist '1'
ensure_global_option log_retention '3d'
ensure_global_option offline_device_retention_days '90'
ensure_global_option app_port '5201'
ensure_global_option log_storage 'ram'
ensure_global_option log_cache_path '/tmp/sheepfold/events.log'
uci -q get sheepfold.no_restrictions >/dev/null || uci -q set sheepfold.no_restrictions='group'
uci -q set sheepfold.no_restrictions.name='Без ограничений'
uci -q set sheepfold.no_restrictions.protected='1'
uci -q set sheepfold.no_restrictions.auto_assignable='1'
uci -q set sheepfold.no_restrictions.description='Trusted home infrastructure devices that should not be limited unless they are blocklisted'
uci -q get sheepfold.child_1 >/dev/null || uci -q set sheepfold.child_1='group'
uci -q set sheepfold.child_1.name='Ребёнок номер 1'
uci -q set sheepfold.child_1.protected='0'
uci -q set sheepfold.child_1.auto_assignable='0'
uci -q set sheepfold.child_1.description='Default first child group'
detect_installed() {
        pkg="\$1"
        init="\$2"
        config="\$3"
        opkg status "\$pkg" 2>/dev/null | grep -q "Status:.* installed" && return 0
        [ -n "\$init" ] && [ -x "/etc/init.d/\$init" ] && return 0
        [ -n "\$config" ] && [ -f "/etc/config/\$config" ] && return 0
        return 1
}
detect_installed AdGuardHome AdGuardHome AdGuardHome || detect_installed adguardhome adguardhome adguardhome
has_adguard="\$?"
detect_installed podkop podkop podkop
has_podkop="\$?"
if [ "\$(uci -q get sheepfold.global.integration_mode_user_set 2>/dev/null)" != "1" ]; then
        if [ "\$has_adguard" = "0" ] && [ "\$has_podkop" = "0" ]; then
                uci -q set sheepfold.global.integration_mode='adguard_podkop'
        elif [ "\$has_adguard" = "0" ]; then
                uci -q set sheepfold.global.integration_mode='adguard'
        elif [ "\$has_podkop" = "0" ]; then
                uci -q set sheepfold.global.integration_mode='podkop'
        else
                uci -q set sheepfold.global.integration_mode='none'
        fi
        uci -q set sheepfold.global.integration_mode_source='auto'
        uci -q set sheepfold.global.adguard_integration="\$([ "\$has_adguard" = "0" ] && printf 1 || printf 0)"
        uci -q set sheepfold.global.podkop_compatibility="\$([ "\$has_podkop" = "0" ] && printf 1 || printf 0)"
fi
uci -q set sheepfold.global.ui_asset_version='${PKG_VERSION}-${PKG_RELEASE}'
uci -q commit sheepfold
rm -f /var/luci-indexcache* 2>/dev/null || true
rm -f /tmp/luci-indexcache* 2>/dev/null || true
rm -f /tmp/luci-modulecache/* 2>/dev/null || true
[ -x /etc/init.d/rpcd ] && /etc/init.d/rpcd reload || true
exit 0
POSTINST
chmod 0755 "$BUILD_DIR/control/postinst"

printf '2.0\n' > "$BUILD_DIR/debian-binary"

(
        cd "$BUILD_DIR/control"
        tar --owner=0 --group=0 -czf ../control.tar.gz .
)

(
        cd "$BUILD_DIR/data"
        tar --owner=0 --group=0 -czf ../data.tar.gz .
)

(
        cd "$BUILD_DIR"
        rm -f "$IPK"
        tar --format=gnu --numeric-owner --sort=name -cf - ./debian-binary ./data.tar.gz ./control.tar.gz | gzip -n - > "$IPK"
)

echo "$IPK"

if DOWNLOADS_DIR="$(resolve_downloads_dir)" && [ -d "$DOWNLOADS_DIR" ]; then
        cp "$IPK" "$DOWNLOADS_DIR/$(basename "$IPK")"
        echo "$DOWNLOADS_DIR/$(basename "$IPK")"
fi
