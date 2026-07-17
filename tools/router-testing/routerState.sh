#!/bin/sh
# Создаёт и восстанавливает резервную копию только известных конфигов тестового
# роутера. Отдельный файл нужен, чтобы не передавать сложный shell-код аргументом
# ssh с Windows: так не мешают CRLF, кавычки и защитное ПО на рабочем компьютере.
# Скрипт принимает только сгенерированный каталог /tmp/sheepfold-live-test-* и
# не обновляет пакеты, не перезагружает роутер и не управляет Wi-Fi/WPS/LED.
set -eu

action="${1:-}"
run_dir="${2:-}"
package_manager="${3:-}"

case "$run_dir" in
    /tmp/sheepfold-live-test-*) ;;
    *) printf 'Недопустимый тестовый каталог.\n' >&2; exit 64 ;;
esac

run_id="${run_dir#/tmp/sheepfold-live-test-}"
case "$run_id" in
    ''|*[!A-Za-z0-9-]*) printf 'Недопустимый ID тестового запуска.\n' >&2; exit 64 ;;
esac

backup_state() {
    case "$package_manager" in
        opkg|apk) ;;
        *) printf 'Неизвестный менеджер пакетов.\n' >&2; exit 64 ;;
    esac

    umask 077
    mkdir -p "$run_dir/config"
    : > "$run_dir/absent-configs"
    for name in sheepfold dhcp wireless firewall; do
        if [ -f "/etc/config/$name" ]; then
            cp -p "/etc/config/$name" "$run_dir/config/$name"
        else
            printf '%s\n' "$name" >> "$run_dir/absent-configs"
        fi
    done

    case "$package_manager" in
        opkg)
            if opkg status luci-app-sheepfold-family-internet-control >/dev/null 2>&1; then
                opkg status luci-app-sheepfold-family-internet-control > "$run_dir/package-status.txt"
            elif opkg status luci-app-sheepfold-ai-support >/dev/null 2>&1; then
                opkg status luci-app-sheepfold-ai-support > "$run_dir/package-status.txt"
            else
                : > "$run_dir/package-status.txt"
            fi
            ;;
        apk)
            if apk info -e luci-app-sheepfold-family-internet-control >/dev/null 2>&1; then
                apk info --from installed --fields name,version --format json luci-app-sheepfold-family-internet-control > "$run_dir/package-status.txt"
            elif apk info -e luci-app-sheepfold-ai-support >/dev/null 2>&1; then
                apk info --from installed --fields name,version --format json luci-app-sheepfold-ai-support > "$run_dir/package-status.txt"
            else
                : > "$run_dir/package-status.txt"
            fi
            ;;
    esac

    tar -czf "$run_dir/config-backup.tgz" -C "$run_dir" config absent-configs package-status.txt
    tar -tzf "$run_dir/config-backup.tgz" >/dev/null
    chmod 600 "$run_dir/config-backup.tgz"
    printf 'state-backup-ok\n'
}

restore_state() {
    [ -d "$run_dir/config" ] || { printf 'Нет каталога резервной копии.\n' >&2; exit 65; }
    [ -f "$run_dir/absent-configs" ] || { printf 'Нет списка отсутствовавших конфигов.\n' >&2; exit 65; }

    for name in sheepfold dhcp wireless firewall; do
        if grep -qx "$name" "$run_dir/absent-configs"; then
            rm -f "/etc/config/$name"
        elif [ -f "$run_dir/config/$name" ]; then
            cp -p "$run_dir/config/$name" "/etc/config/$name"
        else
            printf 'Неполная резервная копия: %s.\n' "$name" >&2
            exit 65
        fi
    done

    # Здесь намеренно нет uci commit и вызова backend: они переписали бы только
    # что восстановленный файл и сделали бы побайтовую проверку бессмысленной.
    for name in sheepfold dhcp wireless firewall; do
        if grep -qx "$name" "$run_dir/absent-configs"; then
            [ ! -e "/etc/config/$name" ] || exit 66
        else
            cmp -s "$run_dir/config/$name" "/etc/config/$name" || exit 66
        fi
    done
    printf 'state-restore-ok\n'
}

case "$action" in
    backup) backup_state ;;
    restore) restore_state ;;
    *) printf 'Использование: routerState.sh backup|restore RUN_DIR [opkg|apk]\n' >&2; exit 64 ;;
esac
