# Личные группы устройств

> Статус: **готово к реализации** — UCI-схема и бизнес-правила описаны полностью.

## Концепция

Личная группа — особый тип группы, жёстко привязанный к конкретному члену семьи.
Она отличается от обычной группы тремя правилами:

1. Устройство можно добавить в личную группу только если оно **ещё не состоит ни в одной личной группе** (один человек — одно устройство; исключений нет).
2. Личную группу **можно включить** в обычную группу как участника (удобно для расписаний и правил).
3. Обычную группу **нельзя включить** в личную группу — только устройства.

## UCI-схема

Секция типа `personal_group` в `/etc/config/sheepfold`:

```uci
config personal_group 'pg_a1b2c3'
    option id         'pg_a1b2c3'          # уникальный ID, генерируется однажды
    option displayName 'Вася'              # человекочитаемое имя
    option ownerLogin  'SuperParent'       # логин администратора-владельца (опционально)
    list   deviceMac   'AA:BB:CC:DD:EE:FF' # MAC-адреса устройств (только физические устройства)
    list   memberOfGroup 'group_kids'      # обычные группы, в которые входит эта личная группа
```

### Генерация ID

ID генерируется при создании как `pg_` + первые 6 байт от `sha256(displayName + timestamp)`.
ID **неизменен** после создания — переименование группы меняет только `displayName`.

## Бизнес-правила

### Добавление устройства в личную группу

Перед добавлением MAC роутер обязан:
1. Перебрать все секции `personal_group` в UCI.
2. Убедиться что данный MAC **не фигурирует** ни в одном `list deviceMac`.
3. Только тогда записать `add_list sheepfold.<pg_id>.deviceMac=<MAC>` и закоммитить.

Если устройство уже в другой личной группе — вернуть ошибку `device_already_in_personal_group`.

### Вложение личной группы в обычную

```uci
config group 'group_kids'
    option displayName 'Дети'
    list   memberPersonalGroup 'pg_a1b2c3'
    list   memberPersonalGroup 'pg_d4e5f6'
```

При применении правил к группе `group_kids` роутер разворачивает все `memberPersonalGroup` и забирает оттуда `deviceMac`.

### Запрет вложения обычной группы в личную

LuCI и CGI-обработчик должны возвращать ошибку `cannot_nest_regular_group_in_personal_group` при попытке добавить обычную группу как участника личной.

## Команды sheepfold-router-control

```
personal-group-create  <displayName> [ownerLogin]
personal-group-rename  <pgId> <newDisplayName>
personal-group-delete  <pgId>
personal-group-add-device    <pgId> <mac>
personal-group-remove-device <pgId> <mac>
personal-group-list
personal-group-get <pgId>
```

Все команды возвращают `key=value` построчно либо JSON при флаге `--json`.

## Взаимодействие с ИИ-анализом

Устройства, состоящие в любой личной группе, **исключаются из анализа принадлежности** (`sheepfold-ai-ownership`). Функция проверяет поле `personalGroupId` у каждого устройства перед отправкой данных в ИИ.

## Что нужно сделать в коде

- [ ] `sheepfold-router-control`: добавить команды `personal-group-*`
- [ ] CGI `personal-groups`: CRUD-эндпоинты
- [ ] LuCI: страница «Члены семьи» с карточками личных групп
- [ ] Android APK: отображение личной группы на карточке устройства
- [ ] `sheepfold-device-detector`: при присвоении устройства в личную группу (>85%) — вызов `personal-group-add-device`
