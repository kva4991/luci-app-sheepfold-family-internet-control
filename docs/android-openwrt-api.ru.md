# API между Android-приложением Sheepfold и OpenWRT

Документ описывает целевой API для связи родительских Android-телефонов с backend-частью Sheepfold на OpenWRT-роутере.

API предназначен только для администраторских устройств родителей. Приложение не устанавливается на телефоны детей и не должно работать как скрытая слежка.

## Текущий статус реализации

Этот документ описывает целевой контракт. В текущей ветке уже есть локальный сервис на порту `5201`, discovery-файл `/.well-known/sheepfold.json` и CGI endpoint `/cgi-bin/sheepfold-api`, который отдаёт базовые сведения о роутере, версии, порте и пути API, диагностический снимок `/cgi-bin/sheepfold-api/router-info`, привязку админского телефона `/cgi-bin/sheepfold-api/pair` и ранний endpoint ИИ-помощника `/cgi-bin/sheepfold-api/ai-assistant`.

Полный authenticated API `/api/v1/*`, настоящее сопряжение телефона, одноразовые pairing token/code, refresh token и role-based authorization ещё не реализованы полностью. Текущий `POST /cgi-bin/sheepfold-api` является временной заглушкой для ранней проверки Android-соединения и не должен считаться безопасным pairing backend.

## ИИ-помощник

### POST `/cgi-bin/sheepfold-api/ai-assistant`

Текущий CGI endpoint отправляет запрос к выбранному ИИ-провайдеру от имени роутера. API-ключи хранятся в UCI-настройках роутера и не передаются в APK.

Формат запроса: `application/x-www-form-urlencoded`.

Поля:

- `provider`: `deepseek` или `gemini`;
- `model`: например `deepseek-v4-flash`, `deepseek-v4-pro`, `gemini-2.5-flash` или `gemini-2.5-flash-lite`;
- `message`: текст вопроса родителя;
- `includeInfo`: `1`, если родитель явно разрешил добавить контекст со страницы `Настройки -> Информация`;
- `includeLogs`: `1`, если родитель явно разрешил добавить журнал программы Sheepfold;
- `googleAccount`: выбранный на телефоне Google-аккаунт родителя как подпись запроса.

Перед отправкой журнала backend маскирует MAC-адреса, IP-адреса и похожие на секреты поля. APK обязан показывать отдельные переключатели для передачи диагностики и журнала, по умолчанию они выключены.

Для `deepseek` backend проксирует JSON DeepSeek Chat Completions, Android читает `choices[0].message.content`.

Для `gemini` backend вызывает Google Gemini `models/{model}:generateContent`, Android читает `candidates[0].content.parts[0].text`. В интерфейсе этот вариант называется `Gemini Free`, потому что он рассчитан на бесплатные лимиты Google AI Studio; фактические лимиты зависят от аккаунта Google, региона и текущих правил Google.

Ошибки Sheepfold возвращаются в формате:

```json
{
  "app": "sheepfold",
  "ok": false,
  "error": "deepseek_api_key_missing",
  "message": "DeepSeek API key is not configured on the router."
}
```

## Базовая схема

- Android дома подключается к роутеру напрямую по локальной сети.
- Первичное сопряжение выполняется локально: родитель открывает LuCI, создаёт/открывает администратора и сканирует QR-код или вводит ручные данные.
- Вне дома Android не должен подключаться к роутеру напрямую через VPN/WireGuard. Удалённое управление выполняется через выбранный мессенджер, который настроен на роутере.
- Один роутер может иметь несколько администраторов и несколько привязанных телефонов.

## Транспорт

Целевой основной backend Android API:

```text
http://<router-host>:5201/api/v1
```

Порт по умолчанию: `5201`. Его можно изменить в LuCI в настройке `Порт`.

Для первичного обнаружения используются или допускаются публичные endpoint-ы без авторизации:

```text
http://<router-host>/.well-known/sheepfold.json
http://<router-host>:5201/cgi-bin/sheepfold-api
http://<router-host>:5201/api/v1/ping
```

`/cgi-bin/sheepfold-api` сейчас используется как ранний lightweight endpoint. Боевой вариант должен постепенно перейти к `/.well-known/sheepfold.json` и `/api/v1/ping`.

## Формат

- Запросы и ответы: JSON.
- Кодировка: UTF-8.
- Время: ISO 8601 UTC, например `2026-07-03T20:15:30Z`.
- MAC-адреса в API передаются в верхнем регистре через двоеточия: `AA:BB:CC:DD:EE:FF`.
- Ошибки возвращаются единым форматом.

Пример ошибки:

```json
{
  "ok": false,
  "error": {
    "code": "PAIRING_TOKEN_EXPIRED",
    "message": "Pairing token expired"
  }
}
```

## Публичное обнаружение

### GET `/.well-known/sheepfold.json`

Без авторизации. Нужен, чтобы Android понял, что в текущей локальной сети действительно установлен Sheepfold.

Ответ:

```json
{
  "service": "sheepfold",
  "name": "Sheepfold Family Internet Control",
  "routerName": "OpenWRT Sheepfold",
  "apiBase": "http://192.168.2.1:5201/api/v1",
  "luciUrl": "http://192.168.2.1/cgi-bin/luci/admin/services/sheepfold",
  "version": "0.1.0"
}
```

Текущий lightweight вариант может также отдавать поля `appPort`, `apiPath` и `apiUrl` для APK-прототипа.

### GET `/cgi-bin/sheepfold-api/router-info`

Текущий CGI endpoint для диагностического снимка роутера. Его должны использовать LuCI-вкладка `Настройки -> Информация` и Android-приложение, чтобы показывать родителю одинаковые данные.

Назначение:

- показать текущее время роутера;
- показать версию Sheepfold;
- показать статус интернет-соединения и ping до `ya.ru`;
- показать версию OpenWRT/прошивки, модель роутера, uptime, нагрузку и память;
- показать Wi-Fi-модули, их состояние, диапазон, канал, страну и режим;
- показать количество LAN-портов;
- показать, установлен ли Podkop и AdGuard Home, и их версии;
- подготовить краткий `aiContextPreview`, который APK может показать родителю перед отправкой ИИ-провайдеру.

Важно: этот endpoint не должен отдавать пароли Wi-Fi, bot/API tokens, session cookies, root-пароль роутера, MAC-адреса клиентов, имена детей, списки устройств или журналы. Если Android хочет отправить этот снимок ИИ-провайдеру, APK обязан показать preview и получить отдельное явное подтверждение родителя.

Текущий CGI-прототип также поддерживает вариант:

```text
GET /cgi-bin/sheepfold-api?action=router-info
```

Пример ответа:

```json
{
  "app": "sheepfold",
  "ok": true,
  "routerName": "gen1",
  "diagnostics": {
    "currentTime": "06.07.2026 15:20:00 MSK",
    "sheepfoldVersion": "0.1.0-example",
    "internetStatus": "online",
    "internetReason": "ya.ru отвечает",
    "pingYandexMs": "12.4",
    "firmwareVersion": "OpenWrt 24.10.4",
    "routerModel": "Xiaomi Mi Router AX3000T",
    "lanPortsCount": "3",
    "podkopInstalled": "yes",
    "podkopVersion": "0.5.0",
    "adguardInstalled": "yes",
    "adguardVersion": "0.107.x"
  },
  "wifiModules": [
    {
      "name": "radio0",
      "status": "enabled",
      "band": "2g",
      "channel": "6"
    }
  ],
  "aiContextPreview": "Router model: ..."
}
```

### GET `/api/v1/ping`

Без авторизации. Нужен для быстрой проверки backend.

Ответ:

```json
{
  "ok": true,
  "service": "sheepfold",
  "routerName": "OpenWRT Sheepfold",
  "version": "0.1.0",
  "apiVersion": 1
}
```

## QR и ручное сопряжение

QR не должен содержать root-пароль роутера, LuCI session cookie, токены ботов, AI-ключи или постоянные Android credentials.

QR содержит только короткоживущие одноразовые данные:

```text
SF1|h=192.168.2.1|p=5201|u=owner|t=<one-time-token>|ttl=600
```

Поля:

- `h`: адрес роутера, который видит LuCI.
- `p`: порт Sheepfold Android API.
- `u`: логин администратора.
- `t`: одноразовый токен сопряжения.
- `ttl`: срок жизни токена в секундах.

Для ручного ввода можно показывать временный пароль вместо длинного токена:

```text
SF1|h=192.168.2.1|p=5201|u=owner|c=Ab7+qK92mN|ttl=600
```

Требования к ручному временному паролю:

- 10 случайных символов;
- наборы: `abcdefghkmnpqrstuvwxyz`, `ABCDEFGHKMNPQRSTUVWXYZ`, `2456789`, `+-*()[]{}<>?@#$%^&:;.,`;
- не больше 3 спецсимволов;
- генерируется только backend-частью роутера через криптографически стойкий генератор;
- хранится на роутере только как hash/невосстановимый секрет;
- после успешного использования немедленно помечается как `consumed`.

## Сопряжение телефона

### POST `/api/v1/pairing/consume`

Без Bearer-токена, но с одноразовым pairing token/code.

Запрос:

```json
{
  "adminLogin": "owner",
  "pairingToken": "optional-token-from-qr",
  "pairingCode": "optional-manual-code",
  "device": {
    "name": "Pixel 8 Pro",
    "platform": "android",
    "androidVersion": "15",
    "appVersion": "0.1.20",
    "wifiMacSeenByPhone": "AA:BB:CC:DD:EE:FF"
  },
  "clientPublicKey": "base64-public-key"
}
```

Ответ:

```json
{
  "ok": true,
  "router": {
    "name": "OpenWRT Sheepfold",
    "apiBase": "http://192.168.2.1:5201/api/v1"
  },
  "admin": {
    "id": "A-0001",
    "name": "Владелец",
    "login": "owner"
  },
  "phone": {
    "id": "P-0001",
    "name": "Pixel 8 Pro"
  },
  "tokens": {
    "accessToken": "short-lived-jwt-or-random-token",
    "accessExpiresIn": 900,
    "refreshToken": "long-lived-random-token"
  }
}
```

Backend обязан проверить:

- pairing token/code существует;
- token/code не истёк;
- token/code не использован ранее;
- token/code принадлежит указанному администратору;
- администратор активен;
- выбранное устройство не находится в чёрном списке;
- если включена строгая MAC-проверка, телефон виден роутеру как ожидаемое админское устройство.

## Авторизация

Все методы ниже требуют:

```http
Authorization: Bearer <accessToken>
```

Refresh token используется только для обновления access token.

### POST `/api/v1/auth/refresh`

Запрос:

```json
{
  "refreshToken": "long-lived-random-token"
}
```

Ответ:

```json
{
  "ok": true,
  "accessToken": "new-short-lived-token",
  "accessExpiresIn": 900
}
```

### POST `/api/v1/auth/logout`

## Действия по подтверждению ИИ-помощника

ИИ-помощник не выполняет действия напрямую. Он может только подготовить предложение, которое APK показывает родителю для подтверждения.

Рекомендуемый поток:

1. ИИ распознаёт намерение пользователя.
2. APK показывает карточку: что будет изменено, кого затронет, как отменить.
3. Родитель нажимает подтверждение.
4. APK вызывает backend.
5. Backend пишет административное событие в журнал.

Примеры будущих endpoint-ов:

```text
POST /api/v1/devices/{id}/static-lease
POST /api/v1/emergency-sites
POST /api/v1/groups/{id}/allowlist-only
POST /api/v1/groups/{id}/activity-log
POST /api/v1/devices/{id}/activity-log
POST /api/v1/devices/{id}/temporary-access
```

Передача MAC/IP/имён устройств/журналов ИИ-провайдеру допускается только после отдельного подтверждения со списком полей.

## Журнал интернет-активности

Журнал интернет-активности не является обычным административным журналом.

Целевые endpoint-ы:

```text
GET /api/v1/devices/{id}/activity-log/status
POST /api/v1/devices/{id}/activity-log/export
POST /api/v1/devices/{id}/activity-log/analyze
POST /api/v1/groups/{id}/activity-log
```

Требования:

- не собирать для админских устройств, белого списка и чёрного списка;
- показывать размер и период, но не показывать сырой журнал по умолчанию;
- для анализа ИИ передавать только подтверждённый период и только перечисленные поля;
- если есть только router/DNS-данные, не утверждать, что доступны заголовки видео, описания или комментарии.

Отзывает refresh token текущего телефона.

## Состояние

### GET `/api/v1/state`

Краткое состояние для главного экрана Android.

Ответ:

```json
{
  "ok": true,
  "routerName": "OpenWRT Sheepfold",
  "internet": {
    "globalBlocked": false
  },
  "counts": {
    "devices": 7,
    "allowlist": 2,
    "blocklist": 1,
    "restricted": 3
  },
  "updatedAt": "2026-07-03T20:15:30Z"
}
```

## Глобальное включение/выключение интернета

### POST `/api/v1/internet/global-block`

Запрос:

```json
{
  "blocked": true,
  "reason": "parent_button"
}
```

Ответ:

```json
{
  "ok": true,
  "internet": {
    "globalBlocked": true
  }
}
```

Правило: глобальное выключение интернета блокирует всех, кроме белого списка и явно разрешённых аварийно-полезных сайтов.

## Устройства

### GET `/api/v1/devices`

Ответ:

```json
{
  "ok": true,
  "devices": [
    {
      "id": "D-0001",
      "displayId": "#1",
      "name": "Телефон родителя",
      "mac": "A4:5E:60:12:34:56",
      "ip": "192.168.2.21",
      "hostname": "parent-phone",
      "groupId": "G-parents",
      "status": "allow",
      "adminDevice": true,
      "adminOwnerId": "A-0001",
      "lastSeenAt": "2026-07-03T20:15:30Z",
      "source": "dhcp"
    }
  ]
}
```

### POST `/api/v1/devices`

Ручное добавление устройства по MAC.

```json
{
  "mac": "AA:BB:CC:DD:EE:FF",
  "name": "Новый планшет",
  "ip": "192.168.2.50",
  "groupId": "G-children"
}
```

### PATCH `/api/v1/devices/{deviceId}`

Обновление имени, группы, статуса, постоянной аренды DHCP.

```json
{
  "name": "Планшет ребёнка",
  "ip": "192.168.2.43",
  "groupId": "G-children"
}
```

Если меняются `name` или `ip`, backend должен синхронизировать данные с OpenWRT DHCP `постоянная аренда`.

## Списки доступа

Устройство не может одновременно быть в белом и чёрном списке. Backend обязан отклонять такой конфликт, даже если frontend ошибся.

### POST `/api/v1/access/allowlist`

```json
{
  "deviceId": "D-0001"
}
```

### GET `/q/{quickAllowlistToken}`

Короткая локальная ссылка для сценария быстрого добавления телефона в белый список после подключения к Wi-Fi.

LuCI показывает эту ссылку как отдельный QR рядом с QR подключения к Wi-Fi. Телефон сначала подключается к Wi-Fi, затем открывает `/q/{quickAllowlistToken}`.

Backend роутера обязан:

- проверить TTL и одноразовость `quickAllowlistToken`;
- определить MAC телефона только по router-side данным DHCP/ARP/neighbor, а не по данным, присланным браузером телефона;
- отклонить повторное использование токена;
- не добавлять устройство, если MAC уже находится в чёрном списке;
- записать действие в журнал администраторов;
- вернуть понятную HTML-страницу результата для телефона.

Если политика проекта требует подтверждения родителем, endpoint должен добавить устройство в список кандидатов быстрого добавления, а не сразу в белый список. Если родитель явно включил режим прямого добавления по одноразовой ссылке, backend может добавить устройство в белый список сразу после всех проверок.

### DELETE `/api/v1/access/allowlist/{deviceId}`

Удаляет устройство из белого списка.

### POST `/api/v1/access/blocklist`

```json
{
  "deviceId": "D-0005",
  "allowEmergencyUsefulSites": true
}
```

### DELETE `/api/v1/access/blocklist/{deviceId}`

Удаляет устройство из чёрного списка.

## Временный доступ

### POST `/api/v1/devices/{deviceId}/temporary-access`

```json
{
  "durationMinutes": 30,
  "reason": "+30 button"
}
```

Для быстрых кнопок допустимы значения: `15`, `30`, `60`, `120`, `180`, `300`, `until_end_of_day`, `until_bedtime`.

## Группы

### GET `/api/v1/groups`

```json
{
  "ok": true,
  "groups": [
    {
      "id": "G-children",
      "name": "Дети"
    },
    {
      "id": "G-parents",
      "name": "Родители"
    }
  ]
}
```

## Расписания

### GET `/api/v1/schedules`

### POST `/api/v1/schedules`

```json
{
  "name": "Учебные дни",
  "target": {
    "type": "group",
    "id": "G-children"
  },
  "action": "allow",
  "days": ["mon", "tue", "wed", "thu", "fri"],
  "from": "07:00",
  "to": "20:30"
}
```

`action` может быть `allow` или `block`.

## Аварийно-полезные сайты

### GET `/api/v1/emergency-sites`

### POST `/api/v1/emergency-sites`

```json
{
  "domain": "gosuslugi.ru",
  "name": "Госуслуги",
  "description": "Государственные услуги",
  "enabled": true
}
```

Широкие порталы, маркетплейсы, супераппы, доставка еды, app stores и широкий `yandex.ru` не должны попадать в дефолтный список.

## Wi-Fi

### GET `/api/v1/wifi/networks`

Ответ:

```json
{
  "ok": true,
  "networks": [
    {
      "id": "radio0.default_radio0",
      "band": "2.4GHz",
      "ssid": "mySweetHome",
      "encryption": "sae-mixed",
      "channel": "auto",
      "qrPayload": "WIFI:T:WPA;S:mySweetHome;P:password;;"
    }
  ]
}
```

Пароль Wi-Fi возвращать только администраторам и только если это явно нужно для QR/редактирования.

### PATCH `/api/v1/wifi/networks/{networkId}`

Изменение SSID, пароля, защиты, канала. Требует подтверждения, потому что администратор может потерять соединение.

### GET `/api/v1/wifi/state`

Состояние всего Wi-Fi на роутере.

```json
{
  "ok": true,
  "enabled": true,
  "radios": [
    {
      "id": "radio0",
      "enabled": true,
      "band": "2.4GHz"
    },
    {
      "id": "radio1",
      "enabled": true,
      "band": "5GHz"
    }
  ],
  "autoEnable": {
    "mode": "never",
    "time": "07:00"
  },
  "autoDisable": {
    "mode": "time",
    "time": "23:00"
  }
}
```

### POST `/api/v1/wifi/enable`

Включает весь Wi-Fi на роутере. Требует подтверждения, потому что меняет состояние всех радиомодулей.

### POST `/api/v1/wifi/disable`

Выключает весь Wi-Fi на роутере. Требует подтверждения и предупреждения, что родитель может потерять подключение, если управляет роутером по Wi-Fi.

### PATCH `/api/v1/wifi/automation`

Настройки автоматического включения/выключения всего Wi-Fi.

Если сохраняется любое автоматическое выключение Wi-Fi (`autoDisable.mode = "time"`), UI обязан показать непропускаемый дисклеймер минимум на 10 секунд. Кнопка подтверждения должна называться `Я понимаю риск, продолжить` и разблокироваться только после обратного отсчёта.

Текст дисклеймера должен объяснять: когда Wi-Fi отключится, через телефон, подключённый только по Wi-Fi, пользователь не сможет включить его обратно; заранее должен быть настроен мессенджер или действие кнопки WPS для включения Wi-Fi вне расписания.

```json
{
  "autoEnable": {
    "mode": "never",
    "time": "07:00"
  },
  "autoDisable": {
    "mode": "time",
    "time": "23:00"
  }
}
```

`mode`:

- `never` — не выполнять автоматически;
- `time` — выполнять каждый день в указанное время роутера.

Backend должен использовать системное время роутера и журналировать фактическое включение/выключение.

### PATCH `/api/v1/router/buttons/wps`

Настройки короткого и долгого нажатия кнопки WPS.

```json
{
  "shortPressAction": "router_default",
  "longPressAction": "router_default"
}
```

Возможные значения:

- `router_default` — функционал роутера по умолчанию;
- `allow_wifi_connection` — дать подключиться к Wi-Fi;
- `allow_wifi_and_allowlist` — дать подключиться к Wi-Fi и добавить устройства в белый список, опасный режим;
- `disable_wifi` — отключить Wi-Fi.

Режим `allow_wifi_and_allowlist` нельзя включать без явного предупреждения: `Добавление устройств в белый список через WPS кнопку опасно так как при нажатии на неё, в течении 30 секунд - любое устройство сможет подключиться к вифи и попасть в белый список.`

Когда кнопка WPS нажимается и открывается 30-секундное окно подключения, все светодиоды должны мигать паттерном `1010000`. Один тик — полсекунды.

### PATCH `/api/v1/router/leds`

Настройка управления светодиодами роутера.

```json
{
  "mode": "router_default"
}
```

Возможные значения:

- `router_default` — функционал роутера по умолчанию;
- `off_forever` — отключить навсегда все светодиоды;
- `new_device_alert_until_luci_login` — сигнализировать светодиодами о новом устройстве до успешного авторизованного входа в LuCI.

Для `new_device_alert_until_luci_login`:

- в интерфейсе пояснение для режима сигнала показывать только при выборе этого режима: `Когда подключилось новое устройство, светодиоды на роутере зажгуться.`;
- после успешного входа в LuCI с паролем backend должен сразу вернуть дефолтное поведение светодиодов роутера;
- после просмотра уведомления о новом устройстве на телефоне любым администратором backend тоже должен сразу вернуть дефолтное поведение светодиодов роутера;
- простое открытие страницы без успешной авторизации не должно сбрасывать сигнал.

Реализация зависит от модели роутера и доступных OpenWrt LED triggers. Если устройство не поддерживает нужный режим, API должен вернуть понятную ошибку, а не молча делать вид, что настройка применена. Старое значение `blink_new_device_until_luci_seen`, если встретится в конфиге раннего прототипа, можно мигрировать в `new_device_alert_until_luci_login`.

### POST `/api/v1/router/leds/new-device-alert/ack`

Сбрасывает LED-сигнал о новом устройстве после того, как любой администратор просмотрел уведомление на телефоне или в выбранном мессенджере.

```json
{
  "source": "android",
  "notificationId": "N-0001"
}
```

Backend должен проверить, что запрос пришёл от авторизованного администратора, записать событие в журнал действий и вернуть дефолтное поведение светодиодов роутера.

### GET/POST локальной страницы блокировки

Заблокированные HTTP-запросы должны получать быстрый локальный ответ от роутера, а не бесконечную загрузку.

Требования:

- браузерные GET/HEAD-запросы получают простую HTML-страницу с текстом из `blockedPageText`;
- POST/PUT/PATCH/DELETE получают завершённый ответ `403` с JSON, если клиент принимает JSON;
- игровые консоли, роботы-пылесосы, колонки и другие IoT-устройства должны получать короткий plain text или JSON-ответ, если они не ожидают HTML;
- ответ должен содержать технический маркер вроде `X-Sheepfold-Blocked: 1`;
- страница блокировки не должна открывать доступ к LuCI, SSH или Sheepfold API.

## Администраторы и телефоны

### GET `/api/v1/admins`

### POST `/api/v1/admins`

Создаёт администратора. Требует owner-прав.

### PATCH `/api/v1/admins/{adminId}`

Обновляет имя, логин, пароль.

### POST `/api/v1/admins/{adminId}/devices`

Привязка сетевого устройства как админского.

```json
{
  "deviceIds": ["D-0001", "D-0003"]
}
```

Устройства из чёрного списка недоступны для привязки.

### GET `/api/v1/admins/{adminId}/phones`

Список телефонов, прошедших сопряжение.

### DELETE `/api/v1/admins/{adminId}/phones/{phoneId}`

Отзывает доступ конкретного телефона.

## Настройки

### GET `/api/v1/settings`

### PATCH `/api/v1/settings`

```json
{
  "language": "ru",
  "newDevicePolicy": "allow",
  "offlineDeviceRetentionDays": 90,
  "logRetention": "3d",
  "blockedPageText": "Интернет временно недоступен по семейным правилам.",
  "appPort": 5201,
  "wifiAutoEnableMode": "never",
  "wifiAutoEnableTime": "07:00",
  "wifiAutoDisableMode": "never",
  "wifiAutoDisableTime": "23:00",
  "wpsShortPressAction": "router_default",
  "wpsLongPressAction": "router_default",
  "routerLedControl": "router_default"
}
```

## Журнал

### GET `/api/v1/logs`

Параметры:

```text
?limit=100&cursor=<cursor>
```

Ответ:

```json
{
  "ok": true,
  "logs": [
    {
      "id": "L-0001",
      "time": "2026-07-03T20:15:30Z",
      "actorAdminId": "A-0001",
      "actorName": "Владелец",
      "action": "temporary_access_granted",
      "message": "Владелец дал +30 минут устройству \"Планшет ребёнка\"",
      "deviceId": "D-0002"
    }
  ],
  "nextCursor": null
}
```

Не писать в журнал: пароли, токены, API-ключи, session cookies, полные переписки, полные AI-запросы, историю сайтов, DNS-query-log всех устройств, банковские/медицинские данные.

### DELETE `/api/v1/logs`

Очистка журнала. Требует подтверждения.

## Импорт и экспорт

### GET `/api/v1/export`

Экспорт всех настроек и списка пользователей. По умолчанию без секретов.

### POST `/api/v1/import`

Импорт всех настроек и списка пользователей. Требует подтверждения и резервной копии текущих настроек.

## Подтверждение опасных действий

Для опасных действий backend может требовать двухшаговое подтверждение.

### POST `/api/v1/confirmations`

```json
{
  "action": "reboot_router",
  "payload": {}
}
```

Ответ:

```json
{
  "ok": true,
  "confirmationId": "C-0001",
  "message": "Подтвердите перезагрузку роутера"
}
```

### POST `/api/v1/confirmations/{confirmationId}/apply`

Применяет подтверждённое действие.

Опасные действия:

- перезагрузка роутера;
- обновление приложения;
- импорт настроек;
- очистка журнала;
- массовая блокировка;
- удаление правил;
- смена активного мессенджера;
- добавление нового администратора;
- изменение Wi-Fi настроек;
- включение/выключение всего Wi-Fi;
- изменение поведения WPS-кнопки;
- опасный режим WPS `allow_wifi_and_allowlist`.

## Безопасность

- Все постоянные токены хранить на роутере только как hash/невосстановимые секреты.
- Access token должен быть короткоживущим.
- Refresh token можно отозвать отдельно для каждого телефона.
- Pairing token/code одноразовый и сжигается только backend-частью роутера.
- Android не должен принимать решение о “сожжённости” токена сам.
- Все административные действия пишутся в журнал с указанием администратора и телефона.
- Экспорт логов должен маскировать MAC, IP, chat/user ID и исключать секреты.
- Обычный API журнала не должен отдавать историю сайтов или DNS-query-log устройств в Android-приложение.
- Если отдельная функция истории интернет-активности будет добавлена позже, для неё нужен отдельный opt-in API, отдельные права, исключение устройств администраторов и белого списка, короткий срок хранения и отдельное предупреждение в интерфейсе.

## Минимальный MVP порядок реализации

1. `/.well-known/sheepfold.json`
2. `/api/v1/ping`
3. `/api/v1/pairing/consume`
4. `/api/v1/auth/refresh`
5. `/api/v1/state`
6. `/api/v1/devices`
7. `/api/v1/internet/global-block`
8. `/api/v1/access/allowlist`
9. `/api/v1/access/blocklist`
10. `/api/v1/admins`
11. `/api/v1/logs`
