# Архитектурные решения Sheepfold

<!-- §adrproc -->

ADR хранит контекст решения, а профильный документ хранит подробное текущее устройство. Номер ADR означает порядок записи, а не важность.

| ADR | Решение | Статус | Основные теги |
|---|---|---|---|
| [0001](0001-product-variants.ru.md) | Две редакции роутерного пакета и два общих Android APK | Принято | `§prodvar` |
| [0002](0002-router-owned-api-and-pairing.ru.md) | Роутер владеет API, ключами и защищённым сопряжением | Принято | `§k5rf0hb`, `§pairtx1`, `§tlspinv2` |
| [0003](0003-uci-persistence-and-command-boundaries.ru.md) | UCI хранит настройки, а немедленные команды применяются атомарно | Принято | `§m9qe4lk`, `§listnoref` |
| [0004](0004-device-passport-and-trust.ru.md) | MAC-карточка, классификация и доверие к устройству разделены | Принято | `§devpas1`, `§devident1` |
| [0005](0005-event-driven-device-analysis.ru.md) | Анализ устройств событийный и ограниченный по ресурсам | Принято | `§detlife1` |
| [0006](0006-access-policy-and-router-protection.ru.md) | Приоритет доступа отделён от безусловной защиты роутера | Принято | `§84azytj`, `§h6mxq4c` |
| [0007](0007-site-filtering-backends.ru.md) | Sheepfold выбирает AdGuard Home либо встроенную фильтрацию | Принято | `§dompol`, `§aghplan` |
| [0008](0008-logs-and-sensitive-export.ru.md) | Обычный журнал живёт в RAM, экспорт маскирует данные | Принято | `§b3nw8vp` |
| [0009](0009-optional-ai-boundary.ru.md) | ИИ необязателен и не участвует в решении firewall | Принято | `§prodvar`, `§aiexec1` |
| [0010](0010-native-luci-and-asset-versioning.ru.md) | LuCI остаётся нативным, модульным и версионирует assets из пакета | Принято | `§frontmod`, `§assetv1` |
| [0011](0011-local-quality-gates.ru.md) | Локальные детерминированные quality gates вместо внешнего AI-score | Принято | `§qassist`, `§impact1`, `§testcat` |
| [0012](0012-android-background-work.ru.md) | Периодическая сеть через WorkManager, точное окончание доступа через AlarmManager | Принято | `§andwork1` |
| [0013](0013-strict-ai-json-boundary.ru.md) | Строгий form-urlencoded и динамический JSON AI backend через общий helper и jshn | Принято | `§jsonio1` |
| [0014](0014-coalesced-luci-action-subscribers.ru.md) | Одна backend-команда сохраняет callbacks каждого UI-инициатора | Принято | `§actsub1` |
| [0015](0015-manual-agentic-security-audit.ru.md) | Агентный security-аудит остаётся ручным консультативным слоем | Принято | `§secaudit1` |
| [0016](0016-trusted-home-network-access.ru.md) | Sheepfold доступен из явно доверенных сегментов без дополнительного кода подтверждения | Принято поэтапно | `§homen01`, `§pairux1` |

## Статусы

- `Предложено` — решение обсуждается и не является обязательным.
- `Принято` — действующий архитектурный контракт.
- `Заменено ADR-NNNN` — историческая запись; новое решение находится в указанном ADR.
- `Отклонено` — вариант рассмотрен и не выбран.

## Правило сопровождения

При изменении решения создать новый ADR на основе [шаблона](template.ru.md). Старый ADR сохраняется и получает ссылку на новый. Одновременно обновляются профильная документация, §-теги и тест, который защищает изменившийся контракт.
