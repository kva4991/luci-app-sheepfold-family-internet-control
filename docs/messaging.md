# Messaging And Notifications

Sheepfold should support two-way messenger control.

Supported adapters:

- Telegram;
- MAX.

Only one messenger adapter can be active on one router at a time.

## Active Messenger Rule

- A router can have `telegram` or `max` enabled, not both.
- Switching the active messenger must require admin confirmation.
- Disabling the current messenger should not delete its configuration immediately; keep it for easy re-enable unless the user explicitly removes it.
- All messenger actions must go through the same Sheepfold API used by LuCI and Android.
- Dangerous actions must require explicit confirmation in the selected messenger.

## Telegram Two-Way Chat

Telegram should support both notifications and interactive parent control.

Planned events:

- global block enabled;
- global block disabled;
- new unknown device detected;
- device added to allowlist;
- device added to blocklist;
- temporary access granted;
- schedule rule applied;
- import/export completed;
- router reboot requested;
- application update completed or failed;
- AdGuard Home integration warning;
- Podkop integration warning;
- firewall/rpcd/service error;
- child access request, if this workflow is added later.

Interactive capabilities:

- show current status;
- show all devices;
- search devices by name, IP, or MAC;
- enable/disable global blocking with confirmation;
- grant temporary access;
- add/remove devices from allowlist or blocklist;
- approve or reject a child access request;
- ask for confirmation before reboot/update/import;
- accept short natural Russian commands.

## MAX Two-Way Chat

MAX should support both notifications and interactive parent control.

Planned capabilities:

- show current status;
- show all devices;
- search devices by name, IP, or MAC;
- enable/disable global blocking with confirmation;
- grant temporary access;
- add/remove devices from allowlist or blocklist;
- approve or reject a child access request;
- ask for confirmation before reboot/update/import;
- accept short natural Russian commands.

Architecture:

- implement Telegram and MAX as separate adapters;
- keep messenger-specific code outside OpenWRT firewall logic;
- route all actions through the same Sheepfold API used by LuCI and Android;
- keep command permissions explicit per approved user.
- assign approved administrators in router settings;
- each administrator should have a role and a linked Telegram/MAX user ID or chat ID;
- log administrative actions: who performed the command, what changed, when, and with what result.

## OpenWRT Implementation

The bot should run as a local `procd` service on the router.

Preferred Telegram approach:

- do not open an inbound port on the router;
- do not require a public IP address;
- use the Telegram Bot API through outbound HTTPS requests;
- receive messages through long polling with `getUpdates`;
- send replies through the HTTPS API;
- store the last processed update offset locally;
- ignore commands from unknown user IDs / chat IDs.

This fits home routers better than webhooks because webhooks require a public HTTPS endpoint.

Use the same adapter interface for MAX, but keep the MAX adapter `experimental` until stable public Bot API documentation and an inbound-message method that does not expose the router to the internet are confirmed.

Minimum OpenWRT dependencies:

```text
uclient-fetch
ca-bundle
jsonfilter
```

If the shell implementation becomes too fragile, move the bot to a `ucode`/`rpcd` backend without changing the external Sheepfold API.

Useful references:

- Telegram Bot API: https://core.telegram.org/bots/api
- Telegram `getUpdates`: https://core.telegram.org/bots/api#getupdates

## Shared Requirements

- Messenger integration must be optional.
- Store bot tokens securely.
- Allow configuring approved chat IDs / user IDs.
- Do not send router passwords, API tokens, session IDs, full MAC addresses, private notes, full device lists, or other sensitive network data without explicit permission.
- By default, bot messages should show a friendly device name and status; technical details should be shown only when an administrator asks for them.
- Dangerous actions must require confirmation: router reboot, update, settings import, clear log, mass block, rule deletion, active messenger switch, and adding a new administrator.
- Respect the logging setting: if logs are disabled, live notifications may still be sent, but Sheepfold should not create local event history unless explicitly enabled.
