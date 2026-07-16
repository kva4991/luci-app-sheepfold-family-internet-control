# Канал отзывов Sheepfold через Yandex Cloud и YDB

<!-- §feedback -->

Эта инструкция настраивает необязательный канал **«Отзыв / предложения»**. LuCI и родительское Android-приложение передают сообщение сначала на домашний роутер. Роутер проверяет поля и отправляет JSON в Yandex API Gateway, закрытая Cloud Function сохраняет запись в Serverless YDB.

```text
LuCI или родительское APK
        ↓ авторизованный Sheepfold API
OpenWrt-роутер
        ↓ HTTPS
Yandex API Gateway
        ↓ служебная авторизация
Cloud Function
        ↓ metadata service + service account
Serverless YDB
```

Канал отзывов не участвует в управлении интернетом и не является обязательной облачной зависимостью Sheepfold. Если Yandex Cloud недоступен, не отправляется только отзыв.

## Что передаётся

Всегда передаются: тип сообщения, тема, текст, необязательный контакт, источник (`luci` или `android`), версия и вариант Sheepfold, случайный идентификатор установки. Идентификатор не строится из MAC, IP, серийного номера или имени роутера; Cloud Function сохраняет только его HMAC-хеш.

После отдельного флажка роутер формирует диагностический отчёт по жёсткому белому списку:

- модель роутера, OpenWrt и версия ядра;
- время работы, средняя нагрузка, свободная/общая RAM и сводка хранилища;
- состояние WAN, безопасное описание причины проблемы и ping до `ya.ru`;
- количество LAN-портов;
- количество и состояние Wi-Fi-модулей, диапазон, канал, режим и страна;
- наличие и версии AdGuard Home и Podkop;
- язык, режим интеграции и распознавания устройств, автонастройка новых устройств, глобальная блокировка, выбранный мессенджер, политика обновлений и безопасные режимы журналирования/списков сайтов;
- включён ли ИИ и название провайдера, но не API-ключ;
- количество устройств, групп, расписаний, администраторов и записей в белом/чёрном списке устройств.

Даже при установленном флажке **не передаются** полный UCI-конфиг, MAC/IP и имена устройств, имена детей или администраторов, логины, SSID/BSSID, Wi-Fi-пароли, токены ботов, chat/user ID, API-ключи, списки доменов, журнал Sheepfold, журналы активности и история сайтов. Cloud Function повторно проверяет названия и размер диагностических полей, поэтому произвольную настройку нельзя подсунуть только изменением интерфейса.

Записи автоматически удаляются YDB через 730 дней. Контакт лучше оставлять пустым, если ответ не нужен.

## 1. Подготовить Yandex Cloud

1. Войдите в [консоль Yandex Cloud](https://console.yandex.cloud/).
2. Подключите платёжный аккаунт и убедитесь, что он имеет статус `ACTIVE` или `TRIAL_ACTIVE`.
3. Создайте отдельный каталог, например `sheepfold-feedback`. Отдельный каталог упрощает контроль прав и расходов.

### Это бесплатно?

Для обычного использования формы отзывов — **практически да**, пока весь платёжный аккаунт остаётся в бесплатных месячных лимитах. По состоянию на 2 июля 2026 года Yandex Cloud бесплатно предоставляет:

- первые 100 000 запросов API Gateway в месяц;
- 1 000 000 вызовов Cloud Functions и 10 ГБ×час выполнения в месяц;
- 1 000 000 Request Units YDB и 1 ГБ хранения YDB в месяц;
- 5 ГБ приёма и 1 ГБ хранения Cloud Logging в месяц.

Несколько десятков или сотен отзывов занимают ничтожную часть этих лимитов. Однако это не безусловно бесплатный хостинг: требуется платёжный аккаунт, после превышения лимитов начинается тарификация, а бесплатные объёмы общие для всех облаков и сервисов одного платёжного аккаунта.

Чтобы исключить неприятные сюрпризы:

1. Создайте отдельный каталог `sheepfold-feedback`.
2. В Billing настройте бюджетные уведомления на небольшие суммы, например 100 и 500 рублей. Бюджет предупреждает, но сам по себе не отключает ресурсы.
3. Ограничьте Serverless YDB размером 1 ГБ, если консоль позволяет выбрать такой лимит, и задайте небольшое ограничение Request Units.
4. Не включайте provisioned instances у Cloud Function.
5. Следите за числом запросов API Gateway. Локальный лимит Sheepfold не защищает публичный адрес от постороннего трафика; для публичного релиза нужен отдельный серверный лимит и, при необходимости, профиль Smart Web Security.

## 2. Создать Serverless YDB

1. В каталоге откройте **Managed Service for YDB**.
2. Нажмите **Создать базу данных**.
3. Имя: `sheepfold-feedback`.
4. Тип базы: **Serverless**.
5. Дождитесь статуса `Running`.
6. На странице базы сохраните строку Endpoint. Она имеет две части, например:

```text
grpcs://ydb.serverless.yandexcloud.net:2135/?database=/ru-central1/.../...
```

Для Cloud Function понадобятся:

```text
YDB_ENDPOINT=grpcs://ydb.serverless.yandexcloud.net:2135
YDB_DATABASE=/ru-central1/.../...
```

Откройте вкладку **Навигация → Выполнить запрос**, вставьте содержимое [`cloud/yandex-feedback/schema.yql`](../cloud/yandex-feedback/schema.yql) и выполните запрос. Появится таблица `feedback` с TTL 730 дней.

Если таблица была создана старой версией схемы, перед публикацией новой Cloud Function выполните миграцию:

```sql
ALTER TABLE feedback ADD COLUMN diagnostics_json Utf8;
```

Свежая установка уже содержит эту колонку в `schema.yql`.

## 3. Создать сервисный аккаунт функции

1. Откройте **Identity and Access Management → Сервисные аккаунты**.
2. Создайте `sheepfold-feedback-function`.
3. На странице базы YDB выдайте этому аккаунту роль `ydb.editor` **на конкретную базу**, а не роль `editor` на весь каталог.
4. Не создавайте статический авторизованный ключ. Cloud Function получает короткоживущие учётные данные через metadata service.

## 4. Создать Cloud Function

1. Откройте **Cloud Functions** и создайте функцию `sheepfold-feedback`.
2. Создайте версию функции:
   - runtime: **Python 3.12**;
   - entrypoint: `index.handler`;
   - память: 256 МБ;
   - timeout: 15 секунд;
   - сервисный аккаунт: `sheepfold-feedback-function`.
3. Загрузите два файла из [`cloud/yandex-feedback`](../cloud/yandex-feedback/): `index.py` и `requirements.txt`.
4. Добавьте переменные окружения:

```text
YDB_ENDPOINT=grpcs://ydb.serverless.yandexcloud.net:2135
YDB_DATABASE=/ru-central1/.../...
INSTALL_ID_SALT=<случайная секретная строка не короче 32 символов>
```

Безопасную соль в PowerShell можно получить так:

```powershell
$bytes = New-Object byte[] 32
[Security.Cryptography.RandomNumberGenerator]::Fill($bytes)
[Convert]::ToHexString($bytes).ToLower()
```

Соль нельзя публиковать в GitHub. При её смене один и тот же роутер получит новый хеш, что допустимо, но нарушит непрерывность ограничения частоты.

Функцию не делайте публичной: её будет вызывать API Gateway от отдельного сервисного аккаунта.

## 5. Создать API Gateway

1. Создайте сервисный аккаунт `sheepfold-feedback-gateway`.
2. Выдайте ему роль `functions.functionInvoker` на функцию `sheepfold-feedback`.
3. Откройте **API Gateway → Создать API Gateway**.
4. Возьмите [`cloud/yandex-feedback/api-gateway.yaml.example`](../cloud/yandex-feedback/api-gateway.yaml.example), замените `<FUNCTION_ID>` и `<API_GATEWAY_SERVICE_ACCOUNT_ID>` на реальные ID и вставьте спецификацию.
5. Создайте шлюз и скопируйте его **Default domain**. Итоговый адрес будет похож на:

```text
https://d5dxxxxxxxx.apigw.yandexcloud.net/feedback
```

Публичным остаётся только узкий endpoint приёма отзывов. Cloud Function проверяет схему, белый список диагностики и длину полей, хеширует идентификатор и ограничивает одну установку пятью сообщениями в час. Роутер дополнительно разрешает три сообщения в час. Ограничение по установке не является полной защитой публичного endpoint: посторонний клиент может генерировать новые идентификаторы. Для публичного релиза нужны бюджетные уведомления, наблюдение за общим потоком и серверная защита API Gateway, например **Smart Web Security**; устаревшее расширение API Gateway `rateLimit` использовать не следует.

## 6. Подключить endpoint к Sheepfold

На тестовом роутере выполните:

```sh
uci set sheepfold.global.feedback_endpoint='https://d5dxxxxxxxx.apigw.yandexcloud.net/feedback'
uci commit sheepfold
/etc/init.d/sheepfold restart
```

Для публичного релиза разработчик может заранее добавить этот адрес в `sheepfold.uci.defaults`, чтобы обычным пользователям не пришлось видеть техническую настройку. Скрипт роутера принимает только HTTPS-адреса доменов `functions.yandexcloud.net` и `*.apigw.yandexcloud.net`.

Проверьте состояние:

```sh
/usr/libexec/sheepfold/sheepfold-router-control feedback-status
```

Ожидаемый ответ:

```text
configured=1
max_message_chars=4000
max_per_hour=3
```

После этого откройте **Sheepfold → Настройки → Отзыв / предложения** и отправьте тестовое сообщение. В APK вкладка находится в верхнем меню родительского приложения.

## 7. Читать отзывы

В YDB откройте редактор запросов и выполните:

```sql
SELECT
    created_at,
    source,
    category,
    subject,
    message,
    contact,
    app_version,
    product_variant,
    router_model,
    firmware_version,
    diagnostics_json
FROM feedback
ORDER BY created_at DESC
LIMIT 100;
```

Не выгружайте таблицу без необходимости и не пересылайте контакты третьим лицам. Для рабочих ответов лучше завести отдельный адрес поддержки.

## 8. Быстрый тест без API Gateway

Только для первого теста можно сделать Cloud Function публичной и записать адрес вида:

```text
https://functions.yandexcloud.net/<FUNCTION_ID>
```

После проверки рекомендуется вернуть функцию в закрытый режим и использовать API Gateway с сервисным аккаунтом. Публичная функция проще, но даёт меньше возможностей для защиты и наблюдения за входящим трафиком.

## Проверка перед релизом

- endpoint не зашит с ошибкой и отвечает только по HTTPS;
- функция закрыта, Gateway вызывает её через `functions.functionInvoker`;
- сервисный аккаунт функции имеет права только на нужную YDB;
- `INSTALL_ID_SALT` отсутствует в Git и логах;
- неверные и слишком большие запросы отклоняются;
- неизвестные поля диагностического отчёта отклоняются;
- в Cloud Logging не печатаются текст сообщения и контакт;
- TTL таблицы равен заявленному сроку;
- недоступность Yandex Cloud не мешает управлению роутером;
- стандартный и AI-вариант используют один и тот же канал, детское APK его не показывает.

## Официальная документация

- [Создание Serverless YDB](https://yandex.cloud/en/docs/ydb/operations/manage-databases)
- [Подключение Cloud Function к YDB из Node.js: общая схема сервисного аккаунта и metadata service](https://yandex.cloud/en/docs/ydb/tutorials/connect-from-cf-nodejs)
- [Обработчик Cloud Functions для Python](https://yandex.cloud/en/docs/functions/lang/python/handler)
- [Интеграция API Gateway с Cloud Functions](https://yandex.cloud/en/docs/api-gateway/concepts/extensions/cloud-functions)
- [Создание API Gateway](https://yandex.cloud/en/docs/api-gateway/quickstart/)
- [TTL таблиц YDB](https://ydb.tech/docs/en/yql/reference/syntax/create_table/with)
- [Бесплатные лимиты serverless-сервисов](https://yandex.cloud/en/docs/billing/concepts/serverless-free-tier)
- [Бюджетные уведомления](https://yandex.cloud/en/docs/billing/operations/budgets)
