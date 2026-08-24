# ADR-0023: Отдельный закрытый серверный проект техподдержки

- Статус: Принято
- Дата: 2026-08-24
- Теги: `§rsup001`, `§rsuppeer`
- Связанные документы: `docs/remote-support-server-integration.ru.md`, ADR-0022, `docs/remote-support-protocol.ru.md`

## Контекст

ADR-0022 определил временный owner-initiated support session, но router client, публичный control plane, relay и operator tooling имеют разные секреты, жизненные циклы и уровни доступа. Размещение server code в публичном LuCI package смешало бы границы и затруднило бы эксплуатационный security review.

## Рассмотренные варианты

1. Хранить server/control/operator code в публичном Sheepfold. Отклонено: это смешивает package и эксплуатационный сервис, расширяет область публичного репозитория и затрудняет независимый аудит серверных секретов.
2. Добавить закрытый проект как Git submodule. Отклонено: публичный clone становится неполным без private GitHub access, а обычные тесты клиента получают ненужную закрытую зависимость.
3. Создать отдельный private repository и связывать проекты версионированным manifest, хешами общих контрактов и cross-repo tests. Выбрано как наименьшая явная граница двух жизненных циклов.

## Решение

Создать отдельный private repository `kva4991/sheepfold-support-server` для control plane, encrypted report queue, relay/bastion, operator CLI и локального Codex bridge.

Public Sheepfold остаётся source of truth для router-side wire protocol, consent, expiry/revoke и golden vectors. Связь фиксируется одинаковыми `peer-project.json`, документацией в обеих сторонах и cross-repo check. Private submodule не используется.

Codex управляет поддержкой через локальный `supportctl`/MCP на операторском ноутбуке, а не через публичный server tool. Write-операции требуют active session, exact plan hash, user approval и rollback; arbitrary shell отсутствует в MCP v1.

## Последствия

- агент, открыв любой репозиторий, видит владельца каждого контракта и способ проверить peer;
- public clone не зависит от private GitHub access;
- server secrets и deployment остаются вне клиентского package;
- общий protocol требует координированных изменений и server-first rollout;
- отдельный private repo сам по себе не делает функцию готовой: LuCI-заглушка остаётся выключенной до production security gate.

## Проверка

- public tests проверяют владельца canonical protocol, contract ID, major и запрет публичного arbitrary shell;
- private tests сверяют парный manifest и зафиксированные SHA-256 общих схем/golden vectors с выбранной редакцией Sheepfold;
- отсутствие private checkout не ломает public CI и не превращает design-контракт в работающий server;
- перед включением runtime обязательны cross-runtime golden vectors, router/server simulator и live security gate ADR-0022.

## Когда пересматривать

- server и router client переходят в один проверяемый release-процесс без раскрытия секретов и закрытой зависимости public clone;
- общий protocol выделяется в отдельный публичный repository с самостоятельной совместимостью и supply-chain policy;
- локальный `supportctl`/Codex bridge заменяется другой границей управления;
- требования эксплуатации или аудита запрещают выбранное разделение владения контрактами.
