# Карта тегов (§-теги)

В документации и исходном коде Sheepfold используется система перекрёстных тегов-сносок.

---

## Что такое §-тег

Тег — это типографский символ `§` (параграф) и 7-символьный буквенно-цифровой идентификатор без пробела, заключённый в скобки:

```
(§xaji0y6)
```

**Тег — это как книжная сноска:** он ставится в месте, где уместно дать дополнительный контекст, но писать его прямо там было бы слишком длинно или не по месту. Расшифровка — в этом файле, в таблицах ниже.

Тег **не заменяет** обычный комментарий в коде или описание в документации — он дополняет: «здесь есть нюанс → смотри в карте».

---

## Инструкция для ИИ-агентов

> Этот раздел адресован ИИ-агентам, работающим с кодовой базой Sheepfold.

### Если ты встретил §-тег в коде или документации

1. **Прочти запись о нём в этом файле** — там объяснено, какое решение, ограничение или контракт скрыт за этим тегом.
2. Используй эту информацию для правильного понимания контекста до того, как вносить изменения.

### Если ты изменяешь место, где стоит §-тег

Тег — это живая связь между конкретным местом в коде/доке и записью в карте. Если ты меняешь суть этого места:

1. **Найди все вхождения этого тега в проекте:**
   ```bash
   grep -r '§XXXXXXX' .
   ```
2. **Для каждого найденного вхождения** реши: тег по-прежнему актуален там или нет.
3. **Обнови запись в этом файле** — отредактируй описание, если суть изменилась.
4. **Если тег больше не имеет смысла** — удали его из всех вхождений и удали строку из таблицы ниже.
5. **Если смысл разделился на два** — создай новый тег для нового контракта.

### Почему это важно именно для ИИ-агентов

Работа с большой кодовой базой по частям — это главное ограничение ИИ: каждый раз читается только фрагмент, без полного контекста проекта. §-теги решают именно эту проблему:

- Вместо того чтобы читать несколько файлов в поисках «а почему здесь именно так» — достаточно найти тег и прочитать одну строку в карте.
- Вместо того чтобы угадывать, есть ли ещё места с такой же логикой — `grep` по тегу даёт точный список.
- Актуальная карта тегов — это **сжатая карта критических решений проекта**, доступная в одном файле.

Если ИИ игнорирует теги или не обновляет их при изменениях — следующий агент будет работать с устаревшей картой, тратить время на разбор контекста заново и рискует повторить уже принятые решения неправильно.

**Своевременное обновление карты тегов — это вклад в качество работы всех, кто придёт после.**

---

## Правила расстановки

### Когда тег нужен

Ставить §-тег стоит не везде, а только там, где он действительно экономит время и снижает риск ошибок.

Тег нужен, если выполняется хотя бы одно из условий:

- За этим местом стоит **неочевидное архитектурное решение**, которое трудно понять только по локальному куску кода.
- Это место связано с **другими местами в проекте**, которые тоже нужно менять синхронно.
- Здесь действует **важное ограничение, контракт или инвариант**, который легко случайно нарушить.
- Здесь уместна «сноска»: дополнительный контекст слишком длинный для обычного комментария, но важен для сопровождающего разработчика или ИИ.

### Когда тег не нужен

Не нужно ставить тег, если:

- Смысл уже полностью понятен из самого кода и ближайшего комментария.
- Это локальная мелочь без связей с остальным проектом.
- Ради этого тега пришлось бы заводить запись в карте, которая не содержит ничего полезнее очевидного описания.

### Один тег — один смысл

Один §-тег должен обозначать **один конкретный контракт, инвариант или архитектурное решение**.

Нельзя использовать один и тот же тег для двух разных смыслов просто потому, что они «примерно рядом». Если решение разделилось на два независимых смысла — нужен второй тег.

### Выбор раздела в карте тегов

При добавлении нового тега его нужно помещать **в тематически правильный раздел карты**.

Если тег относится к ИИ-помощнику — он должен быть в разделе про ИИ. Если к авторизации API — в разделе API. Если к правилам доступа — в разделе логики доступа. Если подходящего раздела нет, сначала стоит добавить новый раздел или подраздел, а потом уже новый тег.

### В Markdown-документации

Тег ставится **в тексте абзаца** в скобках, но не в заголовке.

```markdown
AI-запросы идут через роутерный proxy, а ключи провайдера хранятся на роутере (§dpbhsah).
```

### В shell-скриптах

Только внутри существующего комментария, в конце строки. Не добавлять отдельную строку только ради тега.

```sh
# Проверяем наличие WAN-интерфейса (§f1t2tal)
if ubus call network.interface.wan status ...
```

### В Kotlin/Java и Lua

```kotlin
// Запрос через роутерный API, не напрямую к LLM (§xaji0y6)
val response = sheepfoldApi.aiAssistant(request)
```

---

## Как найти и добавить тег

```bash
# Найти все теги в проекте
grep -r '§' docs/ usr/

# Найти конкретный тег
grep -r '§xaji0y6' .
```

Добавить новый тег: сгенерировать 7 символов из `[a-z0-9]`, убедиться что такого нет в таблицах ниже, добавить строку в нужный раздел, расставить в коде/доке.

---

# Карта тегов

## 🤖 ИИ-помощник

Теги о поведении, архитектуре и безопасности ИИ-модуля в Android-приложении.

| Тег | Имя | Тип | Описание |
|-----|-----|-----|--------|
| `§xaji0y6` | AI_NO_DIRECT_LLM | архитектура | Android **не ходит напрямую** к LLM — все через `/cgi-bin/sheepfold-api/ai-assistant`. Тег означает: здесь реализуется или проверяется эта прослойка. Файлы: `ai-assistant.ru.md`, `ai-assistant.md`, `ai-dev-guide.ru.md`, `product-requirements.md` |
| `§dpbhsah` | AI_PROVIDER_KEYS_ON_ROUTER | безопасность | API-ключи LLM хранятся **на роутере в UCI Sheepfold**, потому что Android ходит к LLM только через роутерный proxy endpoint. Android Keystore хранит локальные Android-секреты, но не provider keys. Файлы: `ai-assistant.ru.md`, `ai-assistant.md`, `ai-dev-guide.ru.md`, `product-requirements.md` |
| `§cldstor` | EXTERNAL_STORAGE_DISCLOSURE | приватность/legal | Яндекс Диск/Google Drive выключены по умолчанию; до включения нужно явно раскрыть категории передаваемых файлов, папку, объём, хранение, отключение и удаление. Перед публичным релизом проверить шифрование до отправки и юридические тексты. Файлы: `privacy.ru.md`, `user-agreement.ru.md`, `PRIVACY_NOTICE.md` |
| `§assetv1` | LUCI_ASSET_VERSIONING | LuCI/cache | Версия OpenWrt-пакета является единственным источником `?v=<PKG_VERSION>-<PKG_RELEASE>` для JS/CSS/static assets. Любое изменение LuCI frontend требует bump package release и теста cache busting. Файлы: `agent-playbook.ru.md`, `Makefile`, `luciAssetVersioning.test.mjs` |
| `§y41iblj` | AI_ENDPOINT_STUB | статус | `/ai-assistant` сейчас **заглушка** — authenticated API и role-based auth не завершены. Тег: этот код зависит от заглушки и нуждается в обновлении. |
| `§ikcidkw` | AI_MODEL_CONFIG | конфиг | Имена моделей **не зашиты в код** — в конфиге провайдера. Тег: здесь читается/записывается model ID. Файлы: `ai-assistant.ru.md` |
| `§t3w5uzb` | AI_PROVIDERS_COUNTRY | конфиг | Провайдеры LLM зависят от **country profile** роутера. Тег: здесь фильтруются провайдеры по стране. Файлы: `ai-assistant.ru.md`, `ai-dev-guide.ru.md` |
| `§nnhj7xv` | AI_PROMPT_REVIEW | процесс | Промпт перед production должен пройти **ревью семейного психолога**. Тег: это место связано с промптом. Файлы: `ai-assistant.ru.md` |
| `§pm3kq7r` | NAMING_BY_LAYER | стиль | Именование зависит от слоя: JS/Kotlin/JSON, тестовые файлы, внутренние test ID и категории — camelCase; OpenWrt UCI, shell и Makefile — нативный стиль OpenWrt. Заголовки `describe()`/`it()` остаются понятными фразами. Для новых локальных переменных и приватных полей предпочтительно говорящее имя примерно до 15 символов, но понятность важнее длины, а рефакторинг только ради лимита не требуется. Переименование UCI-полей — только с миграцией. Файлы: `CODING_RULES.md`, `AGENTS.md`, `ai-dev-guide.ru.md`, `test-strategy.ru.md` |
| `§frontmod` | FRONTEND_BY_DOMAIN | архитектура | LuCI frontend делится на route/composition в `view/sheepfold`, инфраструктуру в `sheepfold/core`, общие UI-части в `sheepfold/shared` и предметные модули в `sheepfold/features/<area>`. Не создавать общий склад `utils.js`; `overview.js` уменьшать поэтапно с тестами. Файлы: `CODING_RULES.md`, `AGENTS.md`, `docs/frontend-architecture.ru.md` |
| `§devinv` | ROUTER_DEVICE_INVENTORY | LuCI/DHCP | Модель устройств объединяет DHCP leases, ARP/neighbour, постоянные DHCP-аренды и UCI Sheepfold по нормализованному MAC. Имя существующей секции `dhcp host` обязательно сохраняется, чтобы редактирование не создавало дубли. Файлы: `features/devices/inventory.js`, `frontendDomainModels.test.mjs`, `frontend-architecture.ru.md` |
| `§lstxcl1` | DEVICE_ACCESS_LIST_EXCLUSIVITY | доступ/UX | Один MAC не может состоять одновременно в белом и чёрном списке устройств; конфликт отклоняется с понятным сообщением, без автоматического переноса между списками. Файлы: `agent-playbook.ru.md`, `features/devices/access-lists.js`, `overview.js`, `sheepfold-router-control-legacy`, тесты списков и backend |
| `§pairsec` | ADMIN_EDITOR_PRIVILEGE_BOUNDARY | LuCI/администраторы/security | Редактор администратора владеет только полями, выбором устройств и визуальным состоянием. Выпуск/сжигание одноразового кода, QR, UCI-транзакция, очистка ограничений устройства, выдача белого списка устройств и токенов остаются в защищённом координаторе. Файлы: `frontend-architecture.ru.md`, `features/administrators/editor.js`, `overview.js`, `administratorEditorUi.test.mjs` |
| `§devmut` | DEVICE_EDITOR_MUTATION_BOUNDARY | LuCI/устройства/UCI | Редактор карточки устройства возвращает проверяемый черновик, но не пишет UCI/DHCP и не применяет firewall. Координатор проверяет конфликт списков и защиту админского устройства, делает commit/runtime apply и только затем обновляет локальные таблицы. Файлы: `frontend-architecture.ru.md`, `features/devices/editor.js`, `overview.js`, `deviceEditorUi.test.mjs` |
| `§vq8xb5d` | AI_OWNERSHIP_THRESHOLD | конфиг | Порог автоназначения владельца устройства (85%) — субъективен. Должен быть в UCI: `sheepfold.global.aiOwnershipAutoAssignThreshold`. Файлы: `ai-dev-guide.ru.md` |
| `§c9rf1pe` | AI_PROVIDER_TAB_VISIBLE | UX | Вкладка ИИ-помощника может показываться в APK, если на роутере настроен AI-provider. Для детского APK отправка вопроса разрешается только после router-side проверки: устройство зарегистрировано, не админское, не в blocklist, есть родительское согласие и устройство состоит в личной группе. Иначе показывается понятный баннер. Файлы: `ai-dev-guide.ru.md` |

### Безопасность передачи данных ИИ

| Тег | Имя | Тип | Описание |
|-----|-----|-----|--------|
| `§xthv3a3` | AI_CONTEXT_CONFIRM | UX | Перед отправкой контекста — **явное подтверждение** с preview. Тег: здесь экран/диалог подтверждения. Файлы: `ai-assistant.ru.md`, `ai-context-sharing.ru.md` |
| `§zmf8mdd` | AI_ROUTER_SNAPSHOT | API | Диагностика роутера для ИИ: версия, модель, Wi-Fi, ping, uptime без паролей. Тег: здесь снимок формируется или используется. Файлы: `ai-context-sharing.ru.md` |
| `§4v30t9n` | AI_FORBIDDEN_FIELDS | безопасность | **Запрещено автоматически:** MAC, IP, имена детей, токены, пароли, журналы. Тег: здесь фильтрация payload. Файлы: `ai-assistant.ru.md`, `ai-context-sharing.ru.md` |
| `§g0fn9xu` | AI_ROLE_CHILD | UX | Запросы ребёнка с `role=child`: мягкий тон, без действий родителя. Тег: здесь ролевая логика. |

---

## 🔌 API и авторизация

Теги о безопасности CGI-шлюза и правилах аутентификации.

| Тег | Имя | Тип | Описание |
|-----|-----|-----|--------|
| `§h75lxo6` | API_BEARER_TOKEN | безопасность | Каждый запрос проверяет Bearer-токен, хранящийся как HMAC-хэш. Тег: здесь проверка токена. Файлы: `backend-design.ru.md` |
| `§qjiujv6` | API_CONFIRM_TOKEN | безопасность | reboot, update, global-block, clear-log требуют отдельный `confirm`-токен. Тег: это «опасное» действие. Файлы: `backend-design.ru.md` |
| `§oh9sdbd` | API_NO_SECRETS_RESPONSE | безопасность | `router-info` не включает пароли, токены, MAC, имена детей. Тег: здесь формируется ответ API. Файлы: `backend-design.ru.md` |
| `§b5wkq2e` | API_CLIENT_STATUS_NO_TOKEN | безопасность/детский статус | `/client-status` не требует Bearer-токена — идентифицирует устройство по IP из DHCP. Это исключение из общего правила токенов. Детский UI показывает только локальное `HH:mm` следующего фактического изменения доступа; расчёт будущих границ не выполняется в минутном firewall-пути. Тег: здесь логика исключения или её последствия. Файлы: `backend-design.ru.md`, `android-openwrt-api.ru.md`, `apps/android-child-app-ru.md`, `sheepfold-api-client-status`, `sheepfold-client-status-effective`, `sheepfold-schedule-evaluator` |

---

## 🛡️ Логика доступа к сети

Теги о приоритетах правил ограничения доступа для устройств в сети.

| Тег | Имя | Описание |
|-----|-----|--------|
| `§84azytj` | ACCESS_PRIORITY_ORDER | Фактический фиксированный порядок устройства: blocklist → admin-devices → no-restrictions → allowlist → global-block → temp-access → device-schedule → group-schedule → default. Emergency-sites являются отдельным доменным исключением. LuCI показывает порядок без редактирования, пока единый configurable runtime не реализован в status API и nftables. |
| `§emerg1` | EMERGENCY_SITES_RUNTIME | UCI-карточки аварийно-полезных сайтов, проверка домена, dnsmasq nftset/fallback-resolve и узкие web-исключения до блокирующих правил. Не открывает LuCI/SSH/API и не обещает строгую изоляцию при общих CDN IP. Файлы: `emergency-sites-runtime.ru.md`, `features/emergency/sites.js`, `sheepfold-emergency-sites`, `30-sheepfold.nft`, `emergencySites.test.mjs`. |
| `§country1` | COUNTRY_PROFILE_EMERGENCY_SITES | Выбранный при установке или в LuCI профиль `ru/by/cn` управляет только собственными аварийными карточками. Ручная правка снимает профильное владение, удаление создаёт постоянное исключение, широкие порталы/маркетплейсы/такси не входят в defaults. Файлы: `country-profiles*.md`, `country-profiles/*.json`, `sheepfold-country-profile`, `features/emergency/sites.js`, `countryProfiles.test.mjs`. |
| `§cfgbak1` | SETTINGS_BACKUP_AND_IMPORT | Полный состав Sheepfold/DHCP/Wi-Fi backup, безопасный JSON без секретов, AES-256-GCM full backup, строгая проверка и UCI rollback. `router_install_id` отличает обычное восстановление от переноса: постоянные `#ID` и правила сохраняются, router-bound HMAC/карантин и привязки админских телефонов сбрасываются, одноразовый pairing code не экспортируется. Файлы: `settings-backup.ru.md`, `features/settings/backup.js`, `overview.js`, `Makefile`, `sheepfold-router-control-legacy`, `settingsBackup.test.mjs`. |
| `§xepq85j` | ACCESS_BLOCKLIST_ROUTER_FINAL | Blocklist всегда запрещает доступ к LuCI/SSH/Sheepfold API, даже если более высокое правило разрешило ограниченный публичный internet-доступ. Файлы: `backend-design.ru.md`, nftables input guard. |
| `§sg65kxv` | ACCESS_ALLOWLIST_BYPASS | При стандартном порядке allowlist обходит global-block, временные и schedule-правила, но находится ниже blocklist и no-restrictions. Файлы: `backend-design.ru.md` |

---

## 📶 Диагностика интернет-соединения

Теги о проверке WAN, DNS и доступности сети.

| Тег | Имя | Описание |
|-----|-----|--------|
| `§f1t2tal` | DIAG_CHAIN | Цепочка: WAN link → route → DNS (ya.ru/gosuslugi.ru) → HTTP(S). Тег: один шаг цепочки или переход между `offline`/`limited`/`online`. Файлы: `backend-design.ru.md` |
| `§a753lc5` | DIAG_NO_GOOGLE_DNS | Не использовать `1.1.1.1`/`8.8.8.8`/`google.com` — могут быть заблокированы в РФ. Тег: здесь выбор целей. Файлы: `backend-design.ru.md` |

---

## ⚙️ Бэкенд: OpenWrt / UCI / LuCI

Теги о нюансах роутерной части: UCI-конфигурация, вызовы из LuCI, журнал.

| Тег | Имя | Описание |
|-----|-----|--------|
| `§w2pcn9t` | UCI_UNIQUE_SECTION | Уникальные имена UCI-секций: `messenger_global`, `pairing_global`, не повторно `global`. Тег: здесь UCI-секция. Файлы: `backend-design.ru.md` |
| `§8drc11e` | LUCI_EXEC_ONLY | LuCI вызывает только `sheepfold-router-control`, не строит shell-команды динамически. Тег: точка вызова. Файлы: `backend-design.ru.md` |
| `§rtj5pht` | LOG_RAM_MASKED | Журнал в RAM `/tmp`, MAC/IP маскируются при экспорте. Тег: запись в журнал или экспорт. Файлы: `backend-design.ru.md` |

---

## 📡 Мессенджеры

Теги об архитектуре и безопасности интеграции с мессенджерами.

| Тег | Имя | Тип | Описание |
|-----|-----|-----|--------|
| `§r2vy5mk` | MSG_SINGLE_ACTIVE | архитектура | Одновременно активен **только один мессенджер** на роутере. Переключение требует подтверждения. Тег: здесь логика активного адаптера или переключение. Файлы: `messaging.ru.md` |
| `§m1fqo8a` | MSG_DANGER_CONFIRM | безопасность | Опасные действия через мессенджер требуют явного подтверждения (reboot, update, global-block, clear-log, смена мессенджера и др.). Тег: это «опасное» действие в мессенджере. Файлы: `messaging.ru.md` |
| `§pw7z6nt` | MSG_NO_SENSITIVE | безопасность | Запрет отправки паролей, токенов, MAC, приватных данных без явного разрешения. По умолчанию — только имя устройства и статус. Тег: здесь фильтрация исходящих сообщений. Файлы: `messaging.ru.md` |
| `§u4hnqle` | MSG_LONG_POLL | архитектура | Telegram работает через **исходящий long polling** `getUpdates` — без webhook, без белого IP, без входящего порта. Тег: здесь реализация или обоснование этой схемы. Файлы: `messaging.ru.md` |

---

## 🔍 Автоопределение устройств

Теги об алгоритме детектора и правилах автоназначения групп.

| Тег | Имя | Тип | Описание |
|-----|-----|-----|--------|
| `§d7vqm4s` | DETECT_TWO_FAMILIES | архитектура | Автоназначение в «Без ограничений» требует **минимум двух независимых семейств признаков**. Одно имя или один сигнал — недостаточно. Тег: здесь проверка или счёт семейств. Файлы: `device-detection.ru.md` |
| `§e8kxtjc` | DETECT_HARD_DENY | безопасность | Роутеры, AP, mesh, репитеры, телефоны, ПК, TV и консоли — **никогда** не в «Без ограничений» автоматически. Для принтера одного сигнала недостаточно: нужны два независимых принтерных признака и отсутствие сетевого hard-deny. Тег: здесь проверка жёсткого запрета. Файлы: `device-detection.ru.md`, `device-identification-design.ru.md` |
| `§nz3lhp0` | DETECT_NO_AUTO_REMOVE | инвариант | Sheepfold не удаляет и не заменяет **ручные** назначения групп. Разрешено снять только собственное доказанное назначение с `group_source=detector`, если автоматически доверенная инфраструктура затем уверенно стала персональным устройством; неизвестное происхождение считается ручным. Файлы: `device-detection.ru.md`, `device-passport-and-control.ru.md`, `sheepfold-device-detector` |
| `§bbxtr01` | BUSYBOX_TR_ASCII_RANGES | OpenWrt/совместимость | BusyBox `tr` на поддерживаемом роутере искажает ASCII-нормализацию с операндами `[:lower:]`, `[:upper:]` и `[:alnum:]`. Для MAC, доменов и служебных идентификаторов обязательны явные `a-z`/`A-Z`/`A-Za-z0-9`; regexp-классы в `grep`/`sed`/`awk` под это правило не подпадают. Файлы: `CODING_RULES.md`, `agent-gotchas.ru.md`, `sheepfold-device-classifier`, `backendRuntimeSafety.test.mjs` |

---

## 📘 Agent playbook и архитектурные инварианты

Теги для ключевых продуктовых правил в `docs/agent-playbook.ru.md`. В этом файле они вставляются HTML-комментариями `<!-- §xxxxxxx -->`, чтобы не шуметь в пользовательском тексте и при этом оставаться доступными для поиска.

| Тег | Имя | Тип | Описание |
|-----|-----|-----|--------|
| `§v7x2k9p` | PLAYBOOK_TRAFFIC_CHAIN | архитектура | Цепочка трафика и ответственности: Sheepfold принимает решение по устройству, затем AdGuard Home фильтрует DNS, затем Podkop маршрутизирует разрешённый трафик. Файлы: `agent-playbook.ru.md`, `backend-design.ru.md`, `live-router-testing.ru.md`, `sheepfold-firewall`, `sheepfold-service`, `sheepfold-pair-device` |
| `§q3nj8wd` | PLAYBOOK_NO_DEV_CLOUD | архитектура | Не добавлять developer-operated cloud backend для управления Sheepfold; необязательный канал отзывов регулируется отдельным тегом `§feedback`. Файлы: `agent-playbook.ru.md` |
| `§feedback` | OPTIONAL_FEEDBACK_CLOUD | privacy/архитектура | Необязательный канал отзывов через Yandex Cloud + YDB изолирован от управления роутером; только введённый текст и отдельно подтверждённый диагностический отчёт по белому списку безопасных полей. Полный UCI-конфиг, идентификаторы и имена устройств, SSID, журналы, история сайтов и секреты запрещены. Файлы: `yandex-cloud-ydb-feedback.ru.md`, `privacy.ru.md`, `AGENTS.md` |
| `§i18ncase` | CASE_SENSITIVE_I18N_JSON | i18n/Windows | `.po` — источник истины; JSON-каталоги генерируются только `scripts/po2json.py`. PowerShell 5 JSON-конвертер запрещён для этих файлов, потому что смешивает msgid, различающиеся регистром. Файлы: `localization.ru.md`, `agent-gotchas.ru.md`, `AGENTS.md` |
| `§k5rf0hb` | PLAYBOOK_LOCAL_FULL_CONTROL | архитектура | Полное управление через LuCI/Android только в локальной сети; вне дома — короткие подтверждаемые команды через мессенджер. Файлы: `agent-playbook.ru.md` |
| `§b3nw8vp` | PLAYBOOK_ADMIN_LOG_NO_SECRETS | безопасность | Административные действия логируются, но без секретов, токенов, паролей и лишних чувствительных данных. Файлы: `agent-playbook.ru.md` |
| `§n2lp7yt` | PLAYBOOK_INSTALLER_EXPLICIT_CONSENT | legal/installer | OpenWRT installer требует явное согласие `yes`, `y` или `да` перед применением изменений. Файлы: `agent-playbook.ru.md` |
| `§m9qe4lk` | PLAYBOOK_LUCI_NO_PENDING_CHANGES | UX/LuCI | LuCI-действия Sheepfold не должны оставлять системную плашку `Не принятые изменения`; после понятной кнопки Sheepfold изменения надо сохранить и применить. Файлы: `agent-playbook.ru.md` |
| `§h6mxq4c` | PLAYBOOK_BLOCKLIST_NO_ROUTER_UI | безопасность | Устройства из чёрного списка не должны открывать LuCI, SSH и Sheepfold API. Файлы: `agent-playbook.ru.md` |
| `§w8dm3kv` | PLAYBOOK_BLOCKLIST_BEATS_TEMP_SCHEDULE | доступ | В стандартном `access_priority` чёрный список сильнее временного доступа и расписаний. Файлы: `agent-playbook.ru.md` |
| `§x1hy6pz` | PLAYBOOK_ALLOWLIST_BYPASS_BLOCKS | доступ | В стандартном `access_priority` белый список выше глобальной блокировки и расписаний. Файлы: `agent-playbook.ru.md` |
| `§e4bq1mn` | PLAYBOOK_QR_NO_SECRETS | безопасность | QR сопряжения не содержит root-пароль, LuCI cookie, bot tokens, AI keys, пароли или full backups. Файлы: `agent-playbook.ru.md` |
| `§j9wv3sz` | PLAYBOOK_PAIRING_BACKEND_CONSUMES_TOKEN | безопасность | Сжигание одноразового pairing token/code реализуется только backend-частью роутера, не Android/LuCI состоянием. Файлы: `agent-playbook.ru.md` |
| `§dscqr01` | ANDROID_DISCOVERY_AND_PAIRING_ERRORS | Android/API | Оба APK читают well-known через штатный HTTPS, узнают фактический API-порт и проверяют отдельный `/ping`; детский APK ищет шлюз до 30 секунд перед ручным IP. QR виден только после backend-активации, новый код сбрасывает старый лимит, а DHCP/neighbour-ожидание не считается неверным кодом. Form-urlencoded разбирается без pipeline-зависимого цикла BusyBox. Ошибки не бывают пустыми/`undefined`; после сопряжения родительский APK восстанавливает порт только через закреплённый сертификат и не повторяет неоднозначную команду. Debug APK пишет маскированную трассировку в Downloads, а opt-in router trace в RAM показывает этап backend без QR, кода, токена и MAC. Backend ищет MAC в DHCP, neighbour и ARP. Файлы: `DiagnosticLog.kt`, `LocalRouterDiscovery.kt`, `ChildRouterDiscovery.kt`, `RouterEndpointRecovery.kt`, `SecureRouterConnectionManager.kt`, `sheepfold-pair-diagnostics`, `sheepfold-api-pair`, `sheepfold-pair-common`, `android-config.ru.md`, `troubleshooting.ru.md` |
| `§pairrng1` | MINIMAL_OPENWRT_PAIRING_RANDOM | pairing/security | Генерация административного Bearer-токена не зависит от необязательной утилиты `od`: случайные байты из `/dev/urandom` преобразуются доступным SHA-256 в прежний 40-символьный hex-формат. Иначе правильный QR заканчивается `token_generation_failed` на минимальной прошивке. Файлы: `sheepfold-pair-common`, `tokenDeviceBinding.test.mjs`, `agent-gotchas.ru.md`, `troubleshooting.ru.md` |
| `§pairlat1` | PAIRING_RESPONSE_LATENCY | pairing/runtime | Ответ Android-сопряжения не ждёт общего firewall lock: права и токен сохраняются атомарно, firewall синхронизируется в фоне, занятый администратор быстро получает `pairing_busy`, а таймаут APK остаётся ниже CGI-лимита uhttpd. Иначе роутер уже привязывает телефон, но APK теряет ответ и ошибочно советует проверить рабочий порт. Файлы: `sheepfold-pair-common`, `sheepfold-pair-device`, `sheepfold-api-pair`, `SecureRouterConnectionManager.kt`, `backendRuntimeSafety.test.mjs`, `androidPairingDiscoveryAndListUi.test.mjs`, `troubleshooting.ru.md` |
| `§qrcap1` | ADMIN_PAIRING_QR_CAPACITY | LuCI/Android/pairing | QR-рендерер проверяется полной боевой строкой `SF2` с адресом, портом, логином, десятисимвольным кодом и 64-символьным SPKI. Для payload длиннее 106 байт используется корректная многоблочная версия QR; короткий демонстрационный payload не считается достаточным тестом. Файлы: `qr.js`, `pairingQrCapacity.test.mjs`, `agent-gotchas.ru.md`, `troubleshooting.ru.md`, `AGENTS.md` |
| `§pairtx1` | TRANSACTIONAL_ADMIN_PAIRING | pairing/UCI/security | Числовой ID, bound token, белый список устройств, админские поля и сжигание одноразового кода составляют одну UCI-транзакцию через общий private savedir и `uci -t/-p`; `uci -P` запрещён, поскольку его commit не переносит delta в основной конфиг. Backend перечитывает main UCI до выдачи успеха, Android подтверждает токен обычным авторизованным запросом, а любой сбой отзывает токен и восстанавливает снимок. Live-router probe обязан проверять реальные BusyBox/UCI semantics. Файлы: `sheepfold-pair-device`, `sheepfold-device-id`, `sheepfold-runtime-hardening`, `RouterAdminClient.kt`, `SecureRouterConnectionManager.kt`, `tokenDeviceBinding.test.mjs`, `androidPairingDiscoveryAndListUi.test.mjs`, `remoteChecks.sh`, `android-openwrt-api.ru.md`, `agent-gotchas.ru.md` |
| `§deviceid2` | PERMANENT_DEVICE_IDS | устройства/UCI/security | Пользовательский числовой ID является постоянной ссылкой: новый номер берётся из монотонного счётчика, удалённый не переиспользуется, а обновление не уплотняет последовательность. Старый строковый формат нормализуется без изменения числового смысла и хранится как MAC-привязанный алиас. Файлы: `sheepfold-device-id`, `sheepfold-token-common`, `sheepfold-ai-gate`, `sheepfold-activity-log`, `deviceStableId.test.mjs`, `agent-gotchas.ru.md` |
| `§tlspinv2` | QR_V2_TLS_SPKI_PIN | Android/pairing/security | LuCI выпускает `SF2` только после получения 64-символьного SHA-256 DER SubjectPublicKeyInfo активного uhttpd-ключа. Android проверяет SPKI до передачи одноразового кода; старый certificate pin остаётся fallback для сохранённых подключений, а новый QR без `spki` отклоняется. Файлы: `sheepfold-tls-fingerprint`, `sheepfold-router-control`, `overview.js`, `RouterTlsPin.kt`, `SecureRouterConnectionManager.kt`, `SheepfoldConnectionStore.kt`, `androidHttpsSecurity.test.mjs`, `android-openwrt-api.ru.md` |
| `§dnsbind1` | ANDROID_LOCAL_IP_PINNING | Android/pairing/security | Имя из подписанного `SF2` разрешается однократно только в локальные адреса, успешный IP сохраняется как endpoint, а все последующие HTTPS-запросы запрещают hostname, loopback, multicast и публичный IP. Ручное/legacy-сопряжение требует локальный IP; детский APK принимает только IP шлюза либо ручной локальный IP. Файлы: `LocalRouterAddress.kt`, `ChildLocalRouterAddress.kt`, `RouterHttps.kt`, `ChildRouterHttps.kt`, `SecureRouterConnectionManager.kt`, `RouterEndpointRecovery.kt`, `androidHttpsSecurity.test.mjs` |
| `§authrs1` | ANDROID_ROUTER_SESSION_RECOVERY | Android/API/security | `401`, явный окончательный token-код, отвязка админского устройства и несовпадение HTTPS/SPKI требуют новой явной привязки. Очищаются только endpoint/token/device/TLS credential; соглашение, Android-разрешения и защита приложения сохраняются. Тайм-ауты, offline и `5xx` токен не удаляют. Для multi-IP hostname сначала выполняются безопасные `/ping`-пробы, после чего одноразовый код отправляется ровно одному endpoint и не повторяется после неоднозначного сбоя. Файлы: `RouterSessionRecovery.kt`, `SheepfoldConnectionStore.kt`, `RouterAdminClient.kt`, `AiAssistantClient.kt`, `SecureRouterConnectionManager.kt`, `MainActivity.kt`, `SafeRouterSetupScreen.kt`, `sheepfold-api`, `sheepfold-api-legacy`, `androidRouterSessionRecovery.test.mjs`, `android-config.ru.md` |
| `§tgconfirm` | TELEGRAM_DANGEROUS_COMMAND_CONFIRMATION | Telegram/security | Отключение интернета/Wi-Fi, очистка журнала, обновление, перезагрузка, временный доступ и изменения политики устройства выполняются только после одноразового 6-значного кода из `/dev/urandom`. Pending-файл приватный, заменяется атомарно, удаляется до действия; для устройства хранит только проверенный числовой ID и ограниченные минуты. Генератор и parser проверяются одним поведенческим тестом. Файлы: `sheepfold-telegram-bot`, `telegramConfirmation.test.mjs`, `current-implementation-status.md` |
| `§childwifi1` | CHILD_WIFI_NETWORK_NOTIFICATION | Android/privacy/API | Выключенный по умолчанию детский отчёт включается только флагом `/client-status`. Телефон передаёт SSID и SHA-256-отпечаток `SSID+BSSID`, но не открытый BSSID; координаты являются последней доступной позицией телефона. До возвращения домой хранится не больше 100 подготовленных отчётов, а отзыв настройки удаляет их или координаты. Router-side IP/DHCP/ARP определяет устройство, админы исключены; роутер хранит максимум 100 сетей на устройство, удаляет сеть и её координаты через 90 дней и позволяет очистить всё из LuCI. Файлы: `child-wifi-network-notifications.ru.md`, `WifiNetworkSnapshotCollector.kt`, `WifiReportQueue.kt`, `sheepfold-child-wifi-monitor`, `sheepfold-api`, `notifications/settings.js`, privacy/agreement, `childWifiNetworkMonitoring.test.mjs` |
| `§prodvar` | STANDARD_AND_AI_PRODUCT_VARIANTS | архитектура/релизы | Из общего ядра собираются Standard и AI Support в нативных форматах OpenWrt IPK/APK с одним внутренним package identity, а также два единых Android APK. Standard физически не содержит AI/activity-backend; переход Standard ↔ AI сохраняет UCI-конфиг, Android flavors для AI запрещены, а AI UI открывается только по положительной capability роутера. Файлы: `product-variants.ru.md`, `product-variants-implementation-task.ru.md`, `AGENTS.md`, `install.sh`, `scripts/sheepfold_variants.py`, `scripts/build-test-ipk.py`, `scripts/verify-android-variant.py`, `tests/productVariants.test.mjs`, `tests/openWrtVariantFeed.test.mjs` |
| `§f8ck5ry` | PLAYBOOK_WIFI_DISABLE_DISCLAIMER | UX/Wi-Fi | Перед включением авто-выключения Wi-Fi нужен непропускаемый дисклеймер с 10-секундным таймером. Файлы: `agent-playbook.ru.md` |
| `§p1zt6ow` | PLAYBOOK_FULL_EXPORT_ENCRYPTED | безопасность | Full export with secrets разрешён только в encrypted-виде и не является default export. Файлы: `agent-playbook.ru.md` |
| `§c7ds2xv` | PLAYBOOK_BLOCKED_PAGE_IOT_SHORT_RESPONSE | совместимость | IoT/API-клиенты при блокировке получают короткий предсказуемый HTTP/TCP-ответ, а не тяжёлую HTML-страницу. Файлы: `agent-playbook.ru.md` |
| `§r2at5nq` | PLAYBOOK_SINGLE_MESSENGER_ADAPTER | архитектура | Один роутер — один активный messenger adapter. Файлы: `agent-playbook.ru.md` |
| `§t4lq9bw` | PLAYBOOK_AI_ADVISES_NOT_ACTS | безопасность/AI | ИИ-помощник не управляет роутером сам; он советует, а действия применяются только после явного подтверждения parent/admin. Файлы: `agent-playbook.ru.md` |
| `§u6fj2sr` | PLAYBOOK_AI_NO_AUTO_SENSITIVE_CONTEXT | приватность/AI | MAC/IP/device names/child names/family details/logs/device lists/router settings не отправляются AI автоматически. Файлы: `agent-playbook.ru.md` |
| `§z5ck8mv` | PLAYBOOK_ANDROID_PARENT_ADMIN | Android | Основное Android-приложение `android/` — только для телефонов родителей-администраторов. Детское приложение живёт отдельно в `android-child/`, не имеет административных функций и получает только собственный статус через `/client-status`. Файлы: `agent-playbook.ru.md`, `AGENTS.md`, `security.md`, `product-requirements.md` |
| `§mrgready` | MERGE_READINESS_PLAN | процесс разработки | Подробная контрольная точка и перечень обязательных проверок перед коммитом или слиянием крупного набора изменений в `main`, включая причины, локальные доказательства и отдельные критерии публичного релиза. Файл: `merge-readiness-plan.ru.md` |
| `§revspot` | MERGE_CODE_REVIEW_HOTSPOTS | code review | Карта наиболее рискованных мест и инвариантов, которые надо проверить в коде перед слиянием: installer/UCI, API/auth, HTTPS/pairing, LuCI, Android, detector, AI, журнал и тесты. Файл: `merge-readiness-plan.ru.md` |
| `§toolwin` | WINDOWS_REPOSITORY_TOOLCHAIN | окружение | Воспроизводимое Windows-окружение ставится/проверяется через `tools/windows/`; скрипт устанавливает 7-Zip/ripgrep, находит скрытый от Codex `winget`, выбирает Python/JDK 17 без конфликта версий, бережно повторяет Android SDK-загрузки и прогревает Gradle Wrapper. Тяжёлые SDK и кэши не коммитятся. Файлы: `tools/README.ru.md`, `agent-environment.ru.md`, `agent-gotchas.ru.md`, `AGENTS.md` |
| `§winsbx1` | WINDOWS_ANTIVIRUS_EXECUTION_SANDBOX | окружение/тестирование | На компьютере владельца Kaspersky может карантинить живой PowerShell harness по поведению backup + SSH/SCP + package install. Исходники и незакоммиченные правки остаются в Git; `runRouterTests.ps1` запускается из копии `tools/router-testing` в `C:\Users\User\Documents\pesochnica\sheepfold-router-harness`. Антивирус целиком не отключается. Файлы: `AGENTS.md`, `agent-environment.ru.md`, `agent-gotchas.ru.md`, `troubleshooting.ru.md`, `live-router-automation.ru.md` |
| `§zipps51` | WINDOWS_ANDROID_ZIP_EXTRACTION | окружение/Windows | Android command-line tools распаковываются через `.NET ZipFile` в короткий `%TEMP%`-путь; `Expand-Archive` Windows PowerShell 5 здесь запрещён из-за внутренней ошибки `Remove-Item`. Файлы: `tools/windows/setup.ps1`, `tools/README.ru.md`, `agent-gotchas.ru.md` |
| `§fastagt` | AGENT_FAST_START | процесс разработки | Новый агент начинает с короткой карты, точечного поиска и послойных тестов, а не читает и запускает весь проект без необходимости. Файлы: `agent-fast-start.ru.md`, `AGENTS.md`, `developer-task.ru.md` |
| `§trouble` | TROUBLESHOOTING_HANDBOOK | диагностика | Справочник уже встречавшихся ошибок: точный симптом, причина, проверка и безопасное исправление для Windows, тестов, Android, IPK/OpenWRT, UCI, LuCI, Git и сети. Файлы: `troubleshooting.ru.md`, `AGENTS.md`, `agent-fast-start.ru.md`, `developer-task.ru.md` |
| `§usrcomm` | OWNER_COMMUNICATION_PROFILE | процесс разработки | Устойчивые правила понимания итеративных требований владельца, обязательное уточнение типа белого/чёрного списка и требования к ясным отчётам. Файлы: `owner-communication-profile.ru.md`, `AGENTS.md`, `agent-fast-start.ru.md`, `developer-task.ru.md` |
| `§uirunfx` | UI_RUNTIME_CONTRACT_FAILURE | тестирование/backend | Класс ошибок, при котором UI выглядит правильно, но UCI/backend/firewall не применяет показанное правило; требует проверки полного runtime-пути и живого роутера для опасных сценариев. Файлы: `agent-gotchas.ru.md`, `schedulePriorityUi.test.mjs` |
| `§agfix88` | AUTO_GROUP_EVIDENCE_RETRY | автоопределение | Высокая уверенность в типе не должна замораживать детектор, пока кандидату в «Без ограничений» не хватает двух независимых семейств доказательств; причина отказа сохраняется в UCI и показывается в UI. Файлы: `device-identification-design.ru.md`, `product-requirements.md`, `sheepfold-device-detector` |
| `§persdev` | PERSONAL_DEVICES_GROUP | группы/автоопределение | Защищённая группа «Персональные устройства» автоматически принимает уверенно распознанные личные экраны и компьютеры, но не даёт обхода правил доступа. Файлы: `product-requirements.md`, `device-identification-design.ru.md`, detector/classifier/default-groups |
| `§child30` | CHILD_ACCESS_REQUEST | Android/API | Детское устройство может только попросить 30 минут; роутер сам определяет устройство, администратор отдельно разрешает уведомления, а доступ никогда не выдаётся автоматически. Файлы: `apps/android-child-app-ru.md`, `product-requirements.md`, `/access-request`, Android worker |
| `§rootgate` | LUCI_ROOT_PASSWORD_GATE | безопасность/LuCI | При отсутствующем или непроверенном root-пароле Sheepfold закрывает настройки непропускаемым экраном и ведёт на штатную страницу установки пароля LuCI. Файлы: `product-requirements.md`, `overview.js`, `sheepfold-router-control` |
| `§luarunt` | OPENWRT_RUNTIME_DEPENDENCY | зависимости | Sheepfold не закрепляет отдельный старый Lua runtime; совместимость предоставляет `luci-base`, а backend использует POSIX shell/ucode. Файлы: `apps/router-app-ru.md`, `backend-design.ru.md`, `Makefile` |
| `§prmvers` | VERSIONED_AI_PROMPTS | AI | Версия родительского промпта выбирается в LuCI и соответствует отдельному неизменяемому runtime-каталогу. Файлы: `product-requirements.md`, `ai-assistant-prompt-for-support-parent/README.md`, `overview.js`, `sheepfold-ai-handler` |
| `§detload` | BOUNDED_DETECTOR_LOAD | автоопределение/backend | Повторный порт-скан одного устройства разрешён не чаще раза в сутки, параметры/таймаут `nmap` и число хостов ограничиваются; обычное WS-Discovery-окно пассивно, один Probe разрешён только новому устройству, SSDP защищён интервалом, а UPnP description ограничен четырьмя peer-pinned запросами за проход. Ручное переопределение ставит выбранный MAC первым; быстрый firewall tick отделён от событийного анализа. Файлы: `device-identification-design.ru.md`, `device-detection-research.ru.md`, `hidden-settings.ru.md`, `AGENTS.md`, detector/service, `sheepfold-device-ws-discovery`, `deviceDiscoverySecurity.test.mjs` |
| `§detlock` | DEVICE_DETECTOR_SERIALIZATION | автоопределение/backend | Фоновый цикл, прямой запуск и ручная переклассификация используют один `flock`-файл и общий helper. Ядро освобождает lock при аварийной гибели процесса; родительские политики чёрного/белого списка устройств и админского устройства проверяются до автогруппы. Файлы: `device-identification-design.ru.md`, `sheepfold-lock-common`, detector/service/reclassify, `lockCommon.test.mjs` |
| `§shscope1` | BUSYBOX_SHELL_VARIABLE_SCOPE | shell/UCI/инвариант | Рабочие переменные вложенных BusyBox `ash`-функций объявляются `local`; helper не может подменить секцию вызывающей функции. Миграция очищает ошибочные поля автогруппы у `config list`, а регрессионный тест проверяет сохранность device-секции. Файлы: `CODING_RULES.md`, `agent-gotchas.ru.md`, `device-detection.ru.md`, detector/default-groups/device-id, `deviceDetectorSafety.test.mjs` |
| `§simchg1` | CHILD_SIM_CHANGE_NOTIFICATION | Android/backend/приватность | Детский APK best-effort читает только доступные Android подписки; ICCID/IMSI/IMEI запрещены. Роутер привязывает отчёт по IP→DHCP/ARP. Первая установленная SIM журналируется с пометкой об обнаружении при установке приложения и подчиняется уведомлениям `all/new_only/off`; тихую исходную точку создаёт только первый пустой отчёт. В UCI остаётся максимум 16 отпечатков и 16 пар `отпечаток + номер`; номер маскируется в читаемом экспорте. Файлы: `sim-change-notifications.ru.md`, `sheepfold-sim-monitor`, `/sim-report`, `SimSnapshotCollector.kt`, `simChangeMonitoring.test.mjs` |
| `§logaudit` | LUCI_ACTION_ATTRIBUTION | LuCI/backend/journal | Общий LuCI backend добавляет служебный `--luci`, фасад переводит его в `SHEEPFOLD_ACTION_ACTOR`, а журнал показывает `LuCI (Изменено на роутере)`. Публичный API не принимает этот маркер и сохраняет собственную атрибуцию. Файлы: `core/backend/router.js`, `overview-secure.js`, `overview-personal.js`, `sheepfold-router-control`, `sheepfold-router-control-legacy`, `log-events.ru.md`, `routerBackendAccessRules.test.mjs` |
| `§fwlock1` | FIREWALL_STATE_TRANSACTION_LOCK | firewall/backend/тестирование | Все изменяющие firewall-проходы используют один kernel lock; fingerprint включает явные границы каждого набора, чтобы перенос одинаковых значений не маскировал изменение политики. Живой детерминированный тест удерживает тот же lock против фонового service и использует совместимый с BusyBox цикл `flock -n`. Файлы: `sheepfold-firewall`, `sheepfold-lock-common`, `remoteChecks.sh`, `runCurrentRuntimeMatrix.ps1`, `backendRuntimeSafety.test.mjs`, `liveRouterHarness.test.mjs`, `agent-gotchas.ru.md` |
| `§aiarch1` | AI_ASSISTANT_MODULAR_ARCHITECTURE | AI/архитектура | Папка `ai-assistant-development/` — единая точка входа; каждая идея имеет одно каноническое место, а новый модуль добавляется в карту документов. Файлы: `ai-assistant-development/README.md`, `modules.ru.md` |
| `§aiimpl1` | AI_CURRENT_IMPLEMENTATION | AI/архитектура | Каноническая карта уже работающих AI-компонентов, путей запроса, проверок доступа и ещё не реализованных границ. Файл: `ai-assistant-development/current-implementation.ru.md` |
| `§aidata1` | AI_MEMORY_DATA_MODEL | AI/данные | Память ИИ хранит происхождение, уверенность, срок актуальности и согласие; доступ к будущей реляционной БД идёт через repository-слой. Файл: `ai-assistant-development/data-model.ru.md` |
| `§aidlg01` | AI_DIALOGUE_SAFETY_POLICY | AI/этика | ИИ защищает безопасность, не разрушает религиозную опору без необходимости и обсуждает опасные идеи мягко, без скрытой манипуляции. Файл: `ai-assistant-development/dialogue-policy.ru.md` |
| `§airoad1` | AI_MEMORY_IMPLEMENTATION_ROADMAP | AI/процесс | Долговременная память и внешние интеграции вводятся поэтапно, с миграциями, подтверждением и тестами удаления. Файл: `ai-assistant-development/implementation-roadmap.ru.md` |
| `§aisecret` | AI_SECRET_MEMORY | AI/приватность | Управляемая категория памяти «Тайна»: локальное шифрование, минимальная передача, отдельное согласие и полное удаление. Файлы: `ai-assistant-development/data-model.ru.md`, `modules.ru.md` |
| `§smscmd` | SMS_COMMAND_TRANSPORT | интеграции/безопасность | Будущий транспорт команд через SMS требует разрешённых отправителей, защиты от повторов и подтверждения опасных действий. Файл: `ai-assistant-development/external-integrations.ru.md` |
| `§aippl01` | AI_KNOWN_SUBJECTS_MEMORY | AI/приватность | Таблица `known_subjects` охватывает всех известных из разговоров субъектов, а не только семью и друзей; память о поддержке, симптомах и диагнозах хранит происхождение каждого утверждения. Файл: `ai-assistant-development/data-model.ru.md` |
| `§aievnt1` | AI_FAMILY_EVENTS_MEMORY | AI/приватность | Семейные события хранятся отдельно, различают факт и интерпретацию, допускают версии разных участников и добавляются после подтверждения карточки события. Файл: `ai-assistant-development/data-model.ru.md` |
| `§aicomm1` | AI_COMMUNICATION_PROFILE | AI/этика | Профиль собеседника помогает тактично обсуждать опасные убеждения без ярлыка личности и автоматического наказания; `localNormJudgments` являются личными суждениями, а не фактами или подтверждёнными местными нормами. Файлы: `ai-assistant-development/data-model.ru.md`, `dialogue-policy.ru.md` |
| `§airel01` | AI_SPIRITUAL_CONTEXT | AI/приватность | `spiritualContext` раздельно хранит самоописание веры, её повседневную значимость, отношение к высшим силам и конфликтность религиозного обсуждения; чужое описание остаётся личным суждением. ИИ может уважительно использовать язык заповедей семьи, но не усиливает страх намеренно, не придумывает волю Бога и не обещает конкретное посмертное наказание. Файлы: `ai-assistant-development/data-model.ru.md`, `dialogue-policy.ru.md`, `ai-assistant-prompt-for-support-parent/v2/religious-context.md` |
| `§aiexec1` | AI_OPTIONAL_EXTERNAL_COMPUTE | AI/архитектура | Тяжёлые AI-задачи могут выполняться необязательным домашним или внешним worker, но основной контроль остаётся на роутере; worker не получает обратную карту алиасов и не применяет действия. Файл: `ai-assistant-development/privacy-proxy-and-external-compute.ru.md` |
| `§aimask1` | AI_LOCAL_PRIVACY_PROXY | AI/приватность | Секреты удаляются, идентификаторы псевдонимизируются, контекст минимизируется и при необходимости показывается в preview на роутере до первого внешнего перехода; псевдонимизация не называется анонимизацией. Файл: `ai-assistant-development/privacy-proxy-and-external-compute.ru.md` |
| `§aireg01` | AI_REGIONAL_HELP_SEEKING_RISKS | AI/безопасность | Региональные факторы являются снабжёнными источниками возможными препятствиями для обращения за помощью, а не характеристикой жителей; при угрозе здоровью безопасность и помощь идут раньше воспитательного разбора. Файлы: `ai-assistant-development/regional-risk-context.ru.md`, `ai-assistant-prompt-for-support-parent/v2/regional-risk-context.md` |
| `§aicare1` | AI_CAREGIVER_EMOTION_REGULATION | AI/безопасность | ИИ помогает взрослому распознать сильную эмоцию, остановить вред, перейти к обучению после паузы и восстановить отношения; понимание страха или неопытности не оправдывает насилие. Файлы: `ai-assistant-development/caregiver-emotion-regulation.ru.md`, `ai-assistant-development/data-model.ru.md`, `ai-assistant-prompt-for-support-parent/v2/caregiver-regulation.md` |
| `§aichild` | AI_CHILD_TRUSTED_SAFETY_ENTRY | AI/безопасность | Детский ИИ является честным тёплым доверенным собеседником и точкой входа в живую помощь; естественная привязанность не стыдится, но приложение не выращивает исключительность намеренно; при непосредственной угрозе safety-router выбирает самого быстрого безопасного получателя и может минимально уведомить родителя, не пересылая полный разговор. Файлы: `ai-assistant-development/child-trusted-assistant.ru.md`, `ai-assistant-development/parent-conversation-after-safety-signal.ru.md`, `apps/android-child-app-ru.md`, `ai-child-safety.ru.md`, `privacy.ru.md`, `security.ru.md` |
| `§aiescal` | AI_TACTFUL_RISK_ESCALATION | AI/безопасность | ИИ не молчит об опасном замалчивании, но возвращается к теме прозрачно и соразмерно риску; внешняя консультация живого специалиста добровольна, минимизирована и является отдельной передачей данных. Файлы: `ai-assistant-development/tactful-persistence-and-human-help.ru.md`, `ai-assistant-development/external-integrations.ru.md`, `ai-assistant-prompt-for-support-parent/v2/tactful-persistence.md`, `privacy.ru.md`, `security.ru.md` |
| `§ailegal` | AI_LEGAL_RISK_AND_RESTORATIVE_RESPONSE | AI/безопасность | ИИ различает непосредственную угрозу, тяжёлый уголовно-правовой риск и небольшой ненасильственный проступок; никогда сам не сообщает государству, не помогает скрывать продолжающийся вред и выбирает безопасную юридическую либо восстановительную помощь. Файлы: `ai-assistant-development/legal-risk-and-restorative-response.ru.md`, `ai-assistant-prompt-for-support-parent/v2/legal-risk-restorative-response.md`, `privacy.ru.md`, `security.ru.md` |
| `§aigov0` | AI_NEVER_CONTACTS_STATE | AI/безопасность | Sheepfold никогда сам не звонит, не пишет и не передаёт семейные данные государственным органам или экстренным службам. Он может дать проверенный контакт и помочь человеку подготовить обращение, но окончательное действие выполняет сам человек. Файлы: `ai-assistant-development/child-trusted-assistant.ru.md`, `ai-assistant-development/legal-risk-and-restorative-response.ru.md`, `privacy.ru.md`, `security.ru.md`, `user-agreement.ru.md` |
| `§aimed01` | AI_MEDIATOR_ACTIONS | AI/действия | Будущий автоматический режим без второго вопроса допускает только применение существующего расписания и обычной пользовательской группы; все остальные действия подтверждаются, а backend повторно проверяет строгую схему. Файлы: `ai-assistant-development/mediator-and-initiative.ru.md`, `ai-assistant-prompt-for-support-parent/v2/router-actions.md` |
| `§aisurv1` | AI_ADAPTIVE_SURVEYS_HYPOTHESES | AI/данные | Анкеты добровольны, а скрытые рабочие гипотезы допустимы только с provenance, confidence, альтернативами, сроком пересмотра и возможностью исправить или удалить. Файлы: `ai-assistant-development/adaptive-surveys-and-hypotheses.ru.md`, `ai-assistant-prompt-for-support-parent/v2/survey-drafts.md` |
| `§aistyle1` | AI_INTERACTION_STYLES | AI/диалог | Выбранный стиль меняет форму ответа, но никогда не ослабляет safety, приватность, честность или правила подтверждения. Файлы: `ai-assistant-development/interaction-styles.ru.md`, `ai-assistant-prompt-for-support-parent/v2/interaction-styles.md` |
| `§aiact01` | AI_ACTIVITY_INITIATIVE_CONSENT | AI/приватность | Сбор активности требует глобального и индивидуального разрешения родителя, не показывается ребёнку автоматически, сопровождается проверяемым по стране предупреждением о законных полномочиях и не даёт родителю сырого досье. Файлы: `ai-assistant-development/mediator-and-initiative.ru.md`, `ai-assistant-prompt-for-support-parent/v2/traffic-and-initiative.md`, `privacy.ru.md` |
| `§aiforgt` | AI_MEMORY_FORGETTING | AI/память | Субъект может попросить ИИ забыть собственные сведения; отдельный модуль каскадно удаляет исходные и производные AI-данные. При подтверждённой непосредственной угрозе минимальный контекст изолируется в `safetyHold` максимум на 72 часа без обычного поиска/export и удаляется, если субъект не попросил сохранить выбранную часть. Смерть не считается удалением: жизненный архив сохраняется, рабочие слои очищаются по своим срокам, приватность не раскрывается автоматически. Файлы: `ai-assistant-development/memory-lifecycle-and-forgetting.ru.md`, `ai-assistant-development/data-model.ru.md`, `ai-assistant-development/modules.ru.md` |
| `§aiconsc` | AI_CONSCIOUSNESS_ARCHITECTURE_NOTES | AI/архитектура | Рекомендации по технической непрерывности, слоям сознания, event-sourced памяти, консолидации, внешним worker и вопросам следующего этапа; это парковка идей, а не реализованный функционал. Файл: `ai-assistant-development/consciousness-architecture-notes.ru.md` |
| `§implaudit` | IMPLEMENTATION_AUDIT | тестирование/готовность | Доказательная локальная проверка реализованного функционала, исправленные дефекты, границы автотестов и сценарии для живого роутера. Файл: `implementation-audit-2026-07-16.ru.md` |
| `§testcat` | AUTOMATED_TEST_CATEGORIES | тестирование/инструменты | Перекрывающиеся предметные категории позволяют запускать ближайший набор во время разработки; карта обязана покрывать каждый test-файл, а полный набор выполняется перед push/PR/merge/release и после общих контрактных изменений. Файлы: `test-strategy.ru.md`, `tests/categories.mjs`, `scripts/run-test-category.mjs`, `tests/testCategories.test.mjs` |
| `§routerharness` | LIVE_ROUTER_AUTOMATION | тестирование/OpenWrt/LuCI | Исполняемый безопасный контур живого тестового роутера: отдельный SSH-ключ, частный IPv4, DPAPI для LuCI, раздельные endpoints LuCI (`http:80` на текущем роутере) и защищённого API (`https:5201`), backup до изменений, SHA-256 пакета, фиктивный MAC с обязательным restore и read-only Playwright desktop/mobile. На Windows созданные скрипты и приватные отчёты могут уходить во внешний `SHEEPFOLD_SCRIPT_SCRATCH_ROOT`; исходники остаются в Git. Hardware-команды, reboot и массовое обновление пакетов запрещены. Файлы: `live-router-automation.ru.md`, `live-router-testing.ru.md`, `tools/router-testing/`, `liveRouterHarness.test.mjs`, `AGENTS.md` |
| `§testwhy` | TEST_PURPOSE_DOCUMENTATION | тестирование/документация | Каждый новый или существенно изменённый тест/helper начинается с объяснения защищаемого риска, выбранного уровня, изменяемого состояния и границы доказательства; комментарий описывает замысел, а не строки кода. Затронутые старые тесты приводятся к правилу постепенно. Файлы: `AGENTS.md`, `CODING_RULES.md`, `test-strategy.ru.md` |
| `§lint1` | STATIC_ANALYSIS_GATE | тестирование/CI | ESLint проверяет LuCI с явными loader-глобалами и допустимым верхнеуровневым return, Node-скрипты и тесты; Android Lint через Gradle Wrapper проверяет оба APK без baseline, скрывающего ошибки. Обе проверки входят в Validate Sheepfold. Файлы: `eslint.config.js`, `package.json`, `scripts/runAndroidLint.mjs`, `.github/workflows/placeholder.yml`, `staticAnalysisTooling.test.mjs`, `CODING_RULES.md`, `test-strategy.ru.md` |
| `§qassist` | QUALITY_ASSISTANT_MODULES | тестирование/инструменты | Локальный детерминированный контур связывает точный Git diff и rename с риском, минимальными категориями, lint/docs/structure-проверками и строгим полным gate; all-pairs и read-only LuCI остаются специализированными модулями с явной границей доказательства. Файлы: `quality-assistants/`, `tools/quality/`, `scripts/runQualityChecks.mjs`, `scripts/checkDocumentation.mjs`, `scripts/inspectStructure.mjs`, `frontendAudit.mjs`, `qualityAssistants.test.mjs` |
| `§ipv6pod` | PODKOP_IPV6_COMPATIBILITY | интеграции/сеть | Видимая настройка IPv6 по умолчанию выключена, автоматически включается для режимов Podkop, применяется собственным sysctl-файлом Sheepfold и восстанавливает прежние kernel-значения без перезаписи чужих UCI-секций. Файлы: `podkop-ipv6.ru.md`, `features/integrations/panel.js`, `sheepfold-ipv6-control`, `routerIpv6.test.mjs` |
| `§slstres` | SITE_LIST_RESILIENCE | списки сайтов/backend | Каждый внешний источник ограниченно проверяется отдельно, рабочий кэш заменяется атомарно, полностью плохой или подозрительно укороченный источник сохраняет последнюю копию, повторяется через сутки и после трёх циклов уведомляет администраторов; после восстановления отправляется одно событие. Скачивание не считается доказательством применения DNS/firewall. Файлы: `site-list-sources.ru.md`, `sheepfold-site-lists`, `siteListResilience.test.mjs` |
| `§dompol` | SITE_DOMAIN_POLICY_RUNTIME | списки сайтов/DNS/firewall | Проверенное транзакционное применение итоговых белых и чёрных списков сайтов: отдельные топология `integration_mode` и исполнитель `site_filter_backend`, локальный dnsmasq `nftset`, один принадлежащий Sheepfold URL-фильтр AdGuard Home через официальный API, подтверждение статуса, встроенный fallback, сохранение пользовательских фильтров и отсутствие вмешательства в Podkop. Файлы: `site-domain-policy.ru.md`, `site-list-sources.ru.md`, `backend-design.ru.md`, `features/integrations/panel.js`, `sheepfold-domain-policy`, `sheepfold-adguard`, `sheepfold-adguard-list`, `sheepfold-firewall`, `30-sheepfold.nft`, `domainPolicyRuntime.test.mjs`, `adguardIntegration.test.mjs`, `firewallDomainPolicyRuntime.test.mjs` |
| `§aghplan` | ADGUARD_MANAGEMENT_ROADMAP | интеграция/API/план | `adguard_auto_manage=1` разрешает только управление URL-фильтром Sheepfold. Адаптер ограничивает endpoints, query, время/размер/схему ответа; read-only `check_host` сверяет точный текст контрольного `.test`-правила и ID собственного фильтра, но не подменяет проверку DNS-пути клиента. Доступность token-protected ленты проверяется отдельно через `uhttpd`; смена токена отключает прежний точный URL, дубликаты URL отклоняются, а после трёх последовательных сбоев и последующего восстановления создаются дедуплицированные уведомления. Каждая будущая запись в глобальные настройки требует отдельного предпросмотра, подтверждения и доказуемого отката. Файлы: `adguard-home-automatic-management-roadmap.ru.md`, `sheepfold-adguard`, `sheepfold-service`, `adguardIntegration.test.mjs` |
| `§ownques` | OWNER_OPEN_QUESTIONS | продукт/архитектура | Канонический список ещё не принятых владельцем решений с рекомендациями; после ответа решение переносится в требования и вопрос удаляется. Файл: `owner-open-questions.ru.md` |
| `§stdplan` | STANDARD_IPK_CONTINUATION | передача работы/проверка | Точная точка остановки проверки Standard IPK: уже внесённые изменения, реально выполненные проверки, неподтверждённые пункты и порядок безопасного продолжения. Файл: `standard-ipk-continuation-plan-2026-07-16.ru.md` |
| `§pkgmgr1` | OPENWRT_PACKAGE_MANAGER_ADAPTER | OpenWrt/пакеты | Все установленные backend-скрипты используют `sheepfold-package-manager` как единый контракт для определения, версии, установки, удаления и сравнения пакетов: `opkg` на OpenWrt 24.10 и старше, `apk` v3 на 25.12 и новее. Массовое upgrade запрещено. Bootstrap `install.sh` дублирует только минимальный контракт до первой установки. Файлы: `sheepfold-package-manager`, `install.sh`, `sheepfold-updater`, `uninstall.sh`, `packageManagerAdapter.test.mjs` |
| `§owrtci1` | OPENWRT_CANONICAL_GITHUB_ACTIONS_BUILD | OpenWrt/CI/релизы | Публичные Standard/AI Support собираются официальным закреплённым OpenWrt SDK: IPK для 24.10 и настоящий apk-tools v3 APK для 25.12. Matrix проверяет внутренние метаданные, целостность, полноту четырёх роутерных файлов, SHA-256 и только затем прикрепляет их к обычному Release. Файлы: `github-actions-openwrt-build.ru.md`, `.github/workflows/build-openwrt-packages.yml`, `scripts/sheepfold_variants.py`, `scripts/prepare-openwrt-sdk-feed.py`, `scripts/collect-openwrt-package.py`, `scripts/create-openwrt-release-manifest.py`, `openWrtBuildWorkflow.test.mjs`, `openWrtVariantFeed.test.mjs` |
| `§patchov1` | EXTERNAL_LAYERED_UPDATE_INTAKE | разработка/качество/Windows | Внешний многоступенчатый архив принимается только после проверки хешей, применения на чистом клоне, LuCI-aware валидации и полного проектного прогона финального дерева; порядок внутренних overlay и встроенный installer не считаются доказательством корректности. Файлы: `agent-gotchas.ru.md` |
| `§updsafe` | UPDATER_TRANSACTION_SAFETY | обновление/OpenWrt-пакет | Updater принимает только asset нужного варианта из официального GitHub release path, ограничивает загрузку, проверяет gzip-tar IPK либо ADB APK и внутренние метаданные до package manager, сохраняет реальный код ошибки и восстанавливает прежний UCI-конфиг. Это не является бинарным rollback. Файлы: `update-safety.ru.md`, `sheepfold-updater`, `Makefile`, `build-test-ipk.py`, `updateTransportSafety.test.mjs` |
| `§listnoref` | ACCESS_LIST_WITHOUT_PAGE_RELOAD | LuCI/UCI/списки устройств | Немедленное добавление в белый или чёрный список устройств выполняется backend-командой с commit и применением правил; frontend затем сбрасывает только локальный UCI-кэш, перечитывает inventory и обновляет DOM без системного LuCI apply и перезапуска страницы. Файлы: `troubleshooting.ru.md`, `overview.js`, `allowlistUi.test.mjs` |
| `§wifitgl1` | WIFI_NETWORK_TOGGLE | LuCI/Wi-Fi/UCI | Каждая AP-карточка, включая выключенную, показывает ON/OFF после значка диапазона; состояние сохраняется общей кнопкой Wi-Fi через обратный UCI-флаг `wifi-iface.disabled`. При включении AP на выключенном radio снимается также `wifi-device.disabled`, а явные состояния остальных показанных SSID сохраняются. Файлы: `overview.js`, `features/wifi/cards.js`, `features/wifi/editor.js`, `sheepfold.css`, `overviewUi148.test.mjs` |
| `§settingtabs1` | SETTINGS_TABS_SAVE_LAYOUT | LuCI/настройки/UI | Две строки табов настроек заканчиваются отдельным толстым разделителем; верхняя кнопка «Сохранить настройки» всегда находится собственной строкой ниже разделителя и до содержимого активного таба. Файлы: `overview.js`, `sheepfold.css`, `overviewUi148.test.mjs` |
| `§devident1` | MULTIFACTOR_DEVICE_IDENTITY_SUGGESTION | устройства/SSDP/UPnP/WS-Discovery/безопасность | Ограниченные mDNS TXT, LAN-привязанные SSDP/WS-Discovery и SSRF-safe UPnP description дополняют классификацию; сильный HMAC UUID/serial либо два слабых семейства могут только предложить родителю, что новый MAC похож на прежнее физическое устройство. UPnP остаётся недоверенным вторичным сигналом и один не выдаёт прав. Один UUID у двух online-MAC изолирует только более новую карточку. Автоматической связи и переноса прав нет; account identity из TLS-трафика не выводится. Файлы: `device-detection.ru.md`, `device-detection-research.ru.md`, `device-identification-design.ru.md`, `sheepfold-device-detector`, `sheepfold-device-identity`, `sheepfold-device-upnp-description`, `device-mdns.uc`, `device-ssdp.uc`, `device-ws-discovery.uc`, `deviceIdentityLinking.test.mjs`, `deviceDiscoverySecurity.test.mjs`, `fixtures/deviceFingerprints.json` |
| `§merge01` | FULL_LOGICAL_DEVICE_MERGE | устройства/идентичность/UI/аудит | Родитель запускает объединение из блока идентификации конкретной карточки и подтверждает его после сравнения. Все MAC, история и политики становятся одним логическим устройством; меньший постоянный `#ID` остаётся основным, поглощённые ID навсегда сохраняются как audit-alias и не переиспользуются. Автоматика не объединяет записи. Для админского устройства токены отзываются и требуется новое QR-сопряжение. Файлы: `AGENTS.md`, `product-requirements.md`, `device-passport-and-control.ru.md`, `device-detection-research.ru.md`, `agent-gotchas.ru.md` |
| `§detlife1` | EVENT_DRIVEN_DEVICE_IDENTITY_LIFECYCLE | устройства/автоопределение/безопасность | Анализ запускается после offline→online с задержкой 20 секунд, 90-секундный grace подавляет flapping, а startup/суточный проход берёт только online-устройства. Классификационный hash отделён от versioned HMAC identity baseline; три обезличенных evidence-снимка вращаются только при изменении hash. Один bounded hostapd-снимок даёт лишь слабые нормализованные Wi-Fi-подсказки типа: raw rate остаётся в RAM и не влияет на identity либо `Без ограничений`. Противоречащий прежнему MAC или новый online-MAC с уже занятым UUID получает бессрочный block/restrict internet overlay, а LuCI/SSH/API закрываются в обоих режимах. Чёрный список устройств исключает классификацию и сканирование, но сохраняет presence и журнал запретов. Файлы: `AGENTS.md`, `device-detection.ru.md`, `device-detection-research.ru.md`, `device-identification-design.ru.md`, `hidden-settings.ru.md`, detector/service/presence/identity/firewall/reclassify, `deviceDetectionService.test.mjs`, `devicePresence.test.mjs`, `deviceIdentityLinking.test.mjs`, `deviceDetectorSafety.test.mjs`, `deviceEvidenceHistory.test.mjs`, `firewallIntegration.test.mjs` |
| `§devpas1` | DEVICE_PASSPORT_END_TO_END | устройства/документация/архитектура | Канонический сквозной контракт паспорта устройства: различает MAC-карточку, пользовательский ID, current/recent presence, bounded DHCP/mDNS/SSDP/UPnP/WS-Discovery observations, classification fingerprint, HMAC trusted baseline, quarantine overlay, provenance ручных полей, автогруппы, firewall, уведомления и недоверенные Android-отчёты. Перед изменением любого из этих слоёв агент читает весь документ и сохраняет границы ответственности. Файлы: `AGENTS.md`, `agent-playbook.ru.md`, `device-passport-and-control.ru.md`, README, профильные device-документы |
| `§adrproc` | ARCHITECTURE_DECISION_RECORDS | архитектура/документация | ADR фиксирует контекст, варианты, принятое решение, последствия, проверку и условие пересмотра; профильный документ остаётся источником подробного текущего поведения. Принятый ADR не переписывают задним числом, а заменяют новым номером. Файлы: `docs/architecture/`, `architectureDecisions.test.mjs`, `AGENTS.md` |
| `§debug01` | ROOT_CAUSE_AND_FRESH_VERIFICATION | диагностика/процесс | Дефект сначала воспроизводится и прослеживается через UI/API/UCI/runtime, затем проверяется одна root-cause гипотеза и добавляется ближайший regression test. Завершение требует свежего результата; toast, screenshot и статический assertion доказывают только свой слой. Файлы: `debugging-and-verification.ru.md`, `AGENTS.md`, `CODING_RULES.md` |
| `§impact1` | CHANGE_IMPACT_REVIEW | ревью/инструменты | Карта путей предупреждает о соседних LuCI/backend/UCI/Android/firewall/package границах, рекомендует пересекающиеся тестовые категории и отмечает общий контракт для полного прогона. Неизвестный путь остаётся видимым и требует ручной оценки. Файлы: `change-impact-review.ru.md`, `inspectChangeImpact.mjs`, `changeImpact.test.mjs` |
| `§uxrev01` | USER_INTERFACE_REVIEW_CONTRACT | UX/тестирование | Интерфейс проверяется для занятого слабого пользователя: понятные команды, замкнутые состояния, честный success, доступные имена, ненулевые hit areas, отсутствие mobile/desktop overflow и технического текста. Read-only Playwright не меняет UCI и не заменяет ручное визуальное ревью. Файлы: `ui-review-contract.ru.md`, `frontendSmoke.mjs`, `liveRouterHarness.test.mjs` |
| `§apicon1` | ROUTER_API_CONTRACT | API/совместимость | Router backend владеет решением и подтверждает persistence/runtime; клиенты получают структурированные status/errorCode, безопасные defaults и capability/version evolution. Неоднозначные неидемпотентные команды не повторяются автоматически. Файлы: `api-contracts.ru.md`, `backend-design.ru.md`, `android-openwrt-api.ru.md` |
| `§pairmat` | PAIRWISE_RUNTIME_MATRIX | тестирование/комбинации | Детерминированная all-pairs матрица сокращает обычные сочетания формата пакета, редакции и интеграций, сохраняя обязательные edge-cases. Она не заменяет security-инварианты, migration/rollback и реальные OpenWrt/DNS/firewall проверки. Файлы: `tools/quality/`, `runtimeCompatibilityMatrix.test.mjs`, `test-strategy.ru.md` |
| `§roadmap` | CURRENT_PROJECT_DEVELOPMENT_ROADMAP | процесс/планирование | Единый актуальный порядок дальнейшей разработки: сначала слияние проверенного инструментария и Standard-ядро, затем доказательство router runtime, Android и release gate; большая AI-архитектура отложена до стабилизации основного продукта. Файлы: `project-development-roadmap.ru.md`, `agent-fast-start.ru.md`, README, `current-implementation-status.md` |

---

*Файл поддерживается разработчиками и ИИ-агентами вручную. При добавлении нового тега — обязательно добавить строку в нужный раздел. При удалении или изменении смысла — обновить/удалить строку и найти все вхождения через `grep -r '§XXXXXXX' .`*
| `§maintjob1` | Background log rotation, conservative offline-device cleanup and notification-only update checks | `docs/maintenance-jobs.ru.md`, `sheepfold-maintenance`, `tests/maintenanceJobs.test.mjs` |
| `§apicon1` | Shared LuCI command coalescing, structured feedback and local refresh | `docs/luci-command-actions.ru.md`, `core/backend/actions.js`, `sheepfold-luci-action`, `tests/luciCommandActions.test.mjs` |
| `§persist1` | Narrow LuCI UCI/device/Wi-Fi/backup/pairing persistence boundaries | `docs/luci-persistence-adapters.ru.md`, `core/persistence/uci.js`, `features/*/persistence.js`, `tests/luciPersistenceAdapters.test.mjs` |
| `§coordclean1` | Final LuCI coordinator cleanup for schedule/group persistence, settings side effects and discovery payloads | `docs/luci-coordinator-cleanup.ru.md`, `features/{schedules,groups,settings,router}`, `tests/luciCoordinatorCleanup.test.mjs` |
| `§settingview1` | Settings/device presentation extracted from the LuCI coordinator | `docs/luci-overview-settings-extraction.ru.md`, `features/settings/{fields,misc,storage,ai}.js`, `features/devices/type-control.js`, `tests/overviewSettingsExtraction.test.mjs` |
| `§ovfinal1` | Final four-line overview bootstrap and explicit bounded application/controllers | `docs/chatgpt-final-overview-refactoring.ru.md`, `features/overview/application.js`, `tests/overviewFinal*.test.mjs` |
| `§ovaudit4` | Pre-final r252 regression pass for refresh semantics, cumulative hardening and runtime edge cases | `docs/chatgpt-final-overview-refactoring.ru.md`, `tests/overviewFinalExperimentalR252.test.mjs`, `tests/overviewFinalRefreshSemantics.test.mjs`, `tests/finalAuditHardening.test.mjs` |
| `§ovaudit5` | Final r252 self-audit: fail-closed LuCI UCI transactions, cross-admin/group invariants, and experimental regressions | `docs/chatgpt-final-overview-refactoring.ru.md`, `tools/quality/luciFinalAudit.mjs`, `tests/overviewFinalExperimentalR252.test.mjs`, `tests/overviewFinalRuntime.test.mjs` |
