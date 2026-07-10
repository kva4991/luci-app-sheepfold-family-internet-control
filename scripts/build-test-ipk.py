#!/usr/bin/env python3
import argparse
import gzip
import io
import os
import shutil
import sys
import tarfile
import time
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
if str(SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPT_DIR))

from po2lmo import compile_po


ROOT_DIR = Path(__file__).resolve().parents[1]
PKG_NAME = "luci-app-sheepfold-family-internet-control"
PKG_DIR = ROOT_DIR / "package" / PKG_NAME


def read_make_value(name: str) -> str:
    prefix = f"{name}:="
    for line in (PKG_DIR / "Makefile").read_text(encoding="utf-8").splitlines():
        if line.startswith(prefix):
            return line[len(prefix):].strip()
    raise RuntimeError(f"Cannot find {name} in package Makefile.")


def add_bytes(tar: tarfile.TarFile, name: str, data: bytes, mode: int = 0o644) -> None:
    info = tarfile.TarInfo(name)
    info.size = len(data)
    info.mode = mode
    info.uid = 0
    info.gid = 0
    info.uname = "root"
    info.gname = "root"
    info.mtime = int(time.time())
    tar.addfile(info, io.BytesIO(data))


def add_directory(tar: tarfile.TarFile, name: str) -> None:
    info = tarfile.TarInfo(name.rstrip("/") + "/")
    info.type = tarfile.DIRTYPE
    info.mode = 0o755
    info.uid = 0
    info.gid = 0
    info.uname = "root"
    info.gname = "root"
    info.mtime = int(time.time())
    tar.addfile(info)


def ensure_tar_directories(tar: tarfile.TarFile, target_path: str) -> None:
    parts = target_path.strip("./").split("/")
    current = "."
    for part in parts[:-1]:
        current = f"{current}/{part}"
        add_directory(tar, current)


def is_executable_ipk_target(target: str) -> bool:
    executable_prefixes = (
        "./etc/init.d/",
        "./etc/uci-defaults/",
        "./etc/hotplug.d/",
        "./usr/libexec/sheepfold/",
        "./www/cgi-bin/",
    )
    if any(target.startswith(prefix) for prefix in executable_prefixes):
        return True
    return target == "./www/.well-known/sheepfold.json.sh"


def add_tree(tar: tarfile.TarFile, source: Path, target_prefix: str) -> None:
    for path in sorted(source.rglob("*")):
        rel = path.relative_to(source).as_posix()
        target = f"./{target_prefix.rstrip('/')}/{rel}" if target_prefix else f"./{rel}"
        target = target.replace("//", "/")

        if path.is_dir():
            add_directory(tar, target)
            continue

        mode = 0o755 if is_executable_ipk_target(target) else 0o644
        add_bytes(tar, target, path.read_bytes(), mode)


def open_gzip_tar(path: Path) -> tarfile.TarFile:
    raw = path.open("wb")
    gz = gzip.GzipFile(filename="", mode="wb", fileobj=raw, mtime=0)
    tar = tarfile.open(fileobj=gz, mode="w", format=tarfile.GNU_FORMAT)
    original_close = tar.close

    def close_all() -> None:
        original_close()
        gz.close()
        raw.close()

    tar.close = close_all
    return tar


def write_control_tar(path: Path, version: str, release: str) -> None:
    control = f"""Package: {PKG_NAME}
Version: {version}-{release}
Architecture: all
Maintainer: kva4991
Depends: luci-base, firewall4, rpcd, uci, uclient-fetch, ca-bundle, uhttpd
Section: luci
Priority: optional
Installed-Size: 10240
Description: Visual test build of Sheepfold Family Internet Control LuCI app.
""".encode("utf-8")
    preinst = b"""#!/bin/sh
[ -n "${IPKG_INSTROOT}" ] && exit 0
case "$1" in
        upgrade|install)
                if [ -s /etc/config/sheepfold ]; then
                        mkdir -p /etc/sheepfold/migrations
                        cp /etc/config/sheepfold /etc/sheepfold/migrations/sheepfold.config.pre-upgrade
                        chmod 600 /etc/sheepfold/migrations/sheepfold.config.pre-upgrade 2>/dev/null || true
                fi
                ;;
esac
exit 0
"""

    postinst = f"""#!/bin/sh
[ -n "${{IPKG_INSTROOT}}" ] && exit 0
cleanup_opkg_conffile_artifacts() {{
        for leftover in /etc/config/sheepfold-opkg /etc/config/sheepfold-opkg.old; do
                [ -e "$leftover" ] || continue
                rm -f "$leftover"
        done
}}
cleanup_stale_update_artifacts() {{
        rm -f /tmp/sheepfold/update/*.ipk /tmp/sheepfold/update/sheepfold-config-before-update 2>/dev/null || true
}}
recover_sheepfold_config() {{
        mkdir -p /etc/config /etc/sheepfold/migrations
        if [ -s /etc/config/sheepfold ]; then
                return 0
        fi
        for candidate in \\
                /etc/sheepfold/migrations/sheepfold.config.pre-upgrade \\
                /etc/config/sheepfold-opkg \\
                /etc/config/sheepfold-opkg.old \\
                /tmp/sheepfold/update/sheepfold-config-before-update; do
                if [ -s "$candidate" ]; then
                        cp "$candidate" /etc/config/sheepfold
                        chmod 600 /etc/config/sheepfold 2>/dev/null || true
                        return 0
                fi
        done
        if [ -r /usr/share/sheepfold/sheepfold.uci.defaults ]; then
                cp /usr/share/sheepfold/sheepfold.uci.defaults /etc/config/sheepfold
        else
                : > /etc/config/sheepfold
        fi
        chmod 600 /etc/config/sheepfold 2>/dev/null || true
}}
recover_sheepfold_config
cleanup_stale_update_artifacts
repair_sheepfold_uci_sections() {{
        mkdir -p /etc/config
        [ -e /etc/config/sheepfold ] || : > /etc/config/sheepfold
        chmod 600 /etc/config/sheepfold 2>/dev/null || true
        for pair in messenger:messenger_global export:export_global wifi_control:wifi_control_global pairing:pairing_global; do
                type="${{pair%%:*}}"
                name="${{pair#*:}}"
                if [ "$(uci -q get sheepfold.global 2>/dev/null)" = "$type" ]; then
                        uci -q rename sheepfold.global="$name" 2>/dev/null || {{
                                uci -q delete sheepfold.global 2>/dev/null || true
                                uci -q set "sheepfold.$name=$type"
                        }}
                fi
                uci -q rename "sheepfold.@$type[0]=$name" 2>/dev/null || true
        done
        if [ "$(uci -q get sheepfold.global 2>/dev/null)" != "sheepfold" ]; then
                uci -q rename sheepfold.global=legacy_global 2>/dev/null || uci -q delete sheepfold.global 2>/dev/null || true
                uci -q rename sheepfold.@sheepfold[0]=global 2>/dev/null || uci -q set sheepfold.global='sheepfold'
        fi
        uci -q commit sheepfold 2>/dev/null || true
}}
repair_sheepfold_uci_sections
uci -q get sheepfold.global >/dev/null || uci -q set sheepfold.global='sheepfold'
ensure_global_option() {{
        option="$1"
        value="$2"
        [ -n "$(uci -q get sheepfold.global.$option 2>/dev/null)" ] || uci -q set sheepfold.global.$option="$value"
}}
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
ensure_global_option detector_min_device_type_confidence '70'
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
ensure_global_option router_ntp_server_enabled '1'
ensure_global_option router_ntp_client_auto_configure '1'
ensure_global_option router_timezone_name 'Europe/Moscow'
ensure_global_option router_timezone 'MSK-3'
ensure_global_option router_ntp_servers 'ntp1.vniiftri.ru ntp2.ntp-servers.net 3.openwrt.pool.ntp.org'
ensure_global_option wps_short_press_action 'router_default'
ensure_global_option wps_long_press_action 'router_default'
ensure_global_option router_led_control 'router_default'
ensure_global_option blocked_page_enabled '1'
ensure_global_option blocked_page_text 'Интернет временно недоступен по семейным правилам. Если это ошибка, обратитесь к родителю.'
ensure_global_option blocked_page_port '5202'
ensure_global_option domain_allowlist_for_blocklist '1'
ensure_global_option site_allowlist_sources 'UT1 child | https://dsi.ut-capitole.fr/blacklists/index_en.php#child'
ensure_global_option site_blocklist_mode 'except_allowlist_admins'
ensure_global_option site_blocklist_sources 'UT1 adult, malware, phishing, gambling, games, vpn | https://dsi.ut-capitole.fr/blacklists/index_en.php; StevenBlack hosts gambling-porn | https://github.com/StevenBlack/hosts; HaGeZi Threat Intelligence Feeds | https://github.com/hagezi/dns-blocklists; URLhaus malware URLs | https://urlhaus.abuse.ch/api/'
ensure_global_option site_lists_update_interval 'weekly'
ensure_global_option log_retention '3d'
ensure_global_option offline_device_retention_days '90'
ensure_global_option app_port '5201'
ensure_global_option log_storage 'ram'
ensure_global_option log_cache_path '/tmp/sheepfold/events.log'
[ -x /usr/libexec/sheepfold/sheepfold-default-groups ] && /usr/libexec/sheepfold/sheepfold-default-groups apply
if [ "$(uci -q get sheepfold.global.luci_language_synced 2>/dev/null)" != "1" ]; then
        lang="$(uci -q get sheepfold.global.language 2>/dev/null || printf ru)"
        case "$lang" in
                en|ru) ;;
                *) lang=ru ;;
        esac
        uci -q get luci.main >/dev/null 2>&1 || uci -q set luci.main=core
        uci -q set luci.main.lang="$lang"
        uci -q set sheepfold.global.luci_language_synced='1'
        uci -q commit luci 2>/dev/null || true
fi
detect_installed() {{
        pkg="$1"
        init="$2"
        config="$3"
        opkg status "$pkg" 2>/dev/null | grep -q "Status:.* installed" && return 0
        [ -n "$init" ] && [ -x "/etc/init.d/$init" ] && return 0
        [ -n "$config" ] && [ -f "/etc/config/$config" ] && return 0
        return 1
}}
detect_installed AdGuardHome AdGuardHome AdGuardHome || detect_installed adguardhome adguardhome adguardhome
has_adguard="$?"
detect_installed podkop podkop podkop
has_podkop="$?"
if [ "$(uci -q get sheepfold.global.integration_mode_user_set 2>/dev/null)" != "1" ]; then
        if [ "$has_adguard" = "0" ] && [ "$has_podkop" = "0" ]; then
                uci -q set sheepfold.global.integration_mode='adguard_podkop'
        elif [ "$has_adguard" = "0" ]; then
                uci -q set sheepfold.global.integration_mode='adguard'
        elif [ "$has_podkop" = "0" ]; then
                uci -q set sheepfold.global.integration_mode='podkop'
        else
                uci -q set sheepfold.global.integration_mode='none'
        fi
        uci -q set sheepfold.global.integration_mode_source='auto'
        uci -q set sheepfold.global.adguard_integration="$([ "$has_adguard" = "0" ] && printf 1 || printf 0)"
        uci -q set sheepfold.global.podkop_compatibility="$([ "$has_podkop" = "0" ] && printf 1 || printf 0)"
fi
uci -q set sheepfold.global.ui_asset_version='{version}-{release}'
uci -q commit sheepfold
find /usr/libexec/sheepfold -type f -exec chmod 0755 {{}} + 2>/dev/null || true
for helper in \\
        /etc/hotplug.d/dhcp/90-sheepfold-device-signals \\
        /www/.well-known/sheepfold.json.sh \\
        /www/cgi-bin/sheepfold-api \\
        /www/cgi-bin/sheepfold-blocked; do
        [ -e "$helper" ] && chmod 0755 "$helper" 2>/dev/null || true
done
app_port="$(uci -q get sheepfold.global.app_port 2>/dev/null || printf 5201)"
mkdir -p /www/.well-known
cat > /www/.well-known/sheepfold.json <<EOF
{{
  "service": "sheepfold",
  "name": "Sheepfold Family Internet Control",
  "routerName": "OpenWRT Sheepfold",
  "appPort": "$app_port",
  "apiPath": "/cgi-bin/sheepfold-api",
  "apiBase": "/cgi-bin/sheepfold-api",
  "version": "{version}-{release}"
}}
EOF
rm -f /var/luci-indexcache* 2>/dev/null || true
rm -f /tmp/luci-indexcache* 2>/dev/null || true
rm -f /tmp/luci-modulecache/* 2>/dev/null || true
[ -x /etc/init.d/rpcd ] && /etc/init.d/rpcd reload || true
[ -x /etc/init.d/sheepfold ] && /etc/init.d/sheepfold enable || true
[ -x /etc/init.d/sheepfold ] && /etc/init.d/sheepfold restart || true
exit 0
""".encode("utf-8")

    with open_gzip_tar(path) as tar:
        add_bytes(tar, "./control", control, 0o644)
        add_bytes(tar, "./preinst", preinst, 0o755)
        add_bytes(tar, "./postinst", postinst, 0o755)


def bundled_i18n_files() -> list[tuple[str, bytes, int]]:
    files: list[tuple[str, bytes, int]] = []
    po_path = PKG_DIR / "po/ru/sheepfold.po"
    if po_path.is_file():
        files.append((
            "./usr/lib/lua/luci/i18n/sheepfold.ru.lmo",
            compile_po(po_path),
            0o644,
        ))
    return files


def write_data_tar(path: Path) -> None:
    with open_gzip_tar(path) as tar:
        add_tree(tar, PKG_DIR / "root", "")
        add_tree(tar, PKG_DIR / "htdocs", "www")
        for target, data, mode in bundled_i18n_files():
            ensure_tar_directories(tar, target)
            add_bytes(tar, target, data, mode)


def write_ipk_tar(path: Path, members: list[tuple[str, bytes]]) -> None:
    with open_gzip_tar(path) as tar:
        for name, data in members:
            add_bytes(tar, f"./{name}", data, 0o644)


def resolve_downloads_dir(value: str | None) -> Path | None:
    if value:
        return Path(value)
    if os.environ.get("USERPROFILE"):
        return Path(os.environ["USERPROFILE"]) / "Downloads"
    if os.environ.get("HOME"):
        return Path(os.environ["HOME"]) / "Downloads"
    # Фолбэк для Windows-рабочей станции владельца проекта
    return Path(r"C:\Users\User\Downloads")


def resolve_default_out_dir(explicit: str | None) -> Path:
    if explicit:
        return Path(explicit)
    downloads = resolve_downloads_dir(None)
    if downloads:
        downloads.mkdir(parents=True, exist_ok=True)
        return downloads
    fallback = ROOT_DIR / ".build" / "ipk-output"
    fallback.mkdir(parents=True, exist_ok=True)
    return fallback


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--out-dir",
        default=None,
        help="Каталог для .ipk (по умолчанию: Downloads пользователя)",
    )
    parser.add_argument(
        "--downloads-dir",
        help="Устаревший алиас для --out-dir",
    )
    parser.add_argument(
        "--no-downloads-copy",
        action="store_true",
        help="Устаревший флаг: копия в Downloads больше не нужна, сборка сразу в out-dir",
    )
    args = parser.parse_args()

    version = read_make_value("PKG_VERSION")
    release = read_make_value("PKG_RELEASE")
    out_dir = resolve_default_out_dir(args.out_dir or args.downloads_dir)
    build_dir = ROOT_DIR / ".build" / "test-ipk-python"
    ipk = out_dir / f"{PKG_NAME}_{version}-{release}_all.ipk"

    shutil.rmtree(build_dir, ignore_errors=True)
    build_dir.mkdir(parents=True, exist_ok=True)
    out_dir.mkdir(parents=True, exist_ok=True)

    debian_binary = build_dir / "debian-binary"
    data_tar = build_dir / "data.tar.gz"
    control_tar = build_dir / "control.tar.gz"

    debian_binary.write_bytes(b"2.0\n")
    write_data_tar(data_tar)
    write_control_tar(control_tar, version, release)

    write_ipk_tar(ipk, [
        ("debian-binary", debian_binary.read_bytes()),
        ("data.tar.gz", data_tar.read_bytes()),
        ("control.tar.gz", control_tar.read_bytes()),
    ])

    print(ipk)


if __name__ == "__main__":
    main()
