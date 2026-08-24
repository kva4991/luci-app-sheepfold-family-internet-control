# ADR-0025: Сквозное шифрование баг-репортов родительского APK

- Статус: Принято
- Дата: 2026-08-24
- Теги: `§feedback`, `§srep001`, `§rsuppeer`
- Связанные документы: `docs/support-report-transport.ru.md`, ADR-0023, `docs/privacy.ru.md`

## Контекст

Старый мобильный feedback проходил через домашний роутер в Yandex Cloud открытым для этих
двух узлов JSON. Для будущего собственного сервера техподдержки это создаёт лишнюю точку чтения
пользовательского текста и смешивает форму отзывов с legacy cloud storage. При этом браузерный
LuCI пока не имеет проверенного HPKE runtime.

## Рассмотренные варианты

1. Оставить общий Yandex Cloud маршрут для LuCI и APK. Отклонено для APK: собственная очередь
   уже проектируется, а центральному узлу не требуется видеть plaintext.
2. Шифровать на домашнем роутере. Отклонено: роутер тогда видит текст и может сформировать
   payload, отличающийся от показанного пользователю.
3. Шифровать в родительском APK после точного preview, подписывать ciphertext отдельной identity
   роутера и расшифровывать только на операторском ноутбуке. Выбрано.
4. Немедленно перевести LuCI тем же изменением. Отложено: собственная реализация HPKE в JS
   недопустима, а подходящий встроенный OpenWrt/LuCI primitive ещё не выбран и не протестирован.

## Решение

Родительское APK строит строгий `support-report-v1`, показывает форматированный JSON и шифрует
те же байты Tink HPKE. Роутер принимает только ciphertext, создаёт Ed25519 signed envelope и
отправляет его по HTTPS без redirect. Сервер принимает только известный recipient key ID и
хранит opaque payload атомарно. Private key находится только у operator client.

Legacy `/feedback` и Yandex Cloud временно остаются только для LuCI. Детское APK не получает
ни один маршрут. Production-настройки нового канала пусты до готовности сервера и ключей.

## Последствия

- домашний и центральный роутеры не читают текст мобильного отчёта;
- точный preview становится частью security boundary и покрывается тестом;
- диагностика строится в APK из router-info по явному whitelist;
- public key можно распространять с конфигурацией, private key нельзя помещать в Git/CI/router;
- ротация требует периода одновременного принятия двух key ID;
- временно существуют разные transports у LuCI и APK, что должно быть явно подписано в docs;
- Android получает небольшую проверенную зависимость Google Tink вместо собственной криптографии.

## Проверка

- static test запрещает Android `/feedback`, private keyset и скрытые household identifiers;
- instrumentation test генерирует HPKE-пару, шифрует production utility и расшифровывает
  операторским private key с тем же context info;
- router shell syntax и canonical sign order проверяются отдельно;
- private server tests проверяют подпись, неизвестный key ID, rate limits, atomic queue,
  конфликт report ID и восстановление metadata после прерванной записи.

## Когда пересматривать

- LuCI получает проверенный HPKE primitive и может перейти с legacy cloud;
- operator client меняет key format или crypto suite;
- CGI заменяется versioned JSON API с другим безопасным пределом размера;
- независимый security review требует enrollment/attestation router identity для report plane.
