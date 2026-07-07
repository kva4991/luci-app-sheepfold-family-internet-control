'use strict';
'require view';
'require ui';
'require uci';
'require fs';

var devices = [];
var defaultLogCachePath = '/tmp/sheepfold/events.log';
var defaultSiteAllowlistSources = [
        'UT1 child | https://dsi.ut-capitole.fr/blacklists/index_en.php#child'
].join('\n');
var defaultSiteBlocklistSources = [
        'UT1 adult, malware, phishing, gambling, games, vpn | https://dsi.ut-capitole.fr/blacklists/index_en.php',
        'StevenBlack hosts gambling-porn | https://github.com/StevenBlack/hosts',
        'HaGeZi Threat Intelligence Feeds | https://github.com/hagezi/dns-blocklists',
        'URLhaus malware URLs | https://urlhaus.abuse.ch/api/'
].join('\n');

var emergencySites = [
        ['gosuslugi.ru', 'Госуслуги', 'Государственные услуги'],
        ['esia.gosuslugi.ru', 'ЕСИА', 'Вход в государственную учётную запись'],
        ['mos.ru', 'Услуги Москвы', 'Городские сервисы'],
        ['school.mos.ru', 'Московская школа', 'Доступ к школе'],
        ['dnevnik.ru', 'Дневник.ру', 'Школьный дневник'],
        ['ya.ru', 'Поиск Яндекса', 'Узкая точка входа в поиск'],
        ['2gis.ru', '2ГИС', 'Карты и организации']
];

var admins = [
        {
                id: 'A-0001',
                name: 'Родитель',
                login: 'SuperParent',
                role: 'owner',
                deviceIds: []
        }
];

var logEntries = [];

var rootPasswordIsSet = true;
// Настройки на этой странице сначала живут в черновике, а не сразу пишутся в UCI.
// Так родитель явно нажимает "Сохранить", получает одно понятное уведомление,
// а LuCI не копит неожиданную плашку "не принятые изменения" после каждого select/input.
var settingsDraft = {};
var settingsSpecialSavers = [];
var settingsIsSaving = false;

var translations = {
        'All devices': 'Все устройства',
        'User lists': 'Списки пользователей',
        'User management': 'Управление пользователями',
        'Allowlist': 'Белый список',
        'Blocklist': 'Чёрный список',
        'Schedules': 'Расписания',
        'Groups': 'Группы',
        'Group devices': 'Устройства группы',
        'Add group': 'Добавить группу',
        'Delete group': 'Удалить группу',
        'Configure group': 'Настроить группу',
        'Group settings': 'Настройки группы',
        'Group name': 'Название группы',
        'Group color': 'Цвет группы',
        'Automatic color': 'Автоматический цвет',
        'Group schedules': 'Расписания группы',
        'Assigned devices': 'Привязанные устройства',
        'Allow only selected whitelist sources for this group': 'Разрешить только выбранные источники белых списков для этой группы',
        'Devices in this group will be limited to domains from the selected whitelist sources and manually allowed emergency-useful sites.': 'Устройства этой группы будут ограничены доменами из выбранных источников белых списков и вручную разрешёнными аварийно-полезными сайтами.',
        'Enable activity journal for all devices in this group': 'Включить журнал активности для всех устройств этой группы',
        'Activity journal is sensitive. It is not collected for administrators, allowlist, or blocklist devices.': 'Журнал активности содержит чувствительные данные. Он не собирается для админских устройств, белого списка и чёрного списка.',
        'Schedule conflict': 'Конфликт расписаний',
        'Selected schedules may conflict with each other. Saving is allowed, but review the rules carefully.': 'Выбранные расписания могут конфликтовать между собой. Сохранение разрешено, но внимательно проверьте правила.',
        'Confirmation will be available in': 'Подтверждение будет доступно через',
        'I understand the risk, continue': 'Я понимаю риск, продолжить',
        'Group saved.': 'Группа сохранена.',
        'Group created.': 'Группа создана.',
        'Could not create group.': 'Не удалось создать группу.',
        'Could not save group.': 'Не удалось сохранить группу.',
        'Group name is required.': 'Название группы обязательно.',
        'This group already exists.': 'Такая группа уже существует.',
        'more devices hidden': 'ещё устройств скрыто',
        'Group deleted.': 'Группа удалена.',
        'Could not delete group.': 'Не удалось удалить группу.',
        'This group cannot be deleted while devices are assigned to it.': 'Эту группу нельзя удалить, пока к ней привязаны устройства.',
        'Protected group cannot be deleted.': 'Защищённую группу нельзя удалить.',
        'No groups yet. Assign devices to groups in device settings.': 'Групп пока нет. Назначьте устройства в группы в настройках устройства.',
        'Groups collect devices so schedules and access rules can be applied to several devices at once.': 'Группы объединяют устройства, чтобы расписания и правила доступа можно было применять сразу к нескольким устройствам.',
        'Group editor is not implemented in this visual test build.': 'Редактор групп пока не реализован в этой тестовой сборке.',
        'Emergency-useful sites': 'Аварийно-полезные сайты',
        'Wi-Fi': 'Wi-Fi',
        'Integrations': 'Интеграции',
        'Messenger': 'Мессенджер',
        'Administrators': 'Администраторы',
        'Logs': 'Журнал',
        'Settings': 'Настройки',
        'Information': 'Информация',
        'Router information': 'Информация о роутере',
        'Refresh information': 'Обновить информацию',
        'Loading router information...': 'Загружаю информацию о роутере...',
        'Could not load router information.': 'Не удалось загрузить информацию о роутере.',
        'Current router time': 'Текущее время роутера',
        'Current Sheepfold version': 'Текущая версия Sheepfold',
        'Internet connection status': 'Статус интернет-соединения',
        'Ping to ya.ru': 'Пинг до ya.ru',
        'Router firmware version': 'Версия прошивки роутера',
        'OpenWRT release': 'Релиз OpenWRT',
        'Kernel version': 'Версия ядра',
        'Router model': 'Модель роутера',
        'Router uptime': 'Время работы роутера',
        'Load average': 'Средняя нагрузка',
        'Memory': 'Память',
        'LAN ports': 'LAN-порты',
        'Podkop': 'Podkop',
        'AdGuard Home': 'AdGuard Home',
        'Wi-Fi modules': 'Wi-Fi модули',
        'Module': 'Модуль',
        'Band': 'Диапазон',
        'Channel': 'Канал',
        'Driver/type': 'Драйвер/тип',
        'Path': 'Путь',
        'Country': 'Страна',
        'Mode': 'Режим',
        'Enabled': 'Включен',
        'Disabled': 'Выключен',
        'Installed': 'Установлен',
        'Not installed': 'Не установлен',
        'Online': 'Онлайн',
        'Offline': 'Офлайн',
        'Limited': 'Ограничено',
        'Unknown': 'Неизвестно',
        'AI context for APK': 'Контекст для ИИ через APK',
        'The Android app can request this diagnostics snapshot from /cgi-bin/sheepfold-api/router-info and show it to the parent before sending it to an AI provider. It does not include Wi-Fi passwords, bot tokens, child names, MAC addresses, or device lists.': 'Android-приложение может запросить этот диагностический снимок через /cgi-bin/sheepfold-api/router-info и показать его родителю перед отправкой ИИ-провайдеру. Здесь нет паролей Wi-Fi, токенов ботов, имён детей, MAC-адресов и списков устройств.',
        'AI assistant model': 'Модель ИИ-помощника',
        'AI provider': 'Провайдер ИИ',
        'Gemini Free': 'Gemini Free',
        'The Android app sends AI requests to the router; the router calls the selected provider.': 'Android-приложение отправляет ИИ-запросы на роутер, а роутер вызывает выбранного провайдера.',
        'DeepSeek requests are sent from the router. The Android app does not store the API key.': 'Запросы DeepSeek отправляются с роутера. Android-приложение не хранит API-ключ.',
        'DeepSeek API key': 'API-ключ DeepSeek',
        'Create the key in DeepSeek Platform and save it here. It is stored only on the router.': 'Создайте ключ в DeepSeek Platform и сохраните его здесь. Он хранится только на роутере.',
        'Gemini Free uses Google AI Studio free-tier limits. The API key is stored only on the router.': 'Gemini Free использует бесплатные лимиты Google AI Studio. API-ключ хранится только на роутере.',
        'Gemini API key': 'API-ключ Gemini',
        'Create the key in Google AI Studio and save it here. Free limits depend on Google account and region.': 'Создайте ключ в Google AI Studio и сохраните его здесь. Бесплатные лимиты зависят от аккаунта Google и региона.',
        'Donation': 'Donation',
        'Support the project': 'Поддержать проект',
        'If Sheepfold becomes useful and you want to support development, donation links will be added here before the first public release.': 'Если Sheepfold окажется полезным и вы захотите поддержать разработку, ссылки для донатов будут добавлены здесь до первого публичного релиза.',
        'Possible options:': 'Возможные варианты:',
        'GitHub Sponsors for international audience;': 'GitHub Sponsors для международной аудитории;',
        'Boosty or YooMoney for Russian-speaking users.': 'Boosty или ЮMoney для русскоязычных пользователей.',
        'Misc': 'Разное',
        'Site list sources': 'Источники списков сайтов',
        'Whitelist sources': 'Источники белых списков',
        'One source per line: name | URL. Use updateable external sources instead of manually maintaining a huge list.': 'Один источник на строку: название | URL. Используйте обновляемые внешние источники, а не ручное ведение огромного списка.',
        'Site blacklist': 'Чёрный список сайтов',
        'Site blacklist sources': 'Источники чёрного списка сайтов',
        'Disabled': 'Выключено',
        'Enabled for everyone': 'Включить для всех',
        'Enabled for everyone except allowlist and administrators': 'Включить для всех кроме белого списка и админов',
        'Site blacklist mode saved.': 'Режим чёрного списка сайтов сохранён.',
        'Could not save site blacklist mode.': 'Не удалось сохранить режим чёрного списка сайтов.',
        'Site list update': 'Обновление списков сайтов',
        'Every day': 'Каждый день',
        'Every 3 days': 'Раз в 3 дня',
        'Once a week': 'Раз в неделю',
        'Site list update interval saved.': 'Период обновления списков сайтов сохранён.',
        'Could not save site list update interval.': 'Не удалось сохранить период обновления списков сайтов.',
        'Whitelist sources saved.': 'Источники белых списков сохранены.',
        'Could not save whitelist sources.': 'Не удалось сохранить источники белых списков.',
        'Site blacklist sources saved.': 'Источники чёрного списка сайтов сохранены.',
        'Could not save site blacklist sources.': 'Не удалось сохранить источники чёрного списка сайтов.',
        'Journal': 'Журнал',
        'Scheduled': 'По расписанию',
        'Restricted': 'Ограничено',
        'New': 'Новое',
        'This action is a visual prototype only.': 'Это действие работает только как визуальная заглушка.',
        'Configure': 'Настроить',
        'Device settings': 'Настройки устройства',
        'Device settings saved.': 'Настройки устройства сохранены.',
        'Could not save device settings.': 'Не удалось сохранить настройки устройства.',
        'Enable activity journal for this device': 'Включить журнал активности для этого устройства',
        'This device is already in the blocklist. Remove it from the blocklist before adding it to the allowlist.': 'Это устройство уже в чёрном списке. Сначала уберите его из чёрного списка, потом добавляйте в белый.',
        'This device is already in the allowlist. Remove it from the allowlist before adding it to the blocklist.': 'Это устройство уже в белом списке. Сначала уберите его из белого списка, потом добавляйте в чёрный.',
        'Permanent DHCP lease': 'Постоянная аренда DHCP',
        'Permanent IP lease': 'Постоянная аренда IP',
        'Create permanent DHCP lease': 'Создать постоянную аренду DHCP',
        'Existing permanent DHCP lease will be updated, not removed.': 'Существующая постоянная аренда DHCP будет обновлена, а не удалена.',
        'Static lease requires an IP address.': 'Для постоянной аренды нужен IP-адрес.',
        'Device name': 'Имя устройства',
        'Hostname': 'Имя в сети',
        'Detection source': 'Источник обнаружения',
        'Detection confidence': 'Уверенность автоопределения',
        'Unknown device type': 'Неизвестный тип',
        'Auto-detected': 'Автоопределено',
        'Auto-assigned to No restrictions': 'Автоматически добавлено в "Без ограничений"',
        'Parents': 'Родители',
        'Children': 'Дети',
        'Child number 1': 'Первый ребёнок',
        'TV / media': 'ТВ / медиа',
        'Guests': 'Гости',
        'No restrictions': 'Без ограничений',
        'Custom': 'Своя',
        'Use custom group': 'Использовать свою группу',
        'Access mode': 'Режим доступа',
        'ID': 'ID',
        'Bind devices': 'Привязать устройства',
        'Assign devices to administrator': 'Назначение устройств админу',
        'Select administrator devices': 'Выберите устройства администратора',
        'Selected administrator devices can manage Sheepfold.': 'Выбранные устройства смогут управлять программой.',
        'Blocklisted devices are not available for binding.': 'Устройства из чёрного списка недоступны для привязки.',
        'When a device is assigned to an administrator, Sheepfold removes it from ordinary groups and schedules, disables activity logging for it, and adds it to the allowlist.': 'При назначении устройства администратору Sheepfold убирает его из обычных групп и расписаний, отключает для него журнал активности и добавляет устройство в белый список.',
        'A blocklisted device cannot become an administrator device. Remove it from the blocklist first.': 'Устройство из чёрного списка не может стать админским. Сначала уберите его из чёрного списка.',
        'Selected devices are shown first.': 'Выбранные устройства показаны сверху.',
        'No devices selected': 'Устройства не выбраны',
        'No devices': 'Нет устройств',
        'Device bindings saved.': 'Привязка устройств сохранена.',
        'Admin device': 'Админское устройство',
        'Pairing': 'Сопряжение',
        'Pairing settings': 'Настройки сопряжения',
        'Scan this QR code with the Android app to connect it to this router.': 'Отсканируйте QR-код Android-приложением, чтобы подключить его к этому роутеру.',
        'Manual setup': 'Ручная настройка',
        'Router address': 'Адрес роутера',
        'Server IP address': 'IP адрес сервера',
        'Port': 'Порт',
        'Used by Android app and pairing QR codes.': 'Используется Android-приложением и QR-кодами подключения.',
        'Port saved. Sheepfold service restart was requested. Android can discover the new port through the router discovery file.': 'Порт сохранён. Запрошен перезапуск сервиса Sheepfold. Android сможет узнать новый порт через файл обнаружения на роутере.',
        'Could not save port.': 'Не удалось сохранить порт.',
        'Enter a port from 1 to 65535.': 'Введите порт от 1 до 65535.',
        'Administrator settings': 'Настройки администратора',
        'Admin name': 'Имя',
        'Temporary password': 'Временный пароль',
        'Show temporary password': 'Показать временный пароль',
        'Hide temporary password': 'Скрыть временный пароль',
        'Show secret': 'Показать секрет',
        'Hide secret': 'Скрыть секрет',
        'Scan this QR code in the Android app for quick setup.': 'Отсканируйте этот QR-код в Android-приложении для быстрой настройки.',
        'Sheepfold API URL': 'URL API Sheepfold',
        'Administrator login': 'Логин администратора',
        'Pairing code': 'Код сопряжения',
        'QR payload': 'Данные QR',
        'Token lifetime': 'Срок действия токена',
        '10 minutes': '10 минут',
        'Wi-Fi MAC check': 'Проверка MAC Wi-Fi',
        'Use the real device MAC for this home Wi-Fi network.': 'Для этой домашней Wi-Fi сети используйте настоящий MAC устройства.',
        'Android must require the real device MAC for this home Wi-Fi network before continuing setup.': 'Android должен требовать настоящий MAC устройства для этой домашней Wi-Fi сети до продолжения настройки.',
        'Close': 'Закрыть',
        '+30 min': '+30 мин',
        'Temporary access would require confirmation.': 'Временный доступ потребует подтверждения.',
        'Device': 'Устройство',
        'Type': 'Тип',
        'Device type': 'Тип устройства',
        'Phone': 'Телефон',
        'Tablet': 'Планшет',
        'Computer': 'Компьютер',
        'TV': 'Телевизор',
        'Game console': 'Игровая приставка',
        'Printer': 'Принтер',
        'Camera': 'Камера',
        'Server': 'Сервер',
        'Smart speaker': 'Умная колонка',
        'Robot vacuum': 'Робот-пылесос',
        'Smart home': 'Умный дом',
        'Engineering device': 'Инженерное устройство',
        'Smart device': 'Умное устройство',
        'Network device': 'Сетевое устройство',
        'IP address': 'IP-адрес',
        'MAC address': 'MAC-адрес',
        'Group': 'Группа',
        'Status': 'Статус',
        'Actions': 'Действия',
        'Detected automatically from router leases, ARP/neighbor data, and static DHCP leases.': 'Обнаруживаются автоматически из аренд DHCP, ARP/neighbor-данных и постоянных аренд DHCP.',
        'No devices found in DHCP leases, ARP, or static DHCP leases yet.': 'В арендах DHCP, ARP и постоянных арендах DHCP пока нет устройств.',
        'Unknown device': 'Неизвестное устройство',
        'Not configured': 'Не настроено',
        'Active DHCP lease': 'Активная аренда DHCP',
        'ARP/neighbor entry': 'Обнаружено в ARP/neighbor',
        'Static DHCP lease': 'Постоянная аренда DHCP',
        'Static DHCP lease, currently online': 'Постоянная аренда DHCP, сейчас в сети',
        'Configured in Sheepfold': 'Настроено в Sheepfold',
        'Search by name, IP, or MAC': 'Поиск по имени, IP или MAC',
        'Search by name, IP, MAC, or ID': 'Поиск по имени, IP, MAC или ID',
        'Manual MAC-based add form is not implemented in this visual test build.': 'Ручное добавление по MAC пока не реализовано в этой визуальной сборке.',
        'Add device manually': 'Добавить устройство вручную',
        'Device name': 'Название устройства',
        'Device added.': 'Устройство добавлено.',
        'These devices are never blocked by global blocking or schedules.': 'Эти устройства не блокируются глобальной блокировкой и расписаниями.',
        'Add device': 'Добавить устройство',
        'Add device to allowlist': 'Добавить устройство в белый список',
        'Add device to blocklist': 'Добавить устройство в чёрный список',
        'Remove from allowlist': 'Удалить из белого списка',
        'Remove from blocklist': 'Удалить из чёрного списка',
        'Remove device from allowlist?': 'Удалить устройство из белого списка?',
        'Remove device from blocklist?': 'Удалить устройство из чёрного списка?',
        'Available devices': 'Доступные устройства',
        'Select': 'Выбрать',
        'No devices available to add.': 'Нет устройств, доступных для добавления.',
        'MAC address is required.': 'MAC-адрес обязателен.',
        'Enter a valid MAC address.': 'Введите корректный MAC-адрес.',
        'Device added to allowlist.': 'Устройство добавлено в белый список.',
        'Device added to blocklist.': 'Устройство добавлено в чёрный список.',
        'Device removed from allowlist.': 'Устройство удалено из белого списка.',
        'Device removed from blocklist.': 'Устройство удалено из чёрного списка.',
        'Could not remove device from list.': 'Не удалось удалить устройство из списка.',
        'Could not add device.': 'Не удалось добавить устройство.',
        'Action failed.': 'Не удалось выполнить действие.',
        'Administrator device cannot be added to blocklist': 'Админское устройство нельзя добавить в чёрный список.',
        'Invalid MAC address': 'Неверный MAC-адрес.',
        'The UI must prevent adding the same MAC to allowlist and blocklist.': 'Интерфейс должен запрещать добавление одного MAC одновременно в белый и чёрный список.',
        'Quick add to allowlist': 'Быстрое добавление в белый список',
        'Quick allowlist add': 'Быстрое добавление в белый список',
        'Scan Wi-Fi QR, then add newly connected devices manually.': 'Отсканируйте QR Wi-Fi, затем вручную добавьте только что подключившиеся устройства.',
        'Wi-Fi access QR': 'QR подключения к Wi-Fi',
        'Allowlist request QR': 'QR запроса в белый список',
        'After connecting to Wi-Fi, scan this QR to request allowlist access from this phone.': 'После подключения к Wi-Fi отсканируйте этот QR с телефона, чтобы запросить добавление в белый список.',
        'One-time allowlist link': 'Одноразовая ссылка добавления',
        'Newly connected devices': 'Только что подключившиеся устройства',
        'Adding allowed': 'Разрешено добавление',
        'Adding window expired': 'Время добавления истекло',
        'Click to restart the 30 second window.': 'Нажмите, чтобы снова запустить окно на 30 секунд.',
        'Connected after quick add started.': 'Подключились после запуска быстрого добавления.',
        'Seen': 'Обнаружено',
        'seconds': 'секунд',
        'seconds ago': 'секунд назад',
        'minute ago': 'минуту назад',
        'minutes ago': 'минут назад',
        'Add': 'Добавить',
        'Candidate added to allowlist. Save changes to apply.': 'Кандидат добавлен в белый список. Сохраните изменения, чтобы применить.',
        'Quick mode only collects candidates. A parent still presses Add for every device.': 'Быстрый режим только собирает кандидатов. Родитель всё равно нажимает "Добавить" для каждого устройства.',
        'Blocklisted devices cannot access the internet, LuCI, SSH, or the Sheepfold API.': 'Устройства из чёрного списка не могут открывать интернет, LuCI, SSH и Sheepfold API.',
        'Blocklist changes require confirmation.': 'Изменения чёрного списка требуют подтверждения.',
        'Emergency-useful sites for blocklisted devices are enabled and still do not open router access.': 'Включен доступ к "аварийно-полезным сайтам" для чёрного списка (но доступ к роутеру всё-равно закрыт).',
        'Emergency-useful sites for blocklisted devices are disabled and still do not open router access.': 'Выключен доступ к "аварийно-полезным сайтам" для чёрного списка (это не открывает доступ к роутеру).',
        'Blocklist emergency-useful sites access': 'Доступ пользователей из чёрного списка к "аварийно-полезным сайтам"',
        'Allows blocklisted devices to access only sites added to the emergency-useful sites list. Router access remains blocked.': 'Разрешает устройствам из чёрного списка доступ только к сайтам добавленым в список аварийно-полезные сайты. Доступ к роутеру остаётся закрытым.',
        'Blocklist emergency-useful sites access saved.': 'Доступ чёрного списка к аварийно-полезным сайтам сохранён.',
        'Could not save blocklist emergency-useful sites access.': 'Не удалось сохранить доступ чёрного списка к аварийно-полезным сайтам.',
        'Yes': 'Да',
        'No': 'Нет',
        'Allow and block rules for devices and groups.': 'Правила разрешения и блокировки для устройств и групп.',
        'Add rule': 'Добавить правило',
        'Schedule editor is not implemented in this visual test build.': 'Редактор расписаний пока не реализован в этой визуальной сборке.',
        'School days': 'Учебные дни',
        'Children group': 'Группа детей',
        'Allow 07:00-20:30, block after bedtime': 'Разрешить 07:00-20:30, блокировать после отбоя',
        'Temporary access': 'Временный доступ',
        'End of day': 'До конца дня',
        'Bedtime': 'До отбоя',
        'Temporary access requires confirmation.': 'Временный доступ требует подтверждения.',
        'Default bedtime': 'Время отбоя по умолчанию',
        'Used by the "until bedtime" quick action.': 'Используется кнопкой быстрого доступа "до отбоя".',
        'Access to emergency-useful sites': 'Доступ к аварийно-полезным сайтам',
        'Editable list for necessary services during restricted access.': 'Редактируемый список необходимых сервисов при ограниченном доступе.',
        'Emergency-useful sites are a small editable list of necessary services that may stay available during restricted access.': 'Аварийно-полезные сайты — это редактируемый белый список необходимых сервисов,  которые могут оставаться доступными при ограничении интернета на роутере (при добавлении пользователя в чёрный список или выключении у него доступа в интернет).',
        'Add site': 'Добавить сайт',
        'Edit site': 'Редактировать сайт',
        'Delete site': 'Удалить сайт',
        'Site URL is required.': 'URL адрес сайта обязателен.',
        'Site saved.': 'Сайт сохранён.',
        'Site deleted.': 'Сайт удалён.',
        'Delete this site?': 'Удалить этот сайт?',
        'This site will be removed from the emergency-useful list.': 'Этот сайт будет удалён из списка аварийно-полезных сайтов.',
        'Delete': 'Удалить',
        'URL address': 'URL адрес',
        'Name': 'Название',
        'Description': 'Описание',
        'Cancel': 'Отмена',
        'Do not add broad yandex.ru by default: it can open video, music, games, feeds, and other non-emergency services.': 'Не добавляйте yandex.ru целиком в аварийно-полезные сайты. Это не только поиск: через общий домен и связанные сервисы могут открываться видео, музыка, игры, новости, ленты рекомендаций и другие развлечения. Для аварийного доступа лучше добавлять только узкие и понятные адреса, например ya.ru для поиска или конкретный сервис, который действительно нужен.',
        'Family-facing shortcut for common OpenWRT wireless settings.': 'Упрощённый семейный доступ к основным настройкам Wi-Fi OpenWRT.',
        'Connect QR': 'QR подключения',
        'Scan to connect to this Wi-Fi network.': 'Отсканируйте для подключения к этой Wi-Fi сети.',
        'Real router wireless settings are loaded from OpenWRT UCI.': 'Реальные настройки Wi-Fi загружаются из OpenWRT UCI.',
        'No active Wi-Fi networks were found in the router wireless config.': 'В конфигурации wireless роутера не найдены активные Wi-Fi сети.',
        'Network': 'Сеть',
        'Open network': 'Открытая сеть',
        'SSID': 'SSID',
        'Password': 'Пароль',
        'Security': 'Защита',
        'Channel': 'Канал',
        'Auto': 'Авто',
        'Use together with': 'Использование совместно с',
        'None': 'Нет',
        'Traffic order: Sheepfold -> AdGuard Home -> Podkop.': 'Порядок трафика: Sheepfold -> AdGuard Home -> Podkop.',
        'Automatic router changes must show integration-specific notes and create/export a backup before applying.': 'Автоматические изменения роутера должны показывать нюансы интеграции и создавать/экспортировать резервную копию перед применением.',
        'Integration status': 'Статус интеграций',
        'AdGuard Home status': 'Статус AdGuard Home',
        'AdGuard Home filters DNS requests after Sheepfold allows a device. It helps block ads, trackers, and unwanted domains.': 'AdGuard Home фильтрует DNS-запросы после того, как Sheepfold разрешил устройство. Он помогает блокировать рекламу, трекеры и нежелательные домены.',
        'AdGuard Home API check should use the local AdGuard Home API when credentials are configured.': 'Проверка API AdGuard Home должна использовать локальный API AdGuard Home, когда учётные данные настроены.',
        'Podkop status': 'Статус Podkop',
        'Podkop routes already allowed traffic according to its own routing rules. Sheepfold must not overwrite Podkop routing.': 'Podkop маршрутизирует уже разрешённый трафик по своим правилам. Sheepfold не должен перезаписывать маршрутизацию Podkop.',
        'Podkop has no stable Sheepfold-facing API yet; detect package/service state and show conservative notes.': 'У Podkop пока нет стабильного API для Sheepfold; определяйте пакет/службу и показывайте осторожные подсказки.',
        'Prepare integration settings': 'Подготовить настройки интеграции',
        'Integration setup must show planned changes, create an export, and require confirmation before applying.': 'Настройка интеграции должна показать план изменений, создать экспорт и потребовать подтверждение перед применением.',
        'Mode notes': 'Нюансы режима',
        'Sheepfold works alone.': 'Sheepfold работает самостоятельно.',
        'Sheepfold blocks/allows devices before AdGuard Home DNS filtering.': 'Sheepfold разрешает/блокирует устройства до DNS-фильтрации AdGuard Home.',
        'Sheepfold must not overwrite Podkop-managed routing, Dnsmasq, nftables, or sing-box state.': 'Sheepfold не должен перезаписывать маршрутизацию, Dnsmasq, nftables или sing-box, которыми управляет Podkop.',
        'Recommended chain: Sheepfold -> AdGuard Home -> Podkop.': 'Рекомендуемая цепочка: Sheepfold -> AdGuard Home -> Podkop.',
        'Active messenger': 'Активный мессенджер',
        'Messenger integration lets approved parents receive notifications and control Sheepfold with short commands when they are away from home.': 'Интеграция с мессенджером позволяет одобренным родителям получать уведомления и управлять Sheepfold короткими командами вне дома.',
        'Disabled': 'Выключено',
        'Messenger settings saved.': 'Настройки мессенджера сохранены.',
        'Could not save messenger settings.': 'Не удалось сохранить настройки мессенджера.',
        'Messenger settings were sent to the router, but the router still reports another active messenger. Reinstall the latest Sheepfold package and check UCI config.': 'Настройки мессенджера отправлены на роутер, но роутер всё ещё сообщает другой активный мессенджер. Установите последний пакет Sheepfold и проверьте UCI-конфиг.',
        'Router reports active messenger:': 'Роутер сообщает активный мессенджер:',
        'Messenger connection status': 'Статус подключения мессенджера',
        'Messenger status will be checked after saving settings or sending a test message.': 'Статус будет проверен после сохранения настроек или отправки тестового сообщения.',
        'Checking messenger connection...': 'Проверяется подключение к мессенджеру...',
        'Messenger disabled.': 'Мессенджер выключен.',
        'Connection check failed.': 'Не удалось проверить подключение.',
        'Telegram connected.': 'Telegram подключён.',
        'VK connected.': 'VK подключён.',
        'No response from Telegram server.': 'От сервера Telegram нет ответа.',
        'No response from VK server.': 'От сервера VK нет ответа.',
        'Stored on the router.': 'Хранится на роутере.',
        'VK community access token': 'Ключ доступа сообщества VK',
        'VK community ID': 'ID сообщества VK',
        'VK admin user ID': 'VK ID родителя-администратора',
        'Telegram bot token': 'Токен Telegram-бота',
        'Telegram admin chat ID': 'Chat ID родителя-администратора',
        'Create a VK community, enable messages, create an access token for community messages, then enter the community ID and the VK user ID of the parent whose commands are allowed.': 'Создайте сообщество VK, включите сообщения, создайте ключ доступа для сообщений сообщества, затем укажите ID сообщества и VK ID родителя, команды которого разрешены.',
        'Create a bot through BotFather, paste the bot token, send any message to the bot from the parent account, then enter that chat ID here.': 'Создайте бота через BotFather, вставьте токен, отправьте боту любое сообщение с аккаунта родителя, затем укажите здесь chat ID этого диалога.',
        'Telegram setup short note': 'Создайте отдельного Telegram-бота для Sheepfold, вставьте токен и привяжите chat ID родителя. Sheepfold использует исходящее подключение к Telegram, поэтому роутеру не нужен публичный адрес.',
        'Step-by-step Telegram setup': 'Пошаговая настройка Telegram',
        'Open Telegram and find the official @BotFather account. Check the username carefully: @BotFather.': 'Откройте Telegram и найдите официальный аккаунт @BotFather. Внимательно проверьте имя: @BotFather.',
        'Press Start or send /start.': 'Нажмите Start или отправьте команду /start.',
        'Send /newbot and follow BotFather questions.': 'Отправьте /newbot и ответьте на вопросы BotFather.',
        'Enter a visible bot name, for example Sheepfold Home. This name is shown in Telegram.': 'Введите видимое имя бота, например Sheepfold Home. Это имя будет видно в Telegram.',
        'Enter a unique bot username. It must end with bot, for example my_sheepfold_home_bot.': 'Введите уникальное имя пользователя бота. Оно должно заканчиваться на bot, например my_sheepfold_home_bot.',
        'BotFather will send a token that looks like 123456:ABC-DEF... Copy it into the Telegram bot token field. Treat this token like a password.': 'BotFather пришлёт токен похожий на 123456:ABC-DEF... Скопируйте его в поле “Токен Telegram-бота”. Относитесь к токену как к паролю.',
        'Select Telegram as the active messenger and save settings in Sheepfold.': 'Выберите Telegram активным мессенджером и сохраните настройки Sheepfold.',
        'Open the created bot from the parent Telegram account and send any message to it. If the chat ID field is empty, Sheepfold will reply with your chat ID.': 'Откройте созданного бота с Telegram-аккаунта родителя и отправьте ему любое сообщение. Если поле chat ID пустое, Sheepfold ответит вашим chat ID.',
        'Copy that chat ID into the Telegram admin chat ID field and save settings again.': 'Скопируйте этот chat ID в поле “Chat ID родителя-администратора” и снова сохраните настройки.',
        'Press the test message button. If everything is correct, the bot will send a message from the router.': 'Нажмите кнопку тестового сообщения. Если всё настроено правильно, бот пришлёт сообщение от роутера.',
        'Keep the bot private. Do not publish its token, do not add it to public groups, and do not give the token to children.': 'Держите бота приватным. Не публикуйте токен, не добавляйте бота в публичные группы и не передавайте токен детям.',
        'Official Telegram guide': 'Официальная инструкция Telegram',
        'Available commands': 'Доступные команды',
        'Telegram commands: /start, /help, /status, /devices, /internet_on, /internet_off, /wifi_on, /wifi_off, /support, /grant_time, /block_device, /unblock_device, /allowlist_add, /blocklist_add, /logs, /clear_logs, /update, /reboot, /emergency_sites, /wifi_status. Russian phrases like "помощь", "статус", "показать все устройства", "отключить интернет", and "саппорт" also work. Dangerous commands require confirmation. Commands are accepted only from the entered chat ID.': 'Команды Telegram: /start, /help, /status, /devices, /internet_on, /internet_off, /wifi_on, /wifi_off, /support, /grant_time, /block_device, /unblock_device, /allowlist_add, /blocklist_add, /logs, /clear_logs, /update, /reboot, /emergency_sites, /wifi_status. Русские фразы вроде «помощь», «статус», «показать все устройства», «отключить интернет» и «саппорт» тоже работают. Опасные команды требуют подтверждения. Команды принимаются только от разрешённого ID пользователя, указанного в настройках роутера.',
        'Russian phrases like "help", "status", "show all devices", "turn internet off", and "support" also work. Dangerous commands require confirmation. Commands are accepted only from the allowed user ID configured on the router.': 'Русские фразы вроде «помощь», «статус», «показать все устройства», «отключить интернет» и «саппорт» тоже работают. Опасные команды требуют подтверждения. Команды принимаются только от разрешённого ID пользователя, указанного в настройках роутера.',
        'Send test Telegram message': 'Отправить тестовое сообщение Telegram',
        'Test Telegram message sent.': 'Тестовое сообщение Telegram отправлено.',
        'Could not send test Telegram message. Check bot token, chat ID, internet access on the router, and that Telegram is selected as the active messenger.': 'Не удалось отправить тестовое сообщение Telegram. Проверьте токен бота, chat ID, доступ роутера в интернет и что Telegram выбран активным мессенджером.',
        'Sheepfold accepts messenger commands only from the administrator ID entered here. Other users are ignored.': 'Sheepfold принимает команды мессенджера только от указанного здесь администратора. Остальные пользователи игнорируются.',
        'Administrator accounts': 'Учётные записи администраторов',
        'Add administrator': 'Добавить администратора',
        'Adding a new administrator requires confirmation.': 'Добавление администратора требует подтверждения.',
        'Administrator added.': 'Администратор добавлен.',
        'Name and login are required.': 'Имя и логин обязательны.',
        'This login is already used.': 'Этот логин уже используется.',
        'Admin name': 'Имя',
        'Login': 'Логин',
        'Admin devices': 'Админские устройства',
        'Commands': 'Доступные команды',
        'show all devices': 'показать все устройства',
        'block internet': 'выключить интернет',
        'unblock internet': 'включить интернет',
        'grant +30 minutes': 'дать +30 минут',
        'show Wi-Fi status': 'показать состояние Wi-Fi',
        'enable Wi-Fi': 'включить Wi-Fi',
        'disable Wi-Fi': 'выключить Wi-Fi',
        'help': 'помощь',
        'disable internet': 'отключить интернет',
        'block device #3': 'заблокировать #3',
        'unblock device #3': 'разблокировать #3',
        'add #3 to allowlist': 'добавить #3 в белый список',
        'add #3 to blocklist': 'добавить #3 в чёрный список',
        'show log': 'показать журнал',
        'clear log': 'очистить журнал',
        'update app': 'обновить приложение',
        'reboot router': 'перезагрузить роутер',
        'emergency-useful sites': 'аварийно-полезные сайты',
        'support': 'поддержка',
        'status': 'статус',
        'Shows all detected devices with Sheepfold IDs.': 'Показывает все найденные устройства с ID Sheepfold.',
        'Turns on global blocking for everyone except the allowlist.': 'Включает глобальную блокировку для всех, кроме белого списка.',
        'Turns global blocking off.': 'Выключает глобальную блокировку.',
        'Grants temporary access to the selected device.': 'Выдаёт выбранному устройству временный доступ.',
        'Shows whether Wi-Fi is enabled.': 'Показывает, включён ли Wi-Fi.',
        'Turns router Wi-Fi on.': 'Включает Wi-Fi на роутере.',
        'Turns router Wi-Fi off; use carefully.': 'Выключает Wi-Fi на роутере; используйте осторожно.',
        'Blocks the selected device.': 'Блокирует выбранное устройство.',
        'Removes blocking from the selected device.': 'Снимает блокировку с выбранного устройства.',
        'Adds the selected device to the allowlist.': 'Добавляет выбранное устройство в белый список.',
        'Adds the selected device to the blocklist.': 'Добавляет выбранное устройство в чёрный список.',
        'Shows recent administrative log entries.': 'Показывает последние записи административного журнала.',
        'Clears the administrative log after confirmation.': 'Очищает административный журнал после подтверждения.',
        'Checks and installs an update after confirmation.': 'Проверяет и устанавливает обновление после подтверждения.',
        'Reboots the router after confirmation.': 'Перезагружает роутер после подтверждения.',
        'Shows configured emergency-useful sites.': 'Показывает настроенные аварийно-полезные сайты.',
        'Shows available commands.': 'Показывает доступные команды.',
        'Shows what to prepare before asking for support.': 'Показывает, что подготовить перед обращением в поддержку.',
        'Shows Sheepfold and router status.': 'Показывает состояние Sheepfold и роутера.',
        'Administrative action log. Export masks sensitive fields.': 'Журнал действий администраторов. При экспорте чувствительные поля маскируются.',
        'Clear log': 'Очистить журнал',
        'Clearing logs requires confirmation.': 'Очистка журнала требует подтверждения.',
        'Log cleared.': 'Журнал очищен.',
        'Could not clear log.': 'Не удалось очистить журнал.',
        'Log is empty.': 'Журнал пуст.',
        'The log is stored in RAM and is cleared after router reboot. Export masks sensitive fields.': 'Журнал очищается после перезагрузки роутера.',
        'Cache file path': 'Путь к файлу кэша',
        'The cache file should be stored under /tmp/ so it does not wear router flash memory.': 'Файлу кэша лучше лежать внутри /tmp/, чтобы не изнашивал flash-память роутера.',
        'Cache file path saved.': 'Путь к файлу кэша сохранён.',
        'Could not save cache file path.': 'Не удалось сохранить путь к файлу кэша.',
        'Cache file path must start with /tmp/ and contain only letters, numbers, dot, slash, underscore, and hyphen.': 'Путь к файлу кэша должен начинаться с /tmp/ и содержать только буквы, цифры, точку, слэш, подчёркивание и дефис.',
        'Export masked': 'Экспорт',
        'Masked log export has been saved.': 'Экспорт журнала с маскированием сохранён.',
        'Export log': 'Экспорт журнала',
        'Export period': 'Период экспорта',
        'Last hour': 'За последний час',
        'Last week': 'За неделю',
        'Custom period': 'С - по',
        'All time': 'За всё время',
        'From': 'С',
        'To': 'По',
        'Export selected period': 'Экспортировать',
        'No log entries for selected period.': 'За выбранный период записей журнала нет.',
        'Owner granted +30 minutes to Child tablet': 'Владелец дал +30 минут устройству "Планшет ребёнка"',
        'New device detected: #4, DC:A6:32:EC:00:19, IP 192.168.1.98': 'Обнаружено новое устройство: #4, DC:A6:32:EC:00:19, IP 192.168.1.98',
        'Global block disabled by owner': 'Глобальная блокировка выключена владельцем',
        'General': 'Общие',
        'Application language': 'Язык приложения',
        'Russian': 'Русский',
        'English': 'Английский',
        'New device behavior': 'Поведение для новых устройств',
        'Allow internet by default': 'Разрешать интернет по умолчанию',
        'Restrict until configured': 'Ограничивать до настройки',
        'New device automatic setup': 'Автонастройка новых устройств',
        'Full automatic setup': 'Полная автонастройка',
        'Reduced automatic setup': 'Урезанная автонастройка',
        'Full mode can use port checks when available. Reduced mode avoids heavy checks but still can automatically add confidently detected home infrastructure devices to No restrictions.': 'Полный режим может использовать проверку портов, если она доступна. Урезанная автонастройка избегает тяжёлых проверок, но тоже может автоматически добавлять уверенно распознанные домашние инфраструктурные устройства в группу "Без ограничений".',
        'New device automatic setup saved.': 'Автонастройка новых устройств сохранена.',
        'Could not save new device automatic setup.': 'Не удалось сохранить автонастройку новых устройств.',
        'Update check and installation': 'Проверка обновления и его установка',
        'Every day': 'Раз в день',
        'Every week': 'Раз в неделю',
        'Every month': 'Раз в месяц',
        'Never': 'Никогда',
        'Update check policy saved.': 'Настройка проверки обновлений сохранена.',
        'Could not save update check policy.': 'Не удалось сохранить настройку проверки обновлений.',
        'Defines how often Sheepfold should check for and install updates after confirmation.': 'Определяет, как часто Sheepfold должен проверять и устанавливать обновления (после подтверждения).',
        'Enable Wi-Fi automatically': 'Включать Wi-Fi автоматически',
        'Disable Wi-Fi automatically': 'Выключать Wi-Fi автоматически',
        'At time': 'В указанное время',
        'Wi-Fi auto-disable warning': 'Предупреждение об автоматическом выключении Wi-Fi',
        'When Wi-Fi turns off, you will not be able to turn it back on from a phone connected only by Wi-Fi. Configure messenger control or a WPS button action so you can enable Wi-Fi outside the schedule if needed.': 'Когда Wi-Fi отключится, с телефона, подключённого только по Wi-Fi, вы уже не сможете включить его обратно. Заранее настройте управление через мессенджер или действие кнопки WPS, чтобы при необходимости включить Wi-Fi вне расписания.',
        'Auto-disable time': 'Время автоматического выключения',
        'Confirmation will be available in': 'Подтверждение будет доступно через',
        'I understand the risk, continue': 'Я понимаю риск, продолжить',
        'Wi-Fi automation settings saved.': 'Настройки автоматического Wi-Fi сохранены.',
        'Could not save Wi-Fi automation settings.': 'Не удалось сохранить настройки автоматического Wi-Fi.',
        'Applies to all Wi-Fi radios on the router. Real switching must require confirmation and be performed by the router backend.': 'Применяется ко всем Wi-Fi радиомодулям роутера. Реальное переключение должно требовать подтверждения и выполняться backend-частью роутера.',
        'Router time and NTP': 'Время роутера и NTP',
        'Make router an NTP server for LAN': 'Делать роутер NTP-сервером для LAN',
        'Home devices can use the router as their local time server.': 'Домашние устройства смогут использовать роутер как локальный сервер времени.',
        'Automatically configure router NTP client': 'Автоматически настраивать NTP-клиент роутера',
        'Sheepfold will write NTP servers and time settings to OpenWRT system config.': 'Sheepfold запишет NTP-серверы и настройки времени в системный конфиг OpenWRT.',
        'Router timezone': 'Часовой пояс роутера',
        'NTP servers': 'NTP-серверы',
        'One server per line. Default for Russia: ntp1.vniiftri.ru, ntp2.ntp-servers.net, 3.openwrt.pool.ntp.org.': 'Один сервер на строку. По умолчанию для России: ntp1.vniiftri.ru, ntp2.ntp-servers.net, 3.openwrt.pool.ntp.org.',
        'Save router time settings': 'Сохранить настройки времени роутера',
        'Router time settings saved.': 'Настройки времени роутера сохранены.',
        'Could not save router time settings.': 'Не удалось сохранить настройки времени роутера.',
        'Moscow time': 'Московское время',
        'Kaliningrad time': 'Калининградское время',
        'Samara time': 'Самарское время',
        'Yekaterinburg time': 'Екатеринбургское время',
        'Omsk time': 'Омское время',
        'Krasnoyarsk time': 'Красноярское время',
        'Irkutsk time': 'Иркутское время',
        'Yakutsk time': 'Якутское время',
        'Vladivostok time': 'Владивостокское время',
        'Magadan time': 'Магаданское время',
        'Kamchatka time': 'Камчатское время',
        'WPS short button press': 'Короткое нажатие кнопки WPS',
        'WPS long button press': 'Долгое нажатие кнопки WPS',
        'Router default behavior': 'Функционал роутера по умолчанию',
        'Allow Wi-Fi connection': 'Дать подключиться к Wi-Fi',
        'Allow Wi-Fi connection and add devices to allowlist (dangerous)': 'Дать подключиться к Wi-Fi и добавить устройства в белый список (опасно)',
        'Disable Wi-Fi': 'Отключить Wi-Fi',
        'WPS action saved.': 'Действие кнопки WPS сохранено.',
        'Could not save WPS action.': 'Не удалось сохранить действие кнопки WPS.',
        'Adding devices to allowlist through the WPS button is dangerous because after pressing it, for 30 seconds any device can connect to Wi-Fi and get into the allowlist.': 'Добавление устройств в белый список через WPS кнопку опасно так как при нажатии на неё, в течении 30 секунд - любое устройство сможет подключиться к вифи и попасть в белый список.',
        'While WPS connection is allowed, all router LEDs should blink using the 1010000 pattern for 30 seconds. One tick is half a second.': 'Пока разрешено WPS-подключение, все светодиоды роутера должны мигать паттерном 1010000 в течение 30 секунд. Один тик — полсекунды.',
        'Router LED control': 'Управление светодиодами роутера',
        'Turn off all LEDs permanently': 'Отключить навсегда все светодиоды',
        'New device LED alert until LuCI login': 'Сигнал светодиодами о новом устройстве до входа в LuCI',
        'LED setting saved.': 'Настройка светодиодов сохранена.',
        'Could not save LED setting.': 'Не удалось сохранить настройку светодиодов.',
        'LED behavior depends on the router model and available OpenWrt LED triggers.': 'Поведение светодиодов зависит от модели роутера и доступных OpenWrt LED-триггеров.',
        'When a new device connects, router LEDs will turn on. After a successful LuCI password login or after any admin views the new-device notification on the phone, restore the router default LED behavior immediately.': 'Когда подключилось новое устройство, светодиоды на роутере зажгуться. После успешного входа в LuCI с паролем или после просмотра уведомления о новом устройстве на телефоне любым админом сразу верните дефолтное поведение светодиодов роутера.',
        'Wi-Fi settings': 'Настройки Wi-Fi',
        'WPS button': 'Кнопка WPS',
        'Router LEDs': 'Светодиоды роутера',
        'Other actions': 'Другие действия',
        'Known offline devices cleanup': 'Очистка логов устройств офлайн',
        '30 days': '30 дней',
        '90 days': '90 дней',
        '180 days': '180 дней',
        'Export and update': 'Экспорт и обновление',
        'Import and export': 'Импорт и экспорт',
        'Export mode': 'Режим экспорта',
        'Readable JSON without secrets': 'Читаемый JSON без секретов',
        'Encrypted full backup': 'Зашифрованный полный бэкап',
        'Blocked internet page text shown instead of websites': 'Текст интернет-страницы блокировки открывающейся вместо сайтов',
        'Internet is temporarily unavailable by family rules.': 'Интернет временно недоступен по семейным правилам.',
        'Update app': 'Обновить приложение',
        'current version': 'текущая версия',
        'checking': 'проверяется',
        'up to date': 'актуальная',
        'outdated': 'устаревшая',
        'could not check': 'не удалось проверить',
        'Application update requires confirmation.': 'Обновление приложения требует подтверждения.',
        'Install Sheepfold update now?': 'Установить обновление Sheepfold сейчас?',
        'Update started. Do not close this page until the result appears.': 'Обновление запущено. Не закрывайте страницу до появления результата.',
        'Update result': 'Результат обновления',
        'Starting update...': 'Запуск обновления...',
        'Checking for updates...': 'Идёт проверка наличия обновлений',
        'Update is running. Waiting for router response...': 'Обновление выполняется. Ждём ответ роутера...',
        'Update log is empty yet.': 'Журнал обновления пока пуст.',
        'Update finished successfully.': 'Обновление успешно завершено.',
        'Update completed. Refresh LuCI if the interface still shows old files.': 'Обновление завершено. Обновите LuCI, если интерфейс всё ещё показывает старые файлы.',
        'Update failed.': 'Обновление не удалось.',
        'Update failed. See log above.': 'Обновление не удалось. Смотрите журнал выше.',
        'No updates available. Installed version is already current.': 'Обновлений нет. Установленная версия уже актуальна.',
        'Could not queue update request.': 'Не удалось создать заявку на обновление.',
        'Reboot router': 'Перезагрузить роутер',
        'Router reboot requires confirmation.': 'Перезагрузка роутера требует подтверждения.',
        'Reboot router now?': 'Перезагрузить роутер сейчас?',
        'Router reboot request queued.': 'Заявка на перезагрузку роутера создана.',
        'Could not queue router reboot request.': 'Не удалось создать заявку на перезагрузку роутера.',
        'Sheepfold Family Internet Control': 'Sheepfold : контроль доступа в интернет для семьи',
        'Visual test build. Router rules and persistence are not active yet.': 'Визуальная тестовая сборка. Правила роутера и сохранение настроек пока не активны.',
        'Internet disabled': 'Интернет отключен',
        'Global block would block every device except allowlist.': 'Глобальная блокировка заблокирует все устройства, кроме белого списка.',
        'Internet enabled': 'Интернет включен',
        'Global block would be disabled after confirmation.': 'Глобальная блокировка будет выключена после подтверждения.',
        'Export': 'Экспорт',
        'Default export is readable JSON without secrets.': 'Экспорт по умолчанию — читаемый JSON без секретов.',
        'Import': 'Импорт',
        'Import all settings and user list': 'Импорт всех настроек и списка пользователей',
        'Export all settings and user list': 'Экспорт всех настроек и списка пользователей',
        'Import requires confirmation.': 'Импорт требует подтверждения.',
        'Settings export saved.': 'Экспорт настроек сохранён.',
        'Could not read import file.': 'Не удалось прочитать файл импорта.',
        'Import file checked. Applying imported settings will be added after backend import confirmation is implemented.': 'Файл импорта проверен. Применение импортированных настроек будет добавлено после реализации backend-подтверждения импорта.',
        'Import file format is not recognized.': 'Формат файла импорта не распознан.',
        'Devices': 'Устройства',
        'Save': 'Сохранить',
        'Save settings': 'Сохранить настройки',
        'Settings saved.': 'Настройки сохранены.',
        'Settings saved successfully.': 'Настройки успешно сохранены',
        'Could not save settings.': 'Не удалось сохранить настройки.',
        'No settings changes to save.': 'Нет изменений настроек для сохранения.',
        'Settings have unsaved changes. Press Save to apply them.': 'В настройках есть несохранённые изменения. Нажмите "Сохранить", чтобы применить их.',
        'Save changes. This visual build does not use a separate Apply button.': 'Сохранить изменения. В этой визуальной сборке отдельная кнопка "Применить" не используется.',
        'Router root password check': 'Проверка root-пароля роутера',
        'Root password is not set. Sheepfold settings must stay locked until the router password is configured.': 'Root-пароль не задан. Настройки Sheepfold должны быть заблокированы до установки пароля роутера.',
        'Open router password page': 'Открыть страницу пароля роутера',
        'Auto-detected during installation. You can change it manually if needed.': 'Автоопределено при установке. При необходимости можно изменить вручную.'
};

function T(text) {
        return translations[text] || text;
}

var tabs = [
        ['users', T('User lists')],
        ['management', T('User management')],
        ['wifi', T('Wi-Fi')],
        ['logs', T('Logs')],
        ['settings', T('Settings')],
        ['donation', T('Donation')]
];

var settingsTabs = [
        ['info', T('Information')],
        ['general', T('General')],
        ['integrations', T('Integrations')],
        ['messenger', T('Messenger')],
        ['emergency', T('Emergency-useful sites')],
        ['misc', T('Misc')]
];

var userListTabs = [
        ['devices', T('All devices')],
        ['allowlist', T('Allowlist')],
        ['blocklist', T('Blocklist')]
];

var managementTabs = [
        ['schedules', T('Schedules')],
        ['groups', T('Groups')],
        ['admins', T('Administrators')]
];

function notify(message, level) {
        ui.addNotification(null, E('p', {}, message), level || 'info');
}

function notifyCentered(message) {
        var toast = E('div', { 'class': 'sf-centered-toast' }, message);

        document.body.appendChild(toast);
        window.setTimeout(function () {
                toast.classList.add('sf-centered-toast-hide');
        }, 1800);
        window.setTimeout(function () {
                if (toast.parentNode)
                        toast.parentNode.removeChild(toast);
        }, 2400);
}

function logCachePath() {
        return safeUciGet('sheepfold', 'global', 'log_cache_path', defaultLogCachePath) || defaultLogCachePath;
}

function validRamCachePath(path) {
        return /^\/tmp\/[A-Za-z0-9_./-]+$/.test(path || '') && path.indexOf('..') === -1 && path.charAt(path.length - 1) !== '/';
}

function resetSettingsDraft() {
        settingsDraft = {};
        settingsSpecialSavers = [];
        settingsIsSaving = false;
}

function hasOwn(object, key) {
        return Object.prototype.hasOwnProperty.call(object, key);
}

function settingValue(option, defaultValue) {
        return hasOwn(settingsDraft, option) ?
                settingsDraft[option] :
                safeUciGet('sheepfold', 'global', option, defaultValue || '');
}

function updateSettingsSaveButtons() {
        var dirty = Object.keys(settingsDraft).length > 0 || settingsSpecialSavers.some(function (saver) {
                return saver.isChanged && saver.isChanged();
        });

        document.querySelectorAll('[data-settings-save]').forEach(function (button) {
                button.disabled = settingsIsSaving ? true : null;
                button.classList.toggle('sf-action-muted', !dirty);
        });

        document.querySelectorAll('[data-settings-dirty-note]').forEach(function (node) {
                node.hidden = dirty ? null : 'hidden';
        });
}

function markSettingsDraftChanged() {
        updateSettingsSaveButtons();
}

function setSettingsDraftOption(option, value) {
        settingsDraft[option] = String(value == null ? '' : value);
        markSettingsDraftChanged();
}

function setSettingsDraftOptions(options) {
        Object.keys(options).forEach(function (option) {
                settingsDraft[option] = String(options[option] == null ? '' : options[option]);
        });
        markSettingsDraftChanged();
}

function registerSettingsSpecialSaver(saver) {
        settingsSpecialSavers.push(saver);
}

function sameObjectValues(left, right) {
        var leftKeys = Object.keys(left || {});
        var rightKeys = Object.keys(right || {});

        if (leftKeys.length !== rightKeys.length)
                return false;

        return leftKeys.every(function (key) {
                return String(left[key] == null ? '' : left[key]) === String(right[key] == null ? '' : right[key]);
        });
}

function appDiscoveryJson(port) {
        return JSON.stringify({
                service: 'sheepfold',
                name: 'Sheepfold Family Internet Control',
                routerName: 'OpenWRT Sheepfold',
                appPort: String(port),
                apiPath: '/cgi-bin/sheepfold-api',
                apiBase: '/cgi-bin/sheepfold-api',
                version: safeUciGet('sheepfold', 'global', 'ui_asset_version', '0.1.0')
        }, null, 2) + '\n';
}

function validateSettingsDraft(options) {
        var portNumber;

        if (hasOwn(options, 'log_cache_path') && !validRamCachePath(options.log_cache_path))
                throw new Error(T('Cache file path must start with /tmp/ and contain only letters, numbers, dot, slash, underscore, and hyphen.'));

        if (hasOwn(options, 'app_port')) {
                portNumber = parseInt(options.app_port, 10);
                if (!options.app_port || String(portNumber) !== String(options.app_port) || portNumber < 1 || portNumber > 65535)
                        throw new Error(T('Enter a port from 1 to 65535.'));
        }
}

function applySettingsSideEffects(options) {
        var chain = Promise.resolve();

        if (hasOwn(options, 'site_lists_update_interval'))
                chain = chain.then(function () {
                        return routerControl(['site-lists-cron-apply']);
                });

        if (hasOwn(options, 'router_led_control'))
                chain = chain.then(function () {
                        return routerControl(['led-apply']);
                });

        if (hasOwn(options, 'app_port'))
                chain = chain.then(function () {
                        return fs.write('/www/.well-known/sheepfold.json', appDiscoveryJson(options.app_port)).catch(function () {});
                }).then(function () {
                        return fs.exec('/etc/init.d/sheepfold', ['restart']).catch(function () {});
                });

        return chain;
}

function saveSettingsNow() {
        var options = Object.assign({}, settingsDraft);
        var specialSavers = settingsSpecialSavers.filter(function (saver) {
                return saver.isChanged && saver.isChanged();
        });

        if (!Object.keys(options).length && !specialSavers.length) {
                notify(T('No settings changes to save.'), 'info');
                return Promise.resolve();
        }

        try {
                validateSettingsDraft(options);
        } catch (error) {
                notify(error.message, 'warning');
                return Promise.reject(error);
        }

        settingsIsSaving = true;
        updateSettingsSaveButtons();

        // Сначала сохраняем простые option из вкладок настроек, затем выполняем side effects
        // вроде перезапуска локального API-порта. В обратном порядке UI мог бы показать
        // успешное сохранение, хотя сервис ещё читает старую конфигурацию.
        return saveGlobalOptions(options).then(function () {
                return applySettingsSideEffects(options);
        }).then(function () {
                var chain = Promise.resolve();

                specialSavers.forEach(function (saver) {
                        chain = chain.then(function () {
                                return saver.save();
                        });
                });

                return chain;
        }).then(function () {
                settingsDraft = {};
                specialSavers.forEach(function (saver) {
                        if (saver.accept)
                                saver.accept();
                });
                notifyCentered(T('Settings saved successfully.'));
        }, function (error) {
                notify(T('Could not save settings.') + ' ' + commandErrorText(error, ''), 'warning');
                return Promise.reject(error);
        }).finally(function () {
                settingsIsSaving = false;
                updateSettingsSaveButtons();
        });
}

function settingsSaveBar(top) {
        return E('div', { 'class': 'sf-settings-save-bar' + (top ? ' sf-settings-save-bar-top' : '') }, [
                E('span', {
                        'class': 'sf-settings-dirty-note',
                        'data-settings-dirty-note': '1',
                        'hidden': 'hidden'
                }, T('Settings have unsaved changes. Press Save to apply them.')),
                E('button', {
                        'class': 'sf-action sf-action-positive sf-action-nowrap',
                        'data-settings-save': '1',
                        'click': function (ev) {
                                var mode;
                                var time;

                                ev.preventDefault();

                                mode = hasOwn(settingsDraft, 'wifi_auto_disable_mode') ?
                                        settingsDraft.wifi_auto_disable_mode :
                                        safeUciGet('sheepfold', 'global', 'wifi_auto_disable_mode', 'never');
                                time = hasOwn(settingsDraft, 'wifi_auto_disable_time') ?
                                        settingsDraft.wifi_auto_disable_time :
                                        safeUciGet('sheepfold', 'global', 'wifi_auto_disable_time', '23:00');

                                if ((hasOwn(settingsDraft, 'wifi_auto_disable_mode') || hasOwn(settingsDraft, 'wifi_auto_disable_time')) && mode === 'time') {
                                        confirmWifiAutoDisable(time).then(function (confirmed) {
                                                if (confirmed)
                                                        saveSettingsNow();
                                        });
                                        return;
                                }

                                saveSettingsNow();
                        }
                }, T('Save settings'))
        ]);
}

function acknowledgeNewDeviceLedAlert(source) {
        if (safeUciGet('sheepfold', 'global', 'router_led_control', 'router_default') !== 'new_device_alert_until_luci_login')
                return;

        fs.write('/tmp/sheepfold/new-device-alert.ack', String(source || 'luci') + '\n').catch(function () {});
}

function badge(status) {
        var labels = {
                allow: T('Allowlist'),
                blocked: T('Blocklist'),
                scheduled: T('Scheduled'),
                restricted: T('Restricted'),
                new: T('New'),
                journal: T('Journal')
        };

        return E('span', { 'class': 'sf-badge sf-badge-' + status }, labels[status] || status);
}

function metric(label, value, tone, handler) {
        return E('button', {
                'class': 'sf-metric sf-metric-' + tone,
                'click': function (ev) {
                        ev.preventDefault();
                        if (handler)
                                handler(ev.currentTarget);
                }
        }, [
                E('span', {}, label),
                E('strong', {}, value)
        ]);
}

function actionButton(label, tone, message) {
        return E('button', {
                'class': 'sf-action sf-action-' + tone,
                'click': function (ev) {
                        ev.preventDefault();
                        notify(message || T('This action is a visual prototype only.'), tone === 'danger' ? 'warning' : 'info');
                }
        }, label);
}

function routerControl(args) {
        return fs.exec('/usr/libexec/sheepfold/sheepfold-router-control', args);
}

function parseKeyValueOutput(text) {
        var values = {};

        String(text || '').split(/\r?\n/).forEach(function (line) {
                var index = line.indexOf('=');

                if (index > 0)
                        values[line.slice(0, index)] = line.slice(index + 1);
        });

        return values;
}

function commandErrorText(error, fallback) {
        var text = fallback || T('Action failed.');

        if (error) {
                text = error.stderr || error.stdout || error.message || text;
                text = String(text).trim() || fallback || T('Action failed.');
        }

        return T(text);
}

function rebootRouterButton() {
        return E('button', {
                'class': 'sf-action sf-action-danger',
                'click': function (ev) {
                        ev.preventDefault();

                        if (!window.confirm(T('Reboot router now?')))
                                return;

                        fs.write('/tmp/sheepfold/reboot.request', String(Date.now()) + '\n').then(function () {
                                notify(T('Router reboot request queued.'), 'warning');
                        }, function () {
                                notify(T('Could not queue router reboot request.'), 'warning');
                        });
                }
        }, T('Reboot router'));
}

function updateAppButton() {
        return E('button', {
                'class': 'sf-action sf-action-danger',
                'click': function (ev) {
                        var button = ev.currentTarget;
                        var spinner;
                        var statusNode;
                        var outputNode;
                        var pollTimer = null;
                        var pollingActive = true;

                        ev.preventDefault();

                        if (!window.confirm(T('Install Sheepfold update now?')))
                                return;

                        button.disabled = true;

                        spinner = E('span', { 'class': 'sf-spinner' });
                        statusNode = E('p', {}, T('Update started. Do not close this page until the result appears.'));
                        outputNode = E('pre', { 'class': 'sf-pre' }, T('Starting update...'));

                        function closeModal() {
                                pollingActive = false;
                                if (pollTimer)
                                        window.clearTimeout(pollTimer);
                                ui.hideModal();
                        }

                        function finishUpdate(spinnerClass, message, notificationType) {
                                pollingActive = false;
                                if (pollTimer)
                                        window.clearTimeout(pollTimer);
                                spinner.className = 'sf-spinner ' + spinnerClass;
                                statusNode.textContent = message;
                                button.disabled = false;
                                if (notificationType)
                                        notify(message, notificationType);
                        }

                        function pollUpdate() {
                                if (!pollingActive)
                                        return;

                                Promise.all([
                                        fs.read('/tmp/sheepfold/update.status').catch(function () { return ''; }),
                                        fs.read('/tmp/sheepfold/update.log').catch(function () { return ''; })
                                ]).then(function (values) {
                                        var status = String(values[0] || '').trim();
                                        var log = String(values[1] || '').trim();

                                        outputNode.textContent = log || T('Update log is empty yet.');

                                        if (status === 'ok') {
                                                finishUpdate('sf-spinner-done', T('Update completed. Refresh LuCI if the interface still shows old files.'), 'info');
                                                return;
                                        }

                                        if (status === 'no_update') {
                                                finishUpdate('sf-spinner-done', T('No updates available. Installed version is already current.'), 'info');
                                                return;
                                        }

                                        if (status.indexOf('failed') === 0) {
                                                finishUpdate('sf-spinner-failed', T('Update failed. See log above.'), 'warning');
                                                return;
                                        }

                                        statusNode.textContent = T('Update is running. Waiting for router response...');
                                        pollTimer = window.setTimeout(pollUpdate, 2000);
                                }, function () {
                                        statusNode.textContent = T('Update is running. Waiting for router response...');
                                        pollTimer = window.setTimeout(pollUpdate, 2000);
                                });
                        }

                        ui.showModal(T('Update result'), [
                                E('div', { 'class': 'sf-update-progress' }, [
                                        spinner,
                                        statusNode
                                ]),
                                outputNode,
                                E('div', { 'class': 'right sf-modal-actions' }, [
                                        E('button', {
                                                'class': 'btn cbi-button',
                                                'click': closeModal
                                        }, T('Close'))
                                ])
                        ]);

                        Promise.all([
                                fs.write('/tmp/sheepfold/update.status', 'queued\n'),
                                fs.write('/tmp/sheepfold/update.log', T('Checking for updates...') + '\n'),
                                fs.write('/tmp/sheepfold/update.request', String(Date.now()) + '\n')
                        ]).then(function () {
                                statusNode.textContent = T('Checking for updates...');
                                outputNode.textContent = T('Checking for updates...');
                                pollUpdate();
                        }, function (error) {
                                outputNode.textContent = String(error && error.message ? error.message : error);
                                finishUpdate('sf-spinner-failed', T('Could not queue update request.'), 'warning');
                                button.disabled = false;
                        });
                }
        }, T('Update app'));
}

function updateVersionStatusText(version, status) {
        return T('current version') + ' ' + version + ' (' + T(status) + ')';
}

function updateAppRow() {
        var version = safeUciGet('sheepfold', 'global', 'ui_asset_version', 'unknown') || 'unknown';
        var statusNode = E('span', {
                'class': 'sf-update-version sf-update-version-checking'
        }, updateVersionStatusText(version, 'checking'));

        window.setTimeout(function () {
                fs.exec('/usr/libexec/sheepfold/sheepfold-updater', ['check']).then(function (result) {
                        var output = String((result && (result.stdout || result.stderr)) || '');
                        var status = 'could not check';
                        var statusClass = 'sf-update-version-unknown';

                        if (/No updates available|Обновлений нет/i.test(output)) {
                                status = 'up to date';
                                statusClass = 'sf-update-version-ok';
                        } else if (/Update is available|Доступно обновление/i.test(output)) {
                                status = 'outdated';
                                statusClass = 'sf-update-version-warning';
                        }

                        statusNode.className = 'sf-update-version ' + statusClass;
                        statusNode.textContent = updateVersionStatusText(version, status);
                }, function () {
                        statusNode.className = 'sf-update-version sf-update-version-unknown';
                        statusNode.textContent = updateVersionStatusText(version, 'could not check');
                });
        }, 0);

        return E('div', { 'class': 'sf-update-row' }, [
                updateAppButton(),
                statusNode
        ]);
}

function infoValue(value, fallback) {
        value = String(value == null ? '' : value).trim();
        return value || fallback || 'unknown';
}

function translatedStatus(value) {
        var labels = {
                online: T('Online'),
                offline: T('Offline'),
                limited: T('Limited'),
                unknown: T('Unknown'),
                enabled: T('Enabled'),
                disabled: T('Disabled'),
                yes: T('Installed'),
                no: T('Not installed')
        };

        return labels[value] || value || T('Unknown');
}

function informationRow(label, value) {
        return E('div', { 'class': 'sf-info-row' }, [
                E('span', {}, label),
                E('strong', {}, value)
        ]);
}

function renderWifiModulesInfo(values) {
        var count = parseInt(values.wifi_count || '0', 10) || 0;
        var rows = [];
        var i;

        for (i = 1; i <= count; i++) {
                rows.push(E('div', { 'class': 'sf-info-table-row' }, [
                        E('div', {}, infoValue(values['wifi_' + i + '_name'])),
                        E('div', {}, translatedStatus(values['wifi_' + i + '_status'])),
                        E('div', {}, infoValue(values['wifi_' + i + '_band'])),
                        E('div', {}, infoValue(values['wifi_' + i + '_channel'])),
                        E('div', {}, infoValue(values['wifi_' + i + '_type'])),
                        E('div', {}, infoValue(values['wifi_' + i + '_path'])),
                        E('div', {}, infoValue(values['wifi_' + i + '_country'])),
                        E('div', {}, infoValue(values['wifi_' + i + '_mode']))
                ]));
        }

        if (!rows.length)
                return E('div', { 'class': 'sf-note sf-note-warning' }, T('No active Wi-Fi networks were found in the router wireless config.'));

        return E('div', { 'class': 'sf-info-table sf-info-wifi-table' }, [
                E('div', { 'class': 'sf-info-table-row sf-info-table-head' }, [
                        E('div', {}, T('Module')),
                        E('div', {}, T('Status')),
                        E('div', {}, T('Band')),
                        E('div', {}, T('Channel')),
                        E('div', {}, T('Driver/type')),
                        E('div', {}, T('Path')),
                        E('div', {}, T('Country')),
                        E('div', {}, T('Mode'))
                ])
        ].concat(rows));
}

function routerInformationPanel() {
        var body = E('div', { 'class': 'sf-info-body' }, T('Loading router information...'));
        var refreshButton;

        function render(values) {
                var internetText = translatedStatus(values.internet_status) + ' - ' + infoValue(values.internet_reason);
                var podkopText = translatedStatus(values.podkop_installed) + ' (' + infoValue(values.podkop_version) + ')';
                var adguardText = translatedStatus(values.adguard_installed) + ' (' + infoValue(values.adguard_version) + ')';

                body.replaceChildren(
                        E('div', { 'class': 'sf-grid two sf-info-grid' }, [
                                E('div', { 'class': 'sf-box' }, [
                                        informationRow(T('Current router time'), infoValue(values.current_time)),
                                        informationRow(T('Current Sheepfold version'), infoValue(values.sheepfold_version)),
                                        informationRow(T('Internet connection status'), internetText),
                                        informationRow(T('Ping to ya.ru'), infoValue(values.ping_yandex_ms) + ' ms'),
                                        informationRow(T('Router firmware version'), infoValue(values.firmware_version)),
                                        informationRow(T('OpenWRT release'), infoValue(values.openwrt_release)),
                                        informationRow(T('Kernel version'), infoValue(values.kernel_version))
                                ]),
                                E('div', { 'class': 'sf-box' }, [
                                        informationRow(T('Router model'), infoValue(values.router_model)),
                                        informationRow(T('Router uptime'), infoValue(values.uptime)),
                                        informationRow(T('Load average'), infoValue(values.load_average)),
                                        informationRow(T('Memory'), infoValue(values.memory)),
                                        informationRow(T('LAN ports'), infoValue(values.lan_ports_count, '0') + ' (' + infoValue(values.lan_ports) + ')'),
                                        informationRow(T('Podkop'), podkopText),
                                        informationRow(T('AdGuard Home'), adguardText)
                                ])
                        ]),
                        E('div', { 'class': 'sf-box' }, [
                                E('h4', {}, T('Wi-Fi modules')),
                                renderWifiModulesInfo(values)
                        ])
                );
        }

        function loadInfo() {
                refreshButton.disabled = true;
                body.replaceChildren(T('Loading router information...'));

                routerControl(['router-info']).then(function (result) {
                        render(parseKeyValueOutput(result.stdout || ''));
                }, function (error) {
                        body.replaceChildren(E('div', { 'class': 'sf-note sf-note-warning' }, commandErrorText(error, T('Could not load router information.'))));
                }).finally(function () {
                        refreshButton.disabled = null;
                });
        }

        refreshButton = E('button', {
                'class': 'sf-action sf-action-neutral',
                'click': function (ev) {
                        ev.preventDefault();
                        loadInfo();
                }
        }, T('Refresh information'));

        window.setTimeout(loadInfo, 0);

        return E('div', { 'class': 'sf-settings-section' }, [
                E('div', { 'class': 'sf-panel-head' }, [
                        E('div', {}, [
                                E('p', { 'class': 'sf-section-intro' }, T('Router information'))
                        ]),
                        refreshButton
                ]),
                body
        ]);
}

function maskLogMessage(message) {
        return String(message || '')
                .replace(/\b([0-9a-f]{2}):([0-9a-f]{2}):([0-9a-f]{2}):([0-9a-f]{2}):([0-9a-f]{2}):([0-9a-f]{2})\b/gi, function (match, first, second, third, fourth, fifth, sixth) {
                        return [first, second, third, 'xx', 'xx', sixth].join(':').toUpperCase();
                })
                .replace(/\b(\d{1,3}\.\d{1,3}\.\d{1,3})\.\d{1,3}\b/g, '$1.x');
}

function parseRamLog(text) {
        return String(text || '').split(/\r?\n/).map(function (line) {
                var parts;

                line = line.trim();
                if (!line)
                        return null;

                parts = line.split('\t');
                if (parts.length >= 2) {
                        return {
                                time: parts.shift(),
                                message: parts.join('\t')
                        };
                }

                return {
                        time: '',
                        message: line
                };
        }).filter(Boolean);
}

function renderLogRows() {
        if (!logEntries.length)
                return [E('div', { 'class': 'sf-log-empty' }, T('Log is empty.'))];

        // Файл журнала остаётся append-only в естественном порядке для экспорта и отладки,
        // а в интерфейсе новые события показываем сверху, чтобы родитель сразу видел последнее.
        return logEntries.slice().reverse().map(function (entry) {
                return E('div', {}, [
                        E('time', {}, entry.time),
                        E('span', {}, T(entry.message))
                ]);
        });
}

function maskedLogExportText() {
        return maskedLogExportTextForEntries(logEntries);
}

function parseLogTime(value) {
        var match = String(value || '').match(/^(\d{2})\.(\d{2})\.(\d{4})\s+(\d{2}):(\d{2}):(\d{2})$/);

        if (!match)
                return null;

        return new Date(
                Number(match[3]),
                Number(match[2]) - 1,
                Number(match[1]),
                Number(match[4]),
                Number(match[5]),
                Number(match[6])
        );
}

function filterLogEntriesByPeriod(period, fromValue, toValue) {
        var now = new Date();
        var from = null;
        var to = null;

        if (period === 'hour')
                from = new Date(now.getTime() - 60 * 60 * 1000);
        else if (period === 'week')
                from = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        else if (period === 'custom') {
                from = fromValue ? new Date(fromValue) : null;
                to = toValue ? new Date(toValue) : null;
        }

        if (period === 'all')
                return logEntries.slice();

        return logEntries.filter(function (entry) {
                var time = parseLogTime(entry.time);

                if (!time)
                        return false;
                if (from && time < from)
                        return false;
                if (to && time > to)
                        return false;

                return true;
        });
}

function maskedLogExportTextForEntries(entries) {
        if (!entries.length)
                return T('Log is empty.') + '\n';

        return entries.map(function (entry) {
                return entry.time + ' ' + maskLogMessage(T(entry.message));
        }).join('\n') + '\n';
}

function showLogExportModal() {
        var periodField = selectControl(T('Export period'), 'week', [
                ['hour', T('Last hour')],
                ['week', T('Last week')],
                ['custom', T('Custom period')],
                ['all', T('All time')]
        ]);
        var fromField = inputControl(T('From'), '', { 'type': 'datetime-local' });
        var toField = inputControl(T('To'), '', { 'type': 'datetime-local' });
        var customRange = E('div', { 'class': 'sf-grid two', 'hidden': 'hidden' }, [
                fromField.node,
                toField.node
        ]);

        function updateRangeVisibility() {
                customRange.hidden = periodField.input.value === 'custom' ? null : 'hidden';
        }

        periodField.input.addEventListener('change', updateRangeVisibility);
        updateRangeVisibility();

        ui.showModal(T('Export log'), [
                E('div', { 'class': 'sf-device-editor' }, [
                        periodField.node,
                        customRange
                ]),
                E('div', { 'class': 'right sf-modal-actions' }, [
                        E('button', {
                                'class': 'btn cbi-button',
                                'click': ui.hideModal
                        }, T('Cancel')),
                        E('button', {
                                'class': 'btn cbi-button cbi-button-positive',
                                'click': function () {
                                        var period = periodField.input.value;
                                        var entries = filterLogEntriesByPeriod(period, fromField.input.value, toField.input.value);
                                        var stamp = new Date().toISOString().replace(/[:.]/g, '-');

                                        if (!entries.length)
                                                notify(T('No log entries for selected period.'), 'warning');

                                        downloadTextFile('sheepfold-log-masked-' + period + '-' + stamp + '.txt', maskedLogExportTextForEntries(entries));
                                        notify(T('Masked log export has been saved.'), 'info');
                                        ui.hideModal();
                                }
                        }, T('Export selected period'))
                ])
        ]);
}

function downloadTextFile(filename, text) {
        var blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
        var url = window.URL.createObjectURL(blob);
        var link = document.createElement('a');

        link.href = url;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        window.setTimeout(function () {
                window.URL.revokeObjectURL(url);
        }, 0);
}

function secretOptionName(name) {
        return /(password|passwd|token|secret|key|cookie|session)/i.test(String(name || ''));
}

function exportPlainSection(section) {
        var result = {};

        Object.keys(section || {}).forEach(function (key) {
                var value = section[key];

                if (typeof value === 'function')
                        return;

                result[key] = secretOptionName(key) ? '[secret]' : value;
        });

        return result;
}

function exportSections(config, type) {
        return safeUciSections(config, type).map(exportPlainSection);
}

function sheepfoldSettingsExportText() {
        var payload = {
                format: 'sheepfold-settings-export-v1',
                app: 'luci-app-sheepfold-family-internet-control',
                exportedAt: new Date().toISOString(),
                sheepfold: {
                        global: exportSections('sheepfold', 'global'),
                        devices: exportSections('sheepfold', 'device'),
                        lists: exportSections('sheepfold', 'list'),
                        groups: exportSections('sheepfold', 'group'),
                        schedules: exportSections('sheepfold', 'schedule'),
                        sites: exportSections('sheepfold', 'site')
                },
                router: {
                        dhcpHosts: exportSections('dhcp', 'host'),
                        wifiDevices: exportSections('wireless', 'wifi-device'),
                        wifiIfaces: exportSections('wireless', 'wifi-iface')
                },
                uiState: {
                        detectedDevices: devices.map(function (device) {
                                return Object.assign({}, device);
                        }),
                        administrators: admins.map(function (admin) {
                                var exportedAdmin = Object.assign({}, admin);

                                delete exportedAdmin.temporaryPassword;
                                return exportedAdmin;
                        }),
                        emergencySites: emergencySites.map(function (site) {
                                return site.slice();
                        })
                }
        };

        return JSON.stringify(payload, null, 2) + '\n';
}

function exportSettingsAndUsers() {
        var stamp = new Date().toISOString().replace(/[:.]/g, '-');

        downloadTextFile('sheepfold-settings-' + stamp + '.json', sheepfoldSettingsExportText());
        notify(T('Settings export saved.'), 'info');
}

function importSettingsAndUsers() {
        var input = E('input', {
                'type': 'file',
                'accept': 'application/json,.json',
                'change': function () {
                        var file = input.files && input.files[0];
                        var reader;

                        if (!file)
                                return;

                        reader = new FileReader();
                        reader.onload = function () {
                                var parsed;

                                try {
                                        parsed = JSON.parse(String(reader.result || ''));
                                } catch (e) {
                                        notify(T('Import file format is not recognized.'), 'warning');
                                        return;
                                }

                                if (!parsed || parsed.format !== 'sheepfold-settings-export-v1') {
                                        notify(T('Import file format is not recognized.'), 'warning');
                                        return;
                                }

                                ui.showModal(T('Import all settings and user list'), [
                                        E('div', { 'class': 'sf-note sf-note-warning' }, T('Import file checked. Applying imported settings will be added after backend import confirmation is implemented.')),
                                        E('div', { 'class': 'right sf-modal-actions' }, [
                                                E('button', {
                                                        'class': 'btn cbi-button cbi-button-positive',
                                                        'click': ui.hideModal
                                                }, T('Close'))
                                        ])
                                ]);
                        };
                        reader.onerror = function () {
                                notify(T('Could not read import file.'), 'warning');
                        };
                        reader.readAsText(file);
                }
        });

        input.click();
}

function svgIcon(paths, attrs) {
        var svgNs = 'http://www.w3.org/2000/svg';
        var svg = document.createElementNS(svgNs, 'svg');

        attrs = attrs || {};
        svg.setAttribute('viewBox', attrs.viewBox || '0 0 24 24');
        svg.setAttribute('aria-hidden', 'true');
        svg.setAttribute('focusable', 'false');

        paths.forEach(function (pathData) {
                var path = document.createElementNS(svgNs, 'path');

                path.setAttribute('d', pathData);
                svg.appendChild(path);
        });

        return svg;
}

function adminDeviceIcon() {
        return E('span', { 'class': 'sf-admin-device-icon', 'title': T('Admin device') }, [
                svgIcon([
                        'M4 5h11a2 2 0 0 1 2 2v8H2V7a2 2 0 0 1 2-2z',
                        'M1 17h17v1a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2z',
                        'M19 8h3a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1h-3a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z'
                ])
        ]);
}

function adminCrownIcon() {
        return E('span', { 'class': 'sf-admin-crown-icon', 'title': T('Admin device') }, [
                svgIcon([
                        'M3 8l4 4 5-7 5 7 4-4-2 11H5L3 8z',
                        'M6 19h12'
                ])
        ]);
}

function staticLeaseIcon() {
        return E('span', { 'class': 'sf-static-lease-icon', 'title': T('Permanent IP lease') }, [
                svgIcon([
                        'M7 11V8a5 5 0 0 1 10 0v3',
                        'M6 11h12v10H6z',
                        'M12 15v2'
                ])
        ]);
}

function deviceTypeDefinitions() {
        return [
                {
                        value: 'unknown',
                        label: T('Unknown device type'),
                        mark: '?',
                        paths: [
                                'M12 18h.01',
                                'M9.1 9a3 3 0 1 1 5.8 1c-.4 1.3-1.6 1.9-2.3 2.5-.5.4-.6.8-.6 1.5'
                        ]
                },
                {
                        value: 'phone',
                        label: T('Phone'),
                        mark: '▯',
                        paths: [
                                'M8 2h8a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2z',
                                'M11 18h2'
                        ]
                },
                {
                        value: 'tablet',
                        label: T('Tablet'),
                        mark: '▭',
                        paths: [
                                'M5 4h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z',
                                'M12 17h.01'
                        ]
                },
                {
                        value: 'computer',
                        label: T('Computer'),
                        mark: '⌨',
                        paths: [
                                'M3 4h18v11H3z',
                                'M8 21h8',
                                'M12 15v6'
                        ]
                },
                {
                        value: 'tv',
                        label: T('TV'),
                        mark: '▣',
                        paths: [
                                'M3 5h18v12H3z',
                                'M8 21h8',
                                'M12 17v4'
                        ]
                },
                {
                        value: 'console',
                        label: T('Game console'),
                        mark: '✚',
                        paths: [
                                'M7 10h10a5 5 0 0 1 4 8l-1 1a2 2 0 0 1-3-.4L15 16H9l-2 2.6a2 2 0 0 1-3 .4l-1-1a5 5 0 0 1 4-8z',
                                'M8 14h4',
                                'M10 12v4',
                                'M16 13h.01',
                                'M18 15h.01'
                        ]
                },
                {
                        value: 'printer',
                        label: T('Printer'),
                        mark: '▤',
                        paths: [
                                'M7 8V3h10v5',
                                'M6 17H4v-6h16v6h-2',
                                'M7 14h10v7H7z'
                        ]
                },
                {
                        value: 'server',
                        label: T('Server'),
                        mark: '▦',
                        paths: [
                                'M6 3h12a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z',
                                'M8 7h8',
                                'M8 11h8',
                                'M8 15h4',
                                'M16 15h.01',
                                'M16 18h.01',
                                'M8 18h4'
                        ]
                },
                {
                        value: 'camera',
                        label: T('Camera'),
                        mark: '◉',
                        paths: [
                                'M4 7h4l2-3h4l2 3h4v13H4z',
                                'M12 17a4 4 0 1 0 0-8 4 4 0 0 0 0 8z'
                        ]
                },
                {
                        value: 'speaker',
                        label: T('Smart speaker'),
                        mark: '♪',
                        paths: [
                                'M8 6a3 3 0 0 1 3-3h2a3 3 0 0 1 3 3v12a3 3 0 0 1-3 3h-2a3 3 0 0 1-3-3z',
                                'M10 8h4',
                                'M10 11h4',
                                'M12 17h.01',
                                'M18 9c1.2 1.6 1.2 4.4 0 6',
                                'M20.5 7c2 2.8 2 7.2 0 10'
                        ]
                },
                {
                        value: 'vacuum',
                        label: T('Robot vacuum'),
                        mark: '◌',
                        paths: [
                                'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z',
                                'M9 10h6',
                                'M9 14h6',
                                'M16 7l3-3'
                        ]
                },
                {
                        value: 'smart_home',
                        label: T('Smart home'),
                        mark: '⌁',
                        paths: [
                                'M3 11l9-8 9 8',
                                'M5 10v10h14V10',
                                'M9 20v-6h6v6',
                                'M8 11h.01',
                                'M16 11h.01'
                        ]
                },
                {
                        value: 'engineering',
                        label: T('Engineering device'),
                        mark: '⚙',
                        paths: [
                                'M7 4h10a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z',
                                'M9 8h6',
                                'M9 11h3',
                                'M7 20v2',
                                'M17 20v2',
                                'M12 18c-1.6-.8-2.4-1.9-2-3.2.3-1 1.2-1.6 1.7-2.8 1.6 1.1 3.3 2.4 3.3 4 0 1.2-1 2-3 2z'
                        ]
                },
                {
                        value: 'smart',
                        label: T('Smart device'),
                        mark: '◇',
                        paths: [
                                'M12 2l8 8-8 12-8-12z',
                                'M9 10h6',
                                'M9 14h6'
                        ]
                },
                {
                        value: 'network',
                        label: T('Network device'),
                        mark: '⌂',
                        paths: [
                                'M4 12h16',
                                'M7 8h10',
                                'M10 4h4',
                                'M6 16h.01',
                                'M12 16h.01',
                                'M18 16h.01',
                                'M6 20h12'
                        ]
                }
        ];
}

function deviceTypeByValue(value) {
        return deviceTypeDefinitions().filter(function (item) {
                return item.value === value;
        })[0] || deviceTypeDefinitions().filter(function (item) {
                return item.value === 'unknown';
        })[0];
}

function displayDeviceType(device) {
        var confidence = parseInt(device && device.detectionConfidence, 10);
        var minConfidence = parseInt(safeUciGet('sheepfold', 'global', 'detector_min_device_type_confidence', '70'), 10);

        if (isNaN(minConfidence))
                minConfidence = 70;

        if (device && !device.manualDeviceType && !isNaN(confidence) && confidence < minConfidence)
                return 'unknown';

        return device && device.deviceType ? device.deviceType : 'unknown';
}

function deviceTypeOptions() {
        return deviceTypeDefinitions().map(function (item) {
                return [item.value, item.label];
        });
}

function inferDeviceType(item, configured) {
        var text = [
                configured && configured.name,
                configured && configured.group,
                item.staticName,
                item.hostname
        ].join(' ').toLowerCase();

        if (/(iphone|android|galaxy|redmi|pixel|phone|телефон|смартфон)/.test(text))
                return 'phone';
        if (/(ipad|tablet|pad|планшет)/.test(text))
                return 'tablet';
        if (/(desktop|laptop|notebook|macbook|pc-|компьютер|ноутбук)/.test(text))
                return 'computer';
        if (/(tv|телевизор|chromecast|mi box|androidtv|smarttv)/.test(text))
                return 'tv';
        if (/(playstation|ps4|ps5|xbox|switch|console|приставк)/.test(text))
                return 'console';
        if (/(printer|print|epson|canon|hp-|принтер)/.test(text))
                return 'printer';
        if (/(home[ -]?assistant|hassio|hass\.io|haos|home assistant green|home assistant yellow|openhab|adguard[ -]?home|adguardhome|samba|smb|cifs|файловый сервер|file server|nas|proxmox|pve|truenas|freenas|openmediavault|omv|synology|diskstation|qnap|unraid|plex server|jellyfin|emby|docker host|portainer|мини[ -]?сервер|домашний сервер|smlight|slzb|slzb-mr4u|zigbee2mqtt|zha coordinator|zigbee coordinator|zigbee gateway|zigbee bridge|matter bridge|thread border router|homekit bridge|smart home hub|smarthome hub|хаб умного дома|координатор zigbee|zigbee шлюз|шлюз zigbee|шлюз умного дома|philips hue bridge|hue bridge|ikea dirigera|dirigera|tradfri gateway|trådfri gateway|aqara hub|xiaomi gateway|mijia gateway|tuya gateway|sonoff zigbee bridge|hubitat|smartthings hub|aeotec hub|homey|fibaro home center|homematic|deconz|conbee|skyconnect|zwavejs|z-wave js|z-wave gateway|zwave gateway)/.test(text))
                return 'server';
        if (/(nvr|dvr|xvr|hybrid recorder|video recorder|videoregistrar|videonablyudenie|videonablydenie|videonabludenie|video-nablyudenie|video-nablydenie|видеорегистратор|регистратор|cctv server|surveillance server|video server|сервер видеонаблюдения|ltv-rne|rne-\d|rvi-r|trassir|xmeye|ivms|hik-connect|smartpss|gdmss|idmss|unv.*nvr|uniview.*nvr|hikvision.*nvr|hiwatch.*nvr|hilook.*nvr|dahua.*nvr|beward.*nvr|optimus.*nvr|tantos.*nvr|polyvision.*nvr|hanwha.*nvr|wisenet.*nvr|axis.*nvr|vivotek.*nvr|tiandy.*nvr)/.test(text))
                return 'server';
        if (/(camera|ip[-_ ]?cam|webcam|(^|[^a-z0-9])cam[0-9]+([^a-z0-9]|$)|(^|[^a-z0-9])cam[-_ ][0-9]+([^a-z0-9]|$)|камера)/.test(text))
                return 'camera';
        if (/(alice|alisa|yandex|яндекс|алиса|station|станци[яи]|smart speaker|speaker|колонк|sonos|homepod|alexa|amazon echo|google home|sberboom|сбербум|маруся|marusya|капсул)/.test(text))
                return 'speaker';
        if (/(vacuum|roborock|dreame|deebot|ecovacs|irobot|roomba|пылесос|miio|xiaomi-vacuum|viomi|ilife|eufy|yeedi)/.test(text))
                return 'vacuum';
        if (/(warm floor|underfloor|floor heating|heated floor|терморегулятор|термоголовк|т[её]пл[ыо]й пол|теплый пол|тёплый пол|подогрев пола|heater relay|smart relay|relay|реле|выключател|switch module|wall switch|light switch|освещен|свет|ламп|dimmer|диммер|curtain|curtains|blind|blinds|shade|roller shade|штор|жалюзи|карниз|чайник|kettle|утюг|iron|socket|plug|розетк|tuya|ewelink|sonoff|shelly|aqara|mijia|xiaomi smart|yeelight|philips hue|nanoleaf|wled|led controller|контроллер led|контроллер света|датчик движения|motion sensor|door sensor|window sensor|датчик двери|датчик окна|leak sensor|датчик протечки|smoke sensor|датчик дыма|temperature sensor|датчик температуры|humidity sensor|датчик влажности|espressif|esp8266|esp32|esp32c3|esp32-c3|esp32s3|esp32-s3|tasmota|esphome)/.test(text))
                return 'smart_home';
        if (/(zont|зонт|ectostroy|ectocontrol|эктоконтрол|myheat|teplocom|теплоком|xital|кситал|телеметрик|telemetrika|owen|овен|saures|boiler|kotel|кот[её]л|baxi|navien|vaillant|buderus|protherm|ariston|heating|thermostat|термостат|отоплен|контроллер|alarm|сигнализац)/.test(text))
                return 'engineering';
        if (/(router|gateway|repeater|extender|openwrt|роутер|шлюз|точка)/.test(text))
                return 'network';

        return 'smart';
}

function deviceTypeIcon(type) {
        var definition = deviceTypeByValue(type);

        return E('span', {
                'class': 'sf-device-type-icon',
                'title': definition.label,
                'aria-label': definition.label
        }, [
                svgIcon(definition.paths)
        ]);
}

function passwordRevealField(label, value) {
        var input = E('input', {
                'class': 'cbi-input-text sf-secret-input',
                'type': 'password',
                'readonly': 'readonly',
                'value': value || ''
        });
        var button = E('button', {
                'class': 'sf-icon-action sf-secret-toggle',
                'title': T('Show temporary password'),
                'aria-label': T('Show temporary password'),
                'click': function (ev) {
                        var visible;

                        ev.preventDefault();
                        visible = input.type === 'password';
                        input.type = visible ? 'text' : 'password';
                        button.setAttribute('title', visible ? T('Hide temporary password') : T('Show temporary password'));
                        button.setAttribute('aria-label', visible ? T('Hide temporary password') : T('Show temporary password'));
                }
        }, iconSvg('eye'));

        return E('label', { 'class': 'sf-field sf-secret-field' }, [
                E('span', {}, label),
                E('div', { 'class': 'sf-secret-row' }, [
                        input,
                        button
                ])
        ]);
}

function gfMultiply(x, y) {
        var z = 0;

        while (y !== 0) {
                if ((y & 1) !== 0)
                        z ^= x;

                x <<= 1;
                if ((x & 0x100) !== 0)
                        x ^= 0x11d;

                y >>>= 1;
        }

        return z;
}

function gfPow2(power) {
        var value = 1;

        while (power-- > 0)
                value = gfMultiply(value, 2);

        return value;
}

function reedSolomonGenerator(degree) {
        var poly = [1];

        for (var i = 0; i < degree; i++) {
                var next = Array(poly.length + 1).fill(0);
                var root = gfPow2(i);

                for (var j = 0; j < poly.length; j++) {
                        next[j] ^= poly[j];
                        next[j + 1] ^= gfMultiply(poly[j], root);
                }

                poly = next;
        }

        return poly;
}

function reedSolomonRemainder(data, degree) {
        var generator = reedSolomonGenerator(degree);
        var message = data.concat(Array(degree).fill(0));

        for (var i = 0; i < data.length; i++) {
                var factor = message[i];

                if (factor === 0)
                        continue;

                for (var j = 0; j < generator.length; j++)
                        message[i + j] ^= gfMultiply(generator[j], factor);
        }

        return message.slice(data.length);
}

function appendBits(bits, value, length) {
        for (var i = length - 1; i >= 0; i--)
                bits.push((value >>> i) & 1);
}

function utf8Bytes(text) {
        if (window.TextEncoder)
                return Array.prototype.slice.call(new TextEncoder().encode(text));

        return unescape(encodeURIComponent(text)).split('').map(function (char) {
                return char.charCodeAt(0) & 0xff;
        });
}

function makeQrCodewords(text) {
        var dataCodewords = 108;
        var errorCorrectionCodewords = 26;
        var bits = [];
        var bytes = utf8Bytes(text);
        var codewords = [];

        appendBits(bits, 0x4, 4);
        appendBits(bits, bytes.length, 8);

        bytes.forEach(function (value) {
                appendBits(bits, value, 8);
        });

        if (bits.length > dataCodewords * 8)
                throw new Error('QR payload is too long');

        appendBits(bits, 0, Math.min(4, dataCodewords * 8 - bits.length));

        while (bits.length % 8 !== 0)
                bits.push(0);

        for (var i = 0; i < bits.length; i += 8) {
                var value = 0;

                for (var j = 0; j < 8; j++)
                        value = (value << 1) | bits[i + j];

                codewords.push(value);
        }

        for (var pad = 0; codewords.length < dataCodewords; pad++)
                codewords.push(pad % 2 === 0 ? 0xec : 0x11);

        return codewords.concat(reedSolomonRemainder(codewords, errorCorrectionCodewords));
}

function createQrMatrix(text) {
        var version = 5;
        var size = version * 4 + 17;
        var matrix = Array.from({ length: size }, function () { return Array(size).fill(false); });
        var reserved = Array.from({ length: size }, function () { return Array(size).fill(false); });

        function setModule(x, y, value, isReserved) {
                if (x < 0 || y < 0 || x >= size || y >= size)
                        return;

                matrix[y][x] = value;
                if (isReserved)
                        reserved[y][x] = true;
        }

        function addFinder(x, y) {
                for (var dy = -1; dy <= 7; dy++) {
                        for (var dx = -1; dx <= 7; dx++) {
                                var xx = x + dx;
                                var yy = y + dy;
                                var on = dx >= 0 && dx <= 6 && dy >= 0 && dy <= 6 &&
                                        (dx === 0 || dx === 6 || dy === 0 || dy === 6 ||
                                        (dx >= 2 && dx <= 4 && dy >= 2 && dy <= 4));

                                setModule(xx, yy, on, true);
                        }
                }
        }

        function addAlignment(cx, cy) {
                for (var dy = -2; dy <= 2; dy++) {
                        for (var dx = -2; dx <= 2; dx++) {
                                var distance = Math.max(Math.abs(dx), Math.abs(dy));
                                setModule(cx + dx, cy + dy, distance !== 1, true);
                        }
                }
        }

        addFinder(0, 0);
        addFinder(size - 7, 0);
        addFinder(0, size - 7);
        addAlignment(30, 30);

        for (var i = 0; i < size; i++) {
                if (!reserved[6][i])
                        setModule(i, 6, i % 2 === 0, true);
                if (!reserved[i][6])
                        setModule(6, i, i % 2 === 0, true);
        }

        setModule(8, version * 4 + 9, true, true);

        var formatBits = 0x77c4;
        for (i = 0; i <= 5; i++)
                setModule(8, i, ((formatBits >>> i) & 1) !== 0, true);
        setModule(8, 7, ((formatBits >>> 6) & 1) !== 0, true);
        setModule(8, 8, ((formatBits >>> 7) & 1) !== 0, true);
        setModule(7, 8, ((formatBits >>> 8) & 1) !== 0, true);
        for (i = 9; i < 15; i++)
                setModule(14 - i, 8, ((formatBits >>> i) & 1) !== 0, true);
        for (i = 0; i < 8; i++)
                setModule(size - 1 - i, 8, ((formatBits >>> i) & 1) !== 0, true);
        for (i = 8; i < 15; i++)
                setModule(8, size - 15 + i, ((formatBits >>> i) & 1) !== 0, true);

        var codewords = makeQrCodewords(text);
        var bitIndex = 0;
        var upward = true;

        for (var right = size - 1; right >= 1; right -= 2) {
                if (right === 6)
                        right--;

                for (var vert = 0; vert < size; vert++) {
                        var y = upward ? size - 1 - vert : vert;

                        for (var col = 0; col < 2; col++) {
                                var x = right - col;

                                if (reserved[y][x])
                                        continue;

                                var bit = false;
                                if (bitIndex < codewords.length * 8)
                                        bit = ((codewords[bitIndex >>> 3] >>> (7 - (bitIndex & 7))) & 1) !== 0;

                                if ((x + y) % 2 === 0)
                                        bit = !bit;

                                setModule(x, y, bit, false);
                                bitIndex++;
                        }
                }

                upward = !upward;
        }

        return matrix;
}

function qrCode(text) {
        var matrix;

        try {
                matrix = createQrMatrix(text);
        } catch (error) {
                return E('div', { 'class': 'sf-qr-error' }, T('QR payload') + ': ' + error.message);
        }

        return E('div', {
                'class': 'sf-qr',
                'aria-label': T('Pairing'),
                'style': 'grid-template-columns: repeat(' + matrix.length + ', 1fr);'
        },
                matrix.reduce(function (nodes, row) {
                        row.forEach(function (on) {
                                nodes.push(E('span', { 'class': on ? 'on' : '' }));
                        });
                        return nodes;
                }, []));
}

function settingLine(label, value) {
        return E('div', { 'class': 'sf-setting-line' }, [
                E('span', {}, label),
                E('code', {}, value)
        ]);
}

function pairingPayload(routerAddress, port, login, code) {
        return 'SF1|h=' + routerAddress + '|p=' + port + '|u=' + login + '|c=' + code;
}

function administratorSectionName(admin) {
        var login = String(admin && admin.login || '').trim();
        var existing = safeUciSections('sheepfold', 'administrator').filter(function (section) {
                return String(section.login || '').trim() === login;
        })[0];
        var preferredName;

        if (existing)
                return existing['.name'];

        preferredName = login === 'SuperParent' ? 'owner' :
                'admin_' + login.toLowerCase().replace(/[^a-z0-9_]+/g, '_').replace(/^_+|_+$/g, '');

        if (!preferredName || preferredName === 'admin_')
                preferredName = 'admin_' + String(admin && admin.id || Date.now()).toLowerCase().replace(/[^a-z0-9_]+/g, '_');

        return ensureSection('sheepfold', 'administrator', preferredName);
}

function activateAdministratorPairingCode(admin, code) {
        return routerControl([
                'activate-admin-pairing-code',
                admin.login || '',
                code || '',
                admin.name || admin.login || '',
                '600'
        ]);
}

function pairingStatusForAdministrator(admin, since) {
        return routerControl([
                'admin-pairing-status',
                admin.login || '',
                String(since || 0)
        ]).then(function (result) {
                return parseKeyValueOutput(result.stdout || '');
        });
}

function upsertPairedAdminDevice(admin, status) {
        var mac = normalizeMac(status.mac);
        var device = null;
        var nextId;

        if (!mac)
                return null;

        devices.some(function (candidate) {
                if (normalizeMac(candidate.mac) === mac) {
                        device = candidate;
                        return true;
                }

                return false;
        });

        if (!device) {
                nextId = 'D-' + String(devices.length + 1).padStart(4, '0');
                device = {
                        id: nextId,
                        name: status.device_name || mac,
                        ip: status.ip || '',
                        mac: mac,
                        group: T('Not configured'),
                        status: 'allow',
                        note: T('Admin device'),
                        adminDevice: true,
                        adminOwner: status.admin_name || admin.name || '',
                        adminLogin: status.admin_login || admin.login || '',
                        deviceType: 'phone'
                };
                devices.push(device);
        }

        device.name = status.device_name || device.name || mac;
        device.ip = status.ip || device.ip || '';
        device.status = 'allow';
        device.adminDevice = true;
        device.adminOwner = status.admin_name || admin.name || '';
        device.adminLogin = status.admin_login || admin.login || '';

        if ((admin.deviceIds || []).indexOf(device.id) === -1)
                admin.deviceIds = (admin.deviceIds || []).concat([device.id]);

        return device;
}

function updateAdminTableRow(admin) {
        document.querySelectorAll('.sf-admin-row').forEach(function (row) {
                if (row.getAttribute('data-admin-login') === String(admin.login || ''))
                        row.replaceWith(adminTableRow(admin));
        });
}

function startAdminPairingWatcher(admin, since) {
        var startedAt = Date.now();
        var timer = null;
        var stopped = false;

        function stop() {
                stopped = true;
                if (timer)
                        window.clearTimeout(timer);
        }

        function check() {
                if (stopped)
                        return;

                if (Date.now() - startedAt > 10 * 60 * 1000) {
                        stop();
                        return;
                }

                pairingStatusForAdministrator(admin, since).then(function (status) {
                        var device;

                        if (stopped)
                                return;

                        if (status.paired === '1') {
                                device = upsertPairedAdminDevice(admin, status);
                                updateAdminTableRow(admin);
                                ui.hideModal();
                                notifyCentered('К администратору ' + (status.admin_name || admin.name || admin.login) +
                                        ' успешно привязалось устройство "' + ((device && device.name) || status.device_name || status.mac || '') + '"');
                                stop();
                                return;
                        }

                        timer = window.setTimeout(check, 2000);
                }, function () {
                        if (!stopped)
                                timer = window.setTimeout(check, 3000);
                });
        }

        timer = window.setTimeout(check, 1500);

        return stop;
}

function randomInteger(max) {
        if (window.crypto && window.crypto.getRandomValues) {
                var values = new Uint32Array(1);
                window.crypto.getRandomValues(values);
                return values[0] % max;
        }

        return Math.floor(Math.random() * max);
}

function shuffleCharacters(chars) {
        for (var i = chars.length - 1; i > 0; i--) {
                var j = randomInteger(i + 1);
                var tmp = chars[i];
                chars[i] = chars[j];
                chars[j] = tmp;
        }

        return chars;
}

function generatePairingCode() {
        var lower = 'abcdefghkmnpqrstuvwxyz';
        var upper = 'ABCDEFGHKMNPQRSTUVWXYZ';
        var digits = '2456789';
        var specials = '+-*()[]{}<>?@#$%^&:;.,';
        var alnum = lower + upper + digits;
        var all = alnum + specials;
        var chars = [
                lower[randomInteger(lower.length)],
                upper[randomInteger(upper.length)],
                digits[randomInteger(digits.length)]
        ];
        var specialCount = randomInteger(4);

        for (var s = 0; s < specialCount; s++) {
                chars.push(specials[randomInteger(specials.length)]);
        }

        while (chars.length < 10) {
                var pool = specialCount >= 3 ? alnum : all;
                var next = pool[randomInteger(pool.length)];
                if (specials.indexOf(next) !== -1)
                        specialCount++;
                chars.push(next);
        }

        return shuffleCharacters(chars).join('');
}

function generateUrlToken(length) {
        var chars = 'abcdefghkmnpqrstuvwxyzABCDEFGHKMNPQRSTUVWXYZ2456789';
        var token = [];

        for (var i = 0; i < length; i++)
                token.push(chars[randomInteger(chars.length)]);

        return token.join('');
}

function currentRouterAddress() {
        return window.location.hostname || String(window.location.host || '').split(':')[0] || '192.168.1.1';
}

function quickAllowlistUrl(token) {
        return window.location.protocol + '//' + currentRouterAddress() + '/q/' + encodeURIComponent(token);
}

function readRouterDevicesNow() {
        return Promise.all([
                fs.read('/tmp/dhcp.leases').catch(function () {
                        return '';
                }),
                fs.read('/proc/net/arp').catch(function () {
                        return '';
                })
        ]).then(function (results) {
                devices = buildRouterDevices(results[0], results[1]);
                return devices;
        });
}

function quickCandidateKey(device) {
        return normalizeMac(device.mac) || device.ip || device.name;
}

function quickCandidateAgeText(ageMs) {
        var seconds = Math.max(0, Math.floor(ageMs / 1000));
        var minutes;

        if (seconds < 60)
                return seconds + ' ' + T('seconds ago');

        minutes = Math.floor(seconds / 60);

        if (minutes === 1)
                return T('minute ago');

        return minutes + ' ' + T('minutes ago');
}

function renderQuickCandidateRow(candidate, onAdd) {
        return E('tr', {}, [
                E('td', {}, [
                        E('strong', {}, candidate.device.name || '-'),
                        E('small', {}, T('Connected after quick add started.'))
                ]),
                E('td', {}, candidate.device.ip || '-'),
                E('td', {}, candidate.device.mac || '-'),
                E('td', {}, quickCandidateAgeText(Date.now() - candidate.firstSeenAt)),
                E('td', {}, E('button', {
                        'class': 'sf-action sf-action-positive',
                        'disabled': candidate.added ? 'disabled' : null,
                        'click': function (ev) {
                                ev.preventDefault();
                                onAdd(candidate, ev.currentTarget);
                        }
                }, candidate.added ? T('Candidate added to allowlist. Save changes to apply.') : T('Add')))
        ]);
}

function renderQuickCandidateTable(candidates, onAdd) {
        return E('table', { 'class': 'sf-quick-table' }, [
                E('thead', {}, E('tr', {}, [
                        E('th', {}, T('Device')),
                        E('th', {}, 'IP'),
                        E('th', {}, 'MAC'),
                        E('th', {}, T('Seen')),
                        E('th', {}, T('Actions'))
                ])),
                E('tbody', {}, candidates.map(function (candidate) {
                        return renderQuickCandidateRow(candidate, onAdd);
                }))
        ]);
}

function ipSortValue(ip) {
        var parts = String(ip || '').split('.').map(function (part) {
                return parseInt(part, 10);
        });

        if (parts.length !== 4 || parts.some(function (part) { return isNaN(part); }))
                return -1;

        return (((parts[0] * 256) + parts[1]) * 256 + parts[2]) * 256 + parts[3];
}

function sortDeviceTable(table, key) {
        var currentKey = table.getAttribute('data-sort-key');
        var currentDirection = table.getAttribute('data-sort-direction') || 'asc';
        var direction = currentKey === key && currentDirection === 'asc' ? 'desc' : 'asc';
        var rows = Array.prototype.slice.call(table.querySelectorAll('.sf-device-row:not(.sf-device-head)'));

        rows.sort(function (left, right) {
                var leftValue = left.getAttribute('data-sort-' + key) || '';
                var rightValue = right.getAttribute('data-sort-' + key) || '';
                var result;

                if (key === 'id' || key === 'ip') {
                        result = Number(leftValue) - Number(rightValue);
                } else {
                        result = leftValue.localeCompare(rightValue, undefined, {
                                numeric: true,
                                sensitivity: 'base'
                        });
                }

                return direction === 'asc' ? result : -result;
        });

        table.setAttribute('data-sort-key', key);
        table.setAttribute('data-sort-direction', direction);
        table.querySelectorAll('.sf-device-sort').forEach(function (button) {
                var active = button.getAttribute('data-sort-key') === key;

                button.classList.toggle('active', active);
                button.setAttribute('data-sort-direction', active ? direction : '');
        });

        rows.forEach(function (row) {
                table.appendChild(row);
        });
}

function deviceSortHeader(label, key) {
        return E('button', {
                'class': 'sf-device-sort',
                'data-sort-key': key,
                'click': function (ev) {
                        ev.preventDefault();
                        sortDeviceTable(ev.currentTarget.closest('.sf-device-table'), key);
                }
        }, [
                E('span', {}, label),
                E('span', { 'class': 'sf-sort-arrow' }, '')
        ]);
}

function filterDeviceTable(table, needle) {
        var query = String(needle || '').trim().toLowerCase();

        table.querySelectorAll('.sf-device-row:not(.sf-device-head)').forEach(function (row) {
                var haystack = [
                        row.getAttribute('data-sort-id') || '',
                        row.getAttribute('data-sort-device') || '',
                        row.getAttribute('data-sort-type') || '',
                        row.getAttribute('data-sort-ip') || '',
                        row.getAttribute('data-sort-group') || '',
                        row.getAttribute('data-sort-status') || '',
                        row.getAttribute('data-search') || ''
                ].join(' ').toLowerCase();

                row.hidden = query && haystack.indexOf(query) === -1;
        });
}

function sortAdminTable(table, key) {
        var currentKey = table.getAttribute('data-sort-key');
        var currentDirection = table.getAttribute('data-sort-direction') || 'asc';
        var direction = currentKey === key && currentDirection === 'asc' ? 'desc' : 'asc';
        var rows = Array.prototype.slice.call(table.querySelectorAll('.sf-admin-row:not(.sf-admin-head)'));

        rows.sort(function (left, right) {
                var leftValue = left.getAttribute('data-sort-' + key) || '';
                var rightValue = right.getAttribute('data-sort-' + key) || '';
                var result = leftValue.localeCompare(rightValue, undefined, {
                        numeric: true,
                        sensitivity: 'base'
                });

                return direction === 'asc' ? result : -result;
        });

        table.setAttribute('data-sort-key', key);
        table.setAttribute('data-sort-direction', direction);
        table.querySelectorAll('.sf-admin-sort').forEach(function (button) {
                var active = button.getAttribute('data-sort-key') === key;

                button.classList.toggle('active', active);
                button.setAttribute('data-sort-direction', active ? direction : '');
        });

        rows.forEach(function (row) {
                table.appendChild(row);
        });
}

function adminSortHeader(label, key) {
        return E('button', {
                'class': 'sf-device-sort sf-admin-sort',
                'data-sort-key': key,
                'click': function (ev) {
                        ev.preventDefault();
                        sortAdminTable(ev.currentTarget.closest('.sf-admin-table'), key);
                }
        }, [
                E('span', {}, label),
                E('span', { 'class': 'sf-sort-arrow' }, '')
        ]);
}

function showPairingModal(device) {
        var routerAddress = currentRouterAddress();
        var port = safeUciGet('sheepfold', 'global', 'app_port', '5201');
        var apiPath = '/cgi-bin/sheepfold-api';
        var apiUrl = 'http://' + routerAddress + ':' + port + apiPath;
        var pairingCode = device.pairingCode || generatePairingCode();
        var pairingPayloadText = pairingPayload(routerAddress, port, device.adminLogin || 'SuperParent', pairingCode);

        ui.showModal(T('Pairing settings'), [
                E('div', { 'class': 'sf-modal-pairing' }, [
                        E('div', { 'class': 'sf-qr-wrap' }, [
                                qrCode(pairingPayloadText),
                                E('p', {}, T('Scan this QR code with the Android app to connect it to this router.'))
                        ]),
                        E('div', { 'class': 'sf-manual-settings' }, [
                                E('h4', {}, T('Manual setup')),
                                settingLine(T('Router address'), routerAddress),
                                settingLine(T('Sheepfold API URL'), apiUrl),
                                settingLine(T('Administrator login'), device.adminLogin || 'SuperParent'),
                                settingLine(T('Pairing code'), pairingCode),
                                settingLine(T('Token lifetime'), T('10 minutes')),
                                settingLine(T('QR payload'), pairingPayloadText),
                                settingLine(T('Wi-Fi MAC check'), T('Use the real device MAC for this home Wi-Fi network.')),
                                E('div', { 'class': 'sf-note sf-note-warning' }, T('Android must require the real device MAC for this home Wi-Fi network before continuing setup.'))
                        ])
                ]),
                E('div', { 'class': 'right' }, [
                        E('button', {
                                'class': 'btn cbi-button',
                                'click': ui.hideModal
                        }, T('Close'))
                ])
        ]);
}

function showAdminSettingsModal(admin) {
        var routerAddress = currentRouterAddress();
        var port = safeUciGet('sheepfold', 'global', 'app_port', '5201');
        var apiPath = '/cgi-bin/sheepfold-api';
        var apiUrl = 'http://' + routerAddress + ':' + port + apiPath;
        var temporaryPassword = admin.temporaryPassword || generatePairingCode();
        var pairingPayloadText = pairingPayload(routerAddress, port, admin.login, temporaryPassword);
        var pairingStartedAt = Math.floor(Date.now() / 1000);
        var stopPairingWatcher = null;

        admin.temporaryPassword = temporaryPassword;
        activateAdministratorPairingCode(admin, temporaryPassword).then(function () {
                stopPairingWatcher = startAdminPairingWatcher(admin, pairingStartedAt);
        }).catch(function () {
                notify(T('Could not save settings.'), 'warning');
        });

        ui.showModal(T('Administrator settings'), [
                E('div', { 'class': 'sf-modal-pairing' }, [
                        E('div', { 'class': 'sf-qr-wrap' }, [
                                qrCode(pairingPayloadText),
                                E('p', {}, T('Scan this QR code in the Android app for quick setup.'))
                        ]),
                        E('div', { 'class': 'sf-manual-settings' }, [
                                field(T('Admin name'), admin.name),
                                field(T('Login'), admin.login),
                                passwordRevealField(T('Temporary password'), temporaryPassword),
                                settingLine(T('Sheepfold API URL'), apiUrl),
                                settingLine(T('Server IP address'), routerAddress),
                                settingLine(T('Port'), port)
                        ])
                ]),
                E('div', { 'class': 'right' }, [
                        E('button', {
                                'class': 'btn cbi-button',
                                'click': function () {
                                        if (stopPairingWatcher)
                                                stopPairingWatcher();
                                        ui.hideModal();
                                }
                        }, T('Close'))
                ])
        ]);
}

function pairingButton(device) {
        return E('button', {
                'class': 'sf-action sf-action-pairing',
                'click': function (ev) {
                        ev.preventDefault();
                        showPairingModal(device);
                }
        }, [adminDeviceIcon(), E('span', {}, T('Pairing'))]);
}

function listDeviceCanBeAdded(device, targetStatus) {
        var mac = normalizeMac(device && device.mac);

        if (!mac)
                return false;

        if (targetStatus === 'blocked')
                return !isAdminDevice(device) &&
                        device.status !== 'blocked' &&
                        device.status !== 'allow' &&
                        !macInSheepfoldList('allowlist', mac);

        return device.status !== 'allow' &&
                device.status !== 'blocked' &&
                !macInSheepfoldList('allowlist', mac) &&
                !macInSheepfoldList('blocklist', mac);
}

function listDeviceCandidateTable(targetStatus, onSelect) {
        var rows = devices.filter(function (device) {
                return listDeviceCanBeAdded(device, targetStatus);
        });

        if (!rows.length)
                return E('div', { 'class': 'sf-note sf-note-warning' }, T('No devices available to add.'));

        return E('div', { 'class': 'sf-add-device-candidates' }, [
                E('strong', {}, T('Available devices')),
                E('table', { 'class': 'sf-quick-table sf-add-device-table' }, [
                        E('thead', {}, [
                                E('tr', {}, [
                                        E('th', {}, T('ID')),
                                        E('th', {}, T('Device')),
                                        E('th', {}, T('IP address')),
                                        E('th', {}, T('MAC address')),
                                        E('th', {}, T('Actions'))
                                ])
                        ]),
                        E('tbody', {}, rows.map(function (device) {
                                return E('tr', {}, [
                                        E('td', {}, formattedDeviceDisplayId(device)),
                                        E('td', {}, [
                                                E('strong', {}, device.name || T('Unknown device')),
                                                E('small', {}, device.group || T('Not configured'))
                                        ]),
                                        E('td', {}, device.ip || '-'),
                                        E('td', { 'class': 'sf-mono' }, device.mac || '-'),
                                        E('td', {}, [
                                                E('button', {
                                                        'class': 'sf-action sf-action-positive',
                                                        'click': function (ev) {
                                                                ev.preventDefault();
                                                                onSelect(device);
                                                        }
                                                }, T('Select'))
                                        ])
                                ]);
                        }))
                ])
        ]);
}

function setDeviceBackendStatus(device, status) {
        var mac = normalizeMac(device && device.mac);

        if (!mac)
                return Promise.reject(new Error(T('Invalid MAC address')));

        return routerControl([
                'set-device-status',
                mac,
                status,
                device.name || device.hostname || mac,
                device.ip || '',
                device.group || T('Not configured'),
                device.deviceType || 'smart'
        ]);
}

function showManualListDeviceModal(targetStatus) {
        var isAllowlist = targetStatus === 'allow';
        var title = isAllowlist ? T('Add device to allowlist') : T('Add device to blocklist');
        var selector = createDeviceSelectionBox({
                filter: function (device) {
                        return listDeviceCanBeAdded(device, targetStatus);
                }
        });

        ui.showModal(title, [
                E('div', { 'class': 'sf-device-editor' }, [
                        selector.node
                ]),
                E('div', { 'class': 'right sf-modal-actions' }, [
                        E('button', {
                                'class': 'btn cbi-button',
                                'click': ui.hideModal
                        }, T('Cancel')),
                        E('button', {
                                'class': 'btn cbi-button cbi-button-positive',
                                'click': function () {
                                        var selectedDevices = selector.selectedDevices();

                                        if (!selectedDevices.length) {
                                                notify(T('No devices selected'), 'warning');
                                                return;
                                        }

                                        Promise.all(selectedDevices.map(function (device) {
                                                return setDeviceBackendStatus(device, targetStatus);
                                        })).then(function () {
                                                notify(isAllowlist ? T('Device added to allowlist.') : T('Device added to blocklist.'), 'info');
                                                ui.hideModal();
                                                window.setTimeout(function () {
                                                        window.location.reload();
                                                }, 700);
                                        }, function (error) {
                                                notify(commandErrorText(error, T('Could not add device.')), 'warning');
                                        });
                                }
                        }, T('Save'))
                ])
        ]);
}

function showManualDeviceModal() {
        var nameField = siteInputField(T('Device name'), '');
        var macField = siteInputField(T('MAC address'), '');
        var ipField = siteInputField(T('IP address'), '');
        var typeField = deviceTypeSelectControl(T('Device type'), 'smart');

        ui.showModal(T('Add device'), [
                E('div', { 'class': 'sf-device-editor' }, [
                        nameField.node,
                        macField.node,
                        ipField.node,
                        typeField.node
                ]),
                E('div', { 'class': 'right sf-modal-actions' }, [
                        E('button', {
                                'class': 'btn cbi-button',
                                'click': ui.hideModal
                        }, T('Cancel')),
                        E('button', {
                                'class': 'btn cbi-button cbi-button-positive',
                                'click': function () {
                                        var mac = normalizeMac(macField.input.value);

                                        if (!mac) {
                                                notify(T('Enter a valid MAC address.'), 'warning');
                                                return;
                                        }

                                        setDeviceBackendStatus({
                                                mac: mac,
                                                name: nameField.input.value.trim() || mac,
                                                ip: ipField.input.value.trim(),
                                                group: T('Not configured'),
                                                deviceType: typeField.input.value
                                        }, 'restricted').then(function () {
                                                notify(T('Device added.'), 'info');
                                                ui.hideModal();
                                                window.setTimeout(function () {
                                                        window.location.reload();
                                                }, 700);
                                        }, function (error) {
                                                notify(commandErrorText(error, T('Could not add device.')), 'warning');
                                        });
                                }
                        }, T('Save'))
                ])
        ]);
}

function manualListDeviceButton(targetStatus) {
        return E('button', {
                'class': 'sf-action sf-action-positive',
                'click': function (ev) {
                        ev.preventDefault();
                        showManualListDeviceModal(targetStatus);
                }
        }, T('Add device'));
}

function showQuickAllowlistModal() {
        var networks = readWifiNetworksFromUci();
        var wifiPayload = networks.length ?
                wifiQrPayload(networks[0].ssid, networks[0].password, networks[0].encryption) :
                'WIFI:T:nopass;S:;;';
        var allowlistToken = generateUrlToken(18);
        var allowlistUrl = quickAllowlistUrl(allowlistToken);
        var progressFill = E('span', { 'class': 'sf-quick-progress-fill' });
        var permitButton;
        var timer = null;
        var refreshTimer = null;
        var startSequence = 0;
        var secondsTotal = 30;
        var windowStartedAt = 0;
        var windowExpiresAt = 0;
        var baselineKeys = {};
        var candidateMap = {};
        var candidatesNode = E('div', { 'class': 'sf-quick-candidates' });
        var permitTitle;
        var permitHint;

        devices.forEach(function (device) {
                baselineKeys[quickCandidateKey(device)] = true;
        });

        function candidateList() {
                return Object.keys(candidateMap).map(function (key) {
                        return candidateMap[key];
                }).sort(function (left, right) {
                        return right.firstSeenAt - left.firstSeenAt;
                });
        }

        function renderCandidates() {
                var candidates = candidateList();

                candidatesNode.replaceChildren(renderQuickCandidateTable(candidates, function (candidate, button) {
                        button.disabled = true;
                        setDeviceBackendStatus(candidate.device, 'allow').then(function () {
                                candidate.added = true;
                                button.textContent = T('Device added to allowlist.');
                                notify(T('Device added to allowlist.'), 'info');
                        }, function (error) {
                                button.disabled = false;
                                notify(commandErrorText(error, T('Could not add device.')), 'warning');
                        });
                }));
        }

        function refreshCandidates() {
                if (!windowStartedAt || Date.now() > windowExpiresAt)
                        return Promise.resolve();

                return readRouterDevicesNow().then(function (currentDevices) {
                        currentDevices.forEach(function (device) {
                                var key = quickCandidateKey(device);

                                if (!key || baselineKeys[key] || candidateMap[key] || device.status === 'blocked' || device.status === 'allow')
                                        return;

                                candidateMap[key] = {
                                        device: device,
                                        firstSeenAt: Date.now()
                                };
                        });

                        renderCandidates();
                });
        }

        function startWindow() {
                var remaining = secondsTotal;
                var sequence = ++startSequence;

                if (timer)
                        window.clearInterval(timer);
                if (refreshTimer)
                        window.clearInterval(refreshTimer);

                permitButton.classList.remove('expired');
                permitTitle.textContent = T('Adding allowed');
                permitHint.textContent = T('Click to restart the 30 second window.');
                windowStartedAt = Date.now();
                windowExpiresAt = windowStartedAt + secondsTotal * 1000;
                baselineKeys = {};

                renderCandidates();
                readRouterDevicesNow().then(function (currentDevices) {
                        if (sequence !== startSequence)
                                return;

                        currentDevices.forEach(function (device) {
                                baselineKeys[quickCandidateKey(device)] = true;
                        });

                        refreshCandidates();
                        refreshTimer = window.setInterval(refreshCandidates, 3000);
                });

                function tick() {
                        var percent = Math.max(0, remaining / secondsTotal * 100);

                        progressFill.style.width = percent + '%';

                        if (remaining <= 0) {
                                window.clearInterval(timer);
                                timer = null;
                                if (refreshTimer) {
                                        window.clearInterval(refreshTimer);
                                        refreshTimer = null;
                                }
                                permitButton.classList.add('expired');
                                permitTitle.textContent = T('Adding window expired');
                                permitHint.textContent = T('Click to restart the 30 second window.');
                        }

                        remaining--;
                }

                tick();
                timer = window.setInterval(tick, 1000);
        }

        permitTitle = E('strong', {}, T('Adding allowed'));
        permitHint = E('small', {}, T('Click to restart the 30 second window.'));
        permitButton = E('button', {
                'class': 'sf-action sf-action-positive sf-quick-permit',
                'click': function (ev) {
                        ev.preventDefault();
                        startWindow();
                }
        }, [
                progressFill,
                permitTitle,
                permitHint
        ]);

        ui.showModal(T('Quick allowlist add'), [
                E('div', { 'class': 'sf-modal-quick' }, [
                        E('div', { 'class': 'sf-modal-quick-top' }, [
                                E('div', { 'class': 'sf-qr-wrap' }, [
                                        E('h4', {}, T('Wi-Fi access QR')),
                                        qrCode(wifiPayload),
                                        E('p', {}, T('Scan Wi-Fi QR, then add newly connected devices manually.'))
                                ]),
                                E('div', { 'class': 'sf-qr-wrap sf-qr-divider' }, [
                                        E('h4', {}, T('Allowlist request QR')),
                                        qrCode(allowlistUrl),
                                        E('p', {}, T('After connecting to Wi-Fi, scan this QR to request allowlist access from this phone.')),
                                        settingLine(T('One-time allowlist link'), allowlistUrl)
                                ]),
                                E('div', { 'class': 'sf-quick-side' }, [
                                        permitButton,
                                        E('div', { 'class': 'sf-note' }, T('Quick mode only collects candidates. A parent still presses Add for every device.'))
                                ])
                        ]),
                        E('div', { 'class': 'sf-quick-candidates-wrap' }, [
                                E('h4', {}, T('Newly connected devices')),
                                candidatesNode
                        ])
                ]),
                E('div', { 'class': 'right' }, [
                        E('button', {
                                'class': 'btn cbi-button',
                                'click': function () {
                                        if (timer)
                                                window.clearInterval(timer);
                                        if (refreshTimer)
                                                window.clearInterval(refreshTimer);
                                        ui.hideModal();
                                }
                        }, T('Close'))
                ])
        ]);

        startWindow();
}

function quickAllowlistButton() {
        return E('button', {
                'class': 'sf-action sf-action-positive',
                'click': function (ev) {
                        ev.preventDefault();
                        showQuickAllowlistModal();
                }
        }, T('Quick add to allowlist'));
}

function renderEmergencySiteList() {
        var lists = document.querySelectorAll('.sf-domain-list');

        for (var i = 0; i < lists.length; i++)
                lists[i].replaceChildren.apply(lists[i], emergencySites.map(domainCard));
}

function siteInputField(label, value) {
        var input = E('input', { 'class': 'cbi-input-text', 'value': value || '' });

        return {
                input: input,
                node: E('label', { 'class': 'sf-field' }, [
                        E('span', {}, label),
                        input
                ])
        };
}

function siteTextareaField(label, value) {
        var input = E('textarea', { 'class': 'cbi-input-textarea', 'rows': 4 }, value || '');

        return {
                input: input,
                node: E('label', { 'class': 'sf-field sf-field-wide' }, [
                        E('span', {}, label),
                        input
                ])
        };
}

function showSiteModal(site) {
        var isEdit = !!site;
        var current = site || ['', '', ''];
        var urlField = siteInputField(T('URL address'), current[0]);
        var nameField = siteInputField(T('Name'), current[1]);
        var descriptionField = siteTextareaField(T('Description'), current[2]);

        ui.showModal(isEdit ? T('Edit site') : T('Add site'), [
                E('div', { 'class': 'sf-site-modal' }, [
                        urlField.node,
                        nameField.node,
                        descriptionField.node,
                        E('div', { 'class': 'sf-note sf-note-warning' },
                                T('Do not add broad yandex.ru by default: it can open video, music, games, feeds, and other non-emergency services.'))
                ]),
                E('div', { 'class': 'right sf-modal-actions' }, [
                        E('button', {
                                'class': 'btn cbi-button',
                                'click': ui.hideModal
                        }, T('Cancel')),
                        E('button', {
                                'class': 'btn cbi-button cbi-button-positive',
                                'click': function () {
                                        var url = urlField.input.value.trim();
                                        var name = nameField.input.value.trim();
                                        var description = descriptionField.input.value.trim();

                                        if (!url) {
                                                notify(T('Site URL is required.'), 'warning');
                                                return;
                                        }

                                        if (isEdit) {
                                                site[0] = url;
                                                site[1] = name;
                                                site[2] = description;
                                        } else {
                                                emergencySites.push([url, name, description]);
                                        }

                                        renderEmergencySiteList();
                                        notify(T('Site saved.'), 'info');
                                        ui.hideModal();
                                }
                        }, T('Save'))
                ])
        ]);
}

function deleteSite(site) {
        var index = emergencySites.indexOf(site);

        if (index === -1)
                return;

        emergencySites.splice(index, 1);
        renderEmergencySiteList();
        notify(T('Site deleted.'), 'info');
        ui.hideModal();
}

function showDeleteSiteModal(site) {
        ui.showModal(T('Delete site'), [
                E('div', { 'class': 'sf-site-modal' }, [
                        E('p', {}, T('Delete this site?')),
                        E('strong', {}, site[0]),
                        E('small', {}, T('This site will be removed from the emergency-useful list.'))
                ]),
                E('div', { 'class': 'right sf-modal-actions' }, [
                        E('button', {
                                'class': 'btn cbi-button',
                                'click': ui.hideModal
                        }, T('Cancel')),
                        E('button', {
                                'class': 'btn cbi-button cbi-button-negative',
                                'click': function () {
                                        deleteSite(site);
                                }
                        }, T('Delete'))
                ])
        ]);
}

function domainCard(site) {
        return E('div', { 'class': 'sf-domain' }, [
                E('div', { 'class': 'sf-domain-actions sf-domain-actions-top' }, [
                        iconButton(T('Edit site'), 'gear', 'neutral', function () {
                                showSiteModal(site);
                        })
                ]),
                E('strong', {}, site[0]),
                E('span', {}, site[1]),
                E('small', {}, site[2]),
                E('div', { 'class': 'sf-domain-actions sf-domain-actions-bottom' }, [
                        iconButton(T('Delete site'), 'trash', 'danger', function () {
                                showDeleteSiteModal(site);
                        })
                ])
        ]);
}

function deviceDisplayId(device) {
        var match = String(device.id || '').match(/(\d+)$/);

        return match ? String(parseInt(match[1], 10)) : String(devices.indexOf(device) + 1);
}

function formattedDeviceDisplayId(device) {
        return '#' + deviceDisplayId(device);
}

function normalizeGroupName(groupName) {
        if (groupName === 'Ребёнок номер 1' || groupName === 'Child number 1')
                return T('Child number 1');

        return String(groupName || '').trim();
}

function noRestrictionsGroupName() {
        return normalizeGroupName(T('No restrictions'));
}

function markNoRestrictionsAutoExcluded(sectionName) {
        if (!sectionName)
                return;

        uci.set('sheepfold', sectionName, 'no_restrictions_auto_excluded', '1');
        uci.set('sheepfold', sectionName, 'auto_group_assigned', '0');
}

function deviceById(id) {
        for (var i = 0; i < devices.length; i++) {
                if (devices[i].id === id)
                        return devices[i];
        }

        return null;
}

function isAdminDevice(device) {
        if (!device)
                return false;

        if (device.adminDevice)
                return true;

        return admins.some(function (admin) {
                return (admin.deviceIds || []).indexOf(device.id) !== -1;
        });
}

function idNumber(value) {
        var match = String(value || '').match(/(\d+)$/);

        return match ? parseInt(match[1], 10) : Number.MAX_SAFE_INTEGER;
}

function firstAdminBySmallestId() {
        return admins.slice().sort(function (left, right) {
                return idNumber(left.id) - idNumber(right.id);
        })[0] || null;
}

function adminByDeepLinkValue(value) {
        if (!value || value === 'first')
                return firstAdminBySmallestId();

        for (var i = 0; i < admins.length; i++) {
                if (admins[i].id === value || admins[i].login === value || admins[i].name === value)
                        return admins[i];
        }

        return null;
}

function adminDeviceList(admin) {
        var selectedById = {};
        var selected = [];

        (admin.deviceIds || []).map(deviceById).filter(Boolean).forEach(function (device) {
                selectedById[device.id] = true;
                selected.push(device);
        });

        devices.forEach(function (device) {
                if (!device || selectedById[device.id])
                        return;

                if (device.adminDevice && (
                        device.adminLogin === admin.login ||
                        device.adminOwner === admin.name
                )) {
                        selectedById[device.id] = true;
                        selected.push(device);
                }
        });

        admin.deviceIds = selected.map(function (device) {
                return device.id;
        });

        if (!selected.length)
                return E('span', { 'class': 'sf-muted' }, T('No devices selected'));

        return E('div', { 'class': 'sf-admin-device-list' }, selected.map(function (device) {
                return E('div', {}, [
                        E('span', { 'class': 'sf-admin-device-list-id' }, formattedDeviceDisplayId(device)),
                        E('span', {}, device.name)
                ]);
        }));
}

function adminAssignedDeviceIds(exceptAdmin) {
        var assigned = {};

        admins.forEach(function (admin) {
                if (exceptAdmin && admin.id === exceptAdmin.id)
                        return;

                (admin.deviceIds || []).forEach(function (id) {
                        assigned[id] = true;
                });
        });

        devices.forEach(function (device) {
                if (!device || !device.adminDevice)
                        return;

                if (exceptAdmin && (
                        device.adminLogin === exceptAdmin.login ||
                        device.adminOwner === exceptAdmin.name
                ))
                        return;

                assigned[device.id] = true;
        });

        return assigned;
}

function adminDeviceCanBeBound(device) {
        return device &&
                device.status !== 'blocked' &&
                !macInSheepfoldList('blocklist', device.mac);
}

function deviceMatchesSelectionFilter(device, needle) {
        if (!needle)
                return true;

        return [
                deviceDisplayId(device),
                formattedDeviceDisplayId(device),
                device.id,
                device.name,
                device.ip,
                device.mac,
                device.group
        ].join(' ').toLowerCase().indexOf(needle) !== -1;
}

function createDeviceSelectionBox(options) {
        var selected = {};
        var filterInput = E('input', {
                'class': 'cbi-input-text sf-search sf-binding-filter',
                'placeholder': T('Search by name, IP, MAC, or ID')
        });
        var table = E('div', { 'class': 'sf-binding-table' });
        var filter = options.filter || function () { return true; };
        var sortSource = options.devices || devices;

        (options.selectedIds || []).forEach(function (id) {
                selected[id] = true;
        });

        function sortedRows() {
                return sortSource.filter(filter).sort(function (left, right) {
                        var leftSelected = selected[left.id] ? 1 : 0;
                        var rightSelected = selected[right.id] ? 1 : 0;

                        if (leftSelected !== rightSelected)
                                return rightSelected - leftSelected;

                        return devices.indexOf(right) - devices.indexOf(left);
                });
        }

        function redraw() {
                var needle = filterInput.value.trim().toLowerCase();
                var rows = sortedRows().filter(function (device) {
                        return deviceMatchesSelectionFilter(device, needle);
                }).map(function (device) {
                        var checkbox = E('input', {
                                'type': 'checkbox',
                                'checked': selected[device.id] ? 'checked' : null,
                                'change': function (ev) {
                                        selected[device.id] = ev.currentTarget.checked;
                                        redraw();
                                }
                        });

                        return E('div', { 'class': 'sf-binding-row' + (selected[device.id] ? ' is-selected' : '') }, [
                                E('div', { 'class': 'sf-device-index' }, formattedDeviceDisplayId(device)),
                                E('div', { 'class': 'sf-device-name' }, [
                                        E('strong', {}, device.name),
                                        E('small', {}, device.group)
                                ]),
                                E('div', {}, device.ip || '-'),
                                E('div', { 'class': 'sf-mono' }, device.mac || '-'),
                                E('label', { 'class': 'sf-binding-check' }, checkbox)
                        ]);
                });

                table.replaceChildren.apply(table, [
                        E('div', { 'class': 'sf-binding-row sf-binding-head' }, [
                                E('div', {}, T('ID')),
                                E('div', {}, T('Device')),
                                E('div', {}, T('IP address')),
                                E('div', {}, T('MAC address')),
                                E('div', {}, '')
                        ])
                ].concat(rows));
        }

        filterInput.addEventListener('input', redraw);
        redraw();

        return {
                node: E('div', { 'class': 'sf-binding-selector' }, [
                        E('div', { 'class': 'sf-panel-head sf-binding-toolbar' }, [
                                filterInput,
                                E('span', { 'class': 'sf-muted' }, T('Selected devices are shown first.'))
                        ]),
                        table
                ]),
                selectedDevices: function () {
                        return sortedRows().filter(function (device) {
                                return selected[device.id];
                        });
                },
                selectedIds: function () {
                        return this.selectedDevices().map(function (device) {
                                return device.id;
                        });
                },
                isSelected: function (device) {
                        return !!selected[device.id];
                }
        };
}

function hashString(text) {
        var hash = 0;

        String(text || '').split('').forEach(function (char) {
                hash = ((hash << 5) - hash + char.charCodeAt(0)) | 0;
        });

        return Math.abs(hash);
}

function groupAutoColor(groupName) {
        var palette = groupColorPalette();

        return palette[hashString(groupName) % palette.length];
}

function groupColorPalette() {
        return [
                '#e8f4ef',
                '#eef2ff',
                '#fff4dd',
                '#fceeee',
                '#edf7fb',
                '#f5f0ff',
                '#eef8e7',
                '#f8f1e8',
                '#eaf3f8'
        ];
}

function validGroupColor(color) {
        return /^#[0-9a-f]{6}$/i.test(String(color || ''));
}

function usedGroupColors(exceptGroupName) {
        var used = {};

        safeUciSections('sheepfold', 'group').forEach(function (section) {
                var name = normalizeGroupName(section.name || section['.name']);
                var color = String(section.color || '').toLowerCase();

                if (name === exceptGroupName || !validGroupColor(color))
                        return;

                used[color] = true;
        });

        return used;
}

function nextAvailableGroupColor(groupName, exceptGroupName) {
        var used = usedGroupColors(exceptGroupName);
        var palette = groupColorPalette();
        var fallback = groupAutoColor(groupName);

        for (var i = 0; i < palette.length; i++) {
                if (!used[palette[i].toLowerCase()])
                        return palette[i];
        }

        return fallback;
}

function groupColor(groupName, section) {
        return section && validGroupColor(section.color) ? section.color : nextAvailableGroupColor(groupName, groupName);
}

function groupSectionName(groupName) {
        return 'group_' + hashString(groupName).toString(16);
}

function groupSectionByName(groupName) {
        var normalized = normalizeGroupName(groupName);
        var result = null;

        safeUciSections('sheepfold', 'group').forEach(function (section) {
                if (!result && normalizeGroupName(section.name || section['.name']) === normalized)
                        result = section;
        });

        return result;
}

function ensureGroupSection(groupName, section) {
        if (section && section['.name'])
                return section['.name'];

        return ensureSection('sheepfold', 'group', groupSectionName(groupName));
}

function scheduleDefinitions() {
        return [
                ['school_days', T('School days')],
                ['temporary_access', T('Temporary access')],
                ['bedtime', T('Bedtime')]
        ];
}

function scheduleCheckboxes(selectedSchedules) {
        var selected = {};
        var nodes;

        selectedSchedules.forEach(function (value) {
                selected[value] = true;
        });

        nodes = scheduleDefinitions().map(function (item) {
                var checkbox = E('input', {
                        'type': 'checkbox',
                        'checked': selected[item[0]] ? 'checked' : null,
                        'change': function (ev) {
                                selected[item[0]] = ev.currentTarget.checked;
                        }
                });

                return E('label', { 'class': 'sf-check-field' }, [
                        checkbox,
                        E('span', {}, item[1])
                ]);
        });

        return {
                node: E('div', { 'class': 'sf-schedule-list' }, nodes),
                values: function () {
                        return scheduleDefinitions().filter(function (item) {
                                return selected[item[0]];
                        }).map(function (item) {
                                return item[0];
                        });
                }
        };
}

function schedulesConflict(values) {
        return values.length > 1;
}

function showScheduleConflictDisclaimer(onContinue) {
        var seconds = 10;
        var countdown = E('strong', {}, String(seconds));
        var button = E('button', {
                'class': 'btn cbi-button cbi-button-positive',
                'disabled': 'disabled',
                'click': function () {
                        ui.hideModal();
                        onContinue();
                }
        }, T('I understand the risk, continue'));
        var timer = window.setInterval(function () {
                seconds--;
                countdown.textContent = String(Math.max(0, seconds));

                if (seconds <= 0) {
                        window.clearInterval(timer);
                        button.disabled = false;
                }
        }, 1000);

        ui.showModal(T('Schedule conflict'), [
                E('div', { 'class': 'sf-device-editor' }, [
                        E('div', { 'class': 'sf-note sf-note-warning' }, T('Selected schedules may conflict with each other. Saving is allowed, but review the rules carefully.')),
                        E('p', {}, [
                                T('Confirmation will be available in'),
                                ' ',
                                countdown
                        ])
                ]),
                E('div', { 'class': 'right sf-modal-actions' }, [
                        E('button', {
                                'class': 'btn cbi-button',
                                'click': function () {
                                        window.clearInterval(timer);
                                        ui.hideModal();
                                }
                        }, T('Cancel')),
                        button
                ])
        ]);
}

function showGroupSettingsModal(groupName, section, onSave) {
        var nameField = inputControl(T('Group name'), groupName, section && section.protected === '1' ? { 'readonly': 'readonly' } : {});
        var colorField = inputControl(T('Group color'), groupColor(groupName, section), { 'type': 'color' });
        var currentDeviceIds = devices.filter(function (device) {
                return normalizeGroupName(device.group) === groupName;
        }).map(function (device) {
                return device.id;
        });
        var deviceSelector = createDeviceSelectionBox({
                selectedIds: currentDeviceIds
        });
        var scheduleSelector = scheduleCheckboxes(listOptionValues(section && section.schedules));
        var allowlistOnlyField = checkboxControl(
                T('Allow only selected whitelist sources for this group'),
                section && section.allowlist_only === '1',
                T('Devices in this group will be limited to domains from the selected whitelist sources and manually allowed emergency-useful sites.')
        );
        var activityLogField = checkboxControl(
                T('Enable activity journal for all devices in this group'),
                section && section.activity_log_enabled === '1',
                T('Activity journal is sensitive. It is not collected for administrators, allowlist, or blocklist devices.')
        );
        var conflictNote = E('div', { 'class': 'sf-note sf-note-danger', 'hidden': 'hidden' });

        function showError(message) {
                conflictNote.textContent = message;
                conflictNote.hidden = false;
        }

        function saveGroupSettings() {
                var oldName = groupName;
                var newName = normalizeGroupName(nameField.input.value.trim());
                var color = colorField.input.value;
                var sectionName;
                var selectedDevices;
                var selectedSchedules = scheduleSelector.values();

                conflictNote.hidden = true;
                conflictNote.textContent = '';

                if (!newName) {
                        showError(T('Group name is required.'));
                        return;
                }

                if (newName !== oldName && safeUciSections('sheepfold', 'group').some(function (item) {
                        return normalizeGroupName(item.name || item['.name']) === newName;
                })) {
                        showError(T('This group already exists.'));
                        return;
                }

                if (!validGroupColor(color))
                        color = groupAutoColor(newName);

                selectedDevices = deviceSelector.selectedDevices();
                sectionName = ensureGroupSection(oldName, section);
                uci.set('sheepfold', sectionName, 'name', newName);
                uci.set('sheepfold', sectionName, 'color', color);
                uci.set('sheepfold', sectionName, 'schedules', selectedSchedules);
                uci.set('sheepfold', sectionName, 'allowlist_only', allowlistOnlyField.input.checked ? '1' : '0');
                uci.set('sheepfold', sectionName, 'activity_log_enabled', activityLogField.input.checked ? '1' : '0');
                if (!section)
                        uci.set('sheepfold', sectionName, 'protected', '0');

                safeUciSections('sheepfold', 'device').forEach(function (deviceSection) {
                        var linked = selectedDevices.some(function (device) {
                                return normalizeMac(device.mac) === normalizeMac(deviceSection.mac);
                        });
                        var currentGroup = normalizeGroupName(deviceSection.group);

                        if (currentGroup === oldName || linked) {
                                uci.set('sheepfold', deviceSection['.name'], 'group', linked ? newName : T('Not configured'));

                                if (oldName === noRestrictionsGroupName() && !linked)
                                        markNoRestrictionsAutoExcluded(deviceSection['.name']);
                        }
                });

                selectedDevices.forEach(function (device) {
                        var sectionDeviceName = ensureSheepfoldDeviceSection(device);

                        uci.set('sheepfold', sectionDeviceName, 'mac', normalizeMac(device.mac));
                        uci.set('sheepfold', sectionDeviceName, 'name', device.name || device.mac);
                        uci.set('sheepfold', sectionDeviceName, 'ip', device.ip || '');
                        uci.set('sheepfold', sectionDeviceName, 'group', newName);
                        if (oldName === noRestrictionsGroupName() && newName !== noRestrictionsGroupName())
                                markNoRestrictionsAutoExcluded(sectionDeviceName);
                });

                saveUciChanges(['sheepfold']).then(function () {
                        notify(T('Group saved.'), 'info');
                        if (onSave)
                                onSave();
                        ui.hideModal();
                        window.setTimeout(function () {
                                window.location.reload();
                        }, 700);
                }, function () {
                        notify(T('Could not save group.'), 'warning');
                });
        }

        ui.showModal(T('Group settings'), [
                E('div', { 'class': 'sf-device-editor' }, [
                        conflictNote,
                        E('div', { 'class': 'sf-grid two' }, [
                                nameField.node,
                                colorField.node
                        ]),
                        E('strong', {}, T('Group schedules')),
                        scheduleSelector.node,
                        allowlistOnlyField.node,
                        activityLogField.node,
                        E('strong', {}, T('Assigned devices')),
                        deviceSelector.node
                ]),
                E('div', { 'class': 'right sf-modal-actions' }, [
                        E('button', {
                                'class': 'btn cbi-button',
                                'click': ui.hideModal
                        }, T('Cancel')),
                        E('button', {
                                'class': 'btn cbi-button cbi-button-positive',
                                'click': function () {
                                        if (schedulesConflict(scheduleSelector.values())) {
                                                showScheduleConflictDisclaimer(saveGroupSettings);
                                                return;
                                        }

                                        saveGroupSettings();
                                }
                        }, T('Save'))
                ])
        ]);
}

function showAddGroupModal(existingNames) {
        var nameField = inputControl(T('Group name'), '');
        var colorField = inputControl(T('Group color'), nextAvailableGroupColor(T('Custom')), { 'type': 'color' }, T('Automatic color'));
        var conflictNote = E('div', { 'class': 'sf-note sf-note-danger', 'hidden': 'hidden' });

        function showError(message) {
                conflictNote.textContent = message;
                conflictNote.hidden = false;
        }

        ui.showModal(T('Add group'), [
                E('div', { 'class': 'sf-device-editor' }, [
                        conflictNote,
                        E('div', { 'class': 'sf-grid two' }, [
                                nameField.node,
                                colorField.node
                        ])
                ]),
                E('div', { 'class': 'right sf-modal-actions' }, [
                        E('button', {
                                'class': 'btn cbi-button',
                                'click': ui.hideModal
                        }, T('Cancel')),
                        E('button', {
                                'class': 'btn cbi-button cbi-button-positive',
                                'click': function () {
                                        var groupName = normalizeGroupName(nameField.input.value.trim());
                                        var color = colorField.input.value;
                                        var sectionName;

                                        conflictNote.hidden = true;
                                        conflictNote.textContent = '';

                                        if (!groupName) {
                                                showError(T('Group name is required.'));
                                                return;
                                        }

                                        if (existingNames[groupName]) {
                                                showError(T('This group already exists.'));
                                                return;
                                        }

                                        if (!validGroupColor(color))
                                                color = nextAvailableGroupColor(groupName);

                                        sectionName = ensureGroupSection(groupName, null);
                                        uci.set('sheepfold', sectionName, 'name', groupName);
                                        uci.set('sheepfold', sectionName, 'color', color);
                                        uci.set('sheepfold', sectionName, 'protected', '0');
                                        uci.set('sheepfold', sectionName, 'auto_assignable', '0');
                                        uci.set('sheepfold', sectionName, 'allowlist_only', '0');
                                        uci.set('sheepfold', sectionName, 'activity_log_enabled', '0');

                                        saveUciChanges(['sheepfold']).then(function () {
                                                notify(T('Group created.'), 'info');
                                                ui.hideModal();
                                                window.setTimeout(function () {
                                                        window.location.reload();
                                                }, 700);
                                        }, function () {
                                                notify(T('Could not create group.'), 'warning');
                                        });
                                }
                        }, T('Save'))
                ])
        ]);
}

function nextAdminId() {
        var next = admins.reduce(function (max, admin) {
                return Math.max(max, idNumber(admin.id));
        }, 0) + 1;

        return 'A-' + String(next).padStart(4, '0');
}

function adminLoginExists(login) {
        var normalized = String(login || '').trim().toLowerCase();

        return admins.some(function (admin) {
                return String(admin.login || '').trim().toLowerCase() === normalized;
        });
}

function adminTableRow(admin) {
        var devicesCell = E('div', {}, adminDeviceList(admin));

        return E('div', {
                'class': 'sf-admin-row',
                'data-admin-login': admin.login || '',
                'data-sort-name': admin.name || '',
                'data-sort-login': admin.login || ''
        }, [
                E('div', {}, [
                        E('strong', {}, admin.name)
                ]),
                E('div', { 'class': 'sf-mono' }, admin.login),
                devicesCell,
                E('div', { 'class': 'sf-row-actions' }, [
                        iconButton(T('Configure'), 'gear', 'neutral', function () {
                                showAdminSettingsModal(admin);
                        }),
                        iconButton(T('Bind devices'), 'link', 'neutral', function () {
                                showAdminDeviceBindingModal(admin, function () {
                                        devicesCell.replaceChildren(adminDeviceList(admin));
                                });
                        })
                ])
        ]);
}

function showAddAdministratorModal(onAdd) {
        var nameField = inputControl(T('Admin name'), '');
        var loginField = inputControl(T('Login'), '');
        var conflictNote = E('div', { 'class': 'sf-note sf-note-danger', 'hidden': 'hidden' });
        var assignedToAnyAdmin = adminAssignedDeviceIds(null);
        var selector = createDeviceSelectionBox({
                filter: function (device) {
                        return adminDeviceCanBeBound(device) && !assignedToAnyAdmin[device.id];
                }
        });

        function showError(message) {
                conflictNote.textContent = message;
                conflictNote.hidden = false;
        }

        ui.showModal(T('Add administrator'), [
                E('div', { 'class': 'sf-device-editor' }, [
                        conflictNote,
                        E('div', { 'class': 'sf-grid two' }, [
                                nameField.node,
                                loginField.node
                        ]),
                        E('strong', {}, T('Assigned devices')),
                        selector.node
                ]),
                E('div', { 'class': 'right sf-modal-actions' }, [
                        E('button', {
                                'class': 'btn cbi-button',
                                'click': ui.hideModal
                        }, T('Cancel')),
                        E('button', {
                                'class': 'btn cbi-button cbi-button-positive',
                                'click': function () {
                                        var name = nameField.input.value.trim();
                                        var login = loginField.input.value.trim();
                                        var admin;

                                        conflictNote.hidden = true;
                                        conflictNote.textContent = '';

                                        if (!name || !login) {
                                                showError(T('Name and login are required.'));
                                                return;
                                        }

                                        if (adminLoginExists(login)) {
                                                showError(T('This login is already used.'));
                                                return;
                                        }

                                        admin = {
                                                id: nextAdminId(),
                                                name: name,
                                                login: login,
                                                deviceIds: selector.selectedIds(),
                                                temporaryPassword: generatePairingCode()
                                        };

                                        admins.push(admin);
                                        applyAdminDeviceBindings(admin, selector.selectedDevices(), []).then(function () {
                                                if (onAdd)
                                                        onAdd(admin);
                                                notify(T('Administrator added.'), 'info');
                                                ui.hideModal();
                                                window.setTimeout(function () {
                                                        window.location.reload();
                                                }, 700);
                                        }, function (error) {
                                                notify(error && error.message ? error.message : T('Could not save device settings.'), 'warning');
                                        });
                                }
                        }, T('Save'))
                ])
        ]);
}

function showAdminDeviceBindingModal(admin, onSave) {
        var assignedToOtherAdmin = adminAssignedDeviceIds(admin);
        var selector = createDeviceSelectionBox({
                selectedIds: admin.deviceIds || [],
                filter: function (device) {
                        return adminDeviceCanBeBound(device) && !assignedToOtherAdmin[device.id];
                }
        });
        var actionRow;

        function saveBindings() {
                var previousIds = admin.deviceIds || [];
                var selectedDevices = selector.selectedDevices();

                admin.deviceIds = selector.selectedIds();
                applyAdminDeviceBindings(admin, selectedDevices, previousIds).then(function () {
                        if (onSave)
                                onSave();
                        ui.hideModal();
                        notify(T('Device bindings saved.'), 'info');
                        window.setTimeout(function () {
                                window.location.reload();
                        }, 700);
                }, function (error) {
                        admin.deviceIds = previousIds;
                        notify(error && error.message ? error.message : T('Could not save device settings.'), 'warning');
                });
        }

        function modalActions() {
                return E('div', { 'class': 'sf-modal-actions right' }, [
                        E('button', {
                                'class': 'btn cbi-button',
                                'click': ui.hideModal
                        }, T('Cancel')),
                        E('button', {
                                'class': 'btn cbi-button cbi-button-positive',
                                'click': saveBindings
                        }, T('Save'))
                ]);
        }

        actionRow = modalActions();

        ui.showModal(T('Assign devices to administrator') + ' ' + admin.name, [
                E('div', { 'class': 'sf-binding-modal' }, [
                        E('div', { 'class': 'sf-section-intro' }, [
                                E('p', {}, T('Select administrator devices') + ' ' + admin.name + '. ' + T('Selected administrator devices can manage Sheepfold.')),
                                E('p', {}, T('Blocklisted devices are not available for binding.')),
                                E('p', {}, T('When a device is assigned to an administrator, Sheepfold removes it from ordinary groups and schedules, disables activity logging for it, and adds it to the allowlist.'))
                        ]),
                        actionRow,
                        selector.node
                ]),
                modalActions()
        ]);
}

function showDeviceSettingsModal(device) {
        var knownGroups = [
                [T('Not configured'), T('Not configured')],
                [T('Parents'), T('Parents')],
                [T('Child number 1'), T('Child number 1')],
                [T('Children'), T('Children')],
                [T('TV / media'), T('TV / media')],
                [T('Guests'), T('Guests')],
                [T('No restrictions'), T('No restrictions')]
        ];
        var knownGroupValues = knownGroups.map(function (item) { return item[0]; });
        var groupIsCustom = device.group && knownGroupValues.indexOf(device.group) === -1;
        var nameField = inputControl(T('Device name'), device.name);
        var ipField = inputControl(T('IP address'), device.ip);
        var groupField = selectControl(T('Group'), groupIsCustom ? '__custom' : device.group, knownGroups.concat([
                ['__custom', T('Custom')]
        ]));
        var customGroupField = inputControl(T('Use custom group'), groupIsCustom ? device.group : '');
        var typeField = deviceTypeSelectControl(T('Device type'), displayDeviceType(device));
        var statusField = selectControl(T('Access mode'), device.status, [
                ['new', T('Not configured')],
                ['allow', T('Allowlist')],
                ['blocked', T('Blocklist')],
                ['scheduled', T('Scheduled')],
                ['restricted', T('Restricted')]
        ]);
        var staticLeaseField = checkboxControl(
                device.staticLease ? T('Permanent DHCP lease') : T('Create permanent DHCP lease'),
                device.staticLease,
                device.staticLease ? T('Existing permanent DHCP lease will be updated, not removed.') : '',
                device.staticLease ? { 'disabled': 'disabled' } : null
        );
        var activityLogField = checkboxControl(
                T('Enable activity journal for this device'),
                device.activityLogEnabled,
                T('Activity journal is sensitive. It is not collected for administrators, allowlist, or blocklist devices.')
        );
        var conflictNote = E('div', { 'class': 'sf-note sf-note-danger', 'hidden': 'hidden' });
        var infoLines = E('div', { 'class': 'sf-device-info-lines' }, [
                settingLine(T('ID'), formattedDeviceDisplayId(device)),
                settingLine(T('MAC address'), device.mac),
                settingLine(T('Hostname'), device.hostname || '-'),
                settingLine(T('Detection source'), device.sourceLabel || '-')
        ]);

        function updateCustomGroupVisibility() {
                customGroupField.node.hidden = groupField.input.value === '__custom' ? null : 'hidden';
        }

        groupField.input.addEventListener('change', updateCustomGroupVisibility);
        updateCustomGroupVisibility();

        ui.showModal(T('Device settings'), [
                E('div', { 'class': 'sf-device-editor' }, [
                        infoLines,
                        conflictNote,
                        E('div', { 'class': 'sf-grid two' }, [
                                nameField.node,
                                ipField.node,
                                typeField.node,
                                groupField.node,
                                customGroupField.node,
                                statusField.node,
                                staticLeaseField.node,
                                activityLogField.node
                        ])
                ]),
                E('div', { 'class': 'right sf-modal-actions' }, [
                        E('button', {
                                'class': 'btn cbi-button',
                                'click': ui.hideModal
                        }, T('Cancel')),
                        E('button', {
                                'class': 'btn cbi-button cbi-button-positive',
                                'click': function () {
                                        var sectionName;
                                        var staticSectionName;
                                        var name = nameField.input.value.trim() || device.name;
                                        var ip = ipField.input.value.trim();
                                        var group = groupField.input.value === '__custom' ?
                                                customGroupField.input.value.trim() :
                                                groupField.input.value;
                                        var oldGroup = normalizeGroupName(device.group);
                                        var newGroup = normalizeGroupName(group || T('Not configured'));
                                        var deviceType = typeField.input.value;
                                        var status = statusField.input.value;
                                        var configs = ['sheepfold'];

                                        conflictNote.hidden = true;
                                        conflictNote.textContent = '';

                                        if (status === 'allow' && macInSheepfoldList('blocklist', device.mac)) {
                                                conflictNote.textContent = T('This device is already in the blocklist. Remove it from the blocklist before adding it to the allowlist.');
                                                conflictNote.hidden = false;
                                                return;
                                        }

                                        if (status === 'blocked' && macInSheepfoldList('allowlist', device.mac)) {
                                                conflictNote.textContent = T('This device is already in the allowlist. Remove it from the allowlist before adding it to the blocklist.');
                                                conflictNote.hidden = false;
                                                return;
                                        }

                                        if (staticLeaseField.input.checked && !ip) {
                                                notify(T('Static lease requires an IP address.'), 'warning');
                                                return;
                                        }

                                        sectionName = ensureSheepfoldDeviceSection(device);
                                        uci.set('sheepfold', sectionName, 'mac', device.mac);
                                        uci.set('sheepfold', sectionName, 'name', name);
                                        uci.set('sheepfold', sectionName, 'ip', ip);
                                        uci.set('sheepfold', sectionName, 'group', newGroup);
                                        uci.set('sheepfold', sectionName, 'device_type', deviceType);
                                        uci.set('sheepfold', sectionName, 'manual_device_type', deviceType === 'unknown' ? '0' : '1');
                                        uci.set('sheepfold', sectionName, 'status', status);
                                        uci.set('sheepfold', sectionName, 'activity_log_enabled', activityLogField.input.checked ? '1' : '0');

                                        if (oldGroup === noRestrictionsGroupName() && newGroup !== noRestrictionsGroupName())
                                                markNoRestrictionsAutoExcluded(sectionName);

                                        if (status === 'allow')
                                                updateMacList('allowlist', device.mac, true);
                                        else if (status !== 'blocked')
                                                updateMacList('allowlist', device.mac, false);

                                        if (status === 'blocked')
                                                updateMacList('blocklist', device.mac, true);
                                        else if (status !== 'allow')
                                                updateMacList('blocklist', device.mac, false);

                                        if (staticLeaseField.input.checked) {
                                                staticSectionName = ensureStaticDhcpSection(device);
                                                uci.set('dhcp', staticSectionName, 'mac', device.mac);
                                                uci.set('dhcp', staticSectionName, 'ip', ip);
                                                uci.set('dhcp', staticSectionName, 'name', name);
                                                configs.push('dhcp');
                                        }

                                        saveUciChanges(configs.filter(function (config, index) {
                                                return configs.indexOf(config) === index;
                                        })).then(function () {
                                                notify(T('Device settings saved.'), 'info');
                                                ui.hideModal();
                                                window.setTimeout(function () {
                                                        window.location.reload();
                                                }, 700);
                                        }, function () {
                                                notify(T('Could not save device settings.'), 'warning');
                                        });
                                }
                        }, T('Save'))
                ])
        ]);
}

function deviceTable(rows, options) {
        options = options || {};

        var tableRows = rows.map(function (device, index) {
                var adminDevice = isAdminDevice(device);
                var displayType = displayDeviceType(device);
                var type = deviceTypeByValue(displayType);

                return E('div', {
                        'class': 'sf-device-row',
                        'data-sort-id': String(index + 1),
                        'data-sort-device': device.name || '',
                        'data-sort-type': type.label || '',
                        'data-sort-ip': String(ipSortValue(device.ip)),
                        'data-sort-group': device.group || '',
                        'data-sort-status': device.status || '',
                        'data-search': [device.id, device.mac, device.hostname, device.note, type.label].join(' ')
                }, [
                        E('div', { 'class': 'sf-device-index' }, formattedDeviceDisplayId(device)),
                        E('div', { 'class': 'sf-device-name' }, [
                                         E('strong', {}, [
                                                 adminDevice ? adminCrownIcon() : '',
                                                 E('span', {}, device.name)
                                          ]),
                                         E('small', {}, device.note)
                          ]),
                        E('div', { 'class': 'sf-device-type-cell' }, deviceTypeIcon(displayType)),
                        E('div', { 'class': 'sf-ip-cell' }, [
                                E('span', {}, device.ip || '-'),
                                device.staticLease ? staticLeaseIcon() : ''
                        ]),
                        E('div', { 'class': 'sf-mono' }, device.mac),
                        E('div', {}, device.group),
                        E('div', { 'class': 'sf-status-stack' }, [
                                badge(device.status),
                                device.activityLogEnabled ? badge('journal') : ''
                        ]),
                        E('div', { 'class': 'sf-row-actions' }, [
                                iconButton(T('Configure'), 'gear', 'neutral', function () {
                                        showDeviceSettingsModal(device);
                                }),
                                options.removeFromList ?
                                        iconButton(
                                                options.removeFromList === 'allowlist' ? T('Remove from allowlist') : T('Remove from blocklist'),
                                                'trash',
                                                'danger',
                                                function () {
                                                        removeDeviceFromAccessList(device, options.removeFromList);
                                                }
                                        ) :
                                        '',
                                options.compact || adminDevice || device.status === 'allow' || device.status === 'blocked' ?
                                        '' :
                                        actionButton(T('+30 min'), 'positive', T('Temporary access would require confirmation.'))
                        ])
                ]);
        });

        return E('div', { 'class': 'sf-device-table' }, [
                E('div', { 'class': 'sf-device-row sf-device-head' }, [
                        E('div', {}, deviceSortHeader(T('ID'), 'id')),
                        E('div', {}, deviceSortHeader(T('Device'), 'device')),
                        E('div', {}, deviceSortHeader(T('Type'), 'type')),
                        E('div', {}, deviceSortHeader(T('IP address'), 'ip')),
                        E('div', {}, T('MAC address')),
                        E('div', {}, deviceSortHeader(T('Group'), 'group')),
                        E('div', {}, deviceSortHeader(T('Status'), 'status')),
                        E('div', {}, T('Actions'))
                ])
        ].concat(tableRows));
}

function field(label, value, hint) {
        return E('label', { 'class': 'sf-field' }, [
                E('span', {}, label),
                E('input', { 'class': 'cbi-input-text', 'value': value || '' }),
                hint ? E('small', {}, hint) : ''
        ]);
}

function selectField(label, value, values, hint) {
        return E('label', { 'class': 'sf-field' }, [
                E('span', {}, label),
                E('select', { 'class': 'cbi-input-select' }, values.map(function (item) {
                        return E('option', { 'value': item[0], 'selected': item[0] === value ? 'selected' : null }, item[1]);
                })),
                hint ? E('small', {}, hint) : ''
        ]);
}

function textareaField(label, value, hint) {
        return E('label', { 'class': 'sf-field sf-field-wide' }, [
                E('span', {}, label),
                E('textarea', { 'class': 'cbi-input-textarea', 'rows': 4 }, value || ''),
                hint ? E('small', {}, hint) : ''
        ]);
}

function globalTextareaOptionField(label, option, defaultValue, savedMessage, errorMessage, hint, rows) {
        var textareaRows = rows || 5;
        var textarea = E('textarea', {
                'class': 'cbi-input-textarea' + (textareaRows <= 2 ? ' sf-textarea-compact' : ''),
                'rows': textareaRows
        }, settingValue(option, defaultValue || ''));

        textarea.addEventListener('input', function () {
                setSettingsDraftOption(option, textarea.value.trim());
        });
        textarea.addEventListener('keydown', function (ev) {
                if (ev.key === 'Enter' && (ev.ctrlKey || ev.metaKey)) {
                        ev.preventDefault();
                        setSettingsDraftOption(option, textarea.value.trim());
                }
        });

        return E('label', { 'class': 'sf-field sf-field-wide' }, [
                E('span', {}, label),
                textarea,
                hint ? E('small', {}, hint) : ''
        ]);
}

function cachePathField() {
        var currentValue = settingValue('log_cache_path', defaultLogCachePath) || defaultLogCachePath;
        var values = [
                [defaultLogCachePath, defaultLogCachePath],
                ['/tmp/sheepfold/sheepfold.log', '/tmp/sheepfold/sheepfold.log'],
                ['/tmp/sheepfold/log/events.log', '/tmp/sheepfold/log/events.log']
        ];
        var select;

        if (!values.some(function (item) { return item[0] === currentValue; }))
                values.unshift([currentValue, currentValue]);

        select = E('select', {
                'class': 'cbi-input-select',
                'change': function (ev) {
                        setSettingsDraftOption('log_cache_path', ev.currentTarget.value);
                }
        }, values.map(function (item) {
                return E('option', { 'value': item[0], 'selected': item[0] === currentValue ? 'selected' : null }, item[1]);
        }));

        return E('label', { 'class': 'sf-field sf-field-wide' }, [
                E('span', {}, T('Cache file path')),
                select,
                E('small', {}, T('The cache file should be stored under /tmp/ so it does not wear router flash memory.'))
        ]);
}

function blocklistEmergencyAccessField() {
        var value = settingValue('domain_allowlist_for_blocklist', '1') === '1' ? '1' : '0';
        var select = E('select', {
                'class': 'cbi-input-select',
                'change': function (ev) {
                        setSettingsDraftOption('domain_allowlist_for_blocklist', ev.currentTarget.value);
                }
        }, [
                E('option', { 'value': '1', 'selected': value === '1' ? 'selected' : null }, T('Yes')),
                E('option', { 'value': '0', 'selected': value === '0' ? 'selected' : null }, T('No'))
        ]);

        return E('label', { 'class': 'sf-field sf-field-wide' }, [
                E('span', {}, T('Blocklist emergency-useful sites access')),
                select,
                E('small', {}, T('Allows blocklisted devices to access only sites added to the emergency-useful sites list. Router access remains blocked.'))
        ]);
}

function siteBlacklistModeField() {
        return saveSelectGlobalField(T('Site blacklist'), 'site_blocklist_mode', 'except_allowlist_admins', [
                ['disabled', T('Disabled')],
                ['all', T('Enabled for everyone')],
                ['except_allowlist_admins', T('Enabled for everyone except allowlist and administrators')]
        ], T('Site blacklist mode saved.'), T('Could not save site blacklist mode.'));
}

function siteListsUpdateIntervalField() {
        return saveSelectGlobalField(T('Site list update'), 'site_lists_update_interval', 'weekly', [
                ['daily', T('Every day')],
                ['3days', T('Every 3 days')],
                ['weekly', T('Once a week')]
        ], T('Site list update interval saved.'), T('Could not save site list update interval.'), null, function () {
                return routerControl(['site-lists-cron-apply']);
        });
}

function autoConfigureDevicesField() {
        var value = settingValue('detection_mode', 'full') === 'reduced' ? 'reduced' : 'full';
        var select = E('select', {
                'class': 'cbi-input-select',
                'change': function (ev) {
                        var nextValue = ev.currentTarget.value;
                        var mode = nextValue === 'full' ? 'full' : 'reduced';

                        setSettingsDraftOptions({
                                auto_configure: '1',
                                detection_mode: mode,
                                no_restrictions_auto_assign: '1'
                        });
                }
        }, [
                E('option', { 'value': 'full', 'selected': value === 'full' ? 'selected' : null }, T('Full automatic setup')),
                E('option', { 'value': 'reduced', 'selected': value === 'reduced' ? 'selected' : null }, T('Reduced automatic setup'))
        ]);

        return E('label', { 'class': 'sf-field sf-field-wide' }, [
                E('span', {}, T('New device automatic setup')),
                select,
                E('small', {}, T('Full mode can use port checks when available. Reduced mode avoids heavy checks but still can automatically add confidently detected home infrastructure devices to No restrictions.'))
        ]);
}

function updateCheckInstallField() {
        var value = settingValue('update_check_install_mode', 'weekly');
        var select = E('select', {
                'class': 'cbi-input-select',
                'change': function (ev) {
                        setSettingsDraftOption('update_check_install_mode', ev.currentTarget.value);
                }
        }, [
                E('option', { 'value': 'daily', 'selected': value === 'daily' ? 'selected' : null }, T('Every day')),
                E('option', { 'value': 'weekly', 'selected': value === 'weekly' ? 'selected' : null }, T('Every week')),
                E('option', { 'value': 'monthly', 'selected': value === 'monthly' ? 'selected' : null }, T('Every month')),
                E('option', { 'value': 'never', 'selected': value === 'never' ? 'selected' : null }, T('Never'))
        ]);

        return E('label', { 'class': 'sf-field sf-field-wide' }, [
                E('span', {}, T('Update check and installation')),
                select,
                E('small', {}, T('Defines how often Sheepfold should check for and install updates after confirmation.'))
        ]);
}

function saveGlobalOptions(options) {
        Object.keys(options).forEach(function (option) {
                uci.set('sheepfold', 'global', option, options[option]);
        });

        return saveUciChanges(['sheepfold']);
}

function confirmWifiAutoDisable(timeValue) {
        return new Promise(function (resolve) {
                var remaining = 10;
                var countdown = E('strong', {}, String(remaining));
                var confirmButton;
                var timer;
                var resolved = false;

                function done(confirmed) {
                        if (resolved)
                                return;

                        resolved = true;
                        if (timer)
                                window.clearInterval(timer);
                        ui.hideModal();
                        resolve(confirmed);
                }

                confirmButton = E('button', {
                        'class': 'btn cbi-button cbi-button-positive',
                        'disabled': 'disabled',
                        'click': function (ev) {
                                ev.preventDefault();
                                done(true);
                        }
                }, T('I understand the risk, continue') + ' (' + remaining + ')');

                timer = window.setInterval(function () {
                        remaining -= 1;
                        countdown.textContent = String(Math.max(remaining, 0));
                        confirmButton.textContent = remaining > 0 ?
                                T('I understand the risk, continue') + ' (' + remaining + ')' :
                                T('I understand the risk, continue');

                        if (remaining <= 0) {
                                confirmButton.disabled = false;
                                window.clearInterval(timer);
                        }
                }, 1000);

                ui.showModal(T('Wi-Fi auto-disable warning'), [
                        E('div', { 'class': 'sf-warning-modal' }, [
                                E('p', {}, T('When Wi-Fi turns off, you will not be able to turn it back on from a phone connected only by Wi-Fi. Configure messenger control or a WPS button action so you can enable Wi-Fi outside the schedule if needed.')),
                                E('p', {}, [
                                        E('strong', {}, T('Auto-disable time') + ': '),
                                        E('span', {}, timeValue)
                                ]),
                                E('p', {}, [
                                        E('span', {}, T('Confirmation will be available in') + ' '),
                                        countdown,
                                        E('span', {}, ' ' + T('seconds'))
                                ])
                        ]),
                        E('div', { 'class': 'right sf-modal-actions' }, [
                                E('button', {
                                        'class': 'btn cbi-button',
                                        'click': function (ev) {
                                                ev.preventDefault();
                                                done(false);
                                        }
                                }, T('Cancel')),
                                confirmButton
                        ])
                ]);
        });
}

function timeAutomationField(label, modeOption, timeOption, defaultTime) {
        var currentMode = settingValue(modeOption, 'never');
        var currentTime = settingValue(timeOption, defaultTime);
        var modeName = 'sf-' + modeOption;
        var neverRadio = E('input', {
                'type': 'radio',
                'name': modeName,
                'value': 'never',
                'checked': currentMode !== 'time' ? 'checked' : null
        });
        var timeRadio = E('input', {
                'type': 'radio',
                'name': modeName,
                'value': 'time',
                'checked': currentMode === 'time' ? 'checked' : null
        });
        var timeInput = E('input', {
                'class': 'cbi-input-text sf-time-input',
                'type': 'time',
                'value': currentTime || defaultTime
        });

        function selectedMode() {
                return timeRadio.checked ? 'time' : 'never';
        }

        function updateDraft() {
                var nextMode = selectedMode();
                var nextTime = timeInput.value || defaultTime;

                setSettingsDraftOptions((function () {
                        var options = {};
                        options[modeOption] = nextMode;
                        options[timeOption] = nextTime;
                        return options;
                })());
        }

        neverRadio.addEventListener('change', updateDraft);
        timeRadio.addEventListener('change', updateDraft);
        timeInput.addEventListener('focus', function () {
                timeRadio.checked = true;
                updateDraft();
        });
        timeInput.addEventListener('input', updateDraft);
        timeInput.addEventListener('keydown', function (ev) {
                if (ev.key === 'Enter') {
                        ev.preventDefault();
                        timeRadio.checked = true;
                        updateDraft();
                }
        });

        return E('div', { 'class': 'sf-field sf-field-wide sf-radio-time-field' }, [
                E('span', {}, label),
                E('label', { 'class': 'sf-inline-option' }, [
                        neverRadio,
                        E('span', {}, T('Never'))
                ]),
                E('label', { 'class': 'sf-inline-option' }, [
                        timeRadio,
                        E('span', {}, T('At time')),
                        timeInput
                ]),
                E('small', {}, T('Applies to all Wi-Fi radios on the router. Real switching must require confirmation and be performed by the router backend.'))
        ]);
}

function saveSelectGlobalField(label, option, value, values, successMessage, errorMessage, hint, afterSave) {
        var currentValue = settingValue(option, value);
        var select = E('select', {
                'class': 'cbi-input-select',
                'change': function (ev) {
                        setSettingsDraftOption(option, ev.currentTarget.value);
                }
        }, values.map(function (item) {
                return E('option', { 'value': item[0], 'selected': item[0] === currentValue ? 'selected' : null }, item[1]);
        }));

        return E('label', { 'class': 'sf-field sf-field-wide' }, [
                E('span', {}, label),
                select,
                hint ? E('small', {}, hint) : ''
        ]);
}

function globalInputOptionField(label, option, defaultValue, placeholder, hint, secret) {
        var input = E('input', {
                'class': 'cbi-input-text' + (secret ? ' sf-secret-input' : ''),
                'type': secret ? 'password' : 'text',
                'value': settingValue(option, defaultValue || ''),
                'placeholder': placeholder || ''
        });
        var fieldControl = input;

        input.addEventListener('input', function () {
                setSettingsDraftOption(option, input.value.trim());
        });
        input.addEventListener('keydown', function (ev) {
                if (ev.key === 'Enter') {
                        ev.preventDefault();
                        setSettingsDraftOption(option, input.value.trim());
                }
        });

        if (secret) {
                fieldControl = E('span', { 'class': 'sf-secret-row' }, [
                        input,
                        E('button', {
                                'class': 'sf-icon-action sf-secret-toggle',
                                'type': 'button',
                                'title': T('Show secret'),
                                'aria-label': T('Show secret'),
                                'click': function (ev) {
                                        var visible;

                                        ev.preventDefault();
                                        visible = input.type === 'password';
                                        input.type = visible ? 'text' : 'password';
                                        ev.currentTarget.setAttribute('title', visible ? T('Hide secret') : T('Show secret'));
                                        ev.currentTarget.setAttribute('aria-label', visible ? T('Hide secret') : T('Show secret'));
                                }
                        }, iconSvg('eye'))
                ]);
        }

        return E('label', { 'class': 'sf-field sf-field-wide' }, [
                E('span', {}, label),
                fieldControl,
                hint ? E('small', {}, hint) : ''
        ]);
}

function messengerField(label, option, placeholder, hint, secret) {
        var input = E('input', {
                'class': 'cbi-input-text' + (secret ? ' sf-secret-input' : ''),
                'type': secret ? 'password' : 'text',
                'value': safeUciGet('sheepfold', 'global', option, ''),
                'placeholder': placeholder || ''
        });

        input.addEventListener('keydown', function (ev) {
                if (ev.key === 'Enter') {
                        ev.preventDefault();
                }
        });

        var fieldControl = input;

        if (secret) {
                fieldControl = E('span', { 'class': 'sf-secret-row' }, [
                        input,
                        E('button', {
                                'class': 'sf-icon-action sf-secret-toggle',
                                'type': 'button',
                                'title': T('Show secret'),
                                'aria-label': T('Show secret'),
                                'click': function (ev) {
                                        var visible;

                                        ev.preventDefault();
                                        visible = input.type === 'password';
                                        input.type = visible ? 'text' : 'password';
                                        ev.currentTarget.setAttribute('title', visible ? T('Hide secret') : T('Show secret'));
                                        ev.currentTarget.setAttribute('aria-label', visible ? T('Hide secret') : T('Show secret'));
                                }
                        }, iconSvg('eye'))
                ]);
        }

        var node = E('label', { 'class': 'sf-field sf-field-wide' }, [
                E('span', {}, label),
                fieldControl,
                hint ? E('small', {}, hint) : ''
        ]);

        node.sfInput = input;
        node.sfOption = option;

        return node;
}

function messengerCommandRows() {
        return [
                ['/start', 'старт', T('Shows available commands.')],
                ['/help', 'помощь, help', T('Shows available commands.')],
                ['/status', 'статус', T('Shows Sheepfold and router status.')],
                ['/devices', 'показать все устройства, устройства', T('Shows all detected devices with Sheepfold IDs.')],
                ['/internet_on', 'включить интернет, интернет включён', T('Turns global blocking off.')],
                ['/internet_off', 'отключить интернет, выключить интернет, интернет отключен', T('Turns on global blocking for everyone except the allowlist.')],
                ['/wifi_status', 'статус Wi-Fi, статус вайфай', T('Shows whether Wi-Fi is enabled.')],
                ['/wifi_on', 'включить Wi-Fi, включить вайфай', T('Turns router Wi-Fi on.')],
                ['/wifi_off', 'отключить Wi-Fi, выключить вайфай', T('Turns router Wi-Fi off; use carefully.')],
                ['/support', 'саппорт, поддержка', T('Shows what to prepare before asking for support.')],
                ['/grant_time #3 30', 'дать #3 30 минут, +30 #3', T('Grants temporary access to the selected device.')],
                ['/block_device #3', 'заблокировать #3', T('Blocks the selected device.')],
                ['/unblock_device #3', 'разблокировать #3', T('Removes blocking from the selected device.')],
                ['/allowlist_add #3', 'добавить #3 в белый список', T('Adds the selected device to the allowlist.')],
                ['/blocklist_add #3', 'добавить #3 в чёрный список', T('Adds the selected device to the blocklist.')],
                ['/logs', 'журнал, показать журнал', T('Shows recent administrative log entries.')],
                ['/clear_logs', 'очистить журнал', T('Clears the administrative log after confirmation.')],
                ['/update', 'обновить приложение', T('Checks and installs an update after confirmation.')],
                ['/reboot', 'перезагрузить роутер', T('Reboots the router after confirmation.')],
                ['/emergency_sites', 'аварийно-полезные сайты', T('Shows configured emergency-useful sites.')]
        ];
}

function renderMessengerCommandList() {
        return E('div', { 'class': 'sf-command-list sf-command-list-wide' }, messengerCommandRows().map(function (command) {
                return E('div', { 'class': 'sf-command-item' }, [
                        E('code', {}, command[0]),
                        E('span', { 'class': 'sf-command-aliases' }, command[1]),
                        E('span', { 'class': 'sf-command-description' }, command[2])
                ]);
        }));
}

function appPortField() {
        var currentValue = settingValue('app_port', '5201');
        var input = E('input', {
                'class': 'cbi-input-text',
                'type': 'number',
                'min': '1',
                'max': '65535',
                'value': currentValue
        });

        input.addEventListener('input', function () {
                setSettingsDraftOption('app_port', String(input.value || '').trim());
        });
        input.addEventListener('keydown', function (ev) {
                if (ev.key === 'Enter') {
                        ev.preventDefault();
                        setSettingsDraftOption('app_port', String(input.value || '').trim());
                }
        });

        return E('label', { 'class': 'sf-field sf-field-wide' }, [
                E('span', {}, T('Port')),
                input,
                E('small', {}, T('Used by Android app and pairing QR codes.'))
        ]);
}

function messengerSettingsBox() {
        var activeValue = safeUciGet('sheepfold', 'global', 'active_messenger', 'none');
        var vkToken = messengerField(T('VK community access token'), 'vk_access_token', '', T('Stored on the router.'), true);
        var vkCommunity = messengerField(T('VK community ID'), 'vk_community_id', 'club123456789', '', false);
        var vkAdmin = messengerField(T('VK admin user ID'), 'vk_admin_user_id', '123456789', T('Sheepfold accepts messenger commands only from the administrator ID entered here. Other users are ignored.'), false);
        var telegramToken = messengerField(T('Telegram bot token'), 'telegram_bot_token', '123456:ABC...', T('Stored on the router.'), true);
        var telegramAdmin = messengerField(T('Telegram admin chat ID'), 'telegram_admin_chat_id', '123456789', T('Sheepfold accepts messenger commands only from the administrator ID entered here. Other users are ignored.'), false);
        var fields = [vkToken, vkCommunity, vkAdmin, telegramToken, telegramAdmin];
        var select;
        var initialMessengerOptions;
        var statusText = E('span', {}, activeValue === 'none' ? T('Messenger disabled.') : T('Messenger status will be checked after saving settings or sending a test message.'));
        var statusPlaque = E('div', {
                'class': 'sf-messenger-status ' + (activeValue === 'none' ? 'sf-messenger-status-muted' : 'sf-messenger-status-idle')
        }, [
                E('span', { 'class': 'sf-messenger-status-label' }, T('Messenger connection status')),
                statusText
        ]);

        function collectOptions() {
                var options = {
                        active_messenger: select.value
                };

                fields.forEach(function (field) {
                        options[field.sfOption] = field.sfInput.value.trim();
                });

                return options;
        }

        function restartSheepfoldService() {
                return fs.exec('/etc/init.d/sheepfold', ['restart']).catch(function () {});
        }

        function readMessengerStatus() {
                return routerControl(['messenger-status']).then(function (result) {
                        return parseKeyValueOutput(result.stdout || '');
                });
        }

        function setMessengerStatus(kind, message) {
                statusPlaque.className = 'sf-messenger-status sf-messenger-status-' + kind;
                statusText.textContent = message || T('Connection check failed.');
        }

        function fallbackMessengerStatusMessage(value) {
                if (value === 'telegram')
                        return T('No response from Telegram server.');
                if (value === 'vk')
                        return T('No response from VK server.');
                return T('Messenger disabled.');
        }

        function checkMessengerConnection() {
                var options = collectOptions();

                if (options.active_messenger === 'none') {
                        setMessengerStatus('muted', T('Messenger disabled.'));
                        return Promise.resolve(null);
                }

                setMessengerStatus('checking', T('Checking messenger connection...'));

                return routerControl(['messenger-check']).then(function (result) {
                        var status = parseKeyValueOutput(result.stdout || '');
                        var kind = status.status === 'connected' ? 'ok' : 'warning';

                        setMessengerStatus(kind, status.message || fallbackMessengerStatusMessage(options.active_messenger));
                        return status;
                }, function (error) {
                        var status = parseKeyValueOutput(error && error.stdout ? error.stdout : '');

                        setMessengerStatus('warning', status.message || fallbackMessengerStatusMessage(options.active_messenger));
                        return status;
                });
        }

        function saveMessengerOptions() {
                var options = collectOptions();
                var args;

                if (options.active_messenger === 'telegram') {
                        args = [
                                'messenger-save-telegram',
                                options.telegram_bot_token || '',
                                options.telegram_admin_chat_id || ''
                        ];
                } else if (options.active_messenger === 'vk') {
                        args = [
                                'messenger-save-vk',
                                options.vk_access_token || '',
                                options.vk_community_id || '',
                                options.vk_admin_user_id || ''
                        ];
                } else {
                        args = ['messenger-disable'];
                }

                return routerControl(args).then(function () {
                        return restartSheepfoldService();
                }).then(function () {
                        return readMessengerStatus();
                }).then(function (status) {
                        if ((status.active || 'none') !== options.active_messenger) {
                                throw new Error(T('Messenger settings were sent to the router, but the router still reports another active messenger. Reinstall the latest Sheepfold package and check UCI config.') + ' ' + T('Router reports active messenger:') + ' ' + (status.active || 'none'));
                        }

                        activeValue = options.active_messenger;
                        initialMessengerOptions = collectOptions();
                        return checkMessengerConnection().then(function () {
                                return status;
                        });
                });
        }

        var vkFields = E('div', { 'class': 'sf-messenger-fields' }, [
                E('div', { 'class': 'sf-note' }, T('Create a VK community, enable messages, create an access token for community messages, then enter the community ID and the VK user ID of the parent whose commands are allowed.')),
                vkToken,
                vkCommunity,
                vkAdmin
        ]);
        var telegramSetupSteps = E('details', { 'class': 'sf-note' }, [
                E('summary', {}, T('Step-by-step Telegram setup')),
                E('ol', {}, [
                        E('li', {}, T('Open Telegram and find the official @BotFather account. Check the username carefully: @BotFather.')),
                        E('li', {}, T('Press Start or send /start.')),
                        E('li', {}, T('Send /newbot and follow BotFather questions.')),
                        E('li', {}, T('Enter a visible bot name, for example Sheepfold Home. This name is shown in Telegram.')),
                        E('li', {}, T('Enter a unique bot username. It must end with bot, for example my_sheepfold_home_bot.')),
                        E('li', {}, T('BotFather will send a token that looks like 123456:ABC-DEF... Copy it into the Telegram bot token field. Treat this token like a password.')),
                        E('li', {}, T('Select Telegram as the active messenger and save settings in Sheepfold.')),
                        E('li', {}, T('Open the created bot from the parent Telegram account and send any message to it. If the chat ID field is empty, Sheepfold will reply with your chat ID.')),
                        E('li', {}, T('Copy that chat ID into the Telegram admin chat ID field and save settings again.')),
                        E('li', {}, T('Press the test message button. If everything is correct, the bot will send a message from the router.'))
                ]),
                E('p', {}, T('Keep the bot private. Do not publish its token, do not add it to public groups, and do not give the token to children.')),
                E('p', {}, [
                        E('a', {
                                'href': 'https://core.telegram.org/bots/tutorial',
                                'target': '_blank',
                                'rel': 'noopener noreferrer'
                        }, T('Official Telegram guide'))
                ])
        ]);
        var telegramFields = E('div', { 'class': 'sf-messenger-fields' }, [
                E('div', { 'class': 'sf-note' }, T('Telegram setup short note')),
                telegramSetupSteps,
                telegramToken,
                telegramAdmin,
                E('div', { 'class': 'sf-note' }, T('Russian phrases like "help", "status", "show all devices", "turn internet off", and "support" also work. Dangerous commands require confirmation. Commands are accepted only from the allowed user ID configured on the router.')),
                E('button', {
                        'class': 'sf-action sf-action-positive sf-action-nowrap',
                        'click': function (ev) {
                                ev.preventDefault();
                                select.value = 'telegram';
                                setMessengerFieldsVisibility('telegram');
                                setMessengerStatus('checking', T('Checking messenger connection...'));
                                saveMessengerOptions().then(function () {
                                        return fs.exec('/usr/libexec/sheepfold/sheepfold-telegram-bot', ['send-test']);
                                }).then(function () {
                                        setMessengerStatus('ok', T('Telegram connected.'));
                                        notify(T('Test Telegram message sent.'), 'info');
                                }, function (error) {
                                        setMessengerStatus('warning', T('No response from Telegram server.'));
                                        notify(T('Could not send test Telegram message. Check bot token, chat ID, internet access on the router, and that Telegram is selected as the active messenger.') + ' ' + commandErrorText(error, ''), 'warning');
                                });
                        }
                }, T('Send test Telegram message')),
                E('div', { 'class': 'sf-messenger-command-box' }, [
                        E('h4', {}, T('Commands')),
                        renderMessengerCommandList()
                ])
        ]);
        select = E('select', {
                'class': 'cbi-input-select',
                'change': function (ev) {
                        var nextValue = ev.currentTarget.value;

                        activeValue = nextValue;
                        setMessengerFieldsVisibility(activeValue);
                        if (activeValue === 'none')
                                setMessengerStatus('muted', T('Messenger disabled.'));
                        else
                                setMessengerStatus('idle', T('Messenger status will be checked after saving settings or sending a test message.'));
                        markSettingsDraftChanged();
                }
        }, [
                ['none', T('Disabled')],
                ['vk', 'VK'],
                ['telegram', 'Telegram']
        ].map(function (item) {
                return E('option', { 'value': item[0], 'selected': item[0] === activeValue ? 'selected' : null }, item[1]);
        }));

        function setMessengerFieldsVisibility(value) {
                if (value === 'vk')
                        vkFields.removeAttribute('hidden');
                else
                        vkFields.setAttribute('hidden', 'hidden');

                if (value === 'telegram')
                        telegramFields.removeAttribute('hidden');
                else
                        telegramFields.setAttribute('hidden', 'hidden');
        }

        setMessengerFieldsVisibility(activeValue);
        initialMessengerOptions = collectOptions();

        fields.forEach(function (field) {
                field.sfInput.addEventListener('input', markSettingsDraftChanged);
                field.sfInput.addEventListener('change', markSettingsDraftChanged);
        });

        registerSettingsSpecialSaver({
                isChanged: function () {
                        return !sameObjectValues(initialMessengerOptions, collectOptions());
                },
                save: function () {
                        return saveMessengerOptions();
                },
                accept: function () {
                        initialMessengerOptions = collectOptions();
                }
        });

        return E('div', { 'class': 'sf-box' }, [
                E('label', { 'class': 'sf-field sf-field-wide' }, [
                        E('span', {}, T('Active messenger')),
                        select
                ]),
                statusPlaque,
                vkFields,
                telegramFields
        ]);
}

function settingsDivider(label) {
        return E('div', { 'class': 'sf-settings-divider' }, [
                E('hr'),
                E('span', {}, label)
        ]);
}

function routerTimezoneOptions() {
        return [
                ['Europe/Moscow|MSK-3', T('Moscow time') + ' (Europe/Moscow, MSK-3)'],
                ['Europe/Kaliningrad|EET-2', T('Kaliningrad time') + ' (Europe/Kaliningrad, EET-2)'],
                ['Europe/Samara|+04-4', T('Samara time') + ' (Europe/Samara, +04-4)'],
                ['Asia/Yekaterinburg|+05-5', T('Yekaterinburg time') + ' (Asia/Yekaterinburg, +05-5)'],
                ['Asia/Omsk|+06-6', T('Omsk time') + ' (Asia/Omsk, +06-6)'],
                ['Asia/Krasnoyarsk|+07-7', T('Krasnoyarsk time') + ' (Asia/Krasnoyarsk, +07-7)'],
                ['Asia/Irkutsk|+08-8', T('Irkutsk time') + ' (Asia/Irkutsk, +08-8)'],
                ['Asia/Yakutsk|+09-9', T('Yakutsk time') + ' (Asia/Yakutsk, +09-9)'],
                ['Asia/Vladivostok|+10-10', T('Vladivostok time') + ' (Asia/Vladivostok, +10-10)'],
                ['Asia/Magadan|+11-11', T('Magadan time') + ' (Asia/Magadan, +11-11)'],
                ['Asia/Kamchatka|+12-12', T('Kamchatka time') + ' (Asia/Kamchatka, +12-12)'],
                ['UTC|UTC0', 'UTC']
        ];
}

function normalizeNtpServers(value) {
        return String(value || '')
                .split(/[\s,;]+/)
                .map(function (server) { return server.trim(); })
                .filter(Boolean)
                .join(' ');
}

function routerTimeSettingsField() {
        var defaultServers = 'ntp1.vniiftri.ru ntp2.ntp-servers.net 3.openwrt.pool.ntp.org';
        var systemZoneName = safeUciGet('system', '@system[0]', 'zonename', safeUciGet('sheepfold', 'global', 'router_timezone_name', 'Europe/Moscow'));
        var systemTimezone = safeUciGet('system', '@system[0]', 'timezone', safeUciGet('sheepfold', 'global', 'router_timezone', 'MSK-3'));
        var selectedTimezone = systemZoneName + '|' + systemTimezone;
        var ntpEnabled = safeUciGet('system', 'ntp', 'enabled', safeUciGet('sheepfold', 'global', 'router_ntp_client_auto_configure', '1')) !== '0';
        var ntpServerEnabled = safeUciGet('system', 'ntp', 'enable_server', safeUciGet('sheepfold', 'global', 'router_ntp_server_enabled', '1')) === '1';
        var ntpServers = listOptionValues(safeUciGet('system', 'ntp', 'server', safeUciGet('sheepfold', 'global', 'router_ntp_servers', defaultServers))).join('\n');
        var serverField = checkboxControl(T('Make router an NTP server for LAN'), ntpServerEnabled, T('Home devices can use the router as their local time server.'));
        var clientField = checkboxControl(T('Automatically configure router NTP client'), ntpEnabled, T('Sheepfold will write NTP servers and time settings to OpenWRT system config.'));
        var timezoneSelect = E('select', { 'class': 'cbi-input-select' }, routerTimezoneOptions().map(function (item) {
                return E('option', {
                        'value': item[0],
                        'selected': item[0] === selectedTimezone ? 'selected' : null
                }, item[1]);
        }));
        var ntpServersTextarea = E('textarea', {
                'class': 'cbi-input-textarea',
                'rows': 3
        }, ntpServers || defaultServers.replace(/ /g, '\n'));
        var initialOptions;

        function collectOptions() {
                var timezoneParts = timezoneSelect.value.split('|');

                return {
                        server_enabled: serverField.input.checked ? '1' : '0',
                        client_enabled: clientField.input.checked ? '1' : '0',
                        timezone_name: timezoneParts[0] || 'Europe/Moscow',
                        timezone: timezoneParts[1] || 'MSK-3',
                        servers: normalizeNtpServers(ntpServersTextarea.value) || defaultServers
                };
        }

        initialOptions = collectOptions();

        [serverField.input, clientField.input, timezoneSelect, ntpServersTextarea].forEach(function (input) {
                input.addEventListener('change', markSettingsDraftChanged);
                input.addEventListener('input', markSettingsDraftChanged);
        });

        registerSettingsSpecialSaver({
                isChanged: function () {
                        return !sameObjectValues(initialOptions, collectOptions());
                },
                save: function () {
                        var options = collectOptions();

                        return routerControl([
                                'time-save',
                                options.server_enabled,
                                options.client_enabled,
                                options.timezone_name,
                                options.timezone,
                                options.servers
                        ]);
                },
                accept: function () {
                        initialOptions = collectOptions();
                }
        });

        return E('div', { 'class': 'sf-flat-form' }, [
                serverField.node,
                clientField.node,
                E('label', { 'class': 'sf-field sf-field-wide' }, [
                        E('span', {}, T('Router timezone')),
                        timezoneSelect
                ]),
                E('label', { 'class': 'sf-field sf-field-wide' }, [
                        E('span', {}, T('NTP servers')),
                        ntpServersTextarea,
                        E('small', {}, T('One server per line. Default for Russia: ntp1.vniiftri.ru, ntp2.ntp-servers.net, 3.openwrt.pool.ntp.org.'))
                ])
        ]);
}

function wpsActionField(label, option) {
        return saveSelectGlobalField(label, option, 'router_default', [
                ['router_default', T('Router default behavior')],
                ['allow_wifi_connection', T('Allow Wi-Fi connection')],
                ['allow_wifi_and_allowlist', T('Allow Wi-Fi connection and add devices to allowlist (dangerous)')],
                ['disable_wifi', T('Disable Wi-Fi')]
        ], T('WPS action saved.'), T('Could not save WPS action.'), [
                E('span', {}, T('Adding devices to allowlist through the WPS button is dangerous because after pressing it, for 30 seconds any device can connect to Wi-Fi and get into the allowlist.')),
                E('br'),
                E('span', {}, T('While WPS connection is allowed, all router LEDs should blink using the 1010000 pattern for 30 seconds. One tick is half a second.'))
        ]);
}

function ledControlField() {
        var currentValue = settingValue('router_led_control', 'router_default');
        var hint = E('small', {
                'hidden': currentValue === 'new_device_alert_until_luci_login' ? null : 'hidden'
        }, T('When a new device connects, router LEDs will turn on. After a successful LuCI password login or after any admin views the new-device notification on the phone, restore the router default LED behavior immediately.'));
        var select = E('select', {
                'class': 'cbi-input-select',
                'change': function (ev) {
                        var nextValue = ev.currentTarget.value;

                        hint.hidden = nextValue === 'new_device_alert_until_luci_login' ? null : 'hidden';
                        setSettingsDraftOption('router_led_control', nextValue);
                }
        }, [
                ['router_default', T('Router default behavior')],
                ['off_forever', T('Turn off all LEDs permanently')],
                ['new_device_alert_until_luci_login', T('New device LED alert until LuCI login')]
        ].map(function (item) {
                return E('option', { 'value': item[0], 'selected': item[0] === currentValue ? 'selected' : null }, item[1]);
        }));

        return E('label', { 'class': 'sf-field sf-field-wide' }, [
                E('span', {}, T('Router LED control')),
                select,
                hint
        ]);
}

function inputControl(label, value, attrs, hint) {
        var input = E('input', Object.assign({
                'class': 'cbi-input-text',
                'value': value || ''
        }, attrs || {}));

        return {
                input: input,
                node: E('label', { 'class': 'sf-field' }, [
                        E('span', {}, label),
                        input,
                        hint ? E('small', {}, hint) : ''
                ])
        };
}

function selectControl(label, value, values, hint) {
        var input = E('select', { 'class': 'cbi-input-select' }, values.map(function (item) {
                return E('option', { 'value': item[0], 'selected': item[0] === value ? 'selected' : null }, item[1]);
        }));

        return {
                input: input,
                node: E('label', { 'class': 'sf-field' }, [
                        E('span', {}, label),
                        input,
                        hint ? E('small', {}, hint) : ''
                ])
        };
}

function deviceTypeSelectControl(label, value, hint) {
        var selected = deviceTypeByValue(value);
        var input = E('input', {
                'type': 'hidden',
                'value': selected.value
        });
        var currentIcon = E('span', { 'class': 'sf-device-type-select-icon' }, [
                deviceTypeIcon(selected.value)
        ]);
        var currentLabel = E('span', { 'class': 'sf-device-type-select-label' }, selected.label);
        var root;
        var menu;
        var closeOnOutsideClick = function (ev) {
                if (root && !root.contains(ev.target))
                        setOpen(false);
        };
        var closeOnEscape = function (ev) {
                if (ev.key === 'Escape')
                        setOpen(false);
        };
        var toggle = E('button', {
                'class': 'sf-device-type-select-button',
                'type': 'button',
                'aria-haspopup': 'listbox',
                'aria-expanded': 'false',
                'click': function (ev) {
                        ev.preventDefault();
                        ev.stopPropagation();
                        setOpen(menu.hidden);
                }
        }, [
                currentIcon,
                currentLabel,
                E('span', { 'class': 'sf-device-type-select-caret' }, '▾')
        ]);

        function setOpen(open) {
                menu.hidden = !open;
                toggle.setAttribute('aria-expanded', open ? 'true' : 'false');

                if (open) {
                        window.setTimeout(function () {
                                document.addEventListener('mousedown', closeOnOutsideClick);
                                document.addEventListener('keydown', closeOnEscape);
                        }, 0);
                } else {
                        document.removeEventListener('mousedown', closeOnOutsideClick);
                        document.removeEventListener('keydown', closeOnEscape);
                }
        }

        function chooseType(item) {
                input.value = item.value;
                currentIcon.replaceChildren(deviceTypeIcon(item.value));
                currentLabel.textContent = item.label;
                setOpen(false);
        }

        menu = E('div', {
                'class': 'sf-device-type-select-menu',
                'role': 'listbox',
                'hidden': 'hidden'
        }, deviceTypeDefinitions().map(function (item) {
                return E('button', {
                        'class': 'sf-device-type-select-option' + (item.value === selected.value ? ' is-selected' : ''),
                        'type': 'button',
                        'role': 'option',
                        'aria-selected': item.value === selected.value ? 'true' : 'false',
                        'click': function (ev) {
                                ev.preventDefault();
                                ev.stopPropagation();
                                Array.prototype.forEach.call(menu.querySelectorAll('.sf-device-type-select-option'), function (button) {
                                        button.classList.remove('is-selected');
                                        button.setAttribute('aria-selected', 'false');
                                });
                                ev.currentTarget.classList.add('is-selected');
                                ev.currentTarget.setAttribute('aria-selected', 'true');
                                chooseType(item);
                        }
                }, [
                        deviceTypeIcon(item.value),
                        E('span', {}, item.label)
                ]);
        }));

        root = E('div', { 'class': 'sf-field sf-device-type-select-field' }, [
                E('span', {}, label),
                input,
                E('div', { 'class': 'sf-device-type-select' }, [
                        toggle,
                        menu
                ]),
                hint ? E('small', {}, hint) : ''
        ]);

        return {
                input: input,
                node: root
        };
}

function checkboxControl(label, checked, hint, attrs) {
        var input = E('input', Object.assign({
                'type': 'checkbox',
                'checked': checked ? 'checked' : null
        }, attrs || {}));

        return {
                input: input,
                node: E('label', { 'class': 'sf-check-field' }, [
                        input,
                        E('span', {}, label),
                        hint ? E('small', {}, hint) : ''
                ])
        };
}

function iconSvg(name) {
        var paths = {
                gear: [
                        'M19.4 13.5a7.8 7.8 0 0 0 0-3l2-1.5-2-3.5-2.4 1a8 8 0 0 0-2.6-1.5L14 2h-4l-.4 3a8 8 0 0 0-2.6 1.5l-2.4-1-2 3.5 2 1.5a7.8 7.8 0 0 0 0 3l-2 1.5 2 3.5 2.4-1a8 8 0 0 0 2.6 1.5l.4 3h4l.4-3a8 8 0 0 0 2.6-1.5l2.4 1 2-3.5z',
                        'M12 9a3 3 0 1 1 0 6 3 3 0 0 1 0-6z'
                ],
                trash: [
                        'M4 7h16',
                        'M10 11v6',
                        'M14 11v6',
                        'M6 7l1 14h10l1-14',
                        'M9 7V4h6v3'
                ],
                link: [
                        'M10 13a5 5 0 0 0 7.1 0l2-2a5 5 0 0 0-7.1-7.1l-1.1 1.1',
                        'M14 11a5 5 0 0 0-7.1 0l-2 2a5 5 0 0 0 7.1 7.1l1.1-1.1'
                ],
                eye: [
                        'M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12z',
                        'M12 9a3 3 0 1 1 0 6 3 3 0 0 1 0-6z'
                ]
        };

        return svgIcon(paths[name] || paths.gear);
}

function iconButton(title, icon, tone, handler) {
        return E('button', {
                'class': 'sf-icon-action sf-icon-action-' + tone,
                'title': title,
                'aria-label': title,
                'click': function (ev) {
                        ev.preventDefault();
                        handler();
                }
        }, iconSvg(icon));
}

function wifiQrEscape(value) {
        return String(value == null ? '' : value).replace(/([\\;,:"])/g, '\\$1');
}

function wifiQrSecurity(encryption) {
        var value = String(encryption || '').toLowerCase();

        if (!value || value === 'none' || value === 'open' || value === 'disabled')
                return 'nopass';

        if (value.indexOf('wep') !== -1)
                return 'WEP';

        return 'WPA';
}

function wifiQrPayload(ssid, password, encryption) {
        var security = wifiQrSecurity(encryption);
        var payload = 'WIFI:T:' + security + ';S:' + wifiQrEscape(ssid) + ';';

        if (security !== 'nopass')
                payload += 'P:' + wifiQrEscape(password) + ';';

        return payload + ';';
}

function safeUciGet(config, section, option, fallback) {
        try {
                var value = uci.get(config, section, option);

                return value == null ? fallback : value;
        } catch (e) {
                return fallback;
        }
}

function safeUciSections(config, type) {
        try {
                return uci.sections(config, type) || [];
        } catch (e) {
                return [];
        }
}

function reservedSheepfoldListSection(name) {
        return ['allowlist', 'blocklist', 'domain_allowlist'].indexOf(String(name || '')) !== -1;
}

function normalizeMac(mac) {
        var value = String(mac || '').trim().toUpperCase().replace(/-/g, ':');
        var compact = value.replace(/:/g, '');

        if (/^[0-9A-F]{12}$/.test(compact))
                value = compact.replace(/(..)(?=.)/g, '$1:');

        if (!/^([0-9A-F]{2}:){5}[0-9A-F]{2}$/.test(value))
                return '';

        if (value === '00:00:00:00:00:00')
                return '';

        return value;
}

function listOptionValues(value) {
        if (Array.isArray(value))
                return value;

        if (value == null)
                return [];

        return String(value).split(/\s+/).filter(Boolean);
}

function addRouterDevice(map, mac, data) {
        var normalizedMac = normalizeMac(mac);
        var current;

        if (!normalizedMac)
                return;

        current = map[normalizedMac] || {
                mac: normalizedMac,
                sources: {}
        };

        if (data.ip && !current.ip)
                current.ip = data.ip;
        if (data.staticIp)
                current.staticIp = data.staticIp;
        if (data.hostname && data.hostname !== '*')
                current.hostname = data.hostname;
        if (data.staticName)
                current.staticName = data.staticName;
        if (data.source)
                current.sources[data.source] = true;

        map[normalizedMac] = current;
}

function parseDhcpLeases(content, map) {
        String(content || '').split(/\n/).forEach(function (line) {
                var fields = line.trim().split(/\s+/);

                if (fields.length < 4)
                        return;

                addRouterDevice(map, fields[1], {
                        ip: fields[2],
                        hostname: fields[3],
                        source: 'dhcp'
                });
        });
}

function parseArpTable(content, map) {
        String(content || '').split(/\n/).slice(1).forEach(function (line) {
                var fields = line.trim().split(/\s+/);

                if (fields.length < 4)
                        return;

                addRouterDevice(map, fields[3], {
                        ip: fields[0],
                        source: 'arp'
                });
        });
}

function addStaticDhcpLeases(map) {
        safeUciSections('dhcp', 'host').forEach(function (section) {
                var name = section.name || section.hostname || section.dns || '';
                var ip = section.ip || '';
                var sectionName = section['.name'] || '';

                listOptionValues(section.mac).forEach(function (mac) {
                        addRouterDevice(map, mac, {
                                staticName: name,
                                staticIp: ip,
                                ip: ip,
                                staticSection: sectionName,
                                source: 'static'
                        });
                });
        });
}

function sheepfoldDeviceConfigByMac() {
        var byMac = {};

        safeUciSections('sheepfold', 'device').forEach(function (section) {
                var mac = normalizeMac(section.mac);

                if (reservedSheepfoldListSection(section['.name']))
                        return;

                if (!mac)
                        return;

                byMac[mac] = section;
        });

        return byMac;
}

function sheepfoldListMacs(listName) {
        var result = {};

        safeUciSections('sheepfold', 'list').forEach(function (section) {
                if (section['.name'] !== listName)
                        return;

                listOptionValues(section.mac).concat(listOptionValues(section.macs)).forEach(function (mac) {
                        mac = normalizeMac(mac);
                        if (mac)
                                result[mac] = true;
                });
        });

        return result;
}

function macInSheepfoldList(listName, mac) {
        var normalizedMac = normalizeMac(mac);
        var found = false;

        safeUciSections('sheepfold', 'list').forEach(function (section) {
                if (found || section['.name'] !== listName)
                        return;

                found = listOptionValues(section.mac).concat(listOptionValues(section.macs)).map(normalizeMac).indexOf(normalizedMac) !== -1;
        });

        return found;
}

function generatedSectionName(prefix, mac) {
        return prefix + '_' + normalizeMac(mac).toLowerCase().replace(/:/g, '');
}

function ensureSection(config, type, preferredName) {
        var existing = safeUciSections(config, type).filter(function (section) {
                return section['.name'] === preferredName;
        })[0];

        if (existing)
                return existing['.name'];

        try {
                return uci.add(config, type, preferredName) || preferredName;
        } catch (e) {
                return uci.add(config, type);
        }
}

function ensureSheepfoldDeviceSection(device) {
        if (device.configSection)
                return device.configSection;

        return ensureSection('sheepfold', 'device', generatedSectionName('device', device.mac));
}

function ensureSheepfoldListSection(listName) {
        return ensureSection('sheepfold', 'list', listName);
}

function updateMacList(listName, mac, enabled) {
        var sectionName = ensureSheepfoldListSection(listName);
        var values = listOptionValues(uci.get('sheepfold', sectionName, 'mac')).map(normalizeMac).filter(Boolean);
        var normalizedMac = normalizeMac(mac);
        var exists = values.indexOf(normalizedMac) !== -1;

        if (enabled && !exists)
                values.push(normalizedMac);

        if (!enabled)
                values = values.filter(function (value) {
                        return value !== normalizedMac;
                });

        uci.set('sheepfold', sectionName, 'mac', values.join(' '));
}

function removeDeviceFromAccessList(device, listName) {
        var isAllowlist = listName === 'allowlist';
        var confirmText = isAllowlist ? T('Remove device from allowlist?') : T('Remove device from blocklist?');
        var successText = isAllowlist ? T('Device removed from allowlist.') : T('Device removed from blocklist.');
        var sectionName;

        if (!window.confirm(confirmText + ' ' + formattedDeviceDisplayId(device) + ' ' + (device.name || device.mac)))
                return;

        sectionName = ensureSheepfoldDeviceSection(device);
        updateMacList(listName, device.mac, false);
        uci.set('sheepfold', sectionName, 'status', 'new');

        saveUciChanges(['sheepfold']).then(function () {
                notify(successText, 'info');
                window.setTimeout(function () {
                        window.location.reload();
                }, 500);
        }, function () {
                notify(T('Could not remove device from list.'), 'warning');
        });
}

function applyAdminDeviceBindings(admin, selectedDevices, previousIds) {
        var selectedById = {};

        if (selectedDevices.some(function (device) { return !adminDeviceCanBeBound(device); }))
                return Promise.reject(new Error(T('A blocklisted device cannot become an administrator device. Remove it from the blocklist first.')));

        // Админское устройство нельзя оставлять в детских группах, расписаниях и журналировании:
        // иначе родитель может сам себя заблокировать, а журнал ребёнка начнёт смешиваться
        // с действиями администратора. Поэтому при привязке явно чистим ограничения,
        // добавляем устройство в белый список и убираем из чёрного.
        selectedDevices.forEach(function (device) {
                var sectionName = ensureSheepfoldDeviceSection(device);
                var mac = normalizeMac(device.mac);

                selectedById[device.id] = true;

                uci.set('sheepfold', sectionName, 'mac', mac);
                uci.set('sheepfold', sectionName, 'name', device.name || mac);
                uci.set('sheepfold', sectionName, 'ip', device.ip || '');
                uci.set('sheepfold', sectionName, 'device_type', device.deviceType || 'phone');
                uci.set('sheepfold', sectionName, 'group', T('Not configured'));
                uci.set('sheepfold', sectionName, 'schedules', '');
                uci.set('sheepfold', sectionName, 'schedule', '');
                uci.set('sheepfold', sectionName, 'activity_log_enabled', '0');
                uci.set('sheepfold', sectionName, 'status', 'allow');
                uci.set('sheepfold', sectionName, 'admin_device', '1');
                uci.set('sheepfold', sectionName, 'admin_owner', admin.name || '');
                uci.set('sheepfold', sectionName, 'admin_login', admin.login || '');
                updateMacList('allowlist', mac, true);
                updateMacList('blocklist', mac, false);
        });

        (previousIds || []).forEach(function (id) {
                var device = deviceById(id);
                var sectionName;

                if (!device || selectedById[id])
                        return;

                sectionName = ensureSheepfoldDeviceSection(device);
                if (uci.get('sheepfold', sectionName, 'admin_login') === admin.login) {
                        uci.set('sheepfold', sectionName, 'admin_device', '0');
                        uci.set('sheepfold', sectionName, 'admin_owner', '');
                        uci.set('sheepfold', sectionName, 'admin_login', '');
                }
        });

        return saveUciChanges(['sheepfold']);
}

function ensureStaticDhcpSection(device) {
        if (device.staticSection)
                return device.staticSection;

        return ensureSection('dhcp', 'host', generatedSectionName('sheepfold', device.mac));
}

function saveUciChanges(configs) {
        return Promise.all(configs.map(function (config) {
                return uci.save(config);
        })).then(function () {
                // LuCI по умолчанию любит оставлять изменения в очереди "не применено".
                // Для Sheepfold это путает пользователя: он уже нажал нашу кнопку "Сохранить".
                // Поэтому после uci.save сразу применяем изменения через LuCI API, а если
                // конкретная сборка OpenWRT этого метода не имеет - падаем обратно на uci.apply().
                if (ui.changes && typeof ui.changes.apply === 'function')
                        return Promise.resolve(ui.changes.apply(false)).catch(function () {
                                return uci.apply();
                        });

                return uci.apply();
        });
}

function routerDeviceNote(item, configured) {
        if (configured && configured.note)
                return configured.note;

        if (configured && configured.detection_reason) {
                var confidence = configured.detection_confidence ?
                        ' (' + T('Detection confidence') + ': ' + configured.detection_confidence + '%)' :
                        '';

                return T('Auto-detected') + ': ' + configured.detection_reason + confidence;
        }

        if (configured)
                return T('Configured in Sheepfold');

        if (item.sources.static && (item.sources.dhcp || item.sources.arp))
                return T('Static DHCP lease, currently online');

        if (item.sources.dhcp)
                return T('Active DHCP lease');

        if (item.sources.arp)
                return T('ARP/neighbor entry');

        if (item.sources.static)
                return T('Static DHCP lease');

        return T('Detected automatically from router leases, ARP/neighbor data, and static DHCP leases.');
}

function buildRouterDevices(dhcpLeases, arpTable) {
        var map = {};
        var configuredByMac;
        var allowlist;
        var blocklist;

        parseDhcpLeases(dhcpLeases, map);
        parseArpTable(arpTable, map);
        addStaticDhcpLeases(map);

        configuredByMac = sheepfoldDeviceConfigByMac();
        allowlist = sheepfoldListMacs('allowlist');
        blocklist = sheepfoldListMacs('blocklist');

        return Object.keys(map).sort(function (left, right) {
                var leftDevice = map[left];
                var rightDevice = map[right];
                var leftOnline = leftDevice.sources.dhcp || leftDevice.sources.arp ? 1 : 0;
                var rightOnline = rightDevice.sources.dhcp || rightDevice.sources.arp ? 1 : 0;
                var leftName = leftDevice.staticName || leftDevice.hostname || left;
                var rightName = rightDevice.staticName || rightDevice.hostname || right;

                if (leftOnline !== rightOnline)
                        return rightOnline - leftOnline;

                return leftName.localeCompare(rightName);
        }).map(function (mac, index) {
                var item = map[mac];
                var configured = configuredByMac[mac];
                var status = configured && configured.status ? configured.status : 'new';
                var adminDevice = configured && configured.admin_device === '1';
                var groupName = configured && configured.group ? normalizeGroupName(configured.group) : T('Not configured');
                var groupSection = groupSectionByName(groupName);
                var deviceType = configured && configured.device_type ?
                        configured.device_type :
                        configured && configured.detected_type ?
                                configured.detected_type :
                                inferDeviceType(item, configured);

                if (allowlist[mac])
                        status = 'allow';
                if (blocklist[mac])
                        status = 'blocked';

                return {
                        id: 'D-' + String(index + 1).padStart(4, '0'),
                        name: configured && configured.name && !reservedSheepfoldListSection(configured.name) ?
                                configured.name :
                                (item.staticName || item.hostname || T('Unknown device')),
                        ip: configured && configured.ip ? configured.ip : (item.ip || item.staticIp || ''),
                        mac: mac,
                        hostname: item.hostname || '',
                        staticIp: item.staticIp || '',
                        staticLease: !!item.sources.static,
                        staticSection: item.staticSection || '',
                        configSection: configured && configured['.name'],
                        sourceLabel: Object.keys(item.sources).map(function (source) {
                                return source === 'dhcp' ? T('Active DHCP lease') :
                                        source === 'arp' ? T('ARP/neighbor entry') :
                                                T('Static DHCP lease');
                        }).join(', '),
                        group: groupName,
                        deviceType: deviceType,
                        manualDeviceType: configured && configured.manual_device_type === '1',
                        detectionConfidence: configured && configured.detection_confidence,
                        detectionReason: configured && configured.detection_reason,
                        autoGroupAssigned: configured && configured.auto_group_assigned === '1',
                        noRestrictionsAutoExcluded: configured && configured.no_restrictions_auto_excluded === '1',
                        status: status,
                        note: routerDeviceNote(item, configured),
                        adminDevice: adminDevice,
                        adminOwner: configured && configured.admin_owner,
                        adminLogin: configured && configured.admin_login,
                        groupAllowlistOnly: groupSection && groupSection.allowlist_only === '1',
                        activityLogEnabled: !adminDevice && status !== 'allow' && status !== 'blocked' && (
                                configured && configured.activity_log_enabled === '1' ||
                                groupSection && groupSection.activity_log_enabled === '1'
                        )
                };
        });
}

function readWifiNetworksFromUci() {
        return safeUciSections('wireless', 'wifi-iface').filter(function (section) {
                return section.disabled !== '1' && (!section.mode || section.mode === 'ap');
        }).map(function (section) {
                var device = section.device || '';
                var deviceLabel = device || T('Network');
                var band = device ? (safeUciGet('wireless', device, 'band', '') || safeUciGet('wireless', device, 'hwmode', '')) : '';
                var channel = device ? (safeUciGet('wireless', device, 'channel', 'auto') || 'auto') : 'auto';
                var sectionName = section['.name'] || '';
                var ssid = section.ssid || (sectionName ? safeUciGet('wireless', sectionName, 'ssid', '') : '') || '';
                var encryption = section.encryption || (sectionName ? safeUciGet('wireless', sectionName, 'encryption', '') : '') || 'none';
                var password = section.key || (sectionName ? safeUciGet('wireless', sectionName, 'key', '') : '') || '';

                return {
                        label: ssid ? ssid + ' (' + (band || deviceLabel) + ')' : deviceLabel,
                        ssid: ssid,
                        password: password,
                        encryption: encryption,
                        channel: channel
                };
        });
}

function wifiSecurityOptions(value) {
        var options = [
                ['sae-mixed', 'WPA2/WPA3 mixed'],
                ['psk2', 'WPA2-PSK'],
                ['sae', 'WPA3-SAE'],
                ['psk-mixed', 'WPA/WPA2 mixed'],
                ['wep', 'WEP'],
                ['none', T('Open network')]
        ];
        var known = options.some(function (item) {
                return item[0] === value;
        });

        if (value && !known)
                options.unshift([value, value]);

        return options;
}

function wifiNetworkCardColor(index) {
        var palette = groupColorPalette();

        return palette[index % palette.length];
}

function wifiNetworkBox(network, index) {
        var ssidInput = E('input', { 'class': 'cbi-input-text', 'value': network.ssid || '' });
        var passwordInput = E('input', { 'class': 'cbi-input-text', 'value': network.password || '' });
        var securitySelect = E('select', { 'class': 'cbi-input-select' }, wifiSecurityOptions(network.encryption).map(function (item) {
                return E('option', { 'value': item[0], 'selected': item[0] === network.encryption ? 'selected' : null }, item[1]);
        }));
        var channelSelect = E('select', { 'class': 'cbi-input-select' }, [
                ['auto', T('Auto')],
                ['1', '1'],
                ['6', '6'],
                ['11', '11'],
                ['36', '36'],
                ['44', '44'],
                ['149', '149']
        ].map(function (item) {
                return E('option', { 'value': item[0], 'selected': item[0] === network.channel ? 'selected' : null }, item[1]);
        }));
        var qrWrap = E('div', { 'class': 'sf-wifi-qr-code' });

        function updateQr() {
                var payload = wifiQrPayload(ssidInput.value, passwordInput.value, securitySelect.value);

                qrWrap.replaceChildren(qrCode(payload));
        }

        ssidInput.addEventListener('input', updateQr);
        passwordInput.addEventListener('input', updateQr);
        securitySelect.addEventListener('change', updateQr);

        updateQr();

        return E('div', {
                'class': 'sf-box sf-wifi-network',
                'style': 'background-color: ' + wifiNetworkCardColor(index) + ';'
        }, [
                E('h4', { 'class': 'sf-wifi-title' }, network.label),
                E('div', { 'class': 'sf-wifi-fields' }, [
                        E('label', { 'class': 'sf-field' }, [
                                E('span', {}, T('SSID')),
                                ssidInput
                        ]),
                        E('label', { 'class': 'sf-field' }, [
                                E('span', {}, T('Password')),
                                passwordInput
                        ]),
                        E('label', { 'class': 'sf-field' }, [
                                E('span', {}, T('Security')),
                                securitySelect
                        ]),
                        E('label', { 'class': 'sf-field' }, [
                                E('span', {}, T('Channel')),
                                channelSelect
                        ])
                ]),
                E('div', { 'class': 'sf-wifi-qr' }, [
                        qrWrap,
                        E('small', {}, T('Scan to connect to this Wi-Fi network.'))
                ])
        ]);
}

return view.extend({
        activeTab: 'users',
        activeUserListTab: 'devices',
        activeManagementTab: 'schedules',
        activeSettingsTab: 'general',
        deepLinkHandled: false,
        globalInternetBlocked: null,
        uciLoadState: {
                sheepfold: false,
                wireless: false,
                system: false
        },

        load: function () {
                var self = this;

                return Promise.all([
                        uci.load('wireless').then(function () {
                                self.uciLoadState.wireless = true;
                        }, function () {
                                self.uciLoadState.wireless = false;
                        }),
                        uci.load('sheepfold').then(function () {
                                self.uciLoadState.sheepfold = true;
                        }, function () {
                                self.uciLoadState.sheepfold = false;
                        }),
                        uci.load('system').then(function () {
                                self.uciLoadState.system = true;
                        }, function () {
                                self.uciLoadState.system = false;
                        }),
                        uci.load('dhcp')
                ]).then(function () {
                        return Promise.all([
                                fs.read('/tmp/dhcp.leases').catch(function () {
                                        return '';
                                }),
                                fs.read('/proc/net/arp').catch(function () {
                                        return '';
                                }),
                                fs.read(logCachePath()).catch(function () {
                                        return '';
                                })
                        ]);
                }).then(function (results) {
                        devices = buildRouterDevices(results[0], results[1]);
                        logEntries = parseRamLog(results[2]);
                });
        },

        isGlobalInternetBlocked: function () {
                if (this.globalInternetBlocked !== null)
                        return this.globalInternetBlocked;

                return safeUciGet('sheepfold', 'global', 'block_on_boot', '0') === '1';
        },

        updateInternetButtons: function (page, blocked) {
                page.querySelectorAll('.sf-internet-toggle').forEach(function (node) {
                        var nodeBlocked = node.getAttribute('data-blocked') === '1';
                        var active = nodeBlocked === blocked;

                        node.classList.toggle('is-active', active);
                        node.classList.toggle('is-inactive', !active);
                        node.setAttribute('aria-pressed', active ? 'true' : 'false');
                });
        },

        deepLinkParams: function () {
                try {
                        return new URLSearchParams(window.location.search || '');
                } catch (e) {
                        return null;
                }
        },

        applyInitialDeepLinkState: function () {
                var params = this.deepLinkParams();

                if (!params)
                        return;

                if (params.get('view') === 'admins') {
                        this.activeTab = 'management';
                        this.activeManagementTab = 'admins';
                }
        },

        runInitialDeepLinkAction: function () {
                var params = this.deepLinkParams();
                var admin;

                if (this.deepLinkHandled || !params)
                        return;

                if (params.get('view') !== 'admins' || params.get('action') !== 'pair')
                        return;

                admin = adminByDeepLinkValue(params.get('admin'));
                if (!admin)
                        return;

                this.deepLinkHandled = true;
                window.setTimeout(function () {
                        showAdminSettingsModal(admin);
                }, 0);
        },

        internetToggleButton: function (label, tone, blocked, currentBlocked, message) {
                var self = this;
                var active = blocked === currentBlocked;

                return E('button', {
                        'class': 'sf-action sf-action-' + tone + ' sf-internet-toggle ' + (active ? 'is-active' : 'is-inactive'),
                        'data-blocked': blocked ? '1' : '0',
                        'aria-pressed': active ? 'true' : 'false',
                        'click': function (ev) {
                                var page = ev.currentTarget.closest('.sf-page');

                                ev.preventDefault();
                                self.globalInternetBlocked = blocked;
                                self.updateInternetButtons(page, blocked);
                                notify(message, blocked ? 'warning' : 'info');
                        }
                }, label);
        },

        switchTab: function (button, tab) {
                var page = button.closest('.sf-page');

                this.activeTab = tab;

                page.querySelectorAll('.sf-tab').forEach(function (node) {
                        node.classList.toggle('active', node.getAttribute('data-tab') === tab);
                });

                page.querySelectorAll('.sf-tab-panel').forEach(function (node) {
                        node.hidden = node.getAttribute('data-tab') !== tab;
                });

                if (tab === 'settings') {
                        var generalButton = page.querySelector('[data-settings-tab="general"]');
                        if (generalButton)
                                this.switchSettingsTab(generalButton, 'general');
                }

                if (tab === 'users') {
                        var devicesButton = page.querySelector('[data-user-list-tab="devices"]');
                        if (devicesButton)
                                this.switchUserListTab(devicesButton, 'devices');
                }

                if (tab === 'management') {
                        var schedulesButton = page.querySelector('[data-management-tab="schedules"]');
                        if (schedulesButton)
                                this.switchManagementTab(schedulesButton, 'schedules');
                }
        },

        openUserListMetric: function (button, userListTab) {
                var page = button.closest('.sf-page');
                var usersTabButton = page.querySelector('[data-tab="users"]');
                var userListButton;

                if (usersTabButton)
                        this.switchTab(usersTabButton, 'users');

                userListButton = page.querySelector('[data-user-list-tab="' + userListTab + '"]');
                if (userListButton)
                        this.switchUserListTab(userListButton, userListTab);
        },

        renderTabs: function () {
                var self = this;

                return E('div', { 'class': 'sf-tabs' }, tabs.map(function (tab) {
                        return E('button', {
                                'class': 'sf-tab' + (self.activeTab === tab[0] ? ' active' : ''),
                                'data-tab': tab[0],
                                'click': function (ev) {
                                        ev.preventDefault();
                                        self.switchTab(ev.currentTarget, tab[0]);
                                }
                        }, tab[1]);
                }));
        },

        switchSettingsTab: function (button, tab) {
                var panel = button.closest('.sf-panel');

                this.activeSettingsTab = tab;

                panel.querySelectorAll('.sf-settings-tab').forEach(function (node) {
                        node.classList.toggle('active', node.getAttribute('data-settings-tab') === tab);
                });

                panel.querySelectorAll('.sf-settings-panel').forEach(function (node) {
                        node.hidden = node.getAttribute('data-settings-panel') !== tab;
                });
        },

        renderSettingsTabs: function () {
                var self = this;

                return E('div', { 'class': 'sf-tabs sf-settings-tabs' }, settingsTabs.map(function (tab) {
                        return E('button', {
                                'class': 'sf-tab sf-settings-tab' + (self.activeSettingsTab === tab[0] ? ' active' : ''),
                                'data-settings-tab': tab[0],
                                'click': function (ev) {
                                        ev.preventDefault();
                                        self.switchSettingsTab(ev.currentTarget, tab[0]);
                                }
                        }, tab[1]);
                }));
        },

        switchUserListTab: function (button, tab) {
                var panel = button.closest('.sf-panel');

                this.activeUserListTab = tab;

                panel.querySelectorAll('.sf-user-list-tab').forEach(function (node) {
                        node.classList.toggle('active', node.getAttribute('data-user-list-tab') === tab);
                });

                panel.querySelectorAll('.sf-user-list-panel').forEach(function (node) {
                        node.hidden = node.getAttribute('data-user-list-panel') !== tab;
                });
        },

        renderUserListTabs: function () {
                var self = this;

                return E('div', { 'class': 'sf-tabs sf-user-list-tabs' }, userListTabs.map(function (tab) {
                        return E('button', {
                                'class': 'sf-tab sf-user-list-tab' + (self.activeUserListTab === tab[0] ? ' active' : ''),
                                'data-user-list-tab': tab[0],
                                'click': function (ev) {
                                        ev.preventDefault();
                                        self.switchUserListTab(ev.currentTarget, tab[0]);
                                }
                        }, tab[1]);
                }));
        },

        switchManagementTab: function (button, tab) {
                var panel = button.closest('.sf-panel');

                this.activeManagementTab = tab;

                panel.querySelectorAll('.sf-management-tab').forEach(function (node) {
                        node.classList.toggle('active', node.getAttribute('data-management-tab') === tab);
                });

                panel.querySelectorAll('.sf-management-panel').forEach(function (node) {
                        node.hidden = node.getAttribute('data-management-panel') !== tab;
                });
        },

        renderManagementTabs: function () {
                var self = this;

                return E('div', { 'class': 'sf-tabs sf-user-list-tabs' }, managementTabs.map(function (tab) {
                        return E('button', {
                                'class': 'sf-tab sf-management-tab' + (self.activeManagementTab === tab[0] ? ' active' : ''),
                                'data-management-tab': tab[0],
                                'click': function (ev) {
                                        ev.preventDefault();
                                        self.switchManagementTab(ev.currentTarget, tab[0]);
                                }
                        }, tab[1]);
                }));
        },

        renderRootPasswordStatus: function () {
                if (rootPasswordIsSet) {
                        return '';
                }

                return E('div', {
                        'class': 'sf-note ' + (rootPasswordIsSet ? 'sf-note-ok' : 'sf-note-danger')
                }, [
                        E('strong', {}, T('Router root password check')),
                        E('span', {}, T('Root password is not set. Sheepfold settings must stay locked until the router password is configured.')),
                        E('a', {
                                'class': 'sf-inline-link',
                                'href': L.url('admin/system/admin')
                        }, T('Open router password page'))
                ]);
        },

        renderDevices: function (embedded) {
                var table = deviceTable(devices);
                var search = E('input', {
                        'class': 'cbi-input-text sf-search',
                        'placeholder': T('Search by name, IP, or MAC')
                });

                search.addEventListener('input', function () {
                        filterDeviceTable(table, search.value);
                });

                return E('div', { 'class': embedded ? 'sf-settings-section' : 'sf-panel' }, [
                        E('div', { 'class': 'sf-panel-head' }, [
                                E('div', {}, [
                                        E('p', {}, T('Detected automatically from router leases, ARP/neighbor data, and static DHCP leases.'))
                                ])
                        ]),
                        E('div', { 'class': 'sf-toolbar sf-device-toolbar' }, [
                                search,
                                E('button', {
                                        'class': 'sf-action sf-action-positive',
                                        'click': function (ev) {
                                                ev.preventDefault();
                                                showManualDeviceModal();
                                        }
                                }, T('Add device'))
                        ]),
                        devices.length ? '' : E('div', { 'class': 'sf-note sf-note-warning' }, T('No devices found in DHCP leases, ARP, or static DHCP leases yet.')),
                        table
                ]);
        },

        renderAllowlist: function (embedded) {
                return E('div', { 'class': embedded ? 'sf-settings-section' : 'sf-panel' }, [
                        E('div', { 'class': 'sf-panel-head' }, [
                                E('div', {}, [
                                        E('p', {}, T('These devices are never blocked by global blocking or schedules.'))
                                ]),
                                E('div', { 'class': 'sf-toolbar' }, [
                                        quickAllowlistButton(),
                                        manualListDeviceButton('allow')
                                ])
                        ]),
                        deviceTable(devices.filter(function (device) { return device.status === 'allow'; }), { compact: true, removeFromList: 'allowlist' })
                ]);
        },

        renderBlocklist: function (embedded) {
                var emergencyAccessEnabled = safeUciGet('sheepfold', 'global', 'domain_allowlist_for_blocklist', '1') === '1';

                return E('div', { 'class': embedded ? 'sf-settings-section' : 'sf-panel' }, [
                        E('div', { 'class': 'sf-panel-head' }, [
                                E('div', {}, [
                                        E('p', {}, T('Blocklisted devices cannot access the internet, LuCI, SSH, or the Sheepfold API.'))
                                ]),
                                manualListDeviceButton('blocked')
                        ]),
                        E('div', { 'class': 'sf-note ' + (emergencyAccessEnabled ? 'sf-note-ok' : 'sf-note-warning') }, emergencyAccessEnabled ?
                                T('Emergency-useful sites for blocklisted devices are enabled and still do not open router access.') :
                                T('Emergency-useful sites for blocklisted devices are disabled and still do not open router access.')),
                        deviceTable(devices.filter(function (device) { return device.status === 'blocked'; }), { compact: true, removeFromList: 'blocklist' })
                ]);
        },

        renderUserListPanel: function (tab, content) {
                return E('div', {
                        'class': 'sf-user-list-panel sf-settings-panel',
                        'data-user-list-panel': tab,
                        'hidden': this.activeUserListTab === tab ? null : 'hidden'
                }, content);
        },

        renderUsers: function () {
                return E('div', { 'class': 'sf-panel' }, [
                        this.renderUserListTabs(),
                        this.renderUserListPanel('devices', this.renderDevices(true)),
                        this.renderUserListPanel('allowlist', this.renderAllowlist(true)),
                        this.renderUserListPanel('blocklist', this.renderBlocklist(true))
                ]);
        },

        renderManagementPanel: function (tab, content) {
                return E('div', {
                        'class': 'sf-management-panel sf-settings-panel',
                        'data-management-panel': tab,
                        'hidden': this.activeManagementTab === tab ? null : 'hidden'
                }, content);
        },

        renderManagement: function () {
                return E('div', { 'class': 'sf-panel' }, [
                        this.renderManagementTabs(),
                        this.renderManagementPanel('schedules', this.renderSchedules(true)),
                        this.renderManagementPanel('groups', this.renderGroups(true)),
                        this.renderManagementPanel('admins', this.renderAdmins(true))
                ]);
        },

        renderSchedules: function (embedded) {
                return E('div', { 'class': embedded ? 'sf-settings-section' : 'sf-panel' }, [
                        E('div', { 'class': 'sf-panel-head' }, [
                                E('div', {}, [
                                        E('p', {}, T('Allow and block rules for devices and groups.'))
                                ]),
                                actionButton(T('Add rule'), 'positive', T('Schedule editor is not implemented in this visual test build.'))
                        ]),
                        E('div', { 'class': 'sf-grid two' }, [
                                E('div', { 'class': 'sf-box' }, [
                                        E('h4', {}, T('School days')),
                                        E('p', {}, T('Children group')),
                                        E('strong', {}, T('Allow 07:00-20:30, block after bedtime'))
                                ]),
                                E('div', { 'class': 'sf-box' }, [
                                        E('h4', {}, T('Temporary access')),
                                        E('div', { 'class': 'sf-chip-row' }, [
                                                '+15', '+30', '+1h', '+2h', '+3h', '+5h', T('End of day'), T('Bedtime')
                                        ].map(function (label) {
                                                return E('button', {
                                                'class': 'sf-chip',
                                                        'click': function (ev) {
                                                                ev.preventDefault();
                                                                notify(T('Temporary access requires confirmation.'), 'info');
                                                        }
                                                }, label);
                                        }))
                                ])
                        ]),
                        E('div', { 'class': 'sf-form-row' }, [
                                field(T('Default bedtime'), '21:00', T('Used by the "until bedtime" quick action.'))
                        ])
                ]);
        },

        renderGroups: function (embedded) {
                var grouped = {};
                var groupSections = {};
                var groupNames;

                safeUciSections('sheepfold', 'group').forEach(function (section) {
                        var groupName = normalizeGroupName(section.name || section['.name']);

                        if (groupName && !grouped[groupName])
                                grouped[groupName] = [];
                        if (groupName)
                                groupSections[groupName] = section;
                });

                function ensureVisibleDefaultGroup(groupName, data) {
                        if (!grouped[groupName])
                                grouped[groupName] = [];
                        if (!groupSections[groupName])
                                groupSections[groupName] = data;
                }

                ensureVisibleDefaultGroup(T('No restrictions'), {
                        name: T('No restrictions'),
                        protected: '1',
                        auto_assignable: '1',
                        color: '#e8f4ef'
                });
                ensureVisibleDefaultGroup(T('Child number 1'), {
                        name: T('Child number 1'),
                        protected: '0',
                        auto_assignable: '0',
                        color: '#eef2ff'
                });

                devices.forEach(function (device) {
                        if (!device.group)
                                return;

                        device.group = normalizeGroupName(device.group);

                        if (!grouped[device.group])
                                grouped[device.group] = [];

                        grouped[device.group].push(device);
                });

                function deleteGroup(groupName) {
                        var section = groupSections[groupName];
                        var sectionName = section && section['.name'];

                        if (normalizeGroupName(groupName) === noRestrictionsGroupName()) {
                                notify(T('Protected group cannot be deleted.'), 'warning');
                                return;
                        }

                        if (grouped[groupName] && grouped[groupName].length) {
                                notify(T('This group cannot be deleted while devices are assigned to it.'), 'warning');
                                return;
                        }

                        if (section && section.protected === '1') {
                                notify(T('Protected group cannot be deleted.'), 'warning');
                                return;
                        }

                        if (!sectionName) {
                                notify(T('Group editor is not implemented in this visual test build.'), 'warning');
                                return;
                        }

                        if (!window.confirm(T('Delete group') + ': ' + groupName + '?'))
                                return;

                        uci.remove('sheepfold', sectionName);
                        saveUciChanges(['sheepfold']).then(function () {
                                delete grouped[groupName];
                                delete groupSections[groupName];
                                notify(T('Group deleted.'), 'info');
                                window.setTimeout(function () {
                                        window.location.reload();
                                }, 700);
                        }, function () {
                                notify(T('Could not delete group.'), 'warning');
                        });
                }

                groupNames = Object.keys(grouped).sort(function (left, right) {
                        return left.localeCompare(right);
                });

                var usedCardColors = {};

                function cardColor(groupName, section) {
                        var color = section && validGroupColor(section.color) ? section.color : '';
                        var palette = groupColorPalette();

                        if (!color) {
                                for (var i = 0; i < palette.length; i++) {
                                        if (!usedCardColors[palette[i].toLowerCase()]) {
                                                color = palette[i];
                                                break;
                                        }
                                }
                        }

                        color = color || groupAutoColor(groupName);
                        usedCardColors[color.toLowerCase()] = true;
                        return color;
                }

                function groupCard(groupName) {
                        var section = groupSections[groupName];
                        var groupDevices = grouped[groupName] || [];
                        var visibleDevices = groupDevices.slice(0, 5);
                        var hiddenCount = Math.max(0, groupDevices.length - visibleDevices.length);

                        return E('div', {
                                'class': 'sf-box sf-group-box',
                                'style': 'background-color: ' + cardColor(groupName, section) + ';'
                        }, [
                                E('div', { 'class': 'sf-group-head' }, [
                                        E('div', {}, [
                                                E('h4', { 'class': 'sf-group-title' }, groupName),
                                                E('strong', { 'class': 'sf-group-count' }, groupDevices.length + ' ' + T('Devices'))
                                        ]),
                                        E('div', { 'class': 'sf-row-actions' }, [
                                                iconButton(T('Configure group'), 'gear', 'neutral', function () {
                                                        showGroupSettingsModal(groupName, section);
                                                }),
                                                iconButton(T('Delete group'), 'trash', 'danger', function () {
                                                        deleteGroup(groupName);
                                                })
                                        ])
                                ]),
                                visibleDevices.length ? E('div', { 'class': 'sf-group-device-list' }, visibleDevices.map(function (device) {
                                        return E('div', {}, [
                                                E('span', { 'class': 'sf-device-index' }, formattedDeviceDisplayId(device)),
                                                E('span', {}, device.name)
                                        ]);
                                }).concat(hiddenCount ? [
                                        E('div', { 'class': 'sf-group-device-more' }, '+ ' + hiddenCount + ' ' + T('more devices hidden'))
                                ] : [])) : E('div', { 'class': 'sf-muted' }, T('No devices'))
                        ]);
                }

                return E('div', { 'class': embedded ? 'sf-settings-section' : 'sf-panel' }, [
                        E('div', { 'class': 'sf-panel-head' }, [
                                E('div', {}, [
                                        E('p', {}, T('Groups collect devices so schedules and access rules can be applied to several devices at once.'))
                                ]),
                                E('button', {
                                        'class': 'sf-action sf-action-positive sf-action-nowrap',
                                        'click': function (ev) {
                                                var existingNames = {};

                                                ev.preventDefault();
                                                groupNames.forEach(function (groupName) {
                                                        existingNames[groupName] = true;
                                                });
                                                showAddGroupModal(existingNames);
                                        }
                                }, T('Add group'))
                        ]),
                        groupNames.length ?
                                E('div', { 'class': 'sf-grid two' }, groupNames.map(groupCard)) :
                                E('div', { 'class': 'sf-note sf-note-warning' }, T('No groups yet. Assign devices to groups in device settings.'))
                ]);
        },

        renderEmergency: function () {
                return E('div', { 'class': 'sf-settings-section' }, [
                        E('div', { 'class': 'sf-panel-head' }, [
                                E('div', {}, [
                                        E('p', { 'class': 'sf-section-intro' }, T('Emergency-useful sites are a small editable list of necessary services that may stay available during restricted access.'))
                                ]),
                                E('button', {
                                        'class': 'sf-action sf-action-positive',
                                        'click': function (ev) {
                                                ev.preventDefault();
                                                showSiteModal();
                                        }
                                }, T('Add site'))
                        ]),
                        E('div', { 'class': 'sf-domain-list' }, emergencySites.map(domainCard))
                ]);
        },

        readWifiNetworks: function () {
                return readWifiNetworksFromUci();
        },

        renderWifi: function () {
                var networks = this.readWifiNetworks();

                return E('div', { 'class': 'sf-panel' }, [
                        networks.length ?
                                E('div', { 'class': 'sf-grid two' }, networks.map(function (network, index) {
                                        return wifiNetworkBox(network, index);
                                })) :
                                E('div', { 'class': 'sf-note sf-note-warning' }, T('No active Wi-Fi networks were found in the router wireless config.'))
                ]);
        },

        integrationModeNotes: function (mode) {
                var notes = {
                        none: T('Sheepfold works alone.'),
                        adguard: T('Sheepfold blocks/allows devices before AdGuard Home DNS filtering.'),
                        podkop: T('Sheepfold must not overwrite Podkop-managed routing, Dnsmasq, nftables, or sing-box state.'),
                        adguard_podkop: T('Recommended chain: Sheepfold -> AdGuard Home -> Podkop.')
                };

                return notes[mode] || notes.none;
        },

        renderIntegrations: function () {
                var self = this;
                var mode = settingValue('integration_mode', 'none');
                var modeNote = E('span', {}, this.integrationModeNotes(mode));
                var modeSelect = E('select', {
                        'class': 'cbi-input-select',
                        'change': function (ev) {
                                var nextMode = ev.currentTarget.value;

                                setSettingsDraftOptions({
                                        integration_mode: nextMode,
                                        integration_mode_source: 'manual',
                                        integration_mode_user_set: '1'
                                });
                                modeNote.textContent = self.integrationModeNotes(nextMode);
                        }
                }, [
                        ['none', T('None')],
                        ['adguard', 'AdGuard Home'],
                        ['podkop', 'Podkop'],
                        ['adguard_podkop', 'AdGuard Home + Podkop']
                ].map(function (item) {
                        return E('option', { 'value': item[0], 'selected': item[0] === mode ? 'selected' : null }, item[1]);
                }));

                return E('div', { 'class': 'sf-settings-section' }, [
                        E('div', { 'class': 'sf-form-row' }, [
                                E('label', { 'class': 'sf-field sf-field-wide' }, [
                                        E('span', {}, T('Use together with')),
                                        modeSelect,
                                        E('small', {}, T('Auto-detected during installation. You can change it manually if needed.'))
                                ])
                        ]),
                        E('div', { 'class': 'sf-grid two' }, [
                                E('div', { 'class': 'sf-box sf-status-card sf-status-warning' }, [
                                        E('h4', {}, T('AdGuard Home status')),
                                        E('p', {}, T('AdGuard Home filters DNS requests after Sheepfold allows a device. It helps block ads, trackers, and unwanted domains.')),
                                        E('strong', {}, 'API: pending'),
                                        E('p', {}, T('AdGuard Home API check should use the local AdGuard Home API when credentials are configured.'))
                                ]),
                                E('div', { 'class': 'sf-box sf-status-card sf-status-warning' }, [
                                        E('h4', {}, T('Podkop status')),
                                        E('p', {}, T('Podkop routes already allowed traffic according to its own routing rules. Sheepfold must not overwrite Podkop routing.')),
                                        E('strong', {}, 'service/package: pending'),
                                        E('p', {}, T('Podkop has no stable Sheepfold-facing API yet; detect package/service state and show conservative notes.'))
                                ])
                        ]),
                        E('div', { 'class': 'sf-note' }, [
                                E('strong', {}, T('Mode notes')),
                                modeNote
                        ]),
                        E('div', { 'class': 'sf-note' }, T('Automatic router changes must show integration-specific notes and create/export a backup before applying.')),
                        actionButton(T('Prepare integration settings'), 'danger', T('Integration setup must show planned changes, create an export, and require confirmation before applying.'))
                ]);
        },

        renderBot: function () {
                return E('div', { 'class': 'sf-settings-section' }, [
                        E('p', { 'class': 'sf-section-intro' }, T('Messenger integration lets approved parents receive notifications and control Sheepfold with short commands when they are away from home.')),
                        messengerSettingsBox()
                ]);
        },

        renderAdmins: function (embedded) {
                var table = E('div', { 'class': 'sf-admin-table' }, [
                        E('div', { 'class': 'sf-admin-row sf-admin-head' }, [
                                E('div', {}, adminSortHeader(T('Admin name'), 'name')),
                                E('div', {}, adminSortHeader(T('Login'), 'login')),
                                E('div', {}, T('Admin devices')),
                                E('div', {}, T('Actions'))
                        ])
                ].concat(admins.map(adminTableRow)));

                return E('div', { 'class': embedded ? 'sf-settings-section' : 'sf-panel' }, [
                        E('div', { 'class': 'sf-panel-head' }, [
                                E('div', {}, [
                                        E('h3', {}, T('Administrator accounts'))
                                ]),
                                E('button', {
                                        'class': 'sf-action sf-action-positive',
                                        'click': function (ev) {
                                                ev.preventDefault();
                                                showAddAdministratorModal(function (admin) {
                                                        table.appendChild(adminTableRow(admin));
                                                });
                                        }
                                }, T('Add administrator'))
                        ]),
                        table
                ]);
        },

        renderLogs: function () {
                return E('div', { 'class': 'sf-panel' }, [
                        E('div', { 'class': 'sf-panel-head' }, [
                                E('div', {}, [
                                        E('p', {}, T('The log is stored in RAM and is cleared after router reboot. Export masks sensitive fields.'))
                                ]),
                                E('div', { 'class': 'sf-toolbar sf-log-toolbar' }, [
                                        E('button', {
                                                'class': 'sf-action sf-action-danger',
                                                'click': function (ev) {
                                                        var logNode = ev.currentTarget.closest('.sf-panel').querySelector('.sf-log');

                                                        ev.preventDefault();
                                                        fs.write(logCachePath(), '').then(function () {
                                                                logEntries = [];
                                                                if (logNode)
                                                                        logNode.replaceChildren.apply(logNode, renderLogRows());
                                                                notify(T('Log cleared.'), 'info');
                                                        }, function () {
                                                                notify(T('Could not clear log.'), 'warning');
                                                        });
                                                }
                                        }, T('Clear log')),
                                        E('button', {
                                                'class': 'sf-action sf-action-neutral',
                                                'click': function (ev) {
                                                        ev.preventDefault();
                                                        showLogExportModal();
                                                }
                                        }, T('Export masked'))
                                ])
                        ]),
                        E('div', { 'class': 'sf-log' }, renderLogRows())
                ]);
        },

        renderSettingsGeneral: function () {
                return E('div', { 'class': 'sf-flat-form' }, [
                        saveSelectGlobalField(T('Application language'), 'language', 'ru', [
                                ['ru', T('Russian')],
                                ['en', T('English')]
                        ]),
                        appPortField(),
                        saveSelectGlobalField(T('New device behavior'), 'new_device_policy', 'allow', [
                                ['allow', T('Allow internet by default')],
                                ['restrict_until_configured', T('Restrict until configured')]
                        ]),
                        autoConfigureDevicesField(),
                        updateCheckInstallField(),
                        saveSelectGlobalField(T('AI provider'), 'ai_provider', 'deepseek', [
                                ['deepseek', 'DeepSeek'],
                                ['gemini', T('Gemini Free')]
                        ], null, null, T('The Android app sends AI requests to the router; the router calls the selected provider.')),
                        saveSelectGlobalField(T('AI assistant model'), 'deepseek_model', 'deepseek-v4-flash', [
                                ['deepseek-v4-flash', 'DeepSeek V4 Flash'],
                                ['deepseek-v4-pro', 'DeepSeek V4 Pro']
                        ], null, null, T('DeepSeek requests are sent from the router. The Android app does not store the API key.')),
                        globalInputOptionField(
                                T('DeepSeek API key'),
                                'deepseek_api_key',
                                '',
                                'sk-...',
                                T('Create the key in DeepSeek Platform and save it here. It is stored only on the router.'),
                                true
                        ),
                        saveSelectGlobalField(T('Gemini Free') + ' - ' + T('AI assistant model'), 'gemini_model', 'gemini-2.5-flash', [
                                ['gemini-2.5-flash', 'Gemini 2.5 Flash'],
                                ['gemini-2.5-flash-lite', 'Gemini 2.5 Flash Lite']
                        ], null, null, T('Gemini Free uses Google AI Studio free-tier limits. The API key is stored only on the router.')),
                        globalInputOptionField(
                                T('Gemini API key'),
                                'gemini_api_key',
                                '',
                                'AIza...',
                                T('Create the key in Google AI Studio and save it here. Free limits depend on Google account and region.'),
                                true
                        ),
                        blocklistEmergencyAccessField(),
                        saveSelectGlobalField(T('Known offline devices cleanup'), 'offline_device_retention_days', '90', [
                                ['30', T('30 days')],
                                ['90', T('90 days')],
                                ['180', T('180 days')]
                        ]),
                        cachePathField(),
                        globalTextareaOptionField(
                                T('Blocked internet page text shown instead of websites'),
                                'blocked_page_text',
                                T('Internet is temporarily unavailable by family rules.'),
                                T('Settings saved.'),
                                T('Could not save settings.'),
                                null,
                                2
                        )
                ]);
        },

        renderSettingsMisc: function () {
                return E('div', { 'class': 'sf-flat-form sf-misc-actions' }, [
                        settingsDivider(T('Wi-Fi settings')),
                        timeAutomationField(T('Enable Wi-Fi automatically'), 'wifi_auto_enable_mode', 'wifi_auto_enable_time', '07:00'),
                        timeAutomationField(T('Disable Wi-Fi automatically'), 'wifi_auto_disable_mode', 'wifi_auto_disable_time', '23:00'),
                        settingsDivider(T('Router time and NTP')),
                        routerTimeSettingsField(),
                        settingsDivider(T('WPS button')),
                        wpsActionField(T('WPS short button press'), 'wps_short_press_action'),
                        wpsActionField(T('WPS long button press'), 'wps_long_press_action'),
                        settingsDivider(T('Router LEDs')),
                        ledControlField(),
                        settingsDivider(T('Site list sources')),
                        siteListsUpdateIntervalField(),
                        globalTextareaOptionField(
                                T('Whitelist sources'),
                                'site_allowlist_sources',
                                defaultSiteAllowlistSources,
                                T('Whitelist sources saved.'),
                                T('Could not save whitelist sources.'),
                                T('One source per line: name | URL. Use updateable external sources instead of manually maintaining a huge list.')
                        ),
                        siteBlacklistModeField(),
                        globalTextareaOptionField(
                                T('Site blacklist sources'),
                                'site_blocklist_sources',
                                defaultSiteBlocklistSources,
                                T('Site blacklist sources saved.'),
                                T('Could not save site blacklist sources.'),
                                T('One source per line: name | URL. Use updateable external sources instead of manually maintaining a huge list.')
                        ),
                        settingsDivider(T('Other actions')),
                        saveSelectGlobalField(T('Export mode'), 'export_mode', 'safe', [
                                ['safe', T('Readable JSON without secrets')],
                                ['encrypted', T('Encrypted full backup')]
                        ]),
                        E('div', { 'class': 'sf-action-stack' }, [
                                E('button', {
                                        'class': 'sf-action sf-action-neutral',
                                        'click': function (ev) {
                                                ev.preventDefault();
                                                importSettingsAndUsers();
                                        }
                                }, T('Import all settings and user list')),
                                E('button', {
                                        'class': 'sf-action sf-action-neutral',
                                        'click': function (ev) {
                                                ev.preventDefault();
                                                exportSettingsAndUsers();
                                        }
                                }, T('Export all settings and user list')),
                                updateAppRow(),
                                rebootRouterButton()
                        ])
                ]);
        },

        renderSettingsPanel: function (tab, content) {
                return E('div', {
                        'class': 'sf-settings-panel',
                        'data-settings-panel': tab,
                        'hidden': this.activeSettingsTab === tab ? null : 'hidden'
                }, content);
        },

        renderSettings: function () {
                if (!settingsTabs.some(function (tab) { return tab[0] === this.activeSettingsTab; }, this))
                        this.activeSettingsTab = 'general';

                resetSettingsDraft();

                return E('div', { 'class': 'sf-panel' }, [
                        E('div', { 'class': 'sf-settings-tabs-row' }, [
                                this.renderSettingsTabs(),
                                settingsSaveBar(true)
                        ]),
                        this.renderSettingsPanel('info', routerInformationPanel()),
                        this.renderSettingsPanel('general', this.renderSettingsGeneral()),
                        this.renderSettingsPanel('integrations', this.renderIntegrations()),
                        this.renderSettingsPanel('messenger', this.renderBot()),
                        this.renderSettingsPanel('emergency', this.renderEmergency()),
                        this.renderSettingsPanel('misc', this.renderSettingsMisc()),
                        settingsSaveBar(false)
                ]);
        },

        renderDonation: function () {
                return E('div', { 'class': 'sf-panel' }, [
                        E('div', { 'class': 'sf-panel-head' }, [
                                E('div', {}, [
                                        E('p', {}, T('Support the project'))
                                ])
                        ]),
                        E('div', { 'class': 'sf-flat-form' }, [
                                E('p', {}, T('If Sheepfold becomes useful and you want to support development, donation links will be added here before the first public release.')),
                                E('p', {}, T('Possible options:')),
                                E('ul', {}, [
                                        E('li', {}, T('GitHub Sponsors for international audience;')),
                                        E('li', {}, T('Boosty or YooMoney for Russian-speaking users.'))
                                ])
                        ])
                ]);
        },

        renderPanel: function (tab, content) {
                return E('section', {
                        'class': 'sf-tab-panel',
                        'data-tab': tab,
                        'hidden': this.activeTab === tab ? null : 'hidden'
                }, content);
        },

        renderPanels: function () {
                return [
                        this.renderPanel('users', this.renderUsers()),
                        this.renderPanel('management', this.renderManagement()),
                        this.renderPanel('wifi', this.renderWifi()),
                        this.renderPanel('logs', this.renderLogs()),
                        this.renderPanel('settings', this.renderSettings()),
                        this.renderPanel('donation', this.renderDonation())
                ];
        },

        render: function () {
                // Версия ассетов берётся из UCI, куда postinst пишет PKG_VERSION-PKG_RELEASE.
                // Это сохраняет единый cache-busting для JS/CSS и избавляет пользователя
                // от ручной очистки кэша браузера после обновления пакета.
                var assetVersion = safeUciGet('sheepfold', 'global', 'ui_asset_version', '0.1.0');
                var self = this;
                var internetBlocked = this.isGlobalInternetBlocked();
                var allowlistCount = devices.filter(function (device) { return device.status === 'allow'; }).length;
                var blocklistCount = devices.filter(function (device) { return device.status === 'blocked'; }).length;
                var restrictedCount = devices.filter(function (device) {
                        return device.status === 'restricted' || device.status === 'scheduled';
                }).length;
                var cssHref = L.resource('sheepfold/sheepfold.css') + '?v=' + encodeURIComponent(assetVersion);
                var page;
                var header = E('div', { 'class': 'sf-header' }, [
                        E('div', {}, [
                                E('h2', {}, T('Sheepfold Family Internet Control')),
                                E('p', {}, T('Visual test build. Router rules and persistence are not active yet.'))
                        ]),
                        E('div', { 'class': 'sf-header-actions' }, [
                                this.internetToggleButton(T('Internet enabled'), 'positive', false, internetBlocked, T('Global block would be disabled after confirmation.')),
                                this.internetToggleButton(T('Internet disabled'), 'danger', true, internetBlocked, T('Global block would block every device except allowlist.'))
                        ])
                ]);

                this.applyInitialDeepLinkState();
                acknowledgeNewDeviceLedAlert('luci');

                if (!rootPasswordIsSet) {
                        return E('div', { 'class': 'sf-page' }, [
                                E('link', { 'rel': 'stylesheet', 'href': cssHref }),
                                header,
                                this.renderRootPasswordStatus()
                        ]);
                }

                page = E('div', { 'class': 'sf-page' }, [
                        E('link', { 'rel': 'stylesheet', 'href': cssHref }),
                        header,
                        E('div', { 'class': 'sf-metrics' }, [
                                metric(T('Devices'), String(devices.length), 'neutral', function (button) {
                                        self.openUserListMetric(button, 'devices');
                                }),
                                metric(T('Allowlist'), String(allowlistCount), 'positive', function (button) {
                                        self.openUserListMetric(button, 'allowlist');
                                }),
                                metric(T('Restricted'), String(restrictedCount), 'warning', function (button) {
                                        self.openUserListMetric(button, 'devices');
                                }),
                                metric(T('Blocklist'), String(blocklistCount), 'danger', function (button) {
                                        self.openUserListMetric(button, 'blocklist');
                                })
                        ]),
                        this.renderTabs(),
                        E('div', { 'class': 'sf-panels' }, this.renderPanels())
                ]);

                this.runInitialDeepLinkAction();

                return page;
        }
});
