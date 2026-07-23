# Единый запуск изменяющих команд LuCI

<!-- §apicon1 -->

Этот слой отделяет пользовательское действие от транспорта `fs.exec`, предметной UCI-логики и локальной перерисовки.

## Контракт

`core/backend/actions.js` получает зависимости явно и для одного стабильного ключа:

1. запускает не более одной операции одновременно;
2. блокирует все кнопки и переключатели с тем же `data-sf-action-key`;
3. сохраняет и точно восстанавливает прежние `disabled`, `aria-busy` и подпись;
4. распознаёт shell exit code, metadata wrapper, JSON `{ok:false}` и `status=error`;
5. выполняет предметный `onSuccess`, затем не более одной локальной перерисовки;
6. показывает одно итоговое уведомление;
7. отклоняет Promise с `errorCode`, `status`, `exitCode` и исходным result.

Составная UCI/runtime-транзакция обязана передать явный `key`. Обычная команда может вывести ключ из аргументов. Аргументы и секреты не попадают в action metadata.

## Shell boundary

`sheepfold-luci-action` является узким rpcd entrypoint. Он вызывает только фиксированный `sheepfold-router-control --luci`, сохраняет stdout без изменений и добавляет в stderr ограниченные поля:

```text
actionStatus
actionCommand
actionErrorCode
actionExitCode
actionMessage
```

Это позволяет старым readers продолжать разбирать key/value или JSON stdout. Новый runner получает стабильные коды `invalid_mac`, `administrator_device`, `device_allowlisted`, `device_blocklisted`, `already_unrestricted`, `confirmation_required`, `action_busy`, `action_timeout`, `runtime_unavailable`, `not_found` и `invalid_request`.

## Мигрированные действия

Через общий runner проходят:

- фактическое включение и отключение глобального интернета;
- временный доступ;
- добавление, удаление и ручное создание устройств в списках доступа;
- быстрый белый список;
- сохранение, включение и удаление расписаний;
- очистка истории Wi-Fi детских устройств;
- отправка feedback;
- тест Telegram;
- сохранение времени и запуск необязательной установки `nmap`;
- команды secure LED wrapper.

Глобальные интернет-кнопки больше не являются визуальным preview: успех показывается только после backend-команды и локального перечитывания UCI.

## Границы проверки

Node-тест доказывает coalescing, восстановление DOM-состояния, JSON/key-value failures и shell metadata. Он не доказывает реальный rpcd ACL, UCI commit, firewall sync или поведение установленной страницы. После изменения command wiring обязательны `lint:js`, `test:luci`, `quality:changed`, `quality:gate` и `router:frontend`; глобальный internet toggle, расписания и списки доступа дополнительно требуют live-router write/effect evidence.
