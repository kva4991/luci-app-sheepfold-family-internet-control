#!/usr/bin/env python3
import argparse
import io
import os
import shutil
import tarfile
import time
from pathlib import Path


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


def add_tree(tar: tarfile.TarFile, source: Path, target_prefix: str) -> None:
    executable_paths = {
        "./etc/init.d/sheepfold",
        "./etc/uci-defaults/50_luci-sheepfold",
        "./etc/hotplug.d/button/90-sheepfold-wps",
        "./usr/libexec/sheepfold/sheepfold-service",
        "./usr/libexec/sheepfold/sheepfold-device-detector",
        "./usr/libexec/sheepfold/sheepfold-log",
        "./usr/libexec/sheepfold/sheepfold-updater",
        "./usr/libexec/sheepfold/sheepfold-router-control",
        "./www/cgi-bin/sheepfold-blocked",
    }

    for path in sorted(source.rglob("*")):
        rel = path.relative_to(source).as_posix()
        target = f"./{target_prefix.rstrip('/')}/{rel}" if target_prefix else f"./{rel}"
        target = target.replace("//", "/")

        if path.is_dir():
            add_directory(tar, target)
            continue

        mode = 0o755 if target in executable_paths else 0o644
        add_bytes(tar, target, path.read_bytes(), mode)


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
    conffiles = b"/etc/config/sheepfold\n"

    postinst = f"""#!/bin/sh
[ -n "${{IPKG_INSTROOT}}" ] && exit 0
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
uci -q set sheepfold.child_1.name='Первый ребёнок'
uci -q set sheepfold.child_1.protected='0'
uci -q set sheepfold.child_1.auto_assignable='0'
uci -q set sheepfold.child_1.description='Default first child group'
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
rm -f /var/luci-indexcache* 2>/dev/null || true
rm -f /tmp/luci-indexcache* 2>/dev/null || true
rm -f /tmp/luci-modulecache/* 2>/dev/null || true
[ -x /etc/init.d/rpcd ] && /etc/init.d/rpcd reload || true
[ -x /etc/init.d/sheepfold ] && /etc/init.d/sheepfold enable || true
[ -x /etc/init.d/sheepfold ] && /etc/init.d/sheepfold restart || true
exit 0
""".encode("utf-8")

    with tarfile.open(path, "w:gz", format=tarfile.GNU_FORMAT) as tar:
        add_bytes(tar, "./control", control, 0o644)
        add_bytes(tar, "./conffiles", conffiles, 0o644)
        add_bytes(tar, "./postinst", postinst, 0o755)


def write_data_tar(path: Path) -> None:
    with tarfile.open(path, "w:gz", format=tarfile.GNU_FORMAT) as tar:
        add_tree(tar, PKG_DIR / "root", "")
        add_tree(tar, PKG_DIR / "htdocs", "www")


def ar_header(name: str, data: bytes) -> bytes:
    if len(name) > 15:
        raise RuntimeError(f"ar member name is too long: {name}")

    return (
        f"{name + '/':<16}"
        f"{int(time.time()):<12}"
        f"{0:<6}"
        f"{0:<6}"
        f"{0o644:<8o}"
        f"{len(data):<10}"
        "`\n"
    ).encode("ascii")


def write_ipk_ar(path: Path, members: list[tuple[str, bytes]]) -> None:
    with path.open("wb") as handle:
        handle.write(b"!<arch>\n")
        for name, data in members:
            handle.write(ar_header(name, data))
            handle.write(data)
            if len(data) % 2:
                handle.write(b"\n")


def resolve_downloads_dir(value: str | None) -> Path | None:
    if value:
        return Path(value)
    if os.environ.get("USERPROFILE"):
        return Path(os.environ["USERPROFILE"]) / "Downloads"
    if os.environ.get("HOME"):
        return Path(os.environ["HOME"]) / "Downloads"
    return None


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--out-dir", default=str(ROOT_DIR / "dist"))
    parser.add_argument("--downloads-dir")
    parser.add_argument("--no-downloads-copy", action="store_true")
    args = parser.parse_args()

    version = read_make_value("PKG_VERSION")
    release = read_make_value("PKG_RELEASE")
    out_dir = Path(args.out_dir)
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

    write_ipk_ar(ipk, [
        ("debian-binary", debian_binary.read_bytes()),
        ("control.tar.gz", control_tar.read_bytes()),
        ("data.tar.gz", data_tar.read_bytes()),
    ])

    print(ipk)

    if not args.no_downloads_copy:
        downloads_dir = resolve_downloads_dir(args.downloads_dir)
        if downloads_dir and downloads_dir.is_dir():
            target = downloads_dir / ipk.name
            shutil.copy2(ipk, target)
            print(target)


if __name__ == "__main__":
    main()
