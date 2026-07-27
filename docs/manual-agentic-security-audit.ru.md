# Ручной агентный аудит безопасности

<!-- §secaudit1 -->

## Назначение

Visa Vulnerability Agentic Harness (VVAH) используется только как необязательный
внешний источник кандидатов для security review. Он не входит в Sheepfold, IPK,
APK, `node_modules`, обычный CI или обязательный `quality:gate`.

Полезный для проекта порядок работы:

1. построить модель угроз и границы доверия;
2. найти возможные уязвимости несколькими специализированными проходами;
3. отфильтровать слабые находки и дубли;
4. независимо проверить правдоподобие оставшихся сценариев;
5. передать человеку Markdown и SARIF;
6. исправлять только подтверждённую root cause;
7. закреплять принятое исправление детерминированным регрессионным тестом.

LLM-находка не является подтверждённой уязвимостью. Анализ недетерминирован:
два запуска могут отличаться, а внешний анализатор не собирает Sheepfold и не
запускает его тесты.

## Когда запускать

Ручной аудит уместен:

- перед публичным релизом;
- после существенного изменения QR-сопряжения и токенов;
- после изменения router API, ACL, updater, импорта или UCI migration;
- после изменения firewall, DNS, AdGuard Home и границ Standard/AI Support;
- когда обычные тесты показывают симптом, но не объясняют возможную цепочку атаки.

Не запускать его после каждой текстовой или визуальной правки. Обычные
детерминированные категории `security`, `backendFast`, `android` и живой router
harness остаются главным воспроизводимым доказательством.

## Граница данных

VVAH отправляет исходный код настроенному LLM-провайдеру. Маскирование уменьшает
риск, но не доказывает, что секрет либо чувствительный fixture никогда не покинет
компьютер. Перед запуском оператор обязан:

1. проверить выбранного провайдера, endpoint, аккаунт и правила хранения;
2. убедиться, что в отслеживаемых файлах нет настоящих ключей, паролей и семейных
   данных;
3. не передавать незакоммиченные файлы;
4. сначала прочитать estimate;
5. только затем явно разрешить анализ исходников.

Скрипт не читает и не копирует `.env`, потому что такие файлы не входят в Git.
Однако перед аудитом всё равно надо проверить tracked fixtures и историю текущего
commit.

## Установка внешнего инструмента

VVAH не опубликован как обычный пакет PyPI. Его устанавливают отдельно из
проверенного checkout официального репозитория:

```powershell
git clone https://github.com/visa/visa-vulnerability-agentic-harness.git `
  "$env:USERPROFILE\Documents\pesochnica\visa-vulnerability-agentic-harness"
cd "$env:USERPROFILE\Documents\pesochnica\visa-vulnerability-agentic-harness"
git status --short --branch
pipx install .
vvaharness --help
```

При обновлении инструмента записать его commit и повторно просмотреть release
notes, конфигурацию и security boundary. Sheepfold не устанавливает VVAH
автоматически и не хранит его API-ключи.

## Безопасный запуск

Из чистого корня Sheepfold сначала выполнить только preflight и оценку:

```powershell
npm.cmd run security:audit:manual
```

Runner по умолчанию выполняет только `doctor` и `estimate`. Он создаёт отдельный
локальный clone текущего commit в
`%SHEEPFOLD_SCRIPT_SCRATCH_ROOT%\sheepfold-security-audit\` либо, если переменная
не задана, в `Documents\pesochnica\sheepfold-security-audit\`. Scratch нельзя
размещать внутри исходного репозитория.

После checkout runner перемещает `.git` за пределы сканируемого каталога
`source/`. Модель получает только tracked-снимок выбранного commit, а не историю,
где могли сохраниться удалённые ранее ключи или чувствительные fixtures. Точный
commit остаётся в Sheepfold manifest.

После проверки estimate и поставщика LLM запустить detection-only режим:

```powershell
npm.cmd run security:audit:manual -- -RunScan -ConfirmSourceUpload
```

Оба флага обязательны. Команда всегда передаёт VVAH `--stop-after s9` и
`--no-auto-step1`. Она не вызывает remediation/validation, не меняет рабочий
checkout и не удаляет результаты автоматически.

## Артефакты

Каждый запуск получает отдельный каталог:

```text
sheepfold-security-audit/
  YYYYMMDD-HHMMSS-commit-pid/
    sheepfold-audit-manifest.json
    clone.log
    checkout.log
    doctor.log
    estimate.log
    scan.log
    run_manifest.json
    source-git-metadata/
    source/
      security-scan/
        *.md
        *.sarif
        *_errors.jsonl
```

Manifest Sheepfold фиксирует commit, ветку, чистоту исходного checkout, режим,
время, команду VVAH, расположение вынесенных Git-метаданных и факт явного
разрешения передачи. Он не содержит API-ключи.

## Разбор находки

Для каждой находки человек обязан ответить:

1. Достижим ли вход на реальном OpenWrt/Android, а не только в текстовой модели?
2. Где находится настоящая граница доверия и root cause?
3. Существуют ли уже validation, ACL, rate limit, lock или firewall-правило,
   которые анализатор пропустил?
4. Можно ли воспроизвести риск минимальным тестом?
5. Закрывает ли исправление все экземпляры, не создавая новый обход?
6. Прошли ли профильные категории, полный gate и требуемая живая проверка?

Неподтверждённые кандидаты не превращаются автоматически в код, issue или запрет
слияния. Подтверждённое исправление без регрессионного теста считается
незавершённым, если тест технически возможен.

## Источники и ограничения

- [VVAH README](https://github.com/visa/visa-vulnerability-agentic-harness)
- [Архитектура](https://github.com/visa/visa-vulnerability-agentic-harness/blob/main/docs/architecture.md)
- [Операционная безопасность](https://github.com/visa/visa-vulnerability-agentic-harness/blob/main/docs/security.md)

На момент принятия решения изучена версия пакета `1.1.0`. У проекта не
опубликованы измерения precision/recall, полный анализ расходует токены, а
автоматически предложенное исправление не проходит сборку и тесты самого
Sheepfold. Поэтому внешний аудит остаётся ручным консультативным слоем.
