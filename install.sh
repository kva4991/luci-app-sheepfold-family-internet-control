#!/bin/sh
set -eu

OWNER="kva4991"
REPO="luci-app-sheepfold-family-internet-control"
INSTALLED_PACKAGE="luci-app-sheepfold-family-internet-control"
LEGACY_AI_PACKAGE="luci-app-sheepfold-ai-support"
ASSET_PACKAGE="luci-app-sheepfold-family-internet-control"
AGREEMENT_URL="https://github.com/${OWNER}/${REPO}/blob/main/docs/user-agreement.ru.md"
RELEASE_API="https://api.github.com/repos/${OWNER}/${REPO}/releases/latest"
INSTALL_DIR="/tmp/sheepfold-install"
PACKAGE_FILE="${INSTALL_DIR}/${ASSET_PACKAGE}.ipk"

echo "Sheepfold Family Internet Control installer"
echo "Repository: ${OWNER}/${REPO}"

if [ ! -r /etc/openwrt_release ]; then
    echo "ERROR: This installer must be run on OpenWRT." >&2
    exit 1
fi

. /etc/openwrt_release

echo "Detected OpenWRT: ${DISTRIB_DESCRIPTION:-unknown}"

echo ""
echo "Choose application language / Выберите язык приложения:"
echo "  Русский: ru"
echo "  English: en"
echo "  简体中文: zh_Hans"
printf "Language [ru]: "
if ! read -r APP_LANGUAGE; then
    APP_LANGUAGE=""
fi

case "${APP_LANGUAGE}" in
    ""|ru|RU|Ru)
        APP_LANGUAGE="ru"
        ;;
    en|EN|En)
        APP_LANGUAGE="en"
        ;;
    zh_Hans|zh_hans|zh|ZH)
        APP_LANGUAGE="zh_Hans"
        ;;
    *)
        echo "Unknown language. Using Russian / Неизвестный язык. Используется русский." >&2
        APP_LANGUAGE="ru"
        ;;
esac

echo ""
echo "Choose Sheepfold product / Выберите вариант Sheepfold:"
echo "  1: Sheepfold (without AI / без ИИ)"
echo "  2: Sheepfold - AI Support"
printf "Product [1]: "
if ! read -r PRODUCT_CHOICE; then
    PRODUCT_CHOICE=""
fi

case "${PRODUCT_CHOICE}" in
    ""|1|sheepfold)
        PRODUCT_VARIANT="sheepfold"
        ASSET_PACKAGE="luci-app-sheepfold-family-internet-control"
        ;;
    2|sheepfoldAi|ai|AI)
        PRODUCT_VARIANT="sheepfoldAi"
        ASSET_PACKAGE="luci-app-sheepfold-ai-support"
        ;;
    *)
        echo "Installation cancelled: unknown Sheepfold product." >&2
        exit 1
        ;;
esac
PACKAGE_FILE="${INSTALL_DIR}/${ASSET_PACKAGE}.ipk"
echo "Release artifact: ${ASSET_PACKAGE}"

if ! command -v opkg >/dev/null 2>&1; then
    echo "ERROR: opkg was not found." >&2
    exit 1
fi

echo ""
echo "Before installation, read the user agreement and data processing consent:"
echo "${AGREEMENT_URL}"
echo ""
echo "By continuing, you confirm that you accept the agreement and are responsible for lawful use of Sheepfold."
printf "Type yes, y, or да to continue: "
if ! read -r AGREEMENT_ACCEPTED; then
    echo "Installation cancelled: agreement was not accepted." >&2
    exit 1
fi

case "${AGREEMENT_ACCEPTED}" in
    yes|YES|Yes|y|Y|да|Да|ДА)
        echo "Agreement accepted."
        ;;
    *)
        echo "Installation cancelled: agreement was not accepted." >&2
        exit 1
        ;;
esac

echo ""
echo "Apply Sheepfold automatic setup?"
echo "If enabled, Sheepfold may automatically configure safe defaults and put confidently detected home infrastructure devices"
echo "such as NAS, Home Assistant, AdGuard Home, Proxmox, video recorders, and smart-home hubs into the No restrictions group."
echo "The blocklist will still override this group."
printf "Press Enter or type yes/y/да to use full automatic setup, or type no/n/нет for reduced mode: "
if ! read -r AUTO_CONFIGURE_ACCEPTED; then
    AUTO_CONFIGURE_ACCEPTED=""
fi

AUTO_CONFIGURE=1
DETECTION_MODE="full"
NO_RESTRICTIONS_AUTO_ASSIGN=1
case "${AUTO_CONFIGURE_ACCEPTED}" in
    ""|yes|YES|Yes|y|Y|да|Да|ДА)
        AUTO_CONFIGURE=1
        DETECTION_MODE="full"
        NO_RESTRICTIONS_AUTO_ASSIGN=1
        echo "Automatic setup enabled."
        ;;
    no|NO|No|n|N|нет|Нет|НЕТ)
        AUTO_CONFIGURE=1
        DETECTION_MODE="reduced"
        NO_RESTRICTIONS_AUTO_ASSIGN=1
        echo "Reduced automatic setup selected."
        ;;
    *)
        echo "Installation cancelled: automatic setup answer was not understood." >&2
        exit 1
        ;;
esac

package_installed() {
    opkg status "$1" 2>/dev/null | grep -q '^Status: .* installed$'
}

service_exists() {
    [ -x "/etc/init.d/$1" ]
}

ADGUARD_DETECTED=0
PODKOP_DETECTED=0

if package_installed adguardhome || package_installed luci-app-adguardhome || service_exists AdGuardHome || service_exists adguardhome; then
    ADGUARD_DETECTED=1
fi

if package_installed podkop || package_installed luci-app-podkop || service_exists podkop; then
    PODKOP_DETECTED=1
fi

INTEGRATION_MODE="none"
if [ "${ADGUARD_DETECTED}" -eq 1 ] && [ "${PODKOP_DETECTED}" -eq 1 ]; then
    INTEGRATION_MODE="adguard_podkop"
elif [ "${ADGUARD_DETECTED}" -eq 1 ]; then
    INTEGRATION_MODE="adguard"
elif [ "${PODKOP_DETECTED}" -eq 1 ]; then
    INTEGRATION_MODE="podkop"
fi

echo "Detected integrations:"
echo "  AdGuard Home: ${ADGUARD_DETECTED}"
echo "  Podkop: ${PODKOP_DETECTED}"
echo "Recommended Sheepfold integration mode: ${INTEGRATION_MODE}"

apply_selected_settings() {
    command -v uci >/dev/null 2>&1 || return 0
    [ -r /etc/config/sheepfold ] || return 0

    echo "Applying selected Sheepfold settings to existing config."
    uci -q set sheepfold.global.language="${APP_LANGUAGE}"
    uci -q set sheepfold.global.product_variant="${PRODUCT_VARIANT}"
    uci -q set sheepfold.global.luci_language_synced='1'
    # Тот же выбор применяем и к языку интерфейса LuCI, чтобы админка сразу
    # открывалась на выбранном языке, а не только внутренние строки Sheepfold.
    uci -q get luci.main >/dev/null 2>&1 || uci -q set luci.main=core
    uci -q set luci.main.lang="${APP_LANGUAGE}" 2>/dev/null || true
    # Повторная установка не должна отменять ручной выбор четырёх режимов совместимости.
    if [ "$(uci -q get sheepfold.global.integration_mode_user_set 2>/dev/null || printf 0)" != "1" ]; then
        uci -q set sheepfold.global.integration_mode="${INTEGRATION_MODE}"
        uci -q set sheepfold.global.integration_mode_source='detected'
        uci -q set sheepfold.global.integration_mode_user_set='0'
    else
        echo "Keeping manually selected integration mode: $(uci -q get sheepfold.global.integration_mode 2>/dev/null || printf none)"
    fi
    uci -q set sheepfold.global.adguard_integration="${ADGUARD_DETECTED}"
    uci -q set sheepfold.global.podkop_compatibility="${PODKOP_DETECTED}"
    uci -q set sheepfold.global.auto_configure="${AUTO_CONFIGURE}"
    uci -q set sheepfold.global.detection_mode="${DETECTION_MODE}"
    uci -q set sheepfold.global.no_restrictions_auto_assign="${NO_RESTRICTIONS_AUTO_ASSIGN}"
    uci -q set sheepfold.adguard.enabled="${ADGUARD_DETECTED}"
    uci -q set sheepfold.podkop.enabled="${PODKOP_DETECTED}"
    uci -q commit sheepfold
    uci -q commit luci 2>/dev/null || true
}

if [ ! -r /etc/config/sheepfold ]; then
    mkdir -p /etc/sheepfold
    printf '%s\n' "${APP_LANGUAGE}" > /etc/sheepfold/install.language
    chmod 600 /etc/sheepfold/install.language 2>/dev/null || true
    echo "Sheepfold config is not installed yet; selected values will be applied after package installation."
    echo "Automatic setup choice:"
    echo "  language=${APP_LANGUAGE}"
    echo "  auto_configure=${AUTO_CONFIGURE}"
    echo "  detection_mode=${DETECTION_MODE}"
    echo "  no_restrictions_auto_assign=${NO_RESTRICTIONS_AUTO_ASSIGN}"
else
    echo "Existing Sheepfold settings were found and will be preserved."
fi

fetch_to_file() {
    url="$1"
    destination="$2"

    if command -v uclient-fetch >/dev/null 2>&1; then
        uclient-fetch -q -O "$destination" "$url"
    elif command -v wget >/dev/null 2>&1; then
        wget -q -O "$destination" "$url"
    elif command -v curl >/dev/null 2>&1; then
        curl -fL --connect-timeout 20 --max-time 300 -o "$destination" "$url"
    else
        echo "ERROR: uclient-fetch, wget, or curl is required." >&2
        return 1
    fi
}

mkdir -p "$INSTALL_DIR"
release_json="${INSTALL_DIR}/latest-release.json"

echo "Checking the latest stable GitHub release..."
if ! fetch_to_file "$RELEASE_API" "$release_json"; then
    echo "ERROR: Failed to download release metadata from GitHub." >&2
    exit 1
fi

# GitHub latest excludes drafts and pre-releases. Choose only the architecture-independent
# OpenWrt package published by this project, as Sheepfold does not contain native binaries.
package_url="$(sed -n 's/.*"browser_download_url"[[:space:]]*:[[:space:]]*"\([^"]*_all\.ipk\)".*/\1/p' "$release_json" | grep "/${ASSET_PACKAGE}_" | head -n 1)"
if [ -z "$package_url" ]; then
    echo "ERROR: The latest stable release does not contain the Sheepfold all.ipk package." >&2
    exit 1
fi

echo "Downloading Sheepfold package..."
if ! fetch_to_file "$package_url" "$PACKAGE_FILE"; then
    echo "ERROR: Failed to download Sheepfold package." >&2
    exit 1
fi

if [ ! -s "$PACKAGE_FILE" ]; then
    echo "ERROR: Downloaded package is empty." >&2
    exit 1
fi

echo "Installing Sheepfold with opkg..."
CONFIG_BACKUP="${INSTALL_DIR}/sheepfold.config.before-install"
if [ -s /etc/config/sheepfold ]; then
    cp /etc/config/sheepfold "$CONFIG_BACKUP"
    chmod 600 "$CONFIG_BACKUP" 2>/dev/null || true
fi

CURRENT_PRODUCT_VARIANT="$(uci -q get sheepfold.global.product_variant 2>/dev/null || true)"
CURRENT_PACKAGE_VERSION="$(opkg status "$INSTALLED_PACKAGE" 2>/dev/null | sed -n 's/^Version: //p' | sed -n '1p')"
TARGET_PACKAGE_VERSION="$(basename "$package_url" | sed -n "s/^${ASSET_PACKAGE}_\\([^_]*\\)_all\\.ipk$/\\1/p" | sed -n '1p')"
if [ -z "$CURRENT_PRODUCT_VARIANT" ]; then
    if package_installed "$LEGACY_AI_PACKAGE"; then
        CURRENT_PRODUCT_VARIANT="sheepfoldAi"
    elif package_installed "$INSTALLED_PACKAGE"; then
        CURRENT_PRODUCT_VARIANT="sheepfold"
    fi
fi

# На одной версии opkg иначе ответит "up to date" и не заменит payload редакции.
# Конфиг вынесен в отдельную копию, потому что --force-reinstall штатно удаляет
# установленный пакет перед немедленной установкой выбранного IPK. §prodvar
if package_installed "$INSTALLED_PACKAGE" && \
   [ "$CURRENT_PRODUCT_VARIANT" != "$PRODUCT_VARIANT" ] && \
   [ -n "$CURRENT_PACKAGE_VERSION" ] && \
   [ "$CURRENT_PACKAGE_VERSION" = "$TARGET_PACKAGE_VERSION" ]; then
    echo "Switching Sheepfold product while preserving the existing configuration..."
    if opkg --force-reinstall install "$PACKAGE_FILE"; then
        INSTALL_CODE=0
    else
        INSTALL_CODE="$?"
    fi
else
    if opkg install "$PACKAGE_FILE"; then
        INSTALL_CODE=0
    else
        INSTALL_CODE="$?"
    fi
fi

if [ "$INSTALL_CODE" -ne 0 ]; then
    if [ -s "$CONFIG_BACKUP" ]; then
        cp "$CONFIG_BACKUP" /etc/config/sheepfold
        chmod 600 /etc/config/sheepfold 2>/dev/null || true
        echo "Previous Sheepfold settings were restored."
    fi
    echo "ERROR: Sheepfold installation failed with code ${INSTALL_CODE}." >&2
    exit "$INSTALL_CODE"
fi

apply_selected_settings

if [ "$(uci -q get sheepfold.global.product_variant 2>/dev/null || true)" != "$PRODUCT_VARIANT" ]; then
    [ ! -s "$CONFIG_BACKUP" ] || cp "$CONFIG_BACKUP" /etc/config/sheepfold
    echo "ERROR: The selected Sheepfold product was not activated; previous settings were restored." >&2
    exit 1
fi
rm -rf "$INSTALL_DIR"

echo "Sheepfold installation completed."

exit 0
