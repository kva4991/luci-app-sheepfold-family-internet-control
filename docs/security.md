# Security Model
## Principles

- Do not store the router root password in the Android app.
- Do not allow Sheepfold setup to continue when the OpenWRT root password is empty/not configured.
- Use API tokens or session-based authentication.
- Restrict management API access to the local network by default.
- Sheepfold is a family self-hosted tool by default; do not require a developer-operated cloud service. The optional `§feedback` endpoint is isolated from router control and its failure must not affect family rules.
- The main Android app in `android/` is for parent/admin devices only. The separate `android-child/` app, when used, must be an explicitly installed status/helper client without administrative functions, not a hidden installation flow (§z5ck8mv).
- Validate MAC addresses, IP addresses, hostnames, and domains.
- Avoid shell injection.
- Avoid duplicate nftables rules.
- Restore rules after `fw4 restart` and router reboot.
- Target `firewall4` / `nftables`; do not add legacy `firewall3` / `iptables` compatibility unless explicitly required later.

## Android App Authentication

During first setup, the Android app should ask which local app-lock method to use.

Recommended default: password or PIN.

Fingerprint and face unlock may be available, but should not be recommended as the safest default for a parental-control app. The UI should explain this briefly:

```text
Password or PIN is recommended. Fingerprint or face unlock can be less safe for parental-control apps: a child may try to unlock the app while the parent is asleep.
```

## Administrators

Sheepfold is administered by parent/admin users configured on the router.

The current MVP does not need a visible role selector. If a future permission split is added, use `owner` and `admin`: `owner` can add/remove administrators and perform dangerous maintenance actions; `admin` can manage family internet rules but cannot remove the owner.

Do not add hidden child/client roles or child-facing control interfaces with administrative power. The separate child client may show only its own router-computed status and explicitly allowed helper flows (§z5ck8mv).

Each messenger administrator must be explicitly bound to a Telegram/VK/MAX user ID or chat ID in router settings. VK is the default first-run messenger choice, but no messenger must become active until credentials and at least one administrator binding are configured. MAX is experimental and must not be enabled by default.

Administrator accounts:

- one default administrator must exist after installation/first setup;
- each administrator must have a unique display name and unique login;
- administrator passwords must be stored only as salted hashes;
- if owner/admin roles are added later, deleting or demoting the last owner must be forbidden.

## Administrator Devices And Android Pairing

Administrator devices must be bound from the `Administrators` tab. Do not expose a `Make admin` action in the general device list. Blocklisted devices must not be eligible for administrator binding.

Pairing rules:

- LuCI must show pairing only for administrator devices;
- QR/manual setup must use a short-lived one-time token scoped to one administrator and one device;
- pairing tokens must be revocable and stored on the router only as hashes or non-reusable secrets;
- after successful pairing, the router backend must immediately mark the one-time token as consumed and reject any later reuse, even if a child photographed the QR code or copied the manual code;
- token consumption is a router-backend responsibility. Android-side state, LuCI frontend state, hidden UI flags, or "already scanned" markers are not sufficient security controls;
- token validation must check token hash, TTL, owning administrator, target admin device, consumed state, and revocation state before issuing any durable Android credential;
- manual pairing codes must be generated on the router backend with a cryptographically secure random source. Use 10 random characters from safe-to-copy sets: lowercase `abcdefghkmnpqrstuvwxyz`, uppercase `ABCDEFGHKMNPQRSTUVWXYZ`, digits `2456789`, and special characters `+-*()[]{}<>?@#$%^&:;.,`; include no more than 3 special characters in one code;
- QR codes must not contain router root passwords, LuCI session cookies, bot tokens, AI keys, or unrelated secrets;
- manual setup text next to QR should show only the minimum required connection settings;
- pairing attempts and successful pairings must be written to the administrative action log with masking.

### Обязательная последовательность безопасного сопряжения

Эта последовательность является частью контракта безопасности и должна одинаково соблюдаться LuCI, CGI backend и Android-приложением:

1. Учётная запись администратора сначала создаётся и сохраняется в LuCI.
2. Одноразовый код выпускается только из аутентифицированной LuCI-сессии и только для уже существующей учётной записи администратора.
3. Публичного CGI endpoint для выпуска кода нет. Маршрут `/pair-token` обязан возвращать `404` для всех HTTP-методов и не должен обслуживаться legacy-маршрутизатором.
4. Android отправляет в `/pair` логин существующего администратора и одноразовый код. MAC из тела запроса не считается доверенным и не используется как источник идентичности.
5. До проверки кода backend применяет ограничение числа попыток отдельно для устройства или его LAN-адреса.
6. Backend проверяет существование учётной записи, совпадение кода, срок действия, отзыв и факт предыдущего использования.
7. MAC телефона определяется самим роутером по DHCP-аренде или ARP-таблице.
8. MAC проверяется по чёрному списку до любых записей и повторно непосредственно перед назначением административных прав.
9. Устройство из чёрного списка не может стать административным. Сопряжение никогда не удаляет MAC из чёрного списка автоматически.
10. Только после всех проверок устройство получает административный признак и при необходимости добавляется в белый список.
11. Одноразовый код удаляется в той же последовательности сохранения и больше не принимается.
12. Долгоживущий Bearer-токен возвращается Android-приложению один раз; на роутере хранится только его хэш.

Инварианты, которые нельзя ослаблять при рефакторинге:

- сопряжение не создаёт новые учётные записи администраторов;
- чёрный список сильнее белого списка, групп, расписаний, временного доступа и административного статуса;
- публичный LAN-клиент не может выпустить код сопряжения;
- повторный запрос с уже использованным кодом не выдаёт новый Bearer-токен;
- административные CGI endpoints требуют Bearer-токен, кроме минимального `/pair`, необходимого для первого сопряжения.

During Android first setup, the app should check whether the phone is visible to the router under the real device MAC address Sheepfold will manage. If randomized/private MAC is enabled for the home Wi-Fi network, the app should guide the parent to system Wi-Fi settings instead of promising automatic changes. Pairing must not continue until router-side data confirms the real MAC for the selected admin device.

Administrative action logs should record:

- administrator ID or display name;
- action type;
- target device or setting, with masking where appropriate;
- timestamp;
- result: success, failure, cancelled, or pending confirmation.

Do not log administrator passwords, bot tokens, API tokens, or session IDs.

## AI Assistant Access

The `/ai-assistant` endpoint may be available to ordinary LAN clients only when the feature is explicitly enabled in LuCI. The router must derive the client MAC itself, deny blocklisted devices, and apply a configurable per-device request limit. Router diagnostics, program logs, Google account context, or other administrative context may be sent to an AI provider only for a request authenticated with an administrator Bearer token.

A child disclosure, network signal, site category, or model inference about a possible offence must not trigger hidden reporting to a parent or any external recipient. Sheepfold never contacts police, child-protection, emergency dispatch, courts, or another state body. It may provide a verified contact and prepare a user-controlled draft, but must not send it. These signals are not evidence. Sheepfold must also refuse assistance to conceal continuing serious harm, destroy evidence, fabricate alibis, or intimidate witnesses (§ailegal, §aichild, §aigov0).

## List Conflicts

The same device must not be present in both allowlist and blocklist.

This rule must be enforced in:

- backend validation;
- LuCI forms;
- Android app;
- bot commands;
- import validation.

## Administrative Actions

The following actions must require confirmation:

- router reboot;
- application update;
- global internet block;
- settings import;
- reset settings.
- Wi-Fi SSID/password/security/channel changes;
- active messenger switch;
- adding a new administrator;
- clearing logs.

## Logging

Logging must be configurable.

Allowed retention values:

```text
6m
3m
1m
14d
7d
3d
1d
12h
3h
1h
off
```

Default:

```text
3d
```

Use a size cap as well as a time cap. Default size cap:

```text
1024 KB
```

Do not write secrets, bot tokens, API keys, passwords, session cookies, full messenger conversations, full AI prompts, full browsing history, raw DNS query history, banking data, medical data, or exact private details about children.

Mask sensitive values in exported logs by default:

- partially mask MAC addresses;
- mask the last IP octet in exports;
- partially mask messenger user IDs and chat IDs;
- always replace tokens, API keys, passwords, and session IDs with `[secret]`.

LuCI and Android must include a `Clear log` action with confirmation. Log export should default to masked export.

## Локальная защита родительского Android-приложения

- пароль и PIN хранятся только как PBKDF2-HMAC-SHA256 с индивидуальной солью;
- после пяти неверных попыток действует возрастающая задержка 30, 60, 120, 240 и максимум 300 секунд;
- задержка использует `SystemClock.elapsedRealtime()` и сбрасывается после перезагрузки телефона, чтобы изменение часов не создавало вечную блокировку;
- приложение повторно блокируется после ухода в фон: заводское значение 1 минута, варианты сразу, 1, 5 и 15 минут;
- Face и Fingerprint представлены одним честным способом `Биометрия`, потому что конкретный системный датчик выбирает Android;
- включение интернета из виджета остаётся быстрым восстановительным действием;
- отключение интернета из виджета по умолчанию открывает `MainActivity`, заново требует локальную защиту и отдельное подтверждение;
- мгновенное отключение без разблокировки доступно только после явного предупреждения и повторно проверяется receiver-ом при выполнении;
- release APK не собирается без внешнего keystore и четырёх environment secrets; ключи и пароли запрещены в Git.

## Минимизация детского API и разрешений

- публичный `/client-status` v3 не раскрывает `accessMode`, конфликт расписаний, разрешившее правило или имя личной группы;
- при разрешённом доступе `message=null`; при отключённом/неизвестном состоянии допускается только короткое безопасное объяснение;
- child AI получает тот же минимизированный публичный контекст, а более подробная оценка остаётся внутри router-side gate;
- notification permission предлагается только после успешного подключения к Sheepfold;
- READ_PHONE_STATE/READ_PHONE_NUMBERS предлагаются только при `simChangeReporting=true`;
- nearby Wi-Fi и location предлагаются только при соответствующих `wifiNetworkReporting`/`wifiLocationReporting`;
- системный диалог открывается только после явного нажатия на объяснённую кнопку, отказ не блокирует статус;
- release APK ребёнка требует внешний owner-controlled keystore и не использует ключ из Git.
