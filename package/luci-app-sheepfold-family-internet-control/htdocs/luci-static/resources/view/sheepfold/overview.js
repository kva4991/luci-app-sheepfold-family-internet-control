'use strict';
'require view';
'require ui';

var devices = [
        {
                name: 'Телефон родителя',
                ip: '192.168.1.21',
                mac: 'A4:5E:60:12:34:56',
                group: 'Родители',
                status: 'allow',
                note: 'Всегда доступен, устройство администратора',
                adminDevice: true,
                adminOwner: 'Владелец',
                pairingCode: 'SF-PAIR-8264'
        },
        {
                name: 'Планшет ребёнка',
                ip: '192.168.1.43',
                mac: '58:2F:40:AA:18:10',
                group: 'Дети',
                status: 'scheduled',
                note: 'Расписание учебного дня, отбой 21:00'
        },
        {
                name: 'Телевизор в гостиной',
                ip: '192.168.1.77',
                mac: 'F0:99:BF:70:22:09',
                group: 'ТВ / медиа',
                status: 'restricted',
                note: 'Разрешён после времени для уроков'
        },
        {
                name: 'Неизвестное устройство',
                ip: '192.168.1.98',
                mac: 'DC:A6:32:8C:00:19',
                group: 'Не настроено',
                status: 'new',
                note: 'Обнаружено по данным роутера'
        },
        {
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
                devices: 'Телефон родителя'
        },
        {
                name: 'Мама',
                login: 'mama',
                role: 'admin',
                devices: 'Не привязано'
        }
];

var translations = {
        'All devices': 'Все устройства',
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
        'Scheduled': 'По расписанию',
        'Restricted': 'Ограничено',
        'New': 'Новое',
        'This action is a visual prototype only.': 'Это действие работает только как визуальная заглушка.',
        'Configure': 'Настроить',
        'Device editor is not implemented in this visual test build.': 'Редактор устройства не реализован в этой визуальной тестовой сборке.',
        'Make admin device': 'Сделать админским',
        'Choose which administrator owns this device before enabling admin pairing.': 'Перед включением админского устройства нужно выбрать, какому администратору оно принадлежит.',
        'Admin device': 'Админское устройство',
        'Owner': 'Владелец',
        'Pairing': 'Сопряжение',
        'Pairing settings': 'Настройки сопряжения',
        'Scan this QR code with the Android app to connect it to this router.': 'Отсканируйте QR-код Android-приложением, чтобы подключить его к этому роутеру.',
        'The QR code must contain a short-lived one-time token, not the router root password.': 'QR-код должен содержать короткоживущий одноразовый токен, а не root-пароль роутера.',
        'Manual setup': 'Ручная настройка',
        'Router address': 'Адрес роутера',
        'Sheepfold API URL': 'URL API Sheepfold',
        'Administrator login': 'Логин администратора',
        'Pairing code': 'Код сопряжения',
        'Token lifetime': 'Срок действия токена',
        '10 minutes': '10 минут',
        'Wi-Fi MAC check': 'Проверка MAC Wi-Fi',
        'Use the real device MAC for this home Wi-Fi network.': 'Для этой домашней Wi-Fi сети используйте настоящий MAC устройства.',
        'Android should detect randomized MAC and guide the parent to Wi-Fi settings; automatic switching must not be promised.': 'Android должен обнаруживать случайный MAC и вести родителя в настройки Wi-Fi; автоматическое переключение обещать нельзя.',
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
        'Add manually': 'Добавить вручную',
        'Manual MAC-based add form is not implemented in this visual test build.': 'Ручное добавление по MAC пока не реализовано в этой визуальной сборке.',
        'These devices are never blocked by global blocking or schedules.': 'Эти устройства не блокируются глобальной блокировкой и расписаниями.',
        'Add device': 'Добавить устройство',
        'The UI must prevent adding the same MAC to allowlist and blocklist.': 'Интерфейс должен запрещать добавление одного MAC одновременно в белый и чёрный список.',
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
        'Add domain': 'Добавить домен',
        'Domain editor is not implemented in this visual test build.': 'Редактор доменов пока не реализован в этой визуальной сборке.',
        'Do not add broad yandex.ru by default: it can open video, music, games, feeds, and other non-emergency services.': 'Не добавляйте широкий yandex.ru по умолчанию: он может открыть видео, музыку, игры, ленты и другие неаварийные сервисы.',
        'Family-facing shortcut for common OpenWRT wireless settings.': 'Упрощённый семейный доступ к основным настройкам Wi-Fi OpenWRT.',
        'Apply Wi-Fi changes': 'Применить Wi-Fi',
        'Wi-Fi changes can disconnect current users and require confirmation.': 'Изменения Wi-Fi могут отключить текущих пользователей и требуют подтверждения.',
        'SSID': 'SSID',
        'Password': 'Пароль',
        'Security': 'Защита',
        'Channel': 'Канал',
        'Auto': 'Авто',
        'Use together with': 'Использование совместно с',
        'None': 'Нет',
        'Traffic order: Sheepfold -> AdGuard Home -> Podkop.': 'Порядок трафика: Sheepfold -> AdGuard Home -> Podkop.',
        'Automatic router changes must show integration-specific notes and create/export a backup before applying.': 'Автоматические изменения роутера должны показывать нюансы интеграции и создавать/экспортировать резервную копию перед применением.',
        'Active messenger': 'Активный мессенджер',
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
        'Role': 'Роль',
        'Admin devices': 'Админские устройства',
        'Admin': 'Администратор',
        'Default owner account': 'Учётная запись владельца по умолчанию',
        'Password is stored as a hash, never as plain text.': 'Пароль хранится в виде хеша, никогда открытым текстом.',
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
        'admin granted +30 minutes to Child tablet': 'администратор дал +30 минут устройству "Планшет ребёнка"',
        'new device detected: DC:A6:32:xx:xx:19': 'обнаружено новое устройство: DC:A6:32:xx:xx:19',
        'global block disabled by owner': 'глобальная блокировка выключена владельцем',
        'General': 'Общие',
        'Language': 'Язык',
        'Russian': 'Русский',
        'English': 'Английский',
        'New device behavior': 'Поведение новых устройств',
        'Allow internet by default': 'Разрешать интернет по умолчанию',
        'Restrict until configured': 'Ограничивать до настройки',
        'Known offline devices cleanup': 'Очистка известных офлайн-устройств',
        '30 days': '30 дней',
        '90 days': '90 дней',
        '180 days': '180 дней',
        'Export and update': 'Экспорт и обновление',
        'Export mode': 'Режим экспорта',
        'Readable JSON without secrets': 'Читаемый JSON без секретов',
        'Encrypted full backup': 'Зашифрованный полный бэкап',
        'Blocked page text': 'Текст страницы блокировки',
        'Internet is temporarily unavailable by family rules.': 'Интернет временно недоступен по семейным правилам.',
        'Update app': 'Обновить приложение',
        'Application update requires confirmation.': 'Обновление приложения требует подтверждения.',
        'Reboot router': 'Перезагрузить роутер',
        'Router reboot requires confirmation.': 'Перезагрузка роутера требует подтверждения.',
        'Sheepfold Family Internet Control': 'Овчарня : контроль доступа в интернет для семьи',
        'Visual test build. Router rules and persistence are not active yet.': 'Визуальная тестовая сборка. Правила роутера и сохранение настроек пока не активны.',
        'Block internet': 'Выключить интернет',
        'Global block would block every device except allowlist.': 'Глобальная блокировка заблокирует все устройства, кроме белого списка.',
        'Unblock': 'Включить',
        'Global block would be disabled after confirmation.': 'Глобальная блокировка будет выключена после подтверждения.',
        'Export': 'Экспорт',
        'Default export is readable JSON without secrets.': 'Экспорт по умолчанию — читаемый JSON без секретов.',
        'Import': 'Импорт',
        'Import requires confirmation.': 'Импорт требует подтверждения.',
        'Devices': 'Устройства'
};

function T(text) {
        return translations[text] || text;
}

var tabs = [
        ['devices', T('All devices')],
        ['allowlist', T('Allowlist')],
        ['blocklist', T('Blocklist')],
        ['schedules', T('Schedules')],
        ['emergency', T('Emergency-useful sites')],
        ['wifi', T('Wi-Fi')],
        ['integrations', T('Integrations')],
        ['admins', T('Administrators')],
        ['bot', T('Messenger')],
        ['logs', T('Logs')],
        ['settings', T('Settings')]
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

function metric(label, value, tone) {
        return E('div', { 'class': 'sf-metric sf-metric-' + tone }, [
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

function adminDeviceIcon() {
        return E('span', { 'class': 'sf-admin-device-icon', 'title': T('Admin device') }, [
                E('svg', { 'viewBox': '0 0 24 24', 'aria-hidden': 'true' }, [
                        E('path', { 'd': 'M4 5h11a2 2 0 0 1 2 2v8H2V7a2 2 0 0 1 2-2z' }),
                        E('path', { 'd': 'M1 17h17v1a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2z' }),
                        E('path', { 'd': 'M19 8h3a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1h-3a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z' })
                ])
        ]);
}

function qrPlaceholder() {
        var active = {
                0: true, 1: true, 2: true, 4: true, 6: true, 7: true, 8: true,
                9: true, 12: true, 13: true, 15: true, 17: true, 20: true,
                22: true, 23: true, 25: true, 27: true, 30: true, 31: true,
                33: true, 36: true, 38: true, 40: true, 41: true, 42: true,
                44: true, 45: true, 47: true, 48: true, 50: true, 53: true,
                55: true, 56: true, 57: true, 58: true, 60: true, 62: true
        };

        return E('div', { 'class': 'sf-qr', 'aria-label': T('Pairing') },
                Array.from({ length: 64 }, function (_, index) {
                        return E('span', { 'class': active[index] ? 'on' : '' });
                }));
}

function settingLine(label, value) {
        return E('div', { 'class': 'sf-setting-line' }, [
                E('span', {}, label),
                E('code', {}, value)
        ]);
}

function showPairingModal(device) {
        var routerAddress = '192.168.1.1';
        var apiUrl = 'http://' + routerAddress + '/sheepfold/api';

        ui.showModal(T('Pairing settings'), [
                E('div', { 'class': 'sf-modal-pairing' }, [
                        E('div', { 'class': 'sf-qr-wrap' }, [
                                qrPlaceholder(),
                                E('p', {}, T('Scan this QR code with the Android app to connect it to this router.')),
                                E('small', {}, T('The QR code must contain a short-lived one-time token, not the router root password.'))
                        ]),
                        E('div', { 'class': 'sf-manual-settings' }, [
                                E('h4', {}, T('Manual setup')),
                                settingLine(T('Router address'), routerAddress),
                                settingLine(T('Sheepfold API URL'), apiUrl),
                                settingLine(T('Administrator login'), device.adminOwner || 'owner'),
                                settingLine(T('Pairing code'), device.pairingCode || 'SF-PAIR-0000'),
                                settingLine(T('Token lifetime'), T('10 minutes')),
                                settingLine(T('Wi-Fi MAC check'), T('Use the real device MAC for this home Wi-Fi network.')),
                                E('div', { 'class': 'sf-note' }, T('Android should detect randomized MAC and guide the parent to Wi-Fi settings; automatic switching must not be promised.'))
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

function deviceTable(rows, options) {
        options = options || {};

        var tableRows = rows.map(function (device) {
                return E('div', { 'class': 'sf-device-row' }, [
                        E('div', { 'class': 'sf-device-name' }, [
                                        E('strong', {}, [
                                                device.adminDevice ? adminDeviceIcon() : '',
                                                E('span', {}, device.name)
                                        ]),
                                        E('small', {}, device.note)
                        ]),
                        E('div', {}, device.ip),
                        E('div', { 'class': 'sf-mono' }, device.mac),
                        E('div', {}, device.group),
                        E('div', {}, badge(device.status)),
                        E('div', { 'class': 'sf-row-actions' }, [
                                actionButton(T('Configure'), 'neutral', T('Device editor is not implemented in this visual test build.')),
                                device.adminDevice ? pairingButton(device) : actionButton(T('Make admin device'), 'neutral', T('Choose which administrator owns this device before enabling admin pairing.')),
                                options.compact ? '' : actionButton(T('+30 min'), 'positive', T('Temporary access would require confirmation.'))
                        ])
                ]);
        });

        return E('div', { 'class': 'sf-device-table' }, [
                E('div', { 'class': 'sf-device-row sf-device-head' }, [
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

return view.extend({
        activeTab: 'devices',

        switchTab: function (button, tab) {
                var page = button.closest('.sf-page');

                this.activeTab = tab;

                page.querySelectorAll('.sf-tab').forEach(function (node) {
                        node.classList.toggle('active', node.getAttribute('data-tab') === tab);
                });

                page.querySelectorAll('.sf-tab-panel').forEach(function (node) {
                        node.hidden = node.getAttribute('data-tab') !== tab;
                });
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

        renderDevices: function () {
                return E('div', { 'class': 'sf-panel' }, [
                        E('div', { 'class': 'sf-panel-head' }, [
                                E('div', {}, [
                                        E('h3', {}, T('All devices')),
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

        renderAllowlist: function () {
                return E('div', { 'class': 'sf-panel' }, [
                        E('div', { 'class': 'sf-panel-head' }, [
                                E('div', {}, [
                                        E('h3', {}, T('Allowlist')),
                                        E('p', {}, T('These devices are never blocked by global blocking or schedules.'))
                                ]),
                                actionButton(T('Add device'), 'positive', T('The UI must prevent adding the same MAC to allowlist and blocklist.'))
                        ]),
                        deviceTable(devices.filter(function (device) { return device.status === 'allow'; }), { compact: true })
                ]);
        },

        renderBlocklist: function () {
                return E('div', { 'class': 'sf-panel' }, [
                        E('div', { 'class': 'sf-panel-head' }, [
                                E('div', {}, [
                                        E('h3', {}, T('Blocklist')),
                                        E('p', {}, T('Blocklisted devices cannot access the internet, LuCI, SSH, or the Sheepfold API.'))
                                ]),
                                actionButton(T('Add device'), 'danger', T('Blocklist changes require confirmation.'))
                        ]),
                        E('div', { 'class': 'sf-note sf-note-warning' }, T('Emergency-useful sites for blocklisted devices require a separate explicit setting and still do not open router access.')),
                        deviceTable(devices.filter(function (device) { return device.status === 'blocked'; }), { compact: true })
                ]);
        },

        renderSchedules: function () {
                return E('div', { 'class': 'sf-panel' }, [
                        E('div', { 'class': 'sf-panel-head' }, [
                                E('div', {}, [
                                        E('h3', {}, T('Schedules')),
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
                return E('div', { 'class': 'sf-panel' }, [
                        E('div', { 'class': 'sf-panel-head' }, [
                                E('div', {}, [
                                        E('h3', {}, T('Access to emergency-useful sites')),
                                        E('p', {}, T('Editable list for necessary services during restricted access.'))
                                ]),
                                actionButton(T('Add domain'), 'positive', T('Domain editor is not implemented in this visual test build.'))
                        ]),
                        E('div', { 'class': 'sf-note' }, T('Do not add broad yandex.ru by default: it can open video, music, games, feeds, and other non-emergency services.')),
                        E('div', { 'class': 'sf-domain-list' }, emergencySites.map(function (site) {
                                return E('div', { 'class': 'sf-domain' }, [
                                        E('strong', {}, site[0]),
                                        E('span', {}, site[1]),
                                        E('small', {}, site[2])
                                ]);
                        }))
                ]);
        },

        renderWifi: function () {
                return E('div', { 'class': 'sf-panel' }, [
                        E('div', { 'class': 'sf-panel-head' }, [
                                E('div', {}, [
                                        E('h3', {}, T('Wi-Fi')),
                                        E('p', {}, T('Family-facing shortcut for common OpenWRT wireless settings.'))
                                ]),
                                actionButton(T('Apply Wi-Fi changes'), 'danger', T('Wi-Fi changes can disconnect current users and require confirmation.'))
                        ]),
                        E('div', { 'class': 'sf-grid two' }, [
                                E('div', { 'class': 'sf-box' }, [
                                        E('h4', {}, T('2.4 GHz')),
                                        field(T('SSID'), 'Sheepfold Home 2G'),
                                        field(T('Password'), '********'),
                                        selectField(T('Security'), 'sae-mixed', [
                                                ['sae-mixed', 'WPA2/WPA3 mixed'],
                                                ['psk2', 'WPA2-PSK'],
                                                ['sae', 'WPA3-SAE']
                                        ]),
                                        selectField(T('Channel'), 'auto', [
                                                ['auto', T('Auto')],
                                                ['1', '1'],
                                                ['6', '6'],
                                                ['11', '11']
                                        ])
                                ]),
                                E('div', { 'class': 'sf-box' }, [
                                        E('h4', {}, T('5 GHz')),
                                        field(T('SSID'), 'Sheepfold Home 5G'),
                                        field(T('Password'), '********'),
                                        selectField(T('Security'), 'sae-mixed', [
                                                ['sae-mixed', 'WPA2/WPA3 mixed'],
                                                ['psk2', 'WPA2-PSK'],
                                                ['sae', 'WPA3-SAE']
                                        ]),
                                        selectField(T('Channel'), 'auto', [
                                                ['auto', T('Auto')],
                                                ['36', '36'],
                                                ['44', '44'],
                                                ['149', '149']
                                        ])
                                ])
                        ])
                ]);
        },

        renderIntegrations: function () {
                return E('div', { 'class': 'sf-panel' }, [
                        E('h3', {}, T('Integrations')),
                        E('div', { 'class': 'sf-form-row' }, [
                                selectField(T('Use together with'), 'adguard_podkop', [
                                        ['none', T('None')],
                                        ['adguard', 'AdGuard Home'],
                                        ['podkop', 'Podkop'],
                                        ['adguard_podkop', 'AdGuard Home + Podkop']
                                ], T('Traffic order: Sheepfold -> AdGuard Home -> Podkop.'))
                        ]),
                        E('div', { 'class': 'sf-note' }, T('Automatic router changes must show integration-specific notes and create/export a backup before applying.'))
                ]);
        },

        renderBot: function () {
                return E('div', { 'class': 'sf-panel' }, [
                        E('h3', {}, T('Messenger')),
                        E('div', { 'class': 'sf-grid two' }, [
                                E('div', { 'class': 'sf-box' }, [
                                        E('h4', {}, T('Messenger')),
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
                        E('div', { 'class': 'sf-note' }, T('Password is stored as a hash, never as plain text.')),
                        E('div', { 'class': 'sf-admin-table' }, [
                                E('div', { 'class': 'sf-admin-row sf-admin-head' }, [
                                        E('div', {}, T('Unique name')),
                                        E('div', {}, T('Login')),
                                        E('div', {}, T('Role')),
                                        E('div', {}, T('Admin devices')),
                                        E('div', {}, T('Actions'))
                                ])
                        ].concat(admins.map(function (admin) {
                                return E('div', { 'class': 'sf-admin-row' }, [
                                        E('div', {}, [
                                                E('strong', {}, admin.name),
                                                admin.role === 'owner' ? E('small', {}, T('Default owner account')) : ''
                                        ]),
                                        E('div', { 'class': 'sf-mono' }, admin.login),
                                        E('div', {}, admin.role === 'owner' ? T('Owner') : T('Admin')),
                                        E('div', {}, admin.devices),
                                        E('div', { 'class': 'sf-row-actions' }, [
                                                actionButton(T('Configure'), 'neutral', T('This action is a visual prototype only.'))
                                        ])
                                ]);
                        })))
                ]);
        },

        renderLogs: function () {
                return E('div', { 'class': 'sf-panel' }, [
                        E('div', { 'class': 'sf-panel-head' }, [
                                E('div', {}, [
                                        E('h3', {}, T('Logs')),
                                        E('p', {}, T('Administrative action log with masking.'))
                                ]),
                                E('div', { 'class': 'sf-toolbar' }, [
                                        actionButton(T('Clear log'), 'danger', T('Clearing logs requires confirmation.')),
                                        actionButton(T('Export masked'), 'neutral', T('Masked log export is not implemented in this visual test build.'))
                                ])
                        ]),
                        E('div', { 'class': 'sf-log' }, [
                                E('div', {}, [E('time', {}, '20:31'), E('span', {}, T('admin granted +30 minutes to Child tablet'))]),
                                E('div', {}, [E('time', {}, '19:55'), E('span', {}, T('new device detected: DC:A6:32:xx:xx:19'))]),
                                E('div', {}, [E('time', {}, '18:10'), E('span', {}, T('global block disabled by owner'))])
                        ])
                ]);
        },

        renderSettings: function () {
                return E('div', { 'class': 'sf-panel' }, [
                        E('h3', {}, T('Settings')),
                        E('div', { 'class': 'sf-grid two' }, [
                                E('div', { 'class': 'sf-box' }, [
                                        E('h4', {}, T('General')),
                                        selectField(T('Language'), 'ru', [
                                                ['ru', T('Russian')],
                                                ['en', T('English')]
                                        ]),
                                        selectField(T('New device behavior'), 'allow', [
                                                ['allow', T('Allow internet by default')],
                                                ['restrict_until_configured', T('Restrict until configured')]
                                        ]),
                                        selectField(T('Known offline devices cleanup'), '90', [
                                                ['30', T('30 days')],
                                                ['90', T('90 days')],
                                                ['180', T('180 days')]
                                        ])
                                ]),
                                E('div', { 'class': 'sf-box' }, [
                                        E('h4', {}, T('Export and update')),
                                        selectField(T('Export mode'), 'safe', [
                                                ['safe', T('Readable JSON without secrets')],
                                                ['encrypted', T('Encrypted full backup')]
                                        ]),
                                        field(T('Blocked page text'), T('Internet is temporarily unavailable by family rules.')),
                                        E('div', { 'class': 'sf-toolbar' }, [
                                                actionButton(T('Update app'), 'danger', T('Application update requires confirmation.')),
                                                actionButton(T('Reboot router'), 'danger', T('Router reboot requires confirmation.'))
                                        ])
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
                        this.renderPanel('devices', this.renderDevices()),
                        this.renderPanel('allowlist', this.renderAllowlist()),
                        this.renderPanel('blocklist', this.renderBlocklist()),
                        this.renderPanel('schedules', this.renderSchedules()),
                        this.renderPanel('emergency', this.renderEmergency()),
                        this.renderPanel('wifi', this.renderWifi()),
                        this.renderPanel('integrations', this.renderIntegrations()),
                        this.renderPanel('admins', this.renderAdmins()),
                        this.renderPanel('bot', this.renderBot()),
                        this.renderPanel('logs', this.renderLogs()),
                        this.renderPanel('settings', this.renderSettings())
                ];
        },

        render: function () {
                var assetVersion = '0.1.0-6';
                var cssHref = L.resource('sheepfold/sheepfold.css') + '?v=' + encodeURIComponent(assetVersion);

                return E('div', { 'class': 'sf-page' }, [
                        E('link', { 'rel': 'stylesheet', 'href': cssHref }),
                        E('div', { 'class': 'sf-header' }, [
                                E('div', {}, [
                                        E('h2', {}, T('Sheepfold Family Internet Control')),
                                        E('p', {}, T('Visual test build. Router rules and persistence are not active yet.'))
                                ]),
                                E('div', { 'class': 'sf-header-actions' }, [
                                        actionButton(T('Block internet'), 'danger', T('Global block would block every device except allowlist.')),
                                        actionButton(T('Unblock'), 'positive', T('Global block would be disabled after confirmation.')),
                                        actionButton(T('Export'), 'neutral', T('Default export is readable JSON without secrets.')),
                                        actionButton(T('Import'), 'neutral', T('Import requires confirmation.'))
                                ])
                        ]),
                        E('div', { 'class': 'sf-metrics' }, [
                                metric(T('Devices'), '5', 'neutral'),
                                metric(T('Allowlist'), '1', 'positive'),
                                metric(T('Restricted'), '2', 'warning'),
                                metric(T('Blocklist'), '1', 'danger')
                        ]),
                        this.renderTabs(),
                        E('div', { 'class': 'sf-panels' }, this.renderPanels())
                ]);
        }
});
