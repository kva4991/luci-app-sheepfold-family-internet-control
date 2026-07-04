#!/bin/sh
set -eu

OWNER="kva4991"
REPO="luci-app-sheepfold-family-internet-control"
PACKAGE="luci-app-sheepfold-family-internet-control"
AGREEMENT_URL="https://github.com/${OWNER}/${REPO}/blob/main/docs/user-agreement.ru.md"

echo "Sheepfold Family Internet Control installer"
echo "Repository: ${OWNER}/${REPO}"

if [ ! -r /etc/openwrt_release ]; then
    echo "ERROR: This installer must be run on OpenWRT." >&2
    exit 1
fi

. /etc/openwrt_release

echo "Detected OpenWRT: ${DISTRIB_DESCRIPTION:-unknown}"
echo "Package: ${PACKAGE}"

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
printf "Type yes, y, or да to enable automatic setup, or press Enter for reduced/manual mode: "
if ! read -r AUTO_CONFIGURE_ACCEPTED; then
    AUTO_CONFIGURE_ACCEPTED=""
fi

AUTO_CONFIGURE=0
DETECTION_MODE="reduced"
NO_RESTRICTIONS_AUTO_ASSIGN=0
case "${AUTO_CONFIGURE_ACCEPTED}" in
    yes|YES|Yes|y|Y|да|Да|ДА)
        AUTO_CONFIGURE=1
        DETECTION_MODE="full"
        NO_RESTRICTIONS_AUTO_ASSIGN=1
        echo "Automatic setup enabled."
        ;;
    *)
        echo "Reduced/manual setup selected."
        ;;
esac

package_installed() {
    opkg status "$1" >/dev/null 2>&1
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

if [ -r /etc/config/sheepfold ] && command -v uci >/dev/null 2>&1; then
    echo "Applying detected integration mode to existing Sheepfold config."
    uci -q set sheepfold.global.integration_mode="${INTEGRATION_MODE}"
    uci -q set sheepfold.global.adguard_integration="${ADGUARD_DETECTED}"
    uci -q set sheepfold.global.podkop_compatibility="${PODKOP_DETECTED}"
    uci -q set sheepfold.global.auto_configure="${AUTO_CONFIGURE}"
    uci -q set sheepfold.global.detection_mode="${DETECTION_MODE}"
    uci -q set sheepfold.global.no_restrictions_auto_assign="${NO_RESTRICTIONS_AUTO_ASSIGN}"
    uci -q set sheepfold.adguard.enabled="${ADGUARD_DETECTED}"
    uci -q set sheepfold.podkop.enabled="${PODKOP_DETECTED}"
    uci -q commit sheepfold
else
    echo "Sheepfold config is not installed yet; the package installer should apply this mode after installation."
    echo "Automatic setup choice:"
    echo "  auto_configure=${AUTO_CONFIGURE}"
    echo "  detection_mode=${DETECTION_MODE}"
    echo "  no_restrictions_auto_assign=${NO_RESTRICTIONS_AUTO_ASSIGN}"
fi

echo "This is a scaffold installer."
echo "The first release package is not published yet."
echo "Next implementation step: download the latest GitHub Release .ipk and install it with opkg."

exit 0
