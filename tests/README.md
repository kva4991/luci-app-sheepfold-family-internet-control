# Sheepfold tests

В этом каталоге находятся автоматические тесты для различных частей проекта
`luci-app-sheepfold-family-internet-control`.

## Browser/UI tests (MJS)

- `deviceDetectionUi.test.mjs` — проверяет отображение и взаимодействие UI, связанного с обнаружением устройств.
- `deviceDetectorSafety.test.mjs` — проверки безопасности и корректности поведения детектора устройств.
- `devicePresence.test.mjs` — тесты логики присутствия устройств.
- `luciAssetVersioning.test.mjs` — тесты версионирования фронтенд-ассетов LuCI.
- `personalGroupWatermark.test.mjs` — тесты отображения watermarks/меток для персональных групп.

## Shell tests

- `test-lib-device.sh` — быстрые тесты для общих библиотек:
  - `sheepfold-lib-device` (MAC-утилиты, `device_section_for_mac`, `list_has_mac`);
  - `sheepfold-lib-uci` (работа с UCI-списками allowlist/blocklist).
  - Использует отдельный `UCI_CONFIG_DIR=/tmp/sheepfold-test-uci`, не трогает реальный `/etc/config/sheepfold`.

## Запуск

- UI/JS тесты: см. инструкции в соответствующих `.mjs` файлах или в документации (например, AGENTS.md).
- Shell-тесты: на роутере или в dev-окружении:

```sh
sh tests/test-lib-device.sh
```
