# UCI-конфиг Sheepfold: шаблон, обновления и миграции

> Для разработчиков и AI-агентов. Читать при изменении `/etc/config/sheepfold`, `postinst`, структуры UCI-секций или сборки `.ipk`.

Связанные файлы:

- `package/luci-app-sheepfold-family-internet-control/Makefile` — `preinst`, `postinst`
- `package/.../root/usr/share/sheepfold/sheepfold.uci.defaults` — справочный шаблон первой установки
- `docs/backend-design.ru.md` — описание секций и полей UCI
- `docs/live-router-testing.ru.md` — проверка обновления на живом роутере

---

## Два разных файла — не путать

| Путь | Роль | Когда меняется |
|---|---|---|
| `/etc/config/sheepfold` на роутере | **Живой** конфиг пользователя: устройства, группы, секреты, настройки | LuCI, Android, `postinst`, ручные правки |
| `/usr/share/sheepfold/sheepfold.uci.defaults` в пакете | **Справочный шаблон** только для первой установки | При изменении структуры дефолтов в репозитории |

**Важно:** шаблон **не** кладётся в payload пакета как `/etc/config/sheepfold`. Иначе при каждом `opkg upgrade` opkg сравнивает живой конфиг с шаблоном из `.ipk`, видит отличия и создаёт `/etc/config/sheepfold-opkg` с предупреждением `resolve_conffiles`. Такие файлы копятся на overlay.

**Нельзя** оставлять `/etc/config/sheepfold` в `conffiles`, если файл **не** входит в payload нового пакета. На обновлении с версий, где конфиг ещё поставлялся в `.ipk`, opkg может вывести `Removing obsolete file /etc/config/sheepfold` и удалить живой конфиг, после чего появятся ошибки `file_sha256sum_alloc: Failed to open file /etc/config/sheepfold`.

Защита при обновлении:

1. `preinst` при `upgrade|install` копирует живой конфиг в `/etc/sheepfold/migrations/sheepfold.config.pre-upgrade`.
2. `postinst` в начале вызывает `recover_sheepfold_config`: если `/etc/config/sheepfold` пропал — восстановить из бэкапа, `sheepfold-opkg` или `sheepfold.uci.defaults`.
3. Только **после** восстановления удалять `sheepfold-opkg` / `sheepfold-opkg.old`.

---

## Что происходит при установке и обновлении

```text
opkg install / обновление .ipk
        │
        ▼
preinst (upgrade|install)
        └─ бэкап /etc/config/sheepfold → /etc/sheepfold/migrations/sheepfold.config.pre-upgrade
        │
        ▼
postinst
        ├─ recover_sheepfold_config          — восстановить конфиг, если opkg его удалил
        ├─ cleanup_opkg_conffile_artifacts   — удалить sheepfold-opkg, sheepfold-opkg.old
        ├─ repair_sheepfold_uci_sections     — переименование устаревших секций
        ├─ ensure_global_option / ensure_named_section — добавить только отсутствующие ключи и секции
        ├─ одноразовые миграции с флагом *_migrated
        └─ uci commit
        │
        ▼
Приложение читает обновлённый /etc/config/sheepfold через uci / global_get()
```

---

## Как приложение читает «старый» конфиг

Код **не требует**, чтобы на роутере был полный актуальный шаблон.

1. **Существующие ключи** читаются как есть: `uci get sheepfold...`, `global_get option default`.
2. **Отсутствующие ключи** в shell обычно закрываются дефолтом вторым аргументом `global_get` или явной проверкой.
3. **Новые ключи после обновления** появляются в `postinst` через `ensure_*` — только если их ещё нет. Пользовательские значения не затираются.

Переименование или смена смысла поля **без** миграции в `postinst` — ошибка разработки: старые роутеры останутся со старой схемой.

---

## Правила для разработчика при изменении структуры UCI

### 1. Новая опция в `sheepfold.global`

Добавить в `postinst`:

```sh
ensure_global_option new_option_name 'default_value'
```

Паттерн `ensure_global_option`: записывает значение **только если ключ отсутствует**.

Также обновить:

- `sheepfold.uci.defaults` — для первой установки
- `docs/backend-design.ru.md` — если поле публичное/важное
- код, который читает поле (LuCI, `sheepfold-router-control`, CGI)

### 2. Новая named-секция (`allowlist`, `owner`, `pairing_global`, …)

```sh
ensure_named_section section_name section_type
```

И при необходимости — дефолтные `uci set` только для отсутствующих полей внутри секции (см. блок `owner` в `Makefile`).

### 3. Переименование секции или исправление legacy-имён

Логику добавлять в `repair_sheepfold_uci_sections()` в `postinst` (и синхронно в `scripts/build-test-ipk.sh` / `build-test-ipk.py`, если там дублируется postinst).

Пример уже в проекте: `messenger` → `messenger_global`, конфликтующие `config ... 'global'`.

### 4. Смена значения по умолчанию для уже существующих роутеров

**Нельзя** просто изменить дефолт в `sheepfold.uci.defaults` — это затронет только новые установки.

Нужна **одноразовая миграция** с флагом:

```sh
if [ "$(uci -q get sheepfold.global.some_migration_done 2>/dev/null)" != "1" ]; then
    uci -q set sheepfold.global.some_option='new_default'
    uci -q set sheepfold.global.some_migration_done='1'
fi
```

Пример в коде: `domain_allowlist_for_blocklist_default_migrated`.

### 5. Удаление устаревшего ключа

Явный `uci -q delete sheepfold....` в `postinst`, только с проверками (версия, флаг миграции, наличие замены). Не удалять секции с пользовательскими данными без крайней необходимости.

### 6. Переименование UCI-ключа (не секции)

Только через миграцию в `postinst`:

```sh
old="$(uci -q get sheepfold.global.old_name 2>/dev/null || true)"
[ -n "$old" ] && [ -z "$(uci -q get sheepfold.global.new_name 2>/dev/null || true)" ] && \
    uci -q set sheepfold.global.new_name="$old"
uci -q delete sheepfold.global.old_name 2>/dev/null || true
```

Обратная совместимость в коде чтения — до тех пор, пока миграция не отработала у всех целевых установок.

---

## Что обновлять в репозитории (чеклист)

При любом изменении схемы UCI:

- [ ] `Makefile` → `postinst` (миграция / `ensure_*`)
- [ ] `root/usr/share/sheepfold/sheepfold.uci.defaults` (первая установка)
- [ ] `scripts/build-test-ipk.sh` и `scripts/build-test-ipk.py` — если дублируют логику postinst
- [ ] `docs/backend-design.ru.md` — структура секций
- [ ] тесты: синтаксис SDK- и test-IPK-вариантов `postinst`, `tests/test-lib-device.sh`, при необходимости новый shell-тест миграции
- [ ] **не** возвращать `root/etc/config/sheepfold` в payload пакета

Поля вроде `ui_asset_version` задаются в `postinst` из `PKG_VERSION-PKG_RELEASE`, а не через шаблон в пакете.

---

## Антипаттерны

| Нельзя | Почему |
|---|---|
| Класть `/etc/config/sheepfold` в каждый `.ipk` | `resolve_conffiles`, `sheepfold-opkg`, мусор на overlay |
| Менять только `sheepfold.uci.defaults` и ждать миграции на старых роутерах | Шаблон не применяется при обновлении |
| Переименовывать UCI-ключи без `postinst` | Сломаются существующие установки |
| Заменять весь конфиг при обновлении | Потеря устройств, списков, хэшей паролей, токенов |
| Хранить секреты в `sheepfold.uci.defaults` в git | Шаблон в репозитории; на роутере секреты только в живом конфиге |

---

## Проверка перед релизом

На тестовом роутере (см. `docs/live-router-testing.ru.md`):

1. Установить предыдущую версию, настроить несколько устройств и опций.
2. Обновить новым `.ipk`.
3. Убедиться:
   - `opkg install` без `sheepfold-opkg` (или файл удалён postinst);
   - `/etc/config/sheepfold` сохранил пользовательские данные;
   - новые опции появились (`uci show sheepfold`);
   - LuCI и `sheepfold-router-control` работают.

Полезные команды:

```sh
uci show sheepfold
ls -la /etc/config/sheepfold*
df -h /overlay
```

---

## Краткий ответ на частый вопрос

> Если шаблон убрали из пакета, как обновлённое приложение читает старый конфиг?

**Живой** `/etc/config/sheepfold` на роутере никуда не девается. Приложение читает его напрямую. Новая версия дописывает недостающие поля через `postinst` и понимает старые имена через `repair_*` и одноразовые миграции. Шаблон `sheepfold.uci.defaults` нужен только когда конфига ещё нет — первая установка Sheepfold на чистом роутере.
