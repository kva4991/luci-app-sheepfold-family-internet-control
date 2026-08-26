# ADR-0027: Необязательный local-first relay семейных сообщений

- Статус: Принято
- Состояние реализации: protocol и synthetic-only server pilot за DNS/TLS/Caddy реализованы;
  Android client foundation сохранён как незавершённый выключенный handoff с известными gaps,
  без production provisioning/UI/lifecycle и завершённых API 28 device/field gates; OpenWrt runtime
  отсутствует; `clientsReady=no`, `realDataAllowed=no`
- Дата: 2026-08-26
- Теги: `§mrelay1`, `§k5rf0hb`, `§q3nj8wd`
- Связанные документы: [параметры relay](../../android-router-message-relay.ru.md), [сообщения](../../messaging.ru.md), [Android/OpenWRT API](../../android-openwrt-api.ru.md), [доступ в домашней сети](../../home-network-access.ru.md)

## Контекст

Родительскому APK нужны короткие команды и уведомления вне дома, но домашний роутер обычно
находится за NAT. Полный Android API, LuCI, SSH и первичное сопряжение намеренно остаются в
доверенной домашней сети. Внешний сервер не должен становиться обязательным для семейных правил
или постоянным туннелем к LAN.

## Рассмотренные варианты

1. Открыть API `5201` на WAN. Отклонено: публикует административную поверхность и ломает
   локальную device binding.
2. Постоянный FRP/VPN с проксированием всего API. Отклонено: смешивает семейные сообщения с
   временной техподдержкой и даёт избыточный доступ.
3. WebSocket/MQTT/FCM. Отложено: добавляет runtime и battery/network complexity; FCM создаёт
   внешнюю зависимость и всё равно не должен быть источником команд.
4. Короткие E2E-encrypted сообщения через HTTPS long poll с local-first fallback. Выбрано.

## Решение

- Первичное `SF2` pairing остаётся локальным; детский APK не участвует в v1.
- Один общий route selector сначала выполняет короткий SPKI-pinned local probe. SSID/BSSID сам по
  себе не является доказательством домашней сети.
- Роутер постоянно держит один 25-секундный исходящий HTTPS long poll. Нормальный бюджет начала
  обработки на маломощном OpenWrt — до 30 секунд.
- Envelope создаётся один раз. Local и relay передают одинаковые `messageId`, sequence, срок,
  metadata и ciphertext; смена маршрута не повторяет side effect.
- Relay хранит opaque ciphertext до явного `ack` или TTL и не проксирует полный API.
- Содержимое защищает `HMAC-SHA256+AES-256-GCM`: два независимых направленных master key передаются
  телефону и роутеру только через существующий pinned local HTTPS, а для каждого `messageId`
  выводится отдельный AES key. Relay этих ключей не получает.
- Router и phone transport credentials случайны, независимы от local Android Bearer и хранятся
  сервером только как SHA-256. Обычный HTTP, raw IP и token в URL запрещены.
- Перед каждым side effect роутер повторно проверяет актуальную administrator-device binding,
  чёрный список устройств и identity quarantine. Server acceptance не означает execution.
- Server и client caches сохраняют последний проверенный endpoint; обновление разрешено только
  подписанным manifest. Серверный сбой не меняет локальный UCI/firewall/pairing.
- На общем хосте message relay и техническая поддержка имеют разные процессы, UID, storage,
  paths, credentials и rate limits.

## Почему эти детали обязательны

- Повторное чтение mailbox после регистрации waiter закрывает lost-wakeup race long polling.
- Явный идемпотентный `ack` даёт at-least-once delivery и допускает безопасный повтор после
  потерянного HTTP-ответа; dedup ledger роутера превращает повторы в один side effect.
- Boot jitter не даёт всем роутерам одновременно переподключиться после аварии питания сервера.
- Реальный local probe не требует Android location permission ради SSID и не отправляет local
  Bearer случайному роутеру с похожим именем сети.
- Отдельные направленные master key разделяют направления, а HMAC-SHA256 выводит message-key из
  exact metadata со свежим 128-битным `messageId`. Поэтому rollback счётчика может повторить IV,
  но не пару AES key/IV; durable `sequence` всё равно обязателен для replay/order и exact retry.

## Последствия

- Локальное управление не зависит от VPS.
- Relay-компрометация раскрывает routing metadata и позволяет DoS/replay ciphertext, но не
  расшифрование и не создание валидной команды.
- В background Android без push delivery является best effort; 30 секунд относятся к router poll,
  а не к гарантии показа уведомления спящим телефоном.
- Synthetic-only DNS/TLS/Caddy boundary развёрнут, health/negative/reboot gates пройдены; server
  остаётся loopback-only, а `8790` не открыт в WAN.
- Всё ещё требуются отдельно согласованный OpenWrt native helper/runtime, Android production
  provisioning/UI/lifecycle wiring, cross-runtime vectors и live tests. Enrollment не создавался,
  реальные credentials и семейные данные не использовались.

## Проверка

- `tests/familyMessageRelayProtocol.test.mjs` проверяет AES-GCM vector и strict protocol.
- `tests/familyMessageRelayArchitecture.test.mjs` проверяет local-first/security/status contract.
- Private server tests проверяют credential lifecycle, bounded mailbox, long-poll wakeup/abort,
  idempotency, HTTP auth и OpenWrt package defaults.

Тесты на Windows и server synthetic gates не заменяют Android API 28, живой OpenWrt и client-side
power-loss testing.

## Когда пересматривать

- Если один long poll не помещается в ресурсный бюджет минимального роутера.
- Если self-hosted push даст доказуемо лучший Android background режим без расширения доверия.
- Если потребуется полный remote API, постоянный tunnel или участие детского APK: это отдельное ADR,
  а не незаметное расширение relay v1.
