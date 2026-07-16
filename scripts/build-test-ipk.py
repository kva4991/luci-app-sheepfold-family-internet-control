#!/usr/bin/env python3
import argparse
import gzip
import io
import json
import re
import shutil
import sys
import tarfile
import tempfile
import time
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
if str(SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPT_DIR))

from po2lmo import compile_po
from po2json import parse_po_entries


ROOT_DIR = Path(__file__).resolve().parents[1]
SOURCE_PKG_NAME = "luci-app-sheepfold-family-internet-control"
PKG_DIR = ROOT_DIR / "package" / SOURCE_PKG_NAME

VARIANTS = {
    "sheepfold": {
        "artifact": SOURCE_PKG_NAME,
        "description": "Sheepfold family internet control without AI components.",
    },
    "sheepfoldAi": {
        "artifact": "luci-app-sheepfold-ai-support",
        "description": "Sheepfold family internet control with AI Support.",
    },
}

AI_ONLY_PATHS = {
    "root/usr/libexec/sheepfold/sheepfold-activity-log",
    "root/usr/libexec/sheepfold/sheepfold-ai-gate",
    "root/usr/libexec/sheepfold/sheepfold-ai-handler",
    "root/usr/libexec/sheepfold/sheepfold-openssl-ensure",
    "htdocs/luci-static/resources/view/sheepfold/ai.js",
}
AI_ONLY_PREFIXES = (
    "root/usr/share/sheepfold/prompts/",
)
AI_TRANSLATION_PATTERN = re.compile(
    r"(?:\bai\b|xai|deepseek|gemini|grok|ии[- ]?помощ|провайдер ии|"
    r"журнал(?:ы|ов)? для ии|protected (?:per-device )?logs|individual logs|"
    r"per-device logs|openssl)",
    re.IGNORECASE,
)


def package_name(variant: str) -> str:
    # Одинаковое внутреннее имя превращает смену редакции в обновление одного пакета.
    # Разные имена остаются только у release-артефактов, чтобы человек различал IPK. §prodvar
    return SOURCE_PKG_NAME


def artifact_name(variant: str) -> str:
    return str(VARIANTS[variant]["artifact"])


def is_ai_only_path(package_relative_path: str) -> bool:
    normalized = package_relative_path.replace("\\", "/")
    return normalized in AI_ONLY_PATHS or any(
        normalized == prefix.rstrip("/") or normalized.startswith(prefix)
        for prefix in AI_ONLY_PREFIXES
    )


def strip_variant_blocks(text: str, marker: str) -> str:
    """Удаляет помеченные блоки до упаковки противоположного варианта. §prodvar"""
    pattern = re.compile(
        rf"^[ \t]*(?:/\*|#|//)[ \t]*SHEEPFOLD_{marker}_BEGIN[ \t]*(?:\*/)?[ \t]*\r?\n"
        r".*?"
        rf"^[ \t]*(?:/\*|#|//)[ \t]*SHEEPFOLD_{marker}_END[ \t]*(?:\*/)?[ \t]*(?:\r?\n|$)",
        re.MULTILINE | re.DOTALL,
    )
    previous = None
    while previous != text:
        previous = text
        text = pattern.sub("", text)
    return text


def unwrap_variant_blocks(text: str, marker: str) -> str:
    marker_line = re.compile(
        rf"^[ \t]*(?:/\*|#|//)[ \t]*SHEEPFOLD_{marker}_(?:BEGIN|END)[ \t]*(?:\*/)?[ \t]*(?:\r?\n|$)",
        re.MULTILINE,
    )
    return marker_line.sub("", text)


def standard_hardening_script() -> bytes:
    return b"""#!/bin/sh
set -eu
root="${1:-}"
required='\
/www/cgi-bin/sheepfold-api \
/usr/libexec/sheepfold/sheepfold-api-legacy \
/usr/libexec/sheepfold/sheepfold-router-control \
/usr/libexec/sheepfold/sheepfold-api-client-status \
 /usr/libexec/sheepfold/sheepfold-access-request \
 /usr/libexec/sheepfold/sheepfold-device-detector \
 /usr/libexec/sheepfold/sheepfold-firewall \
 /usr/libexec/sheepfold/sheepfold-schedule-evaluator \
 /usr/libexec/sheepfold/sheepfold-emergency-sites \
 /usr/libexec/sheepfold/sheepfold-site-lists \
 /usr/libexec/sheepfold/sheepfold-admin-notification \
 /usr/libexec/sheepfold/sheepfold-domain-policy'
for path in $required; do
    [ -f "$root$path" ] || { echo "Sheepfold hardening check failed: missing $path" >&2; exit 1; }
done
grep -q 'query_token_forbidden' "$root/www/cgi-bin/sheepfold-api"
for script in $required; do /bin/sh -n "$root$script"; done
exit 0
"""


def transform_standard_payload(target: str, data: bytes) -> bytes:
    if target == "./usr/libexec/sheepfold/sheepfold-runtime-hardening":
        return standard_hardening_script()
    try:
        text = data.decode("utf-8")
    except UnicodeDecodeError:
        return data
    text = strip_variant_blocks(text, "AI")
    text = unwrap_variant_blocks(text, "STANDARD")
    if target.endswith("/acl.d/luci-app-sheepfold-family-internet-control.json"):
        acl = json.loads(text)
        write_files = acl[SOURCE_PKG_NAME]["write"]["file"]
        write_files.pop("/usr/libexec/sheepfold/sheepfold-openssl-ensure", None)
        text = json.dumps(acl, ensure_ascii=False, indent=2) + "\n"
    if target.endswith("/PRIVACY_NOTICE.md"):
        text = """# Sheepfold local storage privacy notice

This storage belongs to the self-hosted Sheepfold installation. The standard
product does not include an AI assistant or per-device activity collection.
Configuration backups and administrative logs remain under the router owner's
control unless the owner deliberately exports them.

Never store passwords, access tokens, session cookies, or unmasked exports in
publicly accessible directories. Remove the storage device only after Sheepfold
has finished writing data.
"""
    if target.endswith("/sheepfold.css"):
        text = re.sub(r"(?ms)^\.sf-ai[^\{]*\{.*?^\}\s*", "", text)
    return text.encode("utf-8")


def transform_ai_payload(data: bytes) -> bytes:
    try:
        text = data.decode("utf-8")
    except UnicodeDecodeError:
        return data
    text = strip_variant_blocks(text, "STANDARD")
    return unwrap_variant_blocks(text, "AI").encode("utf-8")


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


def add_tree(tar: tarfile.TarFile, source: Path, target_prefix: str, variant: str) -> None:
    for path in sorted(source.rglob("*")):
        rel = path.relative_to(source).as_posix()
        package_relative = f"{source.name}/{rel}"
        if package_relative.startswith("htdocs/luci-static/resources/sheepfold/i18n/"):
            continue
        if variant == "sheepfold" and is_ai_only_path(package_relative):
            continue
        target = f"./{target_prefix.rstrip('/')}/{rel}" if target_prefix else f"./{rel}"
        target = target.replace("//", "/")

        if path.is_dir():
            add_directory(tar, target)
            continue

        mode = 0o755 if is_executable_ipk_target(target) else 0o644
        data = path.read_bytes()
        if variant == "sheepfold":
            data = transform_standard_payload(target, data)
        else:
            data = transform_ai_payload(data)
        add_bytes(tar, target, data, mode)


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


def write_control_tar(path: Path, version: str, release: str, variant: str) -> None:
    current_package = package_name(variant)
    ai_postinst_defaults = ""
    ai_cron_jobs = ""
    if variant == "sheepfoldAi":
        ai_postinst_defaults = """ensure_global_option ai_enabled '0'
ensure_global_option ai_provider 'none'
ensure_global_option ai_rate_limit_requests '20'
ensure_global_option ai_rate_limit_window_seconds '3600'
ensure_global_option ai_individual_logs '0'
ensure_global_option child_ai_parental_consent '0'
ensure_global_option child_ai_consent_version 'child-ai-v1'
ensure_global_option parent_ai_prompt_version 'v2'
ensure_global_option child_ai_prompt_version 'v1'
ensure_global_option deepseek_model 'deepseek-chat'
ensure_global_option deepseek_api_url 'https://api.deepseek.com/chat/completions'
ensure_global_option deepseek_api_key ''
ensure_global_option gemini_model 'gemini-2.5-flash'
ensure_global_option gemini_api_url 'https://generativelanguage.googleapis.com/v1beta/models'
ensure_global_option gemini_api_key ''
ensure_global_option grok_model 'grok-3-mini'
ensure_global_option grok_api_url 'https://api.x.ai/v1/chat/completions'
ensure_global_option grok_api_key ''
"""
        # Эти задания нужны только AI Support: Standard не содержит sheepfold-activity-log.
        ai_cron_jobs = """5 2 * * * /usr/libexec/sheepfold/sheepfold-maintenance-window && /usr/libexec/sheepfold/sheepfold-activity-log rotate >/dev/null 2>&1
55 4 * * * /usr/libexec/sheepfold/sheepfold-activity-log rotate >/dev/null 2>&1
"""
    control = f"""Package: {current_package}
Version: {version}-{release}
Architecture: all
Maintainer: kva4991
Depends: luci-base, firewall4, rpcd, uci, uclient-fetch, ca-bundle, uhttpd, uhttpd-mod-tls, curl
Conflicts: luci-app-sheepfold-ai-support
Replaces: luci-app-sheepfold-ai-support
Provides: sheepfold-family-internet-control
Section: luci
Priority: optional
Installed-Size: 10240
Description: {VARIANTS[variant]["description"]}
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
        # Временную копию конфига удаляет updater только после проверки результата opkg (§updsafe).
        rm -f /tmp/sheepfold/update/*.ipk 2>/dev/null || true
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
uci -q set sheepfold.global.product_variant='{variant}'
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
{ai_postinst_defaults}ensure_global_option vk_access_token ''
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
old_site_allowlist_sources='UT1 child | https://dsi.ut-capitole.fr/blacklists/index_en.php#child'
default_site_allowlist_sources='UT1 child | https://dsi.ut-capitole.fr/blacklists/download/child.tar.gz'
current_site_allowlist_sources="$(uci -q get sheepfold.global.site_allowlist_sources 2>/dev/null || true)"
if [ -z "$current_site_allowlist_sources" ] || [ "$current_site_allowlist_sources" = "$old_site_allowlist_sources" ]; then
        uci -q set sheepfold.global.site_allowlist_sources="$default_site_allowlist_sources"
fi
ensure_global_option site_blocklist_mode 'except_allowlist_admins'
old_site_blocklist_sources='UT1 adult, malware, phishing, gambling, games, vpn | https://dsi.ut-capitole.fr/blacklists/index_en.php; StevenBlack hosts gambling-porn | https://github.com/StevenBlack/hosts; HaGeZi Threat Intelligence Feeds | https://github.com/hagezi/dns-blocklists; URLhaus malware URLs | https://urlhaus.abuse.ch/api/'
default_site_blocklist_sources='HaGeZi NSFW | https://raw.githubusercontent.com/hagezi/dns-blocklists/main/adblock/nsfw.txt; HaGeZi Gambling mini | https://raw.githubusercontent.com/hagezi/dns-blocklists/main/adblock/gambling.mini.txt; HaGeZi Threat Intelligence mini | https://raw.githubusercontent.com/hagezi/dns-blocklists/main/adblock/tif.mini.txt; URLhaus malware domains | https://urlhaus.abuse.ch/downloads/hostfile/'
current_site_blocklist_sources="$(uci -q get sheepfold.global.site_blocklist_sources 2>/dev/null || true)"
if [ -z "$current_site_blocklist_sources" ] || [ "$current_site_blocklist_sources" = "$old_site_blocklist_sources" ]; then
        uci -q set sheepfold.global.site_blocklist_sources="$default_site_blocklist_sources"
fi
ensure_global_option site_lists_update_interval 'weekly'
ensure_global_option log_retention '3d'
ensure_global_option offline_device_retention_days '90'
ensure_global_option app_port '5201'
ensure_global_option feedback_endpoint ''
ensure_global_option feedback_install_id ''
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
case "$app_port" in ''|*[!0-9]*) app_port=5201 ;; esac
[ "$app_port" -ge 1 ] && [ "$app_port" -le 65535 ] || app_port=5201
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
install_sheepfold_cron() {{
        cron_file='/etc/crontabs/root'
        mkdir -p /etc/crontabs
        tmp="$cron_file.sheepfold.tmp"
        if [ -f "$cron_file" ]; then
                awk '
                /^# BEGIN SHEEPFOLD MANAGED JOBS$/ {{ skip=1; next }}
                /^# END SHEEPFOLD MANAGED JOBS$/   {{ skip=0; next }}
                !skip {{ print }}
                ' "$cron_file" > "$tmp"
        else
                : > "$tmp"
        fi
        cat >> "$tmp" <<'EOF'
# BEGIN SHEEPFOLD MANAGED JOBS
* * * * * /usr/libexec/sheepfold/sheepfold-firewall sync >/dev/null 2>&1
{ai_cron_jobs}10 2 * * * /usr/libexec/sheepfold/sheepfold-maintenance-window && /usr/libexec/sheepfold/sheepfold-log-storage archive-push >/dev/null 2>&1
0 5 * * * /usr/libexec/sheepfold/sheepfold-log-storage archive-push >/dev/null 2>&1
# END SHEEPFOLD MANAGED JOBS
EOF
        chmod 600 "$tmp"
        mv -f "$tmp" "$cron_file"
        [ -x /etc/init.d/cron ] && /etc/init.d/cron restart >/dev/null 2>&1 || true
}}
install_sheepfold_cron
rm -f /var/luci-indexcache* 2>/dev/null || true
rm -f /tmp/luci-indexcache* 2>/dev/null || true
rm -f /tmp/luci-modulecache/* 2>/dev/null || true
[ -x /etc/init.d/rpcd ] && /etc/init.d/rpcd reload || true
[ -x /etc/init.d/sheepfold ] && /etc/init.d/sheepfold enable || true
[ -x /etc/init.d/sheepfold ] && /etc/init.d/sheepfold restart || true
exit 0
""".encode("utf-8")

    prerm = """#!/bin/sh
[ -n "${IPKG_INSTROOT}" ] && exit 0
[ -x /usr/libexec/sheepfold/sheepfold-site-lists ] && \
        /usr/libexec/sheepfold/sheepfold-site-lists cron-remove >/dev/null 2>&1 || true
[ -x /usr/libexec/sheepfold/sheepfold-domain-policy ] && \
        /usr/libexec/sheepfold/sheepfold-domain-policy clear >/dev/null 2>&1 || true
# Удаляем только собственные firewall-объекты и cron-блок Sheepfold.
[ -x /usr/libexec/sheepfold/sheepfold-firewall ] && \
        /usr/libexec/sheepfold/sheepfold-firewall clear >/dev/null 2>&1 || true
cron_file='/etc/crontabs/root'
if [ -f "$cron_file" ]; then
        tmp="$cron_file.sheepfold.tmp"
        awk '
        /^# BEGIN SHEEPFOLD MANAGED JOBS$/ { skip=1; next }
        /^# END SHEEPFOLD MANAGED JOBS$/   { skip=0; next }
        !skip { print }
        ' "$cron_file" > "$tmp" && {
                chmod 600 "$tmp"
                mv -f "$tmp" "$cron_file"
        }
fi
[ -x /etc/init.d/cron ] && /etc/init.d/cron restart >/dev/null 2>&1 || true
exit 0
""".encode("utf-8")

    with open_gzip_tar(path) as tar:
        add_bytes(tar, "./control", control, 0o644)
        add_bytes(tar, "./preinst", preinst, 0o755)
        add_bytes(tar, "./postinst", postinst, 0o755)
        add_bytes(tar, "./prerm", prerm, 0o755)


def filter_standard_po(source: str) -> str:
    blocks = re.split(r"(?:\r?\n){2,}", source)
    kept = []
    for block in blocks:
        lowered = block.lower()
        if AI_TRANSLATION_PATTERN.search(lowered):
            continue
        kept.append(block)
    return "\n\n".join(kept).rstrip() + "\n"


def bundled_i18n_files(variant: str) -> list[tuple[str, bytes, int]]:
    files: list[tuple[str, bytes, int]] = []
    po_catalogs = [
        ("ru", PKG_DIR / "po/ru/sheepfold.po"),
        ("zh_Hans", ROOT_DIR / "po/zh_Hans/sheepfold.po"),
    ]
    for lang, po_path in po_catalogs:
        if not po_path.is_file():
            continue
        source = po_path.read_text(encoding="utf-8")
        if variant == "sheepfold":
            source = filter_standard_po(source)
        with tempfile.NamedTemporaryFile("w", suffix=".po", encoding="utf-8", delete=False) as temp_po:
            temp_po.write(source)
            temp_po_path = Path(temp_po.name)
        try:
            lmo_data = compile_po(temp_po_path)
        finally:
            temp_po_path.unlink(missing_ok=True)
        files.append((f"./usr/lib/lua/luci/i18n/sheepfold.{lang}.lmo", lmo_data, 0o644))
        json_data = json.dumps(
            parse_po_entries(source), ensure_ascii=False, separators=(",", ":")
        ).encode("utf-8")
        files.append((
            f"./www/luci-static/resources/sheepfold/i18n/{lang}.json",
            json_data,
            0o644,
        ))
    return files


def write_data_tar(path: Path, variant: str) -> None:
    with open_gzip_tar(path) as tar:
        add_tree(tar, PKG_DIR / "root", "", variant)
        add_tree(tar, PKG_DIR / "htdocs", "www", variant)
        for target, data, mode in bundled_i18n_files(variant):
            ensure_tar_directories(tar, target)
            add_bytes(tar, target, data, mode)


def write_ipk_tar(path: Path, members: list[tuple[str, bytes]]) -> None:
    with open_gzip_tar(path) as tar:
        for name, data in members:
            add_bytes(tar, f"./{name}", data, 0o644)


def resolve_default_out_dir(explicit: str | None) -> Path:
    if explicit:
        return Path(explicit)
    artifact_dir = ROOT_DIR / ".build" / "ipk-output"
    artifact_dir.mkdir(parents=True, exist_ok=True)
    return artifact_dir


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--variant",
        choices=["sheepfold", "sheepfoldAi", "all"],
        default="sheepfold",
        help="Вариант продукта; all собирает оба IPK",
    )
    parser.add_argument(
        "--out-dir",
        default=None,
        help="Каталог для .ipk (по умолчанию: .build/ipk-output внутри репозитория)",
    )
    args = parser.parse_args()

    version = read_make_value("PKG_VERSION")
    release = read_make_value("PKG_RELEASE")
    out_dir = resolve_default_out_dir(args.out_dir)
    build_root = ROOT_DIR / ".build"
    build_root.mkdir(parents=True, exist_ok=True)
    out_dir.mkdir(parents=True, exist_ok=True)
    selected_variants = list(VARIANTS) if args.variant == "all" else [args.variant]
    built = []
    for variant in selected_variants:
        build_dir = Path(tempfile.mkdtemp(prefix=f"sheepfold-{variant}-ipk-", dir=build_root))
        ipk = out_dir / f"{artifact_name(variant)}_{version}-{release}_all.ipk"
        try:
            debian_binary = build_dir / "debian-binary"
            data_tar = build_dir / "data.tar.gz"
            control_tar = build_dir / "control.tar.gz"
            debian_binary.write_bytes(b"2.0\n")
            write_data_tar(data_tar, variant)
            write_control_tar(control_tar, version, release, variant)
            write_ipk_tar(ipk, [
                ("debian-binary", debian_binary.read_bytes()),
                ("data.tar.gz", data_tar.read_bytes()),
                ("control.tar.gz", control_tar.read_bytes()),
            ])
        finally:
            shutil.rmtree(build_dir, ignore_errors=True)
        built.append(ipk)

    for ipk in built:
        print(ipk)


if __name__ == "__main__":
    main()
