# Messenger Bot

Sheepfold should support messenger control through adapters.

Planned adapters:

- `telegram`
- `max`

The bot must use the router API safely, restrict access to approved users, and require confirmation for destructive actions such as reboot, update, and global block changes.

On OpenWRT the preferred Telegram implementation is a local `procd` service that uses outbound HTTPS long polling (`getUpdates`). This avoids exposing the router through a public webhook.

The MAX adapter should use the same internal interface, but remain experimental until the public MAX Bot API and incoming-message delivery model are confirmed for router-side use.
