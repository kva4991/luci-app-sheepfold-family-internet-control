#!/bin/sh
# Генерирует /.well-known/sheepfold.json при установке и изменении app_port.
# Android использует файл только для обнаружения локального Sheepfold-роутера.

set -eu

json_escape() {
    printf '%s' "$1" | tr '\r\n\t' '   ' | sed 's/\\/\\\\/g; s/"/\\"/g'
}

APP_PORT="$(uci -q get sheepfold.global.app_port 2>/dev/null || printf '5201')"
case "$APP_PORT" in ''|*[!0-9]*) APP_PORT=5201 ;; esac
[ "$APP_PORT" -ge 1 ] && [ "$APP_PORT" -le 65535 ] || APP_PORT=5201

ROUTER_NAME="$(uci -q get system.@system[0].hostname 2>/dev/null || printf 'OpenWrt')"
VERSION="$(uci -q get sheepfold.global.ui_asset_version 2>/dev/null || printf 'unknown')"
API_PATH="/cgi-bin/sheepfold-api"

mkdir -p /www/.well-known
TMP="/www/.well-known/sheepfold.json.tmp.$$"
trap 'rm -f "$TMP"' EXIT HUP INT TERM

cat > "$TMP" << EOF
{
  "service": "sheepfold",
  "name": "Sheepfold Family Internet Control",
  "routerName": "$(json_escape "$ROUTER_NAME")",
  "appPort": "$APP_PORT",
  "apiPath": "$API_PATH",
  "apiBase": "$API_PATH",
  "version": "$(json_escape "$VERSION")"
}
EOF

chmod 0644 "$TMP"
mv -f "$TMP" /www/.well-known/sheepfold.json
trap - EXIT HUP INT TERM
