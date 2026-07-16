# Локализация

Sheepfold должен быть готов к многоязычному интерфейсу с самого начала.

## Принципы

- Не зашивать пользовательские строки напрямую в LuCI JS, Android Kotlin, сообщения бота или shell-вывод, если эти строки являются частью интерфейса.
- Использовать стабильные ключи переводов.
- Русский считать основным источником продуктовых формулировок.
- Английский считать обязательным fallback-языком.
- Переводы на популярные языки можно генерировать автоматически, а затем давать сообществу возможность исправлять их.
- Если перевод отсутствует, использовать английский.
- Файлы переводов маленькие, поэтому их лучше хранить прямо в репозитории/пакете, а не скачивать отдельно.

## Обязательные языки

Эти языки должны поддерживаться как основные:

| Locale | Язык |
| --- | --- |
| `ru` | Русский |
| `en` | Английский |

## Планируемые популярные языки

Эти языки планируются для сгенерированных переводов интерфейса:

| Locale | Язык |
| --- | --- |
| `es` | Испанский |
| `de` | Немецкий |
| `fr` | Французский |
| `pt-BR` | Португальский (Бразилия) |
| `it` | Итальянский |
| `pl` | Польский |
| `tr` | Турецкий |
| `uk` | Украинский |
| `zh-Hans` | Китайский упрощённый |
| `ja` | Японский |
| `ko` | Корейский |
| `ar` | Арабский |
| `hi` | Хинди |
| `id` | Индонезийский |
| `vi` | Вьетнамский |

## Что переводить

Переводить:

- пункты меню LuCI;
- формы и вкладки LuCI;
- экраны Android-приложения;
- Android-виджеты;
- команды и ответы бота;
- ошибки валидации;
- диалоги подтверждения;
- справку и подсказки;
- описания аварийно-полезных сайтов.

Не переводить:

- имя пакета: `luci-app-sheepfold-family-internet-control`;
- имя проекта: `Sheepfold`;
- Android package: `app.sheepfold.android`;
- домены;
- примеры MAC/IP;
- shell-команды.

## Правила нейминга

- Использовать `Sheepfold` как имя проекта на всех языках.
- Использовать `Sheepfold` как публичное название Android-приложения и имя продукта в LuCI. Не писать `Овчарня` в публичных текстах без отдельного решения владельца проекта.
- Фичу `Доступ к аварийно-полезным сайтам` переводить по смыслу, а не дословно.

## LuCI: gettext, `.po` и `.lmo`

### Строки в JavaScript

- Использовать только штатный LuCI `_('...')`, не локальный словарь `T()`.
- Текст внутри `_('...')` пишется **на английском** — это msgid и fallback, если перевода нет.
- Переводы живут в `po/<lang>/sheepfold.po`; шаблон — `po/templates/sheepfold.pot`.
- Обновление каталогов: `xgettext.sh` / `msgmerge.sh` (см. [`CODING_RULES.md`](../CODING_RULES.md) §8.2).

### Бинарный каталог на роутере

LuCI подгружает переводы из **`/usr/lib/lua/luci/i18n/sheepfold.<lang>.lmo`**.

Без `sheepfold.ru.lmo` на роутере экран останется на английских msgid, даже если в настройках указан русский язык. Это **не** проблема кэша браузера.

Сборка `.lmo` для тестового IPK: `scripts/po2lmo.py` (вызывается из `scripts/build-test-ipk.py`). Проверка: `tests/testIpkI18n.test.mjs`.

### Два разных «языка»

| Параметр | Где задаётся | Что влияет |
| --- | --- | --- |
| `sheepfold.global.language` | Установщик (`install.sh`), настройки приложения | Язык интерфейса Sheepfold (`sheepfold/i18n/<lang>.json`), имена групп по умолчанию, часть backend-текстов |
| `luci.main.lang` | Установщик (`install.sh`), системные настройки LuCI | Язык **всего** LuCI (меню OpenWRT, системные экраны) |
| `sheepfold.global.luci_language_synced` | `postinst`, `install.sh` | Флаг «язык LuCI уже синхронизирован с выбором при установке»; при `1` обновление пакета не перезаписывает `luci.main.lang` |

Для русского интерфейса **Sheepfold** нужны `sheepfold.global.language=ru` и файл `sheepfold/i18n/ru.json` в пакете (плюс `sheepfold.ru.lmo` для совместимости с gettext LuCI). Язык роутера (`luci.main.lang`) при смене языка в настройках Sheepfold **не меняется**.

### Безопасная генерация JSON-каталогов

`.po` является источником истины, а клиентский JSON генерируется из него:

```powershell
python scripts/po2json.py package/luci-app-sheepfold-family-internet-control/po/ru/sheepfold.po package/luci-app-sheepfold-family-internet-control/htdocs/luci-static/resources/sheepfold/i18n/ru.json
python scripts/po2json.py po/zh_Hans/sheepfold.po package/luci-app-sheepfold-family-internet-control/htdocs/luci-static/resources/sheepfold/i18n/zh_Hans.json
```

Не прогоняйте эти JSON-файлы через `ConvertFrom-Json` / `ConvertTo-Json` в Windows PowerShell 5. Его свойства нечувствительны к регистру, поэтому корректные разные msgid `Clear log` и `clear log` конфликтуют. `scripts/po2json.py` сохраняет регистр и прекращает сборку, если один и тот же точный msgid случайно получил два разных перевода. (§i18ncase)

### Установка и English

Цепочка при **первой** установке через `install.sh`:

1. Пользователь выбирает `en` или `ru`.
2. До установки пакета выбор пишется в `/etc/sheepfold/install.language`.
3. `sheepfold-default-groups apply` (из `postinst`) переносит язык в `sheepfold.global.language`, выставляет `luci.main.lang` той же меткой и `luci_language_synced=1`, затем удаляет `install.language`.
4. Если `postinst` ещё не видел флага синхронизации, он один раз копирует `sheepfold.global.language` → `luci.main.lang` (резерв для установки без `install.language`).

Для **английского** Sheepfold отдельный `sheepfold.en.lmo` не обязателен: msgid в `overview.js` уже на английском. Для **русского** без `sheepfold.ru.lmo` экран останется на msgid.

Меню **всего** OpenWRT/LuCI (вне вкладок Sheepfold) остаётся на `luci.main.lang`. Sheepfold загружает свой каталог переводов по `sheepfold.global.language` через модуль `sheepfold/i18n.js`.

### Если после установки English UI всё ещё русский

На уже установленном роутере:

```sh
uci set sheepfold.global.language=en
uci set luci.main.lang=en
uci set sheepfold.global.luci_language_synced=1
uci commit sheepfold
uci commit luci
rm -f /tmp/luci-* /var/luci-indexcache*
```

Либо в Sheepfold: **Настройки → Язык приложения → English → Сохранить** (страница перезагрузится; меняется только `sheepfold.global.language`).

Автотест: `tests/installLanguage.test.mjs`.

В **настройках Sheepfold** («Язык приложения») при сохранении значение записывается только в `sheepfold.global.language`, затем страница перезагружается и подгружает `sheepfold/i18n/<lang>.json`. `luci.main.lang` не трогается. До сохранения экран остаётся на прежнем языке приложения.

### Что не переводить через gettext

- Имена групп устройств в UCI (`sheepfold.no_restrictions.name` и т.д.) — пользовательские сущности, см. [`docs/default-groups.ru.md`](default-groups.ru.md).
- Технические метки источника в детекторе (`arp`, `dhcp`, `static`) — не имена устройств.
