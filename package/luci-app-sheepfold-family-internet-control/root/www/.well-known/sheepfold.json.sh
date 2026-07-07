#!/bin/sh
# Этот скрипт генерирует /.well-known/sheepfold.json при установке/обновлении.
# Вызывается из postinst и при изменении app_port через UCI commit hook.
# Android использует этот файл для обнаружения Sheepfold-роутера в локальной сети.

APP_PORT="$(uci -q get sheepfold.global.app_port 2>/dev/null || printf '5201')"
ROUTER_NAME="$(uci -q get system.@system[0].hostname 2>/dev/null || printf 'OpenWrt')"
VERSION="$(uci -q get sheepfold.global.ui_asset_version 2>/dev/null || printf 'unknown')"
API_PATH="/cgi-bin/sheepfold-api"

mkdir -p /www/.well-known
cat > /www/.well-known/sheepfold.json << EOF
{
  "service": "sheepfold",
  "name": "Sheepfold Family Internet Control",
  "routerName": "${ROUTER_NAME}",
  "appPort": "${APP_PORT}",
  "apiPath": "${API_PATH}",
  "apiBase": "${API_PATH}",
  "version": "${VERSION}"
}
EOF
