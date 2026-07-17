# Сборка OpenWrt-пакетов в GitHub Actions

<!-- §owrtci1 -->

## Назначение

Канонические публичные пакеты Sheepfold собирает workflow
`.github/workflows/build-openwrt-packages.yml` через официальный
[`openwrt/gh-action-sdk`](https://github.com/openwrt/gh-action-sdk). Локальный
`scripts/build-test-ipk.py` остаётся быстрым тестовым сборщиком для Windows и
живого тестового роутера, но не заменяет официальный OpenWrt SDK.

OpenWrt `.apk` здесь означает пакет роутера для `apk-tools` v3. Это не Android
APK, несмотря на одинаковое расширение.

## Матрица

Workflow собирает четыре роутерных файла:

| Редакция | OpenWrt | Менеджер | Формат |
|---|---:|---|---|
| Sheepfold Standard | 24.10.7 | `opkg` | `.ipk` |
| Sheepfold - AI Support | 24.10.7 | `opkg` | `.ipk` |
| Sheepfold Standard | 25.12.5 | `apk` v3 | OpenWrt `.apk` |
| Sheepfold - AI Support | 25.12.5 | `apk` v3 | OpenWrt `.apk` |

SDK-контейнеры используют `aarch64_cortex-a53`, соответствующий классу
целевых современных ARM-роутеров и тестовому роутеру. Сам пакет не содержит
нативных бинарников, поэтому его внутренние метаданные обязаны иметь
архитектуру `all`/`noarch` и подходят другим архитектурам той же версии OpenWrt.

Обе редакции имеют единое внутреннее имя:

```text
luci-app-sheepfold-family-internet-control
```

Различается только имя скачиваемого release-файла. Поэтому переход Standard ↔
AI Support является обновлением/переустановкой одной сущности и сохраняет
`/etc/config/sheepfold`.

## Когда запускается

- вручную через `Actions → Build OpenWrt packages → Run workflow`;
- для pull request;
- после push в `main`;
- при публикации GitHub Release.

Из консоли:

```powershell
gh workflow run "Build OpenWrt packages" --ref main
gh run list --workflow "Build OpenWrt packages"
gh run watch
```

На PR и push результат доступен в артефакте `sheepfold-openwrt-packages`.
Промежуточные matrix-артефакты хранятся 14 дней, общий набор — 30 дней.

## Публикация Release

При публикации обычного, не предварительного GitHub Release workflow заново
собирает точный commit тега и прикрепляет к Release:

- два `.ipk`;
- два OpenWrt `.apk`;
- `SHA256SUMS`;
- `openwrt-build-manifest.json` с версией OpenWrt, SDK, редакцией, размером и
  SHA-256 каждого файла.

Pre-release намеренно не получает эти файлы: updater Sheepfold читает
`releases/latest`, то есть стабильный обычный Release. Android release-APK
собираются и подписываются отдельным Android-процессом; debug APK нельзя
прикреплять как пользовательский релиз.

## Проверки

Перед публикацией workflow:

1. готовит отдельный feed каждой редакции через
   `scripts/prepare-openwrt-sdk-feed.py`;
2. собирает пакет официальным SDK соответствующей версии OpenWrt;
3. для IPK читает внутренние `Package`, `Version`, `Architecture`;
4. для OpenWrt APK запускает `apk verify --allow-untrusted` и `apk adbdump`
   инструментом из того же SDK-контейнера;
5. требует ровно один основной пакет в каждой ячейке матрицы;
6. проверяет полную матрицу и совпадение файлов с matrix-метаданными;
7. только после этого создаёт общий артефакт и публикует Release.

`openwrt/gh-action-sdk` закреплён полным commit SHA релиза `v11`. Право
`contents: write` выдаётся только задаче публикации обычного Release; сборочные
задачи имеют `contents: read`.

Локальные быстрые проверки:

```powershell
python scripts\prepare-openwrt-sdk-feed.py --variant sheepfold --out-dir .build\sdk-standard
python scripts\prepare-openwrt-sdk-feed.py --variant sheepfoldAi --out-dir .build\sdk-ai
node --test tests\openWrtBuildWorkflow.test.mjs tests\openWrtVariantFeed.test.mjs
```

Настоящая SDK-сборка требует Linux и Docker. На Windows она намеренно вынесена
в GitHub Actions, поэтому WSL/Docker Desktop не являются обязательными для
обычной работы с репозиторием.

## Подпись пакетов

Workflow поддерживает два необязательных repository secret:

```text
OPENWRT_IPK_SIGNING_KEY
OPENWRT_APK_PRIVATE_KEY
```

Добавление: `Settings → Secrets and variables → Actions → New repository
secret`. Первый секрет передаётся только сборке IPK как `KEY_BUILD`, второй —
только OpenWrt APK как `PRIVATE_KEY`. Секреты нельзя печатать в лог, помещать в
репозиторий, артефакт или build manifest.

Пока ключи не настроены, SDK может выпустить локально устанавливаемые
неподписанные пакеты. Updater дополнительно проверяет контейнер, внутренние
метаданные и доверенный GitHub URL, а workflow публикует SHA-256. До первого
стабильного публичного релиза нужно отдельно создать постоянные ключи проекта,
безопасно сохранить резервную копию и определить доставку публичных ключей на
роутер. Контрольная сумма рядом с файлом защищает от случайной порчи, но сама по
себе не заменяет криптографически доверенную подпись.

## Обновление матрицы

Версии OpenWrt и SDK закреплены намеренно. При выходе следующего stable-релиза:

1. проверить версию на `https://downloads.openwrt.org/`;
2. проверить существование точного тега
   `ghcr.io/openwrt/sdk:aarch64_cortex-a53-<version>`;
3. обновить обе строки соответствующей серии в matrix;
4. обновить этот документ и `tests/openWrtBuildWorkflow.test.mjs`;
5. выполнить workflow вручную;
6. установить оба формата/обе редакции на тестовые роутеры и проверить переход
   Standard ↔ AI Support с сохранением конфига.

Нельзя заменять OpenWrt APK переименованным IPK, использовать snapshot в
стабильном Release или менять SDK-версию без отдельного успешного прогона.
