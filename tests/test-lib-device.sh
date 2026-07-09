#!/bin/sh
# tests/test-lib-device.sh
# Мини-тесты для sheepfold-lib-device и связки с sheepfold-lib-uci.
# Запуск: sh tests/test-lib-device.sh

set -eu

# Используем отдельный каталог для UCI, чтобы не трогать /etc/config.
TEST_ROOT="/tmp/sheepfold-test-uci"
mkdir -p "$TEST_ROOT"
export UCI_CONFIG_DIR="$TEST_ROOT"

# Создаём пустой конфиг sheepfold.
cat >"$TEST_ROOT/sheepfold" <<'EOF'
config global 'global'
EOF

# Подгружаем библиотеки так же, как в основном коде.
. /usr/libexec/sheepfold/sheepfold-lib-device
. /usr/libexec/sheepfold/sheepfold-lib-uci

fail() {
    echo "TEST FAILED: $*" >&2
    exit 1
}

ok() {
    echo "OK: $*"
}

# --- Тесты normalize_mac / valid_mac ---

[ "$(normalize_mac 'aa:bb:cc:dd:ee:ff')" = "AA:BB:CC:DD:EE:FF" ] || fail "normalize_mac uppercases"
valid_mac "AA:BB:CC:DD:EE:FF" || fail "valid_mac accepts correct MAC"
if valid_mac "AA:BB:CC:DD:EE"; then
    fail "valid_mac should reject short MAC"
fi
ok "MAC normalization and validation"

# --- Тесты device_section_for_mac ---

MAC1="AA:BB:CC:DD:EE:FF"

# Секция ещё не существует — должна создаться device_aabbccddeeff.
SECTION1="$(device_section_for_mac "$MAC1")"
[ "$SECTION1" = "device_aabbccddeeff" ] || fail "device_section_for_mac generated section name"
TYPE1="$(uci -q get "sheepfold.$SECTION1" 2>/dev/null || true)"
[ "$TYPE1" = "device" ] || fail "new section has type=device"
ok "device_section_for_mac creates new device section"

# Повторный вызов для того же MAC должен вернуть ту же секцию.
SECTION1_AGAIN="$(device_section_for_mac "$MAC1")"
[ "$SECTION1_AGAIN" = "$SECTION1" ] || fail "device_section_for_mac returns existing section"
ok "device_section_for_mac returns existing section for same MAC"

# --- Тесты работы со списками allowlist через lib-uci+lib-device ---

ALLOW_MAC="11:22:33:44:55:66"

# Сначала список пустой.
if list_has_mac allowlist "$ALLOW_MAC"; then
    fail "list_has_mac should not see MAC in empty allowlist"
fi

add_mac_to_allowlist "$ALLOW_MAC"
list_has_mac allowlist "$ALLOW_MAC" || fail "MAC must appear in allowlist after add_mac_to_allowlist"

# Повторное добавление не должно создавать дубликаты.
add_mac_to_allowlist "$ALLOW_MAC"
COUNT="$(uci -q get "sheepfold.allowlist.mac" 2>/dev/null | wc -w || echo 0)"
[ "$COUNT" -eq 1 ] || fail "allowlist must not contain duplicate MAC entries"
ok "allowlist add/list_has_mac without duplicates"

echo "All sheepfold-lib-device tests passed."
