#!/bin/sh
# Выполняет проверки непосредственно в BusyBox/OpenWrt, где видны реальные UCI,
# ubus, системный менеджер пакетов, права файлов и fw4. Режим writeSafe использует только фиктивный MAC,
# а trap восстанавливает точный конфиг и RAM-журнал даже при ошибке или прерывании.
# Файл не содержит hardware-команд: его безопасно загружать в /tmp автоматически.
set -eu

mode="${1:-readOnly}"
run_dir="${2:-/tmp/sheepfold-live-test}"
router_control='/usr/libexec/sheepfold/sheepfold-router-control'
test_mac='02:53:48:45:45:50'
package_manager=''

pass() {
    printf 'PASS|%s|%s\n' "$1" "$2"
}

fail() {
    printf 'FAIL|%s|%s\n' "$1" "$2" >&2
    exit 1
}

require_command() {
    command -v "$1" >/dev/null 2>&1 || fail "command_$1" "Не найдена команда $1"
}

require_file() {
    [ -f "$1" ] || fail "file_$(basename "$1")" "Не найден файл $1"
}

require_executable() {
    [ -x "$1" ] || fail "executable_$(basename "$1")" "Файл не исполняемый: $1"
}

detect_package_manager() {
    # На OpenWrt 24.10 apk мог быть установлен дополнительно, но системной базой
    # пакетов всё равно управляет opkg. Поэтому при наличии обеих команд выбираем opkg.
    if command -v opkg >/dev/null 2>&1; then
        package_manager='opkg'
    elif command -v apk >/dev/null 2>&1; then
        package_manager='apk'
    else
        fail packageManager 'Не найден системный менеджер пакетов opkg или apk'
    fi
}

package_is_installed() {
    case "$package_manager" in
        opkg) opkg status "$1" >/dev/null 2>&1 ;;
        apk) apk info -e "$1" >/dev/null 2>&1 ;;
        *) return 1 ;;
    esac
}

installed_package_version() {
    case "$package_manager" in
        opkg)
            opkg status "$1" 2>/dev/null | sed -n 's/^Version: //p' | sed -n '1p'
            ;;
        apk)
            # OpenWrt 25.12 использует apk-tools v3; JSON query не зависит от
            # локализованного человекочитаемого вывода и не требует jsonfilter.
            apk info --from installed --fields version --format json "$1" 2>/dev/null |
                sed -n 's/^[[:space:]]*"version": "\([^"]*\)".*/\1/p' |
                sed -n '1p'
            ;;
    esac
}

read_only_checks() {
    require_command uci
    require_command ubus
    detect_package_manager
    ubus call system board >/dev/null 2>&1 || fail system_board 'ubus system board не отвечает'
    pass systemBoard 'Сведения о роутере доступны через ubus'
    pass packageManager "Используется системный менеджер пакетов $package_manager"

    if package_is_installed luci-app-sheepfold-family-internet-control; then
        package_name='luci-app-sheepfold-family-internet-control'
    elif package_is_installed luci-app-sheepfold-ai-support; then
        package_name='luci-app-sheepfold-ai-support'
    else
        fail packageInstalled 'Пакет Sheepfold не установлен'
    fi
    package_version="$(installed_package_version "$package_name")"
    [ -n "$package_version" ] || fail packageVersion "$package_manager не вернул версию Sheepfold"
    pass packageInstalled "$package_name $package_version"

    require_file /etc/config/sheepfold
    for section in global allowlist blocklist; do
        uci -q get "sheepfold.$section" >/dev/null 2>&1 || fail "uci_$section" "Нет обязательной секции sheepfold.$section"
    done
    asset_version="$(uci -q get sheepfold.global.ui_asset_version 2>/dev/null || true)"
    [ -n "$asset_version" ] || fail uiAssetVersion 'ui_asset_version пустой'
    pass uciConfig "Обязательные секции UCI присутствуют; версия ресурсов $asset_version"

    require_executable "$router_control"
    require_executable /usr/libexec/sheepfold/sheepfold-router-control-legacy
    require_executable /usr/libexec/sheepfold/sheepfold-ipv6-control
    require_executable /etc/init.d/sheepfold
    require_executable /www/cgi-bin/sheepfold-api
    pass executableFiles 'Основные backend и CGI-файлы исполняемые'

    "$router_control" root-password-status | grep -qx set || fail rootPassword 'Root-пароль роутера не задан'
    "$router_control" status >/dev/null 2>&1 || fail routerStatus 'sheepfold-router-control status завершился с ошибкой'
    router_info="$($router_control router-info 2>/dev/null)" || fail routerInfo 'router-info завершился с ошибкой'
    printf '%s\n' "$router_info" | grep -Eq '^model=.+$' || fail routerModel 'router-info не вернул модель роутера'
    if printf '%s\n' "$router_info" | grep -Eq '^model=(unknown|)$'; then
        fail routerModel 'router-info вернул unknown вместо модели роутера'
    fi
    printf '%s\n' "$router_info" | grep -Eq '^firmware=.+$' || fail routerFirmware 'router-info не вернул прошивку'
    pass routerInfo 'Backend вернул модель, прошивку и диагностический снимок'

    "$router_control" ipv6-status >/dev/null 2>&1 || fail ipv6Status 'ipv6-status завершился с ошибкой'
    pass ipv6Status 'Статус управления IPv6 читается без изменений'

    if command -v fw4 >/dev/null 2>&1; then
        fw4 check >/dev/null 2>&1 || fail firewallSyntax 'fw4 не смог проверить текущую конфигурацию'
        pass firewallSyntax 'Текущая конфигурация fw4 синтаксически корректна'
    else
        pass firewallSyntax 'fw4 отсутствует; проверка пропущена для этой прошивки'
    fi

    pending_count="$(uci changes sheepfold 2>/dev/null | wc -l | tr -d ' ')"
    [ "$pending_count" = 0 ] || fail pendingUciChanges "Найдены неприменённые изменения UCI Sheepfold: $pending_count"
    pass pendingUciChanges 'Неприменённых изменений UCI Sheepfold нет'
}

write_safe_checks() {
    [ -d "$run_dir" ] || fail testRunDirectory 'Не найден временный каталог теста'
    cp -p /etc/config/sheepfold "$run_dir/sheepfold.before"

    log_path="$(uci -q get sheepfold.global.log_cache_path 2>/dev/null || printf /tmp/sheepfold/events.log)"
    case "$log_path" in
        /tmp/*)
            if [ -f "$log_path" ]; then
                cp -p "$log_path" "$run_dir/events.before"
                : > "$run_dir/events.existed"
            fi
            ;;
        *) log_path='' ;;
    esac

    restore_state() {
        result=$?
        cp -p "$run_dir/sheepfold.before" /etc/config/sheepfold
        uci -q commit sheepfold || true
        "$router_control" settings-import-applied >/dev/null 2>&1 || true
        if [ -n "$log_path" ]; then
            if [ -f "$run_dir/events.existed" ]; then
                cp -p "$run_dir/events.before" "$log_path"
            else
                rm -f "$log_path"
            fi
        fi
        return "$result"
    }
    trap restore_state EXIT HUP INT TERM

    if grep -qi "$test_mac" /tmp/dhcp.leases /proc/net/arp /etc/config/sheepfold 2>/dev/null; then
        fail syntheticMacCollision "Фиктивный MAC $test_mac уже встречается на роутере"
    fi

    "$router_control" set-device-status "$test_mac" allow 'Sheepfold SSH test' '' '' computer >/dev/null
    uci -q get sheepfold.allowlist.mac 2>/dev/null | tr ' ' '\n' | grep -qix "$test_mac" || fail allowlistWrite 'Фиктивный MAC не записался в белый список устройств'
    if "$router_control" set-device-status "$test_mac" blocked 'Sheepfold SSH test' '' '' computer >/dev/null 2>&1; then
        fail accessListConflict 'Backend допустил одновременное присутствие в белом и чёрном списках устройств'
    fi
    pass allowlistWrite 'Белый список устройств записывается, конфликт отклоняется'

    "$router_control" set-device-status "$test_mac" new 'Sheepfold SSH test' '' '' computer >/dev/null
    "$router_control" set-device-status "$test_mac" blocked 'Sheepfold SSH test' '' '' computer >/dev/null
    uci -q get sheepfold.blocklist.mac 2>/dev/null | tr ' ' '\n' | grep -qix "$test_mac" || fail blocklistWrite 'Фиктивный MAC не записался в чёрный список устройств'
    if "$router_control" set-device-status "$test_mac" allow 'Sheepfold SSH test' '' '' computer >/dev/null 2>&1; then
        fail accessListConflict 'Backend допустил обратный конфликт списков устройств'
    fi
    pass blocklistWrite 'Чёрный список устройств записывается, обратный конфликт отклоняется'

    restore_state
    trap - EXIT HUP INT TERM
    if grep -qi "$test_mac" /etc/config/sheepfold 2>/dev/null; then
        fail configRestore 'После восстановления фиктивный MAC остался в UCI'
    fi
    pass configRestore 'Исходный UCI-конфиг и журнал восстановлены'
}

case "$mode" in
    readOnly) read_only_checks ;;
    writeSafe) write_safe_checks ;;
    *) fail testMode "Неизвестный режим: $mode" ;;
esac
