# Runtime-манифесты Sheepfold

<!-- §srepdisc1 -->

Этот каталог предназначен только для маленьких machine-readable файлов, которые уже
установленный Sheepfold может прочитать без обновления пакета. Обычная документация, README,
issue и release notes никогда не являются runtime-конфигурацией.

## Резервный адрес баг-репортов

Будущий production-файл имеет фиксированный путь
`support-report-endpoint-v1.txt` и точный формат:

```text
sheepfold-support-endpoint-v1
sequence=1
endpoint=https://support.example/v1/reports
signature=<canonical-base64url Ed25519 signature>
```

Правила выпуска:

1. Private Ed25519 key создаётся и хранится офлайн; в Git, GitHub Actions, роутер и APK он не
   попадает.
2. Оператор задаёт новый HTTPS endpoint и sequence, который больше последнего принятого.
3. Signer закрытого `sheepfold-support-server` создаёт новый файл. Ручное редактирование после
   подписи запрещено.
4. Public SPKI key сначала доставляется в Sheepfold доверенным пакетом и проверяется на тестовом
   роутере.
5. Новый endpoint разворачивается и проверяется до публикации manifest.
6. Manifest публикуется обычным review/merge в `main`; после этого выполняется live-router тест
   отказа старого endpoint, проверки подписи, доставки и сохранения нового адреса.

Manifest не содержит HPKE recipient key, токены, пароли, router ID и семейные настройки. Ветка
`main` выбрана ради обновляемости адреса; доверие обеспечивается подписью, а не самим GitHub.

## Текущий статус

Production-файл `support-report-endpoint-v1.txt` намеренно отсутствует. В поставляемом UCI
`support_report_discovery_public_key` пуст, поэтому router helper завершает fallback до сетевого
запроса. Пример рядом показывает только синтаксис и не имеет действительной подписи.

Формат и причины решения зафиксированы в ADR-0026. Команда signer и операционный порядок
хранятся в закрытом серверном проекте, потому что именно там находится граница офлайн-ключа.

Точный порядок shell, Node, package, private-peer и live-router проверок, ожидаемые результаты,
частые ошибки и заведомо неверные способы запуска описаны в
[`../testing-support-endpoint-discovery.ru.md`](../testing-support-endpoint-discovery.ru.md)
(§docops1). Изменение формата, URL, ключа, sequence или fallback одновременно сверяется с
[`../mandatory-companion-changes.ru.md`](../mandatory-companion-changes.ru.md) (§cmpchg1).
