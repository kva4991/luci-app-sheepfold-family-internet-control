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
| `§pm3kq7r` | NAMING_BY_LAYER | стиль | Именование зависит от слоя: JS/Kotlin/JSON — camelCase; OpenWrt UCI, shell и Makefile — нативный стиль OpenWrt. Для новых локальных переменных и приватных полей предпочтительно говорящее имя примерно до 15 символов, но понятность важнее длины, а рефакторинг только ради лимита не требуется. Переименование UCI-полей — только с миграцией. Файлы: `CODING_RULES.md`, `AGENTS.md`, `ai-dev-guide.ru.md` |
| `§frontmod` | FRONTEND_BY_DOMAIN | архитектура | LuCI frontend делится на route/composition в `view/sheepfold`, инфраструктуру в `sheepfold/core`, общие UI-части в `sheepfold/shared` и предметные модули в `sheepfold/features/<area>`. Не создавать общий склад `utils.js`; `overview.js` уменьшать поэтапно с тестами. Файлы: `CODING_RULES.md`, `AGENTS.md`, `docs/frontend-architecture.ru.md` |
| `§devinv` | ROUTER_DEVICE_INVENTORY | LuCI/DHCP | Модель устройств объединяет DHCP leases, ARP/neighbour, постоянные DHCP-аренды и UCI Sheepfold по нормализованному MAC. Имя существующей секции `dhcp host` обязательно сохраняется, чтобы редактирование не создавало дубли. Файлы: `features/devices/inventory.js`, `frontendDomainModels.test.mjs`, `frontend-architecture.ru.md` |
| `§lstxcl1` | DEVICE_ACCESS_LIST_EXCLUSIVITY | доступ/UX | Один MAC не может состоять одновременно в белом и чёрном списке устройств; конфликт отклоняется с понятным сообщением, без автоматического переноса между списками. Файлы: `agent-playbook.ru.md`, `features/devices/access-lists.js`, `overview.js`, `sheepfold-router-control-legacy`, тесты списков и backend |
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
| `§b5wkq2e` | API_CLIENT_STATUS_NO_TOKEN | безопасность | `/client-status` не требует Bearer-токена — идентифицирует устройство по IP из DHCP. Это исключение из общего правила токенов. Тег: здесь логика исключения или её последствия. Файлы: `backend-design.ru.md`, `apps/android-child-app-ru.md` |

---

## 🛡️ Логика доступа к сети

Теги о приоритетах правил ограничения доступа для устройств в сети.

| Тег | Имя | Описание |
|-----|-----|--------|
| `§84azytj` | ACCESS_PRIORITY_ORDER | Фактический фиксированный порядок устройства: blocklist → admin-devices → no-restrictions → allowlist → global-block → temp-access → device-schedule → group-schedule → default. Emergency-sites являются отдельным доменным исключением. LuCI показывает порядок без редактирования, пока единый configurable runtime не реализован в status API и nftables. |
| `§emerg1` | EMERGENCY_SITES_RUNTIME | UCI-карточки аварийно-полезных сайтов, проверка домена, dnsmasq nftset/fallback-resolve и узкие web-исключения до блокирующих правил. Не открывает LuCI/SSH/API и не обещает строгую изоляцию при общих CDN IP. Файлы: `emergency-sites-runtime.ru.md`, `features/emergency/sites.js`, `sheepfold-emergency-sites`, `30-sheepfold.nft`, `emergencySites.test.mjs`. |
| `§cfgbak1` | SETTINGS_BACKUP_AND_IMPORT | Полный состав Sheepfold/DHCP/Wi-Fi backup, безопасный JSON без секретов, AES-256-GCM full backup, строгая проверка и UCI rollback. Файлы: `settings-backup.ru.md`, `features/settings/backup.js`, `overview.js`, `sheepfold-router-control-legacy`, `settingsBackup.test.mjs`. |
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
| `§e8kxtjc` | DETECT_HARD_DENY | безопасность | Роутеры, AP, mesh, репитеры, принтеры, телефоны, ПК, TV, консоли — **никогда** не в «Без ограничений» автоматически. Тег: здесь проверка жёсткого запрета. Файлы: `device-detection.ru.md` |
| `§nz3lhp0` | DETECT_NO_AUTO_REMOVE | инвариант | Sheepfold **не удаляет** существующие назначения групп автоматически. Только владелец вручную. Тег: здесь логика, которую легко ошибочно нарушить. Файлы: `device-detection.ru.md` |

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
| `§dscqr01` | ANDROID_DISCOVERY_AND_PAIRING_ERRORS | Android/API | Автопоиск читает well-known через штатный HTTPS, узнаёт фактический API-порт, проверяет endpoint и никогда не показывает пустую/`undefined` ошибку QR-сопряжения; после сопряжения родительский APK восстанавливает изменённый порт только через уже закреплённый сертификат и не повторяет команду после неоднозначного тайм-аута; backend ищет MAC телефона в DHCP, neighbour и ARP. Файлы: `LocalRouterDiscovery.kt`, `RouterEndpointRecovery.kt`, `SecureRouterConnectionManager.kt`, `sheepfold-pair-common`, `android-config.ru.md`, `troubleshooting.ru.md` |
| `§prodvar` | STANDARD_AND_AI_PRODUCT_VARIANTS | архитектура/релизы | Из общего ядра собираются два release-IPK с одним внутренним package identity и два единых APK. Standard физически не содержит AI/activity-backend; переход Standard ↔ AI сохраняет UCI-конфиг, Android flavors для AI запрещены, а AI UI открывается только по положительной capability роутера. Файлы: `product-variants.ru.md`, `product-variants-implementation-task.ru.md`, `AGENTS.md`, `install.sh`, `scripts/build-test-ipk.py`, `scripts/verify-android-variant.py`, `tests/productVariants.test.mjs` |
| `§f8ck5ry` | PLAYBOOK_WIFI_DISABLE_DISCLAIMER | UX/Wi-Fi | Перед включением авто-выключения Wi-Fi нужен непропускаемый дисклеймер с 10-секундным таймером. Файлы: `agent-playbook.ru.md` |
| `§p1zt6ow` | PLAYBOOK_FULL_EXPORT_ENCRYPTED | безопасность | Full export with secrets разрешён только в encrypted-виде и не является default export. Файлы: `agent-playbook.ru.md` |
| `§c7ds2xv` | PLAYBOOK_BLOCKED_PAGE_IOT_SHORT_RESPONSE | совместимость | IoT/API-клиенты при блокировке получают короткий предсказуемый HTTP/TCP-ответ, а не тяжёлую HTML-страницу. Файлы: `agent-playbook.ru.md` |
| `§r2at5nq` | PLAYBOOK_SINGLE_MESSENGER_ADAPTER | архитектура | Один роутер — один активный messenger adapter. Файлы: `agent-playbook.ru.md` |
| `§t4lq9bw` | PLAYBOOK_AI_ADVISES_NOT_ACTS | безопасность/AI | ИИ-помощник не управляет роутером сам; он советует, а действия применяются только после явного подтверждения parent/admin. Файлы: `agent-playbook.ru.md` |
| `§u6fj2sr` | PLAYBOOK_AI_NO_AUTO_SENSITIVE_CONTEXT | приватность/AI | MAC/IP/device names/child names/family details/logs/device lists/router settings не отправляются AI автоматически. Файлы: `agent-playbook.ru.md` |
| `§z5ck8mv` | PLAYBOOK_ANDROID_PARENT_ADMIN | Android | Основное Android-приложение `android/` — только для телефонов родителей-администраторов. Детское приложение живёт отдельно в `android-child/`, не имеет административных функций и получает только собственный статус через `/client-status`. Файлы: `agent-playbook.ru.md`, `AGENTS.md`, `security.md`, `product-requirements.md` |
| `§mrgready` | MERGE_READINESS_PLAN | процесс разработки | Подробная контрольная точка и перечень обязательных проверок перед слиянием `editsByClaude` с `main`, включая причины и критерии готовности. Файл: `merge-readiness-plan.ru.md` |
| `§revspot` | MERGE_CODE_REVIEW_HOTSPOTS | code review | Карта наиболее рискованных мест и инвариантов, которые надо проверить в коде перед слиянием: installer/UCI, API/auth, HTTPS/pairing, LuCI, Android, detector, AI, журнал и тесты. Файл: `merge-readiness-plan.ru.md` |
| `§toolwin` | WINDOWS_REPOSITORY_TOOLCHAIN | окружение | Воспроизводимое Windows-окружение ставится/проверяется через `tools/windows/`; скрипт устанавливает 7-Zip/ripgrep, находит скрытый от Codex `winget`, выбирает Python/JDK 17 без конфликта версий, бережно повторяет Android SDK-загрузки и прогревает Gradle Wrapper. Тяжёлые SDK и кэши не коммитятся. Файлы: `tools/README.ru.md`, `agent-environment.ru.md`, `agent-gotchas.ru.md`, `AGENTS.md` |
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
| `§detload` | BOUNDED_DETECTOR_LOAD | автоопределение/backend | Порт-сканирование одного устройства кэшируется на 6 часов, параметры `nmap` ограничиваются, ручное переопределение ставит выбранный MAC первым; быстрый firewall tick отделён от более редких фоновых операций. Файлы: `device-identification-design.ru.md`, `hidden-settings.ru.md`, `AGENTS.md`, detector/service |
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
| `§slstres` | SITE_LIST_RESILIENCE | списки сайтов/backend | Каждый внешний источник ограниченно проверяется отдельно, рабочий кэш заменяется атомарно, полностью плохой или подозрительно укороченный источник сохраняет последнюю копию, повторяется через сутки и после трёх циклов уведомляет администраторов; после восстановления отправляется одно событие. Скачивание не считается доказательством применения DNS/firewall. Файлы: `site-list-sources.ru.md`, `sheepfold-site-lists`, `siteListResilience.test.mjs` |
| `§dompol` | SITE_DOMAIN_POLICY_RUNTIME | списки сайтов/DNS/firewall | Проверенное транзакционное применение итоговых белых и чёрных списков сайтов: локальный dnsmasq `nftset` в режимах `none`/`podkop`, делегирование AdGuard Home в режимах `adguard`/`adguard_podkop`, последняя рабочая конфигурация, отказ без ложной блокировки и отдельные наборы Sheepfold без вмешательства в Podkop. Файлы: `site-domain-policy.ru.md`, `site-list-sources.ru.md`, `backend-design.ru.md`, `sheepfold-domain-policy`, `sheepfold-firewall`, `30-sheepfold.nft`, `domainPolicyRuntime.test.mjs`, `firewallDomainPolicyRuntime.test.mjs` |
| `§ownques` | OWNER_OPEN_QUESTIONS | продукт/архитектура | Канонический список ещё не принятых владельцем решений с рекомендациями; после ответа решение переносится в требования и вопрос удаляется. Файл: `owner-open-questions.ru.md` |
| `§stdplan` | STANDARD_IPK_CONTINUATION | передача работы/проверка | Точная точка остановки проверки Standard IPK: уже внесённые изменения, реально выполненные проверки, неподтверждённые пункты и порядок безопасного продолжения. Файл: `standard-ipk-continuation-plan-2026-07-16.ru.md` |
| `§updsafe` | UPDATER_TRANSACTION_SAFETY | обновление/IPK | Updater принимает только asset нужного варианта из официального GitHub release path, ограничивает загрузку, проверяет gzip-tar IPK и метаданные до `opkg`, сохраняет реальный код ошибки и восстанавливает прежний UCI-конфиг. Это не является бинарным rollback. Файлы: `update-safety.ru.md`, `sheepfold-updater`, `Makefile`, `build-test-ipk.py`, `updateTransportSafety.test.mjs` |

---

*Файл поддерживается разработчиками и ИИ-агентами вручную. При добавлении нового тега — обязательно добавить строку в нужный раздел. При удалении или изменении смысла — обновить/удалить строку и найти все вхождения через `grep -r '§XXXXXXX' .`*
