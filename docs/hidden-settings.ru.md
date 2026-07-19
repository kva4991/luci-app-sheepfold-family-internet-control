# Скрытые и неотображаемые настройки

UCI-параметры и секции Sheepfold, которые **существуют в `/etc/config/sheepfold`**, но **не имеют отдельного поля** в LuCI `overview.js` (или показаны только как статический текст без записи в UCI).

Актуальный UI: `htdocs/.../overview.js`, `overview-secure.js`, `ai.js`. Шаблон значений: `root/usr/share/sheepfold/sheepfold.uci.defaults`.

При добавлении поля в UI **удалить** соответствующую строку из этого документа и из [`docs/agent-gotchas.ru.md`](agent-gotchas.ru.md).

## Никогда не показываются в LuCI (только UCI / backend)

| Параметр | Секция | Назначение |
| --- | --- | --- |
| `enabled` | `global` | Включение пакета; не выводится в overview |
| `lan_interface`, `wan_interface` | `global` | Имена интерфейсов для диагностики/правил |
| `lan_firewall_zones` | `global` | Имена внутренних firewall-зон, на которых глобальная блокировка применяется к неизвестным устройствам; по умолчанию `lan` |
| `logging`, `log_level` | `global` | Уровень служебного логирования backend |
| `log_masking`, `log_export_mask_sensitive` | `global` | Маскирование в логах и экспорте |
| `allow_router_for_blocked`, `block_router_for_blacklist` | `global` | Доступ к LuCI/роутеру при блокировке |
| `domain_allowlist_enabled` | `global` | Включение доменного allowlist (отдельно от emergency sites) |
| `domain_allowlist_for_blocklist_default_migrated` | `global` | Флаг одноразовой миграции |
| `country_profile_schema`, `country_profile_migrated` | `global` | Версия country profile и одноразовая миграция старых заводских карточек (§country1) |
| `emergency_sites_initialized` | `global` | Служебный флаг первичного заполнения аварийно-полезных сайтов; не является пользовательским переключателем |
| `activity_log_enabled` | `global` | Глобальный журнал активности (в UI только per-device/per-group) |
| `private_logs`, `log_days`, `log_max_dir_kb`, `log_max_device_kb` | `global` | Старые/расширенные лимиты журналов |
| `no_restrictions_auto_assign` | `global` | Автоназначение в «Без ограничений»; задаётся только вместе с `detection_mode` |
| `detector_watch_interval_seconds` | `global` | Интервал чтения текущего ARP/Wi-Fi/DHCP online-снимка; 10 секунд по умолчанию (§detlife1) |
| `detector_offline_grace_seconds` | `global` | Grace-период 90 секунд перед реальным offline; подавляет ложные новые подключения из-за сна Wi-Fi/roaming, backend ограничивает 30-900 (§detlife1) |
| `detector_interval_seconds` | `global` | Страховочный проход только по подтверждённо online-устройствам; 86400 секунд (раз в сутки) по умолчанию (§detlife1) |
| `detector_connection_delay_seconds` | `global` | Задержка после появления устройства перед событийным анализом; 20 секунд, backend ограничивает 5-120 (§detlife1) |
| `detector_max_event_scans_per_tick` | `global` | Максимум созревших событий подключения за тик; 4, backend ограничивает 1-8 (§detlife1) |
| `detector_max_hosts_per_scan` | `global` | Лимит хостов на nmap-проход |
| `detector_min_device_type_confidence` | `global` | Порог «известного типа» (читается в UI детектора, не редактируется) |
| `detector_min_no_restrictions_confidence` | `global` | Порог автогруппы «Без ограничений» |
| `detector_nmap_host_timeout_seconds` | `global` | Таймаут nmap на хост |
| `detector_full_rescan_seconds` | `global` | Минимальный интервал повторного сканирования портов одного устройства; 86400 секунд по умолчанию, backend минимум 1 час (§detload, §detlife1) |
| `detector_low_confidence_retry_seconds` | `global` | Не чаще этого интервала повторять классификацию с низкой уверенностью; 86400 секунд по умолчанию (§detlife1) |
| `detector_ssdp_rescan_seconds` | `global` | Минимальный интервал активного LAN SSDP M-SEARCH; 3600 секунд по умолчанию |
| `detector_wsd_rescan_seconds` | `global` | Минимальный интервал короткого пассивного окна WS-Discovery; 3600 секунд по умолчанию. Единственный активный Probe разрешён только событию нового устройства и защищён от шторма (§detload) |
| `detector_max_upnp_fetches_per_scan` | `global` | Максимум peer-pinned UPnP descriptions за один проход; 4 по умолчанию, backend ограничивает 1-8 (§devident1, §detload) |
| `identity_quarantine_reminder_seconds` | `global` | Интервал повторного напоминания о нерешённом identity-карантине; минимум и значение по умолчанию 86400 секунд (§detlife1) |
| `service_control_interval_seconds` | `global` | Интервал фоновых Wi-Fi/WAN/LED/blocked-page операций; firewall синхронизируется отдельным быстрым проходом (§detload) |
| `child_ai_consent_version` | `global` | Версия шаблона согласия child AI |
| `deepseek_api_url`, `gemini_api_url` | `global` | URL провайдеров (зашиты, не редактируются) |
| `active_messenger` | `global` | Дублирует `messenger_global.active` |
| `integration_mode_source`, `integration_mode_user_set` | `global` | Служебные флаги выбора интеграции |
| `router_ipv6_mode_source` | `global` | Источник настройки IPv6: `default`, `manual` или `auto_podkop`; пользователь меняет только видимую настройку `router_ipv6_disabled` |
| `adguard_integration`, `podkop_compatibility` | `global` | Устаревшие/параллельные флаги интеграций |
| `require_router_root_password` | `global` | Проверка root-пароля при входе в Sheepfold |
| `quick_allowlist_window_seconds` | `global` | Длина окна quick add (30 с; в UI не настраивается) |
| `feedback_install_id` | `global` | Случайный идентификатор установки только для необязательного канала отзывов; не является ID семьи или устройства (§feedback) |
| `blocked_page_port`, `blocked_page_enabled` | `global` | Страница блокировки HTTP |
| `pairing_diagnostics` | `global` | Расширенный RAM-журнал QR-сопряжения (`0` по умолчанию, `1` только на время диагностики) |
| `bedtime` | `global` | Время «до отбоя» для quick action; **в расписаниях показано как статичное `21:00`, в UCI не пишется** |
| `block_on_boot` | `global` | Глобальная блокировка при загрузке |
| `auto_configure` | `global` | Включена автонастройка; в UI только `detection_mode` |
| `description` | `list` / `group` | Служебные описания секций |
| `protected`, `personal`, `auto_assignable`, `allowlist_only` | `group` | Часть полей групп задаётся при создании, не все редактируются в модалке |
| `password_hash`, `password_setup_required`, `role` | `administrator` | Пароль и роль; в overview нет редактора пароля |
| `enabled` | `integration` adguard/podkop | Служебный флаг обнаруженной интеграции; не является переключателем API |
| `compatibility_mode` | `integration` podkop | Служебный флаг совместимости старой podkop-секции; пользователь выбирает общий `integration_mode` |
| `url` | `integration` podkop | Адрес Podkop вне вкладки «Интеграции» |
| `default_adapter`, `max_experimental`, `polling_mode`, `show_technical_details`, `require_confirmation` | `messenger_global` | Поведение бота; в UI messenger частично |
| `default_format`, `include_secrets`, `encrypted_full_backup` | `export_global` | Экспорт; в UI только `export_mode` в Misc |
| `enabled`, `allow_24ghz`, `allow_5ghz`, `require_confirmation` | `wifi_control_global` | Wi-Fi control helper; отдельной вкладки нет |
| `token_lifetime_seconds`, `require_admin_device`, `store_tokens_hashed`, `consume_token_on_success`, `max_attempts`, `attempt_window_seconds` | `pairing_global` | Параметры pairing на backend |
| `adguard_health_interval_seconds` | `global` | Интервал фоновой проверки управляемого фильтра AdGuard Home; по умолчанию 300 секунд, допустимо 60–3600 |
| `authorized` | `yandex_disk` | Флаг успешной авторизации; выставляет `sheepfold-yandex-disk status`, в LuCI не редактируется |
| `encrypt` | `usb` | В UI есть |
| `domain_allowlist` | `list` | Список доменов emergency; редактируется на вкладке emergency sites |

## Показаны косвенно или только при условии

| Параметр | Где видно | Заметка |
| --- | --- | --- |
| `detector_min_device_type_confidence` | Текст детектора в карточке устройства | Нет поля настроек |
| `router_led_repair` | Secure settings + LED | Не на основном overview без secure |
| `deepseek_model` default в defaults `deepseek-chat` vs UI `deepseek-v4-flash` | Расхождение default UCI и UI | |
| Расписания (`schedule` секции) | Вкладка расписаний и backend evaluator | Правила сохраняются в UCI и вычисляются backend |
| `bedtime` | Быстрое разрешение «до отбоя» | Хранится в `sheepfold.global.bedtime` |

## Отображаются в LuCI (для сверки)

`language`, `country_profile`, `new_device_policy`, `detection_mode`, `device_monitoring_mode`, `update_check_install_mode`, `domain_allowlist_for_blocklist`, `site_*`, `site_filter_backend`, `adguard_auto_manage`, `adguard_health_interval_seconds`, AdGuard Home (`url`, `username`, `password`), `app_port`, `sim_change_notifications`, `child_wifi_network_notifications`, messenger tokens, `integration_mode`, emergency sites, Wi-Fi auto, NTP/timezone, WPS, LED, `log_storage`, log retention, offline cleanup, USB, Yandex Disk (`login`, `password`, `root_folder`, `quota_mb`), AI keys/flags, `export_mode`, `blocked_page_text`, группы/устройства/списки MAC.

## Исторические ловушки UI

- Кнопка «Привязать устройства» в таблице администраторов удалялась в `overview-secure.js` — восстановлена; блокируется только привязка из общего списка устройств.
- Белый список через LuCI: `updateMacList` должен делать `uci.unset` + повторный `uci.set` по каждому MAC, иначе `list mac` с роутера не обновляется (см. `persistDeviceListMembership`).
