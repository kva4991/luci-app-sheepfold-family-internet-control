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
                adminLogin: 'owner',
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
        'Devices': 'Устройства',
        'Save': 'Сохранить',
        'Save changes. This visual build does not use a separate Apply button.': 'Сохранить изменения. В этой визуальной сборке отдельная кнопка "Применить" не используется.',
        'Router root password check': 'Проверка root-пароля роутера',
        'Root password is set. Sheepfold settings can be opened.': 'Root-пароль задан. Настройки Sheepfold можно открывать.',
        'Root password is not set. Sheepfold settings must stay locked until the router password is configured.': 'Root-пароль не задан. Настройки Sheepfold должны быть заблокированы до установки пароля роутера.',
        'Open router password page': 'Открыть страницу пароля роутера'
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

function asciiBytes(text) {
        return text.split('').map(function (char) {
                return char.charCodeAt(0) & 0xff;
        });
}

function makeQrCodewords(text) {
        var dataCodewords = 80;
        var bits = [];
        var bytes = asciiBytes(text);
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

function showPairingModal(device) {
        var routerAddress = '192.168.1.1';
        var apiUrl = 'http://' + routerAddress + '/sheepfold/api';
        var pairingPayload = 'SF1|h=' + routerAddress + '|api=/sf|u=' +
                (device.adminLogin || 'owner') + '|c=' + (device.pairingCode || 'SF-PAIR-0000') + '|ttl=600';

        ui.showModal(T('Pairing settings'), [
                E('div', { 'class': 'sf-modal-pairing' }, [
                        E('div', { 'class': 'sf-qr-wrap' }, [
                                qrCode(pairingPayload),
                                E('p', {}, T('Scan this QR code with the Android app to connect it to this router.')),
                                E('small', {}, T('The QR code must contain a short-lived one-time token, not the router root password.'))
                        ]),
                        E('div', { 'class': 'sf-manual-settings' }, [
                                E('h4', {}, T('Manual setup')),
                                settingLine(T('Router address'), routerAddress),
                                settingLine(T('Sheepfold API URL'), apiUrl),
                                settingLine(T('Administrator login'), device.adminLogin || 'owner'),
                                settingLine(T('Pairing code'), device.pairingCode || 'SF-PAIR-0000'),
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
        var wifiPayload = 'WIFI:T:WPA;S:Sheepfold Home 5G;P:sheepfold-demo-pass;;';
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

        renderRootPasswordStatus: function () {
                return E('div', {
                        'class': 'sf-note ' + (rootPasswordIsSet ? 'sf-note-ok' : 'sf-note-danger')
                }, [
                        E('strong', {}, T('Router root password check')),
                        E('span', {}, rootPasswordIsSet ?
                                T('Root password is set. Sheepfold settings can be opened.') :
                                T('Root password is not set. Sheepfold settings must stay locked until the router password is configured.')),
                        rootPasswordIsSet ? '' : E('a', {
                                'class': 'sf-inline-link',
                                'href': L.url('admin/system/admin')
                        }, T('Open router password page'))
                ]);
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
                                E('div', { 'class': 'sf-toolbar' }, [
                                        quickAllowlistButton(),
                                        actionButton(T('Add device'), 'positive', T('The UI must prevent adding the same MAC to allowlist and blocklist.'))
                                ])
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
                var assetVersion = '0.1.0-8';
                var cssHref = L.resource('sheepfold/sheepfold.css') + '?v=' + encodeURIComponent(assetVersion);
                var header = E('div', { 'class': 'sf-header' }, [
                        E('div', {}, [
                                E('h2', {}, T('Sheepfold Family Internet Control')),
                                E('p', {}, T('Visual test build. Router rules and persistence are not active yet.'))
                        ]),
                        E('div', { 'class': 'sf-header-actions' }, [
                                actionButton(T('Save'), 'positive', T('Save changes. This visual build does not use a separate Apply button.')),
                                actionButton(T('Block internet'), 'danger', T('Global block would block every device except allowlist.')),
                                actionButton(T('Unblock'), 'positive', T('Global block would be disabled after confirmation.')),
                                actionButton(T('Export'), 'neutral', T('Default export is readable JSON without secrets.')),
                                actionButton(T('Import'), 'neutral', T('Import requires confirmation.'))
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
                                metric(T('Devices'), '5', 'neutral'),
                                metric(T('Allowlist'), '1', 'positive'),
                                metric(T('Restricted'), '2', 'warning'),
                                metric(T('Blocklist'), '1', 'danger')
                        ]),
                        this.renderRootPasswordStatus(),
                        this.renderTabs(),
                        E('div', { 'class': 'sf-panels' }, this.renderPanels())
                ]);
        }
});
