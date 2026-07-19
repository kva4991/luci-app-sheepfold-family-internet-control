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
test_schedule='live_test_schedule'
test_schedule_peer='live_test_schedule_peer'
firewall_lock='/tmp/sheepfold/firewall-sync.flock'
package_manager=''

acquire_firewall_test_lock() {
    waited_seconds=0
    while ! flock -n 8; do
        [ "$waited_seconds" -lt 30 ] || return 1
        waited_seconds=$((waited_seconds + 1))
        sleep 1
    done
}

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

nft_set_has_mac() {
    set_name="$1"
    wanted_mac="$2"
    nft list set inet fw4 "$set_name" 2>/dev/null | grep -qi "$wanted_mac"
}

device_section_for_mac() {
    wanted_mac="$(printf '%s' "$1" | tr '[:lower:]' '[:upper:]')"
    for device_section in $(uci -q show sheepfold 2>/dev/null | sed -n 's/^sheepfold\.\([^.=]*\)=device$/\1/p'); do
        current_mac="$(uci -q get "sheepfold.$device_section.mac" 2>/dev/null | tr '[:lower:]' '[:upper:]')"
        [ "$current_mac" = "$wanted_mac" ] || continue
        printf '%s\n' "$device_section"
        return 0
    done
    return 1
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

    # Вызываем discovery тем же CGI, который использует Android. Так тест ловит не только
    # неверный маршрут, но и ошибки BusyBox helper-ов, попавшие в stderr вроде `now: not found`.
    api_ping_output="$(REQUEST_METHOD=GET PATH_INFO=/ping REMOTE_ADDR=127.0.0.1 /www/cgi-bin/sheepfold-api 2>&1)" ||
        fail apiDiscovery 'CGI endpoint /ping завершился с ошибкой'
    printf '%s\n' "$api_ping_output" | grep -q '^Status: 200 OK' ||
        fail apiDiscovery 'CGI endpoint /ping не вернул HTTP 200'
    printf '%s\n' "$api_ping_output" | grep -q '"service":"sheepfold"' ||
        fail apiDiscovery 'CGI endpoint /ping не вернул маркер service=sheepfold'
    [ "$(printf '%s\n' "$api_ping_output" | grep -c 'not found' || true)" = 0 ] ||
        fail apiDiscovery 'CGI endpoint /ping вывел shell-ошибку not found'
    pass apiDiscovery 'Android discovery endpoint /ping отвечает без shell-ошибок'

    # QR v2 использует DER SubjectPublicKeyInfo, а не байты PEM/X.509-файла.
    # Сравнение двумя путями ловит несовместимый fingerprint до проверки телефоном. §tlspinv2
    tls_fingerprint_helper='/usr/libexec/sheepfold/sheepfold-tls-fingerprint'
    if [ -x "$tls_fingerprint_helper" ]; then
        require_command openssl
        tls_fingerprint_output="$($router_control tls-public-key-fingerprint 2>/dev/null)" ||
            fail tlsPublicKeyFingerprint 'Backend не смог вычислить SPKI fingerprint'
        tls_algorithm="$(printf '%s\n' "$tls_fingerprint_output" | sed -n 's/^algorithm=//p' | sed -n '1p')"
        tls_fingerprint="$(printf '%s\n' "$tls_fingerprint_output" | sed -n 's/^fingerprint=//p' | sed -n '1p')"
        [ "$tls_algorithm" = 'sha256-spki' ] ||
            fail tlsPublicKeyFingerprint 'Backend вернул неизвестный алгоритм TLS fingerprint'
        case "$tls_fingerprint" in
            *[!0-9a-f]*|'') fail tlsPublicKeyFingerprint 'Backend вернул некорректный TLS fingerprint' ;;
        esac
        [ "${#tls_fingerprint}" -eq 64 ] ||
            fail tlsPublicKeyFingerprint 'Backend вернул TLS fingerprint неверной длины'

        tls_public_pem="$run_dir/tls-public.pem"
        tls_public_der="$run_dir/tls-public.der"
        openssl x509 -in /etc/uhttpd.crt -pubkey -noout > "$tls_public_pem" 2>/dev/null ||
            fail tlsPublicKeyFingerprint 'OpenSSL не прочитал публичный ключ uhttpd'
        openssl pkey -pubin -in "$tls_public_pem" -outform DER -out "$tls_public_der" 2>/dev/null ||
            fail tlsPublicKeyFingerprint 'OpenSSL не преобразовал публичный ключ в DER'
        tls_direct_output="$(openssl dgst -sha256 "$tls_public_der" 2>/dev/null)" ||
            fail tlsPublicKeyFingerprint 'OpenSSL не вычислил контрольный SPKI fingerprint'
        tls_direct_fingerprint="${tls_direct_output##* }"
        rm -f "$tls_public_pem" "$tls_public_der"
        [ "$tls_fingerprint" = "$tls_direct_fingerprint" ] ||
            fail tlsPublicKeyFingerprint 'Backend и прямой OpenSSL вернули разные SPKI fingerprint'
        pass tlsPublicKeyFingerprint 'QR v2 получает правильный SHA-256 публичного TLS-ключа'
    else
        pass tlsPublicKeyFingerprint 'Helper QR v2 отсутствует в установленной старой версии; проверка пропущена'
    fi

    "$router_control" root-password-status | grep -qx set || fail rootPassword 'Root-пароль роутера не задан'
    "$router_control" status >/dev/null 2>&1 || fail routerStatus 'sheepfold-router-control status завершился с ошибкой'
    router_info="$($router_control router-info 2>/dev/null)" || fail routerInfo 'router-info завершился с ошибкой'
    # Проверяем канонические ключи router-info, которые читает LuCI. Короткие
    # model/firmware здесь дали бы ложную ошибку при исправном backend.
    printf '%s\n' "$router_info" | grep -Eq '^router_model=.+$' || fail routerModel 'router-info не вернул модель роутера'
    if printf '%s\n' "$router_info" | grep -Eq '^router_model=(unknown|)$'; then
        fail routerModel 'router-info вернул unknown вместо модели роутера'
    fi
    printf '%s\n' "$router_info" | grep -Eq '^firmware_version=.+$' || fail routerFirmware 'router-info не вернул прошивку'
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

    # Фоновый Sheepfold service синхронизирует расписания по реальному времени.
    # Удерживаем production lock на весь сценарий, а дочернему firewall явно сообщаем,
    # что блокировка уже захвачена: так проверка времени не гоняется с daemon-циклом. §fwlock1
    mkdir -p /tmp/sheepfold
    exec 8>"$firewall_lock"
    # BusyBox flock в штатном OpenWrt не поддерживает util-linux ключ -w,
    # поэтому ожидание реализовано переносимым циклом с неблокирующим -n.
    acquire_firewall_test_lock || fail firewallTestLock 'Не удалось захватить firewall lock для безопасной write-проверки'
    export SHEEPFOLD_FIREWALL_LOCK_HELD=1

    if grep -qi "$test_mac" /tmp/dhcp.leases /proc/net/arp /etc/config/sheepfold 2>/dev/null; then
        fail syntheticMacCollision "Фиктивный MAC $test_mac уже встречается на роутере"
    fi
    if uci -q get "sheepfold.$test_schedule" >/dev/null 2>&1; then
        fail syntheticScheduleCollision "Тестовая секция sheepfold.$test_schedule уже существует"
    fi
    if uci -q get "sheepfold.$test_schedule_peer" >/dev/null 2>&1; then
        fail syntheticScheduleCollision "Тестовая секция sheepfold.$test_schedule_peer уже существует"
    fi

    "$router_control" set-device-status "$test_mac" allow 'Sheepfold SSH test' '' '' computer >/dev/null
    uci -q get sheepfold.allowlist.mac 2>/dev/null | tr ' ' '\n' | grep -qix "$test_mac" || fail allowlistWrite 'Фиктивный MAC не записался в белый список устройств'
    nft_set_has_mac sheepfold_exempt_macs "$test_mac" || \
        fail allowlistRuntime 'UCI изменился, но фиктивный MAC не попал в разрешающий nftables-набор'
    if "$router_control" set-device-status "$test_mac" blocked 'Sheepfold SSH test' '' '' computer >/dev/null 2>&1; then
        fail accessListConflict 'Backend допустил одновременное присутствие в белом и чёрном списках устройств'
    fi
    pass allowlistWrite 'Белый список устройств записывается и применяется в nftables, конфликт отклоняется'

    "$router_control" set-device-status "$test_mac" new 'Sheepfold SSH test' '' '' computer >/dev/null
    "$router_control" set-device-status "$test_mac" blocked 'Sheepfold SSH test' '' '' computer >/dev/null
    uci -q get sheepfold.blocklist.mac 2>/dev/null | tr ' ' '\n' | grep -qix "$test_mac" || fail blocklistWrite 'Фиктивный MAC не записался в чёрный список устройств'
    nft_set_has_mac sheepfold_block_macs "$test_mac" || \
        fail blocklistRuntime 'UCI изменился, но фиктивный MAC не попал в блокирующий nftables-набор'
    if "$router_control" set-device-status "$test_mac" allow 'Sheepfold SSH test' '' '' computer >/dev/null 2>&1; then
        fail accessListConflict 'Backend допустил обратный конфликт списков устройств'
    fi
    pass blocklistWrite 'Чёрный список устройств записывается и применяется в nftables, обратный конфликт отклоняется'

    # Расписание проверяем на status=new и policy=allow, чтобы MAC мог попасть в
    # restricted set только из вычислителя расписаний, а не из прежнего статуса. §uirunfx
    "$router_control" set-device-status "$test_mac" new 'Sheepfold SSH test' '' '' computer >/dev/null
    test_device_section="$(device_section_for_mac "$test_mac")" || fail scheduleDevice 'Не найдена UCI-секция фиктивного устройства'
    test_device_id="$(uci -q get "sheepfold.$test_device_section.id" 2>/dev/null || true)"
    [ -n "$test_device_id" ] || fail scheduleDeviceId 'У фиктивного устройства не назначен числовой ID'
    uci -q set sheepfold.global.new_device_policy='allow'
    uci -q set "sheepfold.$test_schedule=schedule"
    uci -q set "sheepfold.$test_schedule.name=Sheepfold live test"
    uci -q set "sheepfold.$test_schedule.enabled=1"
    uci -q set "sheepfold.$test_schedule.target_type=device"
    uci -q set "sheepfold.$test_schedule.targets=$test_device_id"
    uci -q set "sheepfold.$test_schedule.weekdays=mon"
    uci -q set "sheepfold.$test_schedule.time_ranges=09:00-11:00"
    uci -q set "sheepfold.$test_schedule.action=block"
    uci -q commit sheepfold
    SHEEPFOLD_NOW_WEEKDAY=mon SHEEPFOLD_NOW_MINUTES=600 "$router_control" schedule-sync >/dev/null
    nft_set_has_mac sheepfold_restricted_macs "$test_mac" || \
        fail scheduleBlockRuntime 'Активное расписание блокировки не попало в restricted nftables-набор'
    pass scheduleBlockRuntime 'Активное расписание устройства применяет блокировку в nftables'

    uci -q set "sheepfold.$test_schedule_peer=schedule"
    uci -q set "sheepfold.$test_schedule_peer.name=Sheepfold live allow test"
    uci -q set "sheepfold.$test_schedule_peer.enabled=1"
    uci -q set "sheepfold.$test_schedule_peer.target_type=device"
    uci -q set "sheepfold.$test_schedule_peer.targets=$test_device_id"
    uci -q set "sheepfold.$test_schedule_peer.weekdays=mon"
    uci -q set "sheepfold.$test_schedule_peer.time_ranges=09:00-11:00"
    uci -q set "sheepfold.$test_schedule_peer.action=allow"
    uci -q set sheepfold.global.schedule_conflict_internet='off'
    uci -q commit sheepfold
    SHEEPFOLD_NOW_WEEKDAY=mon SHEEPFOLD_NOW_MINUTES=600 "$router_control" schedule-sync >/dev/null
    if ! nft_set_has_mac sheepfold_restricted_macs "$test_mac"; then
        schedule_probe="$(SHEEPFOLD_NOW_WEEKDAY=mon SHEEPFOLD_NOW_MINUTES=600 \
            /usr/libexec/sheepfold/sheepfold-schedule-evaluator "$test_device_section" 2>&1 | tr '\n' ';')"
        fail scheduleConflictOffRuntime "Конфликт расписаний не сохранил интернет выключенным согласно настройке off; evaluator: $schedule_probe"
    fi
    pass scheduleConflictOffRuntime 'Конфликт расписаний применяет вариант Интернет выключен'

    uci -q set sheepfold.global.schedule_conflict_internet='on'
    uci -q commit sheepfold
    SHEEPFOLD_NOW_WEEKDAY=mon SHEEPFOLD_NOW_MINUTES=600 "$router_control" schedule-sync >/dev/null
    if nft_set_has_mac sheepfold_restricted_macs "$test_mac"; then
        schedule_probe="$(SHEEPFOLD_NOW_WEEKDAY=mon SHEEPFOLD_NOW_MINUTES=600 \
            /usr/libexec/sheepfold/sheepfold-schedule-evaluator "$test_device_section" 2>&1 | tr '\n' ';')"
        fail scheduleConflictOnRuntime "Конфликт расписаний не включил интернет согласно настройке on; evaluator: $schedule_probe"
    fi
    nft_set_has_mac sheepfold_exempt_macs "$test_mac" && \
        fail scheduleConflictOnRuntime 'Разрешение конфликта ошибочно создало постоянное исключение'
    pass scheduleConflictOnRuntime 'Конфликт расписаний применяет вариант Интернет включён без постоянного исключения'

    uci -q delete "sheepfold.$test_schedule_peer"
    uci -q set sheepfold.global.schedule_conflict_internet='off'
    uci -q set "sheepfold.$test_schedule.weekdays=mon"
    uci -q set "sheepfold.$test_schedule.time_ranges=22:00-07:00"
    uci -q set "sheepfold.$test_schedule.action=block"
    uci -q commit sheepfold
    SHEEPFOLD_NOW_WEEKDAY=tue SHEEPFOLD_PREVIOUS_WEEKDAY=mon SHEEPFOLD_NOW_MINUTES=60 "$router_control" schedule-sync >/dev/null
    nft_set_has_mac sheepfold_restricted_macs "$test_mac" || \
        fail overnightScheduleRuntime 'Ночной интервал понедельника не продолжил блокировку во вторник'
    pass overnightScheduleRuntime 'Ночной интервал продолжает действовать после полуночи следующего дня'

    # Разрешающее расписание должно быть сильнее обычного restricted-статуса, но не
    # превращать устройство в постоянное исключение или белый список устройств. §84azytj
    uci -q set "sheepfold.$test_device_section.status=restricted"
    uci -q set "sheepfold.$test_schedule.time_ranges=09:00-11:00"
    uci -q set "sheepfold.$test_schedule.action=allow"
    uci -q commit sheepfold
    SHEEPFOLD_NOW_WEEKDAY=mon SHEEPFOLD_NOW_MINUTES=600 "$router_control" schedule-sync >/dev/null
    nft_set_has_mac sheepfold_restricted_macs "$test_mac" && \
        fail scheduleAllowRuntime 'Разрешающее расписание не сняло обычное ограничение'
    nft_set_has_mac sheepfold_exempt_macs "$test_mac" && \
        fail scheduleAllowRuntime 'Разрешающее расписание ошибочно создало постоянное nftables-исключение'
    pass scheduleAllowRuntime 'Разрешающее расписание временно снимает обычное ограничение без постоянного исключения'

    uci -q set "sheepfold.$test_schedule.enabled=0"
    uci -q commit sheepfold
    SHEEPFOLD_NOW_WEEKDAY=mon SHEEPFOLD_NOW_MINUTES=600 "$router_control" schedule-sync >/dev/null
    nft_set_has_mac sheepfold_restricted_macs "$test_mac" || \
        fail disabledScheduleRuntime 'Выключенное расписание продолжило влиять на обычный restricted-статус'
    pass disabledScheduleRuntime 'Выключение расписания без удаления возвращает обычную политику устройства'

    no_restrictions_name="$(uci -q get sheepfold.no_restrictions.name 2>/dev/null || true)"
    [ -n "$no_restrictions_name" ] || fail noRestrictionsGroup 'Не найдена системная группа Без ограничений'
    uci -q set "sheepfold.$test_device_section.group=$no_restrictions_name"
    uci -q set "sheepfold.$test_schedule.enabled=1"
    uci -q set "sheepfold.$test_schedule.action=block"
    uci -q commit sheepfold
    SHEEPFOLD_NOW_WEEKDAY=mon SHEEPFOLD_NOW_MINUTES=600 "$router_control" schedule-sync >/dev/null
    nft_set_has_mac sheepfold_exempt_macs "$test_mac" || \
        fail noRestrictionsRuntime 'Группа Без ограничений не добавила MAC в exempt nftables-набор'
    nft_set_has_mac sheepfold_restricted_macs "$test_mac" && \
        fail noRestrictionsRuntime 'Активное расписание ошибочно оказалось сильнее группы Без ограничений'
    pass noRestrictionsRuntime 'Группа Без ограничений остаётся выше активного расписания устройства'

    "$router_control" set-device-status "$test_mac" blocked 'Sheepfold SSH test' '' "$no_restrictions_name" computer >/dev/null
    nft_set_has_mac sheepfold_block_macs "$test_mac" || \
        fail blocklistBeatsGroupRuntime 'Чёрный список устройств не добавил MAC в блокирующий nftables-набор'
    nft_set_has_mac sheepfold_exempt_macs "$test_mac" && \
        fail blocklistBeatsGroupRuntime 'Группа Без ограничений ошибочно обошла чёрный список устройств'
    pass blocklistBeatsGroupRuntime 'Чёрный список устройств остаётся выше группы Без ограничений'

    "$router_control" set-device-status "$test_mac" restricted 'Sheepfold SSH test' '' 'Not configured' computer >/dev/null
    uci -q set "sheepfold.$test_schedule.enabled=0"
    uci -q commit sheepfold
    SHEEPFOLD_NOW_WEEKDAY=mon SHEEPFOLD_NOW_MINUTES=600 "$router_control" schedule-sync >/dev/null
    nft_set_has_mac sheepfold_restricted_macs "$test_mac" || \
        fail noRestrictionsRelease 'После выхода из группы не восстановился restricted nftables-набор'
    pass noRestrictionsRelease 'После выхода из группы восстановилось обычное ограничение устройства'

    "$router_control" device-temp-access "$test_mac" 30 >/dev/null
    [ "$(uci -q get "sheepfold.$test_device_section.status" 2>/dev/null || true)" = temp_access ] || \
        fail tempAccessStatus 'Backend не сохранил временный статус устройства'
    nft_set_has_mac sheepfold_restricted_macs "$test_mac" && \
        fail tempAccessRuntime 'Временный доступ не снял restricted nftables-ограничение'
    nft_set_has_mac sheepfold_exempt_macs "$test_mac" && \
        fail tempAccessRuntime 'Временный доступ ошибочно стал постоянным nftables-исключением'
    if uci -q get sheepfold.allowlist.mac 2>/dev/null | tr ' ' '\n' | grep -qix "$test_mac"; then
        fail tempAccessRuntime 'Временный доступ ошибочно записал MAC в белый список устройств'
    fi
    pass tempAccessRuntime 'Временный доступ действует без постоянного белого списка или nftables-исключения'

    uci -q set "sheepfold.$test_device_section.temp_access_until=1"
    uci -q commit sheepfold
    "$router_control" expire-temp-access >/dev/null
    [ "$(uci -q get "sheepfold.$test_device_section.status" 2>/dev/null || true)" = restricted ] || \
        fail tempAccessExpiry 'После истечения не восстановился прежний статус restricted'
    nft_set_has_mac sheepfold_restricted_macs "$test_mac" || \
        fail tempAccessExpiry 'После истечения временного доступа MAC не вернулся в restricted nftables-набор'
    uci -q get "sheepfold.$test_device_section.temp_access_until" >/dev/null 2>&1 && \
        fail tempAccessExpiry 'После истечения осталось служебное поле temp_access_until'
    pass tempAccessExpiry 'Истечение временного доступа восстанавливает прежний статус и runtime-ограничение'

    restore_state
    unset SHEEPFOLD_FIREWALL_LOCK_HELD
    flock -u 8
    exec 8>&-
    trap - EXIT HUP INT TERM
    if grep -qi "$test_mac" /etc/config/sheepfold 2>/dev/null; then
        fail configRestore 'После восстановления фиктивный MAC остался в UCI'
    fi
    if nft_set_has_mac sheepfold_exempt_macs "$test_mac" || \
            nft_set_has_mac sheepfold_block_macs "$test_mac" || \
            nft_set_has_mac sheepfold_restricted_macs "$test_mac"; then
        fail runtimeRestore 'После восстановления фиктивный MAC остался в nftables'
    fi
    pass configRestore 'Исходный UCI-конфиг, журнал и runtime nftables восстановлены'
}

case "$mode" in
    readOnly) read_only_checks ;;
    writeSafe) write_safe_checks ;;
    *) fail testMode "Неизвестный режим: $mode" ;;
esac
