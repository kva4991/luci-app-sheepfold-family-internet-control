'use strict';
'require view';
'require ui';
'require uci';

var devices = [
        {
                id: 'D-0001',
                name: 'Телефон родителя',
                ip: '192.168.1.21',
                mac: 'A4:5E:60:12:34:56',
                group: 'Родители',
                status: 'allow',
                note: 'Всегда доступен, устройство администратора',
                adminDevice: true,
                adminOwner: 'Владелец',
                adminLogin: 'owner'
        },
        {
                id: 'D-0002',
                name: 'Планшет ребёнка',
                ip: '192.168.1.43',
                mac: '58:2F:40:AA:18:10',
                group: 'Дети',
                status: 'scheduled',
                note: 'Расписание учебного дня, отбой 21:00'
        },
        {
                id: 'D-0003',
                name: 'Телевизор в гостиной',
                ip: '192.168.1.77',
                mac: 'F0:99:BF:70:22:09',
                group: 'ТВ / медиа',
                status: 'restricted',
                note: 'Разрешён после времени для уроков'
        },
        {
                id: 'D-0004',
                name: 'Неизвестное устройство',
                ip: '192.168.1.98',
                mac: 'DC:A6:32:8C:00:19',
                group: 'Не настроено',
                status: 'new',
                note: 'Обнаружено по данным роутера'
        },
        {
                id: 'D-0005',
                name: 'Старая игровая приставка',
                ip: '192.168.1.64',
                mac: '00:1F:16:CC:90:02',
                group: 'Дети',
                status: 'blocked',
                note: 'Чёрный список'
        }
];

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
                name: 'Владелец',
                login: 'owner',
                role: 'owner',
                deviceIds: ['D-0001']
        },
        {
                name: 'Мама',
                login: 'mama',
                role: 'admin',
                deviceIds: ['D-0002', 'D-0003']
        }
];

var quickAllowlistCandidates = [
        {
                name: 'iPhone гостя',
                ip: '192.168.1.104',
                mac: '8C:85:90:44:11:2A',
                joinedAgo: '7 sec ago'
        },
        {
                name: 'Android ученика',
                ip: '192.168.1.105',
                mac: '34:2E:B7:91:8A:10',
                joinedAgo: '18 sec ago'
        }
];

var rootPasswordIsSet = true;

var translations = {
        'All devices': 'Все устройства',
        'User lists': 'Списки пользователей',
        'Allowlist': 'Белый список',
        'Blocklist': 'Чёрный список',
        'Schedules': 'Расписания',
        'Emergency-useful sites': 'Аварийно-полезные сайты',
        'Wi-Fi': 'Wi-Fi',
        'Integrations': 'Интеграции',
        'Messenger': 'Мессенджер',
        'Administrators': 'Администраторы',
        'Logs': 'Журнал',
        'Settings': 'Настройки',
        'Misc': 'Разное',
        'Scheduled': 'По расписанию',
        'Restricted': 'Ограничено',
        'New': 'Новое',
        'This action is a visual prototype only.': 'Это действие работает только как визуальная заглушка.',
        'Configure': 'Настроить',
        'Device editor is not implemented in this visual test build.': 'Редактор устройства не реализован в этой визуальной тестовой сборке.',
        'ID': 'ID',
        'Bind devices': 'Привязать устройства',
        'Device binding': 'Привязка устройств',
        'Select administrator devices': 'Выберите устройства администратора',
        'Selected administrator devices can manage Sheepfold.': 'Выбранные устройства смогут управлять программой.',
        'Blocklisted devices are not available for binding.': 'Устройства из чёрного списка недоступны для привязки.',
        'Selected devices are shown first.': 'Выбранные устройства показаны сверху.',
        'No devices selected': 'Устройства не выбраны',
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
        'Administrator settings': 'Настройки администратора',
        'Admin name': 'Имя',
        'Temporary password': 'Временный пароль',
        'Show temporary password': 'Показать временный пароль',
        'Hide temporary password': 'Скрыть временный пароль',
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
        'IP address': 'IP-адрес',
        'MAC address': 'MAC-адрес',
        'Group': 'Группа',
        'Status': 'Статус',
        'Actions': 'Действия',
        'Detected automatically from router leases, ARP/neighbor data, and static DHCP leases.': 'Обнаруживаются автоматически из аренд DHCP, ARP/neighbor-данных и постоянных аренд DHCP.',
        'Search by name, IP, or MAC': 'Поиск по имени, IP или MAC',
        'Search by name, IP, MAC, or ID': 'Поиск по имени, IP, MAC или ID',
        'Add manually': 'Добавить вручную',
        'Manual MAC-based add form is not implemented in this visual test build.': 'Ручное добавление по MAC пока не реализовано в этой визуальной сборке.',
        'These devices are never blocked by global blocking or schedules.': 'Эти устройства не блокируются глобальной блокировкой и расписаниями.',
        'Add device': 'Добавить устройство',
        'The UI must prevent adding the same MAC to allowlist and blocklist.': 'Интерфейс должен запрещать добавление одного MAC одновременно в белый и чёрный список.',
        'Quick add to allowlist': 'Быстрое добавление в белый список',
        'Quick allowlist add': 'Быстрое добавление в белый список',
        'Scan Wi-Fi QR, then add newly connected devices manually.': 'Отсканируйте QR Wi-Fi, затем вручную добавьте только что подключившиеся устройства.',
        'Wi-Fi access QR': 'QR подключения к Wi-Fi',
        'Newly connected devices': 'Только что подключившиеся устройства',
        'Connection allowed': 'Разрешено подключение',
        'Connection window expired': 'Окно подключения истекло',
        'Click to restart the 30 second window.': 'Нажмите, чтобы снова запустить окно на 30 секунд.',
        'seconds left': 'секунд осталось',
        'Connected after quick add started.': 'Подключились после запуска быстрого добавления.',
        'Add': 'Добавить',
        'Candidate would be added to allowlist after confirmation.': 'Кандидат будет добавлен в белый список после подтверждения.',
        'Quick mode only collects candidates. A parent still presses Add for every device.': 'Быстрый режим только собирает кандидатов. Родитель всё равно нажимает "Добавить" для каждого устройства.',
        'Blocklisted devices cannot access the internet, LuCI, SSH, or the Sheepfold API.': 'Устройства из чёрного списка не могут открывать интернет, LuCI, SSH и Sheepfold API.',
        'Blocklist changes require confirmation.': 'Изменения чёрного списка требуют подтверждения.',
        'Emergency-useful sites for blocklisted devices require a separate explicit setting and still do not open router access.': 'Доступ к аварийно-полезным сайтам для чёрного списка требует отдельной явной настройки и всё равно не открывает доступ к роутеру.',
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
        'Emergency-useful sites are a small editable list of necessary services that may stay available during restricted access.': 'Аварийно-полезные сайты — это небольшой редактируемый список необходимых сервисов, которые могут оставаться доступными при ограничении интернета.',
        'Add site': 'Добавить сайт',
        'Edit site': 'Редактировать сайт',
        'Delete site': 'Удалить сайт',
        'URL address': 'URL адрес',
        'Name': 'Название',
        'Description': 'Описание',
        'Cancel': 'Отмена',
        'Site changes would be saved after confirmation.': 'Изменения сайта будут сохранены после подтверждения.',
        'Site would be removed after confirmation.': 'Сайт будет удалён после подтверждения.',
        'Do not add broad yandex.ru by default: it can open video, music, games, feeds, and other non-emergency services.': 'Не добавляйте широкий yandex.ru по умолчанию: он может открыть видео, музыку, игры, ленты и другие неаварийные сервисы.',
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
        'MAX experimental': 'MAX экспериментально',
        'VK is shown first during setup, but activation requires credentials and an approved admin.': 'VK предлагается первым при настройке, но включение требует данных доступа и разрешённого администратора.',
        'Approved admin ID': 'ID разрешённого администратора',
        'Stored on the router.': 'Хранится на роутере.',
        'Administrator accounts': 'Учётные записи администраторов',
        'Each administrator has a unique display name, login, and password stored on the router.': 'У каждого администратора есть уникальное имя, логин и пароль, хранящиеся на роутере.',
        'Add administrator': 'Добавить администратора',
        'Adding a new administrator requires confirmation.': 'Добавление администратора требует подтверждения.',
        'Unique name': 'Уникальное имя',
        'Login': 'Логин',
        'Admin devices': 'Админские устройства',
        'Commands': 'Команды',
        'show all devices': 'показать все устройства',
        'block internet': 'выключить интернет',
        'unblock internet': 'включить интернет',
        'grant +30 minutes': 'дать +30 минут',
        'status': 'статус',
        'Administrative action log with masking.': 'Журнал действий администраторов с маскированием.',
        'Clear log': 'Очистить журнал',
        'Clearing logs requires confirmation.': 'Очистка журнала требует подтверждения.',
        'Export masked': 'Экспорт с маскированием',
        'Masked log export is not implemented in this visual test build.': 'Экспорт журнала с маскированием пока не реализован в этой визуальной сборке.',
        'Owner granted +30 minutes to Child tablet': 'Владелец дал +30 минут устройству "Планшет ребёнка"',
        'New device detected: #4, DC:A6:32:xx:xx:19, IP 192.168.1.98': 'Обнаружено новое устройство: #4, DC:A6:32:xx:xx:19, IP 192.168.1.98',
        'Global block disabled by owner': 'Глобальная блокировка выключена владельцем',
        'General': 'Общие',
        'Application language': 'Язык приложения',
        'Russian': 'Русский',
        'English': 'Английский',
        'New device behavior': 'Поведение для новых устройств',
        'Allow internet by default': 'Разрешать интернет по умолчанию',
        'Restrict until configured': 'Ограничивать до настройки',
        'Known offline devices cleanup': 'Очистка логов устройств офлайн',
        '30 days': '30 дней',
        '90 days': '90 дней',
        '180 days': '180 дней',
        'Export and update': 'Экспорт и обновление',
        'Import and export': 'Импорт и экспорт',
        'Export mode': 'Режим экспорта',
        'Readable JSON without secrets': 'Читаемый JSON без секретов',
        'Encrypted full backup': 'Зашифрованный полный бэкап',
        'Blocked page text': 'Текст страницы блокировки',
        'Internet is temporarily unavailable by family rules.': 'Интернет временно недоступен по семейным правилам.',
        'Update app': 'Обновить приложение',
        'Application update requires confirmation.': 'Обновление приложения требует подтверждения.',
        'Reboot router': 'Перезагрузить роутер',
        'Router reboot requires confirmation.': 'Перезагрузка роутера требует подтверждения.',
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
        'Devices': 'Устройства',
        'Save': 'Сохранить',
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
        ['schedules', T('Schedules')],
        ['wifi', T('Wi-Fi')],
        ['admins', T('Administrators')],
        ['logs', T('Logs')],
        ['settings', T('Settings')]
];

var settingsTabs = [
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

function notify(message, level) {
        ui.addNotification(null, E('p', {}, message), level || 'info');
}

function badge(status) {
        var labels = {
                allow: T('Allowlist'),
                blocked: T('Blocklist'),
                scheduled: T('Scheduled'),
                restricted: T('Restricted'),
                new: T('New')
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
        var dataCodewords = 80;
        var bits = [];
        var bytes = utf8Bytes(text);
        var codewords = [];

        appendBits(bits, 0x4, 4);
        appendBits(bits, bytes.length, 8);

        bytes.forEach(function (value) {
                appendBits(bits, value, 8);
        });

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

        return codewords.concat(reedSolomonRemainder(codewords, 20));
}

function createQrMatrix(text) {
        var version = 4;
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
        addAlignment(26, 26);

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
        var matrix = createQrMatrix(text);

        return E('div', { 'class': 'sf-qr', 'aria-label': T('Pairing') },
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

function showPairingModal(device) {
        var routerAddress = '192.168.1.1';
        var apiUrl = 'http://' + routerAddress + '/sheepfold/api';
        var pairingCode = device.pairingCode || generatePairingCode();
        var pairingPayload = 'SF1|h=' + routerAddress + '|api=/sf|u=' +
                (device.adminLogin || 'owner') + '|c=' + pairingCode + '|ttl=600';

        ui.showModal(T('Pairing settings'), [
                E('div', { 'class': 'sf-modal-pairing' }, [
                        E('div', { 'class': 'sf-qr-wrap' }, [
                                qrCode(pairingPayload),
                                E('p', {}, T('Scan this QR code with the Android app to connect it to this router.'))
                        ]),
                        E('div', { 'class': 'sf-manual-settings' }, [
                                E('h4', {}, T('Manual setup')),
                                settingLine(T('Router address'), routerAddress),
                                settingLine(T('Sheepfold API URL'), apiUrl),
                                settingLine(T('Administrator login'), device.adminLogin || 'owner'),
                                settingLine(T('Pairing code'), pairingCode),
                                settingLine(T('Token lifetime'), T('10 minutes')),
                                settingLine(T('QR payload'), pairingPayload),
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
        var routerAddress = '192.168.1.1';
        var port = safeUciGet('sheepfold', 'global', 'app_port', '5201');
        var temporaryPassword = generatePairingCode();
        var pairingPayload = 'SF1|h=' + routerAddress + '|p=' + port + '|u=' +
                admin.login + '|c=' + temporaryPassword + '|ttl=600';

        ui.showModal(T('Administrator settings'), [
                E('div', { 'class': 'sf-modal-pairing' }, [
                        E('div', { 'class': 'sf-qr-wrap' }, [
                                qrCode(pairingPayload),
                                E('p', {}, T('Scan this QR code in the Android app for quick setup.'))
                        ]),
                        E('div', { 'class': 'sf-manual-settings' }, [
                                field(T('Admin name'), admin.name),
                                field(T('Login'), admin.login),
                                passwordRevealField(T('Temporary password'), temporaryPassword),
                                settingLine(T('Server IP address'), routerAddress),
                                settingLine(T('Port'), port)
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

function pairingButton(device) {
        return E('button', {
                'class': 'sf-action sf-action-pairing',
                'click': function (ev) {
                        ev.preventDefault();
                        showPairingModal(device);
                }
        }, [adminDeviceIcon(), E('span', {}, T('Pairing'))]);
}

function showQuickAllowlistModal() {
        var networks = readWifiNetworksFromUci();
        var wifiPayload = networks.length ?
                wifiQrPayload(networks[0].ssid, networks[0].password, networks[0].encryption) :
                'WIFI:T:nopass;S:;;';
        var progressFill = E('span', { 'class': 'sf-quick-progress-fill' });
        var statusText = E('span', { 'class': 'sf-quick-status-text' });
        var permitButton;
        var timer = null;
        var secondsTotal = 30;

        function startWindow() {
                var remaining = secondsTotal;

                if (timer)
                        window.clearInterval(timer);

                permitButton.classList.remove('expired');

                function tick() {
                        var percent = Math.max(0, remaining / secondsTotal * 100);

                        progressFill.style.width = percent + '%';
                        statusText.textContent = remaining > 0 ?
                                remaining + ' ' + T('seconds left') :
                                T('Connection window expired');

                        if (remaining <= 0) {
                                window.clearInterval(timer);
                                timer = null;
                                permitButton.classList.add('expired');
                        }

                        remaining--;
                }

                tick();
                timer = window.setInterval(tick, 1000);
        }

        permitButton = E('button', {
                'class': 'sf-action sf-action-positive sf-quick-permit',
                'click': function (ev) {
                        ev.preventDefault();
                        startWindow();
                }
        }, [
                E('strong', {}, T('Connection allowed')),
                E('small', {}, T('Click to restart the 30 second window.'))
        ]);

        ui.showModal(T('Quick allowlist add'), [
                E('div', { 'class': 'sf-modal-quick' }, [
                        E('div', { 'class': 'sf-qr-wrap' }, [
                                E('h4', {}, T('Wi-Fi access QR')),
                                qrCode(wifiPayload),
                                E('p', {}, T('Scan Wi-Fi QR, then add newly connected devices manually.')),
                                E('code', {}, wifiPayload)
                        ]),
                        E('div', { 'class': 'sf-quick-side' }, [
                                permitButton,
                                E('div', { 'class': 'sf-quick-progress' }, [
                                        progressFill,
                                        statusText
                                ]),
                                E('div', { 'class': 'sf-note' }, T('Quick mode only collects candidates. A parent still presses Add for every device.')),
                                E('h4', {}, T('Newly connected devices')),
                                E('div', { 'class': 'sf-quick-candidates' }, quickAllowlistCandidates.map(function (candidate) {
                                        return E('div', { 'class': 'sf-quick-candidate' }, [
                                                E('div', {}, [
                                                        E('strong', {}, candidate.name),
                                                        E('small', {}, T('Connected after quick add started.'))
                                                ]),
                                                E('div', { 'class': 'sf-mono' }, candidate.ip),
                                                E('div', { 'class': 'sf-mono' }, candidate.mac),
                                                E('small', {}, candidate.joinedAgo),
                                                actionButton(T('Add'), 'positive', T('Candidate would be added to allowlist after confirmation.'))
                                        ]);
                                }))
                        ])
                ]),
                E('div', { 'class': 'right' }, [
                        E('button', {
                                'class': 'btn cbi-button',
                                'click': function () {
                                        if (timer)
                                                window.clearInterval(timer);
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

function showSiteModal(site) {
        site = site || ['', '', ''];

        ui.showModal(site[0] ? T('Edit site') : T('Add site'), [
                E('div', { 'class': 'sf-site-modal' }, [
                        field(T('URL address'), site[0]),
                        field(T('Name'), site[1]),
                        textareaField(T('Description'), site[2]),
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
                                        notify(T('Site changes would be saved after confirmation.'), 'info');
                                        ui.hideModal();
                                }
                        }, T('Save'))
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
                                notify(T('Site would be removed after confirmation.'), 'warning');
                        })
                ])
        ]);
}

function deviceDisplayId(device) {
        var match = String(device.id || '').match(/(\d+)$/);

        return match ? String(parseInt(match[1], 10)) : String(devices.indexOf(device) + 1);
}

function deviceById(id) {
        for (var i = 0; i < devices.length; i++) {
                if (devices[i].id === id)
                        return devices[i];
        }

        return null;
}

function adminDeviceList(admin) {
        var selected = (admin.deviceIds || []).map(deviceById).filter(Boolean);

        if (!selected.length)
                return E('span', { 'class': 'sf-muted' }, T('No devices selected'));

        return E('div', { 'class': 'sf-admin-device-list' }, selected.map(function (device) {
                return E('div', {}, [
                        E('span', { 'class': 'sf-admin-device-list-id' }, '#' + deviceDisplayId(device)),
                        E('span', {}, device.name)
                ]);
        }));
}

function showAdminDeviceBindingModal(admin, onSave) {
        var selected = {};
        var filterInput = E('input', {
                'class': 'cbi-input-text sf-search sf-binding-filter',
                'placeholder': T('Search by name, IP, MAC, or ID')
        });
        var table = E('div', { 'class': 'sf-binding-table' });

        (admin.deviceIds || []).forEach(function (id) {
                selected[id] = true;
        });

        function matchesFilter(device, needle) {
                if (!needle)
                        return true;

                return [
                        deviceDisplayId(device),
                        device.id,
                        device.name,
                        device.ip,
                        device.mac,
                        device.group
                ].join(' ').toLowerCase().indexOf(needle) !== -1;
        }

        function sortedRows() {
                return devices.filter(function (device) {
                        return device.status !== 'blocked';
                }).sort(function (left, right) {
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
                        return matchesFilter(device, needle);
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
                                E('div', { 'class': 'sf-device-index' }, deviceDisplayId(device)),
                                E('div', { 'class': 'sf-device-name' }, [
                                        E('strong', {}, device.name),
                                        E('small', {}, device.group)
                                ]),
                                E('div', {}, device.ip),
                                E('div', { 'class': 'sf-mono' }, device.mac),
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

        ui.showModal(T('Device binding'), [
                E('div', { 'class': 'sf-binding-modal' }, [
                        E('div', { 'class': 'sf-section-intro' }, [
                                E('p', {}, T('Select administrator devices') + ' ' + admin.name + '. ' + T('Selected administrator devices can manage Sheepfold.')),
                                E('p', {}, T('Blocklisted devices are not available for binding.'))
                        ]),
                        E('div', { 'class': 'sf-panel-head sf-binding-toolbar' }, [
                                filterInput,
                                E('span', { 'class': 'sf-muted' }, T('Selected devices are shown first.'))
                        ]),
                        table
                ]),
                E('div', { 'class': 'sf-modal-actions right' }, [
                        E('button', {
                                'class': 'btn cbi-button',
                                'click': ui.hideModal
                        }, T('Cancel')),
                        E('button', {
                                'class': 'btn cbi-button cbi-button-positive',
                                'click': function () {
                                        admin.deviceIds = sortedRows().filter(function (device) {
                                                return selected[device.id];
                                        }).map(function (device) {
                                                return device.id;
                                        });
                                        if (onSave)
                                                onSave();
                                        ui.hideModal();
                                        notify(T('Device bindings saved.'), 'info');
                                }
                        }, T('Save'))
                ])
        ]);
}

function deviceTable(rows, options) {
        options = options || {};

        var tableRows = rows.map(function (device, index) {
                return E('div', { 'class': 'sf-device-row' }, [
                        E('div', { 'class': 'sf-device-index' }, deviceDisplayId(device)),
                        E('div', { 'class': 'sf-device-name' }, [
                                        E('strong', {}, [
                                                device.adminDevice ? adminCrownIcon() : '',
                                                E('span', {}, device.name)
                                        ]),
                                        E('small', {}, device.note)
                        ]),
                        E('div', {}, device.ip),
                        E('div', { 'class': 'sf-mono' }, device.mac),
                        E('div', {}, device.group),
                        E('div', {}, badge(device.status)),
                        E('div', { 'class': 'sf-row-actions' }, [
                                iconButton(T('Configure'), 'gear', 'neutral', function () {
                                        notify(T('Device editor is not implemented in this visual test build.'), 'info');
                                }),
                                options.compact ? '' : actionButton(T('+30 min'), 'positive', T('Temporary access would require confirmation.'))
                        ])
                ]);
        });

        return E('div', { 'class': 'sf-device-table' }, [
                E('div', { 'class': 'sf-device-row sf-device-head' }, [
                        E('div', {}, T('ID')),
                        E('div', {}, T('Device')),
                        E('div', {}, T('IP address')),
                        E('div', {}, T('MAC address')),
                        E('div', {}, T('Group')),
                        E('div', {}, T('Status')),
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

function wifiNetworkBox(network) {
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

        return E('div', { 'class': 'sf-box sf-wifi-network' }, [
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
        activeSettingsTab: 'general',
        globalInternetBlocked: null,
        uciLoadState: {
                sheepfold: false,
                wireless: false
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
                        })
                ]);
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
                return E('div', { 'class': embedded ? 'sf-settings-section' : 'sf-panel' }, [
                        E('div', { 'class': 'sf-panel-head' }, [
                                E('div', {}, [
                                        E('p', {}, T('Detected automatically from router leases, ARP/neighbor data, and static DHCP leases.'))
                                ]),
                                E('div', { 'class': 'sf-toolbar' }, [
                                        E('input', {
                                                'class': 'cbi-input-text sf-search',
                                                'placeholder': T('Search by name, IP, or MAC')
                                        }),
                                        actionButton(T('Add manually'), 'positive', T('Manual MAC-based add form is not implemented in this visual test build.'))
                                ])
                        ]),
                        deviceTable(devices)
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
                                        actionButton(T('Add device'), 'positive', T('The UI must prevent adding the same MAC to allowlist and blocklist.'))
                                ])
                        ]),
                        deviceTable(devices.filter(function (device) { return device.status === 'allow'; }), { compact: true })
                ]);
        },

        renderBlocklist: function (embedded) {
                return E('div', { 'class': embedded ? 'sf-settings-section' : 'sf-panel' }, [
                        E('div', { 'class': 'sf-panel-head' }, [
                                E('div', {}, [
                                        E('p', {}, T('Blocklisted devices cannot access the internet, LuCI, SSH, or the Sheepfold API.'))
                                ]),
                                actionButton(T('Add device'), 'danger', T('Blocklist changes require confirmation.'))
                        ]),
                        E('div', { 'class': 'sf-note sf-note-warning' }, T('Emergency-useful sites for blocklisted devices require a separate explicit setting and still do not open router access.')),
                        deviceTable(devices.filter(function (device) { return device.status === 'blocked'; }), { compact: true })
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

        renderSchedules: function () {
                return E('div', { 'class': 'sf-panel' }, [
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
                                E('div', { 'class': 'sf-grid two' }, networks.map(wifiNetworkBox)) :
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
                var mode = safeUciGet('sheepfold', 'global', 'integration_mode', 'none');

                return E('div', { 'class': 'sf-settings-section' }, [
                        E('div', { 'class': 'sf-form-row' }, [
                                selectField(T('Use together with'), mode, [
                                        ['none', T('None')],
                                        ['adguard', 'AdGuard Home'],
                                        ['podkop', 'Podkop'],
                                        ['adguard_podkop', 'AdGuard Home + Podkop']
                                ], T('Auto-detected during installation. You can change it manually if needed.'))
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
                                E('span', {}, this.integrationModeNotes(mode))
                        ]),
                        E('div', { 'class': 'sf-note' }, T('Automatic router changes must show integration-specific notes and create/export a backup before applying.')),
                        actionButton(T('Prepare integration settings'), 'danger', T('Integration setup must show planned changes, create an export, and require confirmation before applying.'))
                ]);
        },

        renderBot: function () {
                return E('div', { 'class': 'sf-settings-section' }, [
                        E('p', { 'class': 'sf-section-intro' }, T('Messenger integration lets approved parents receive notifications and control Sheepfold with short commands when they are away from home.')),
                        E('div', { 'class': 'sf-grid two' }, [
                                E('div', { 'class': 'sf-box' }, [
                                        selectField(T('Active messenger'), 'none', [
                                                ['none', T('Disabled')],
                                                ['vk', 'VK'],
                                                ['telegram', 'Telegram'],
                                                ['max', T('MAX experimental')]
                                        ], T('VK is shown first during setup, but activation requires credentials and an approved admin.')),
                                        field(T('Approved admin ID'), 'vk:123***789', T('Stored on the router.'))
                                ]),
                                E('div', { 'class': 'sf-box' }, [
                                        E('h4', {}, T('Commands')),
                                        E('div', { 'class': 'sf-command-list' }, [
                                                T('show all devices'),
                                                T('block internet'),
                                                T('unblock internet'),
                                                T('grant +30 minutes'),
                                                T('status')
                                        ].map(function (command) {
                                                return E('code', {}, command);
                                        }))
                                ])
                        ])
                ]);
        },

        renderAdmins: function () {
                return E('div', { 'class': 'sf-panel' }, [
                        E('div', { 'class': 'sf-panel-head' }, [
                                E('div', {}, [
                                        E('h3', {}, T('Administrator accounts')),
                                        E('p', {}, T('Each administrator has a unique display name, login, and password stored on the router.'))
                                ]),
                                actionButton(T('Add administrator'), 'danger', T('Adding a new administrator requires confirmation.'))
                        ]),
                        E('div', { 'class': 'sf-admin-table' }, [
                                E('div', { 'class': 'sf-admin-row sf-admin-head' }, [
                                        E('div', {}, T('Unique name')),
                                        E('div', {}, T('Login')),
                                        E('div', {}, T('Admin devices')),
                                        E('div', {}, T('Actions'))
                                ])
                        ].concat(admins.map(function (admin) {
                                var devicesCell = E('div', {}, adminDeviceList(admin));

                                return E('div', { 'class': 'sf-admin-row' }, [
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
                        })))
                ]);
        },

        renderLogs: function () {
                return E('div', { 'class': 'sf-panel' }, [
                        E('div', { 'class': 'sf-panel-head' }, [
                                E('div', {}, [
                                        E('p', {}, T('Administrative action log with masking.'))
                                ]),
                                E('div', { 'class': 'sf-toolbar' }, [
                                        actionButton(T('Clear log'), 'danger', T('Clearing logs requires confirmation.')),
                                        actionButton(T('Export masked'), 'neutral', T('Masked log export is not implemented in this visual test build.'))
                                ])
                        ]),
                        E('div', { 'class': 'sf-log' }, [
                                E('div', {}, [E('time', {}, '03.07.2026 20:31:12'), E('span', {}, T('Owner granted +30 minutes to Child tablet'))]),
                                E('div', {}, [E('time', {}, '03.07.2026 19:55:04'), E('span', {}, T('New device detected: #4, DC:A6:32:xx:xx:19, IP 192.168.1.98'))]),
                                E('div', {}, [E('time', {}, '03.07.2026 18:10:44'), E('span', {}, T('Global block disabled by owner'))])
                        ])
                ]);
        },

        renderSettingsGeneral: function () {
                return E('div', { 'class': 'sf-flat-form' }, [
                        selectField(T('Application language'), 'ru', [
                                ['ru', T('Russian')],
                                ['en', T('English')]
                        ]),
                        field(T('Port'), safeUciGet('sheepfold', 'global', 'app_port', '5201'), T('Used by Android app and pairing QR codes.')),
                        selectField(T('New device behavior'), 'allow', [
                                ['allow', T('Allow internet by default')],
                                ['restrict_until_configured', T('Restrict until configured')]
                        ]),
                        selectField(T('Known offline devices cleanup'), '90', [
                                ['30', T('30 days')],
                                ['90', T('90 days')],
                                ['180', T('180 days')]
                        ]),
                        textareaField(T('Blocked page text'), T('Internet is temporarily unavailable by family rules.'))
                ]);
        },

        renderSettingsMisc: function () {
                return E('div', { 'class': 'sf-flat-form sf-misc-actions' }, [
                        selectField(T('Export mode'), 'safe', [
                                ['safe', T('Readable JSON without secrets')],
                                ['encrypted', T('Encrypted full backup')]
                        ]),
                        E('div', { 'class': 'sf-action-stack' }, [
                                actionButton(T('Import all settings and user list'), 'neutral', T('Import requires confirmation.')),
                                actionButton(T('Export all settings and user list'), 'neutral', T('Default export is readable JSON without secrets.')),
                                actionButton(T('Update app'), 'danger', T('Application update requires confirmation.')),
                                actionButton(T('Reboot router'), 'danger', T('Router reboot requires confirmation.'))
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

                return E('div', { 'class': 'sf-panel' }, [
                        this.renderSettingsTabs(),
                        this.renderSettingsPanel('general', this.renderSettingsGeneral()),
                        this.renderSettingsPanel('integrations', this.renderIntegrations()),
                        this.renderSettingsPanel('messenger', this.renderBot()),
                        this.renderSettingsPanel('emergency', this.renderEmergency()),
                        this.renderSettingsPanel('misc', this.renderSettingsMisc())
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
                        this.renderPanel('schedules', this.renderSchedules()),
                        this.renderPanel('wifi', this.renderWifi()),
                        this.renderPanel('admins', this.renderAdmins()),
                        this.renderPanel('logs', this.renderLogs()),
                        this.renderPanel('settings', this.renderSettings())
                ];
        },

        render: function () {
                var assetVersion = '0.1.0-28';
                var self = this;
                var internetBlocked = this.isGlobalInternetBlocked();
                var cssHref = L.resource('sheepfold/sheepfold.css') + '?v=' + encodeURIComponent(assetVersion);
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

                if (!rootPasswordIsSet) {
                        return E('div', { 'class': 'sf-page' }, [
                                E('link', { 'rel': 'stylesheet', 'href': cssHref }),
                                header,
                                this.renderRootPasswordStatus()
                        ]);
                }

                return E('div', { 'class': 'sf-page' }, [
                        E('link', { 'rel': 'stylesheet', 'href': cssHref }),
                        header,
                        E('div', { 'class': 'sf-metrics' }, [
                                metric(T('Devices'), '5', 'neutral', function (button) {
                                        self.openUserListMetric(button, 'devices');
                                }),
                                metric(T('Allowlist'), '1', 'positive', function (button) {
                                        self.openUserListMetric(button, 'allowlist');
                                }),
                                metric(T('Restricted'), '2', 'warning', function (button) {
                                        self.openUserListMetric(button, 'devices');
                                }),
                                metric(T('Blocklist'), '1', 'danger', function (button) {
                                        self.openUserListMetric(button, 'blocklist');
                                })
                        ]),
                        this.renderTabs(),
                        E('div', { 'class': 'sf-panels' }, this.renderPanels())
                ]);
        }
});
