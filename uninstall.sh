#!/bin/sh
set -u

PACKAGE="luci-app-sheepfold-family-internet-control"
REPORT="/tmp/sheepfold-uninstall-report.txt"
STAMP="$(date +%Y%m%d-%H%M%S 2>/dev/null || echo unknown-time)"
BACKUP_DIR="/root/sheepfold-backup-${STAMP}"

: > "${REPORT}"

log() {
    echo "$*" | tee -a "${REPORT}"
}

run() {
    log "+ $*"
    "$@" >> "${REPORT}" 2>&1
    STATUS="$?"
    if [ "${STATUS}" -ne 0 ]; then
        log "WARN: command failed with status ${STATUS}"
    fi
    return "${STATUS}"
}

log "Sheepfold Family Internet Control uninstaller"
log "Package: ${PACKAGE}"
log "Report: ${REPORT}"

if [ ! -r /etc/openwrt_release ]; then
    log "ERROR: This uninstaller must be run on OpenWRT."
    exit 1
fi

if ! command -v opkg >/dev/null 2>&1; then
    log "ERROR: opkg was not found."
    exit 1
fi

mkdir -p "${BACKUP_DIR}"
log "Backup directory: ${BACKUP_DIR}"

if [ -r /etc/config/sheepfold ]; then
    run cp -p /etc/config/sheepfold "${BACKUP_DIR}/sheepfold.config"
fi

if [ -d /etc/sheepfold ]; then
    run cp -R -p /etc/sheepfold "${BACKUP_DIR}/etc-sheepfold"
fi

if [ -d /var/lib/sheepfold ]; then
    run cp -R -p /var/lib/sheepfold "${BACKUP_DIR}/var-lib-sheepfold"
fi

log "Stopping Sheepfold service if it exists."
if [ -x /etc/init.d/sheepfold ]; then
    run /etc/init.d/sheepfold stop
    run /etc/init.d/sheepfold disable
else
    log "Sheepfold init script was not found."
fi

if opkg status "${PACKAGE}" >/dev/null 2>&1; then
    log "Removing package, keeping user settings and client lists."
    run opkg remove "${PACKAGE}"
else
    log "Package is not installed according to opkg."
fi

if [ -r "${BACKUP_DIR}/sheepfold.config" ] && [ ! -e /etc/config/sheepfold ]; then
    log "Restoring /etc/config/sheepfold so client lists are not lost."
    run cp -p "${BACKUP_DIR}/sheepfold.config" /etc/config/sheepfold
fi

log ""
log "Remaining Sheepfold-related UCI settings:"
if command -v uci >/dev/null 2>&1 && uci -q show sheepfold >/dev/null 2>&1; then
    uci -q show sheepfold | tee -a "${REPORT}"
else
    log "No Sheepfold UCI config was found."
fi

log ""
log "Remaining Sheepfold-related files or directories:"
FOUND_PATHS=0
for PATH_TO_CHECK in \
    /etc/config/sheepfold \
    /etc/sheepfold \
    /var/lib/sheepfold \
    /usr/share/sheepfold \
    /usr/libexec/sheepfold \
    /etc/init.d/sheepfold \
    /www/luci-static/resources/view/sheepfold \
    /usr/lib/lua/luci/controller/sheepfold.lua \
    /usr/lib/lua/luci/model/cbi/sheepfold
do
    if [ -e "${PATH_TO_CHECK}" ]; then
        FOUND_PATHS=1
        ls -ld "${PATH_TO_CHECK}" | tee -a "${REPORT}"
    fi
done

if [ "${FOUND_PATHS}" -eq 0 ]; then
    log "No known Sheepfold paths remain."
fi

log ""
log "Remaining nftables rules containing 'sheepfold':"
if command -v nft >/dev/null 2>&1; then
    NFT_LINES="$(nft list ruleset 2>/dev/null | grep -i sheepfold || true)"
    if [ -n "${NFT_LINES}" ]; then
        echo "${NFT_LINES}" | tee -a "${REPORT}"
    else
        log "No Sheepfold nftables rules were found."
    fi
else
    log "nft command was not found."
fi

log ""
log "Uninstall finished."
log "User settings and client lists are intentionally preserved."
log "Review remaining items above if you want to clean them manually later."
log "Full report: ${REPORT}"
