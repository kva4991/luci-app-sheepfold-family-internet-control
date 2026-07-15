# Current Implementation Status

Last checked: 2026-07-13.

Before merging the current `editsByClaude` branch into `main`, follow the evidence-based checklist in [`merge-readiness-plan.ru.md`](merge-readiness-plan.ru.md). It separates locally verified work from scenarios that still require a live OpenWRT router or a real Android device.

Current OpenWRT package version in the repository:

```text
luci-app-sheepfold-family-internet-control_0.1.0-163_all.ipk
```

The package uses `Architecture: all` because it contains LuCI assets, shell scripts, UCI defaults, init/hotplug scripts, CGI endpoints, and rpcd ACL files without native binaries.

## Working In The Current Package

- LuCI entry point for `Sheepfold Family Internet Control`.
- UCI config `/etc/config/sheepfold` with default app settings.
- Asset cache busting through `ui_asset_version` and JS/CSS query suffixes.
- HTTPS-only local Android discovery/API service on the configurable Sheepfold port, default `5201`, with certificate pinning in both Android applications.
- Public discovery data through `/.well-known/sheepfold.json`.
- CGI endpoint `/cgi-bin/sheepfold-api` with current router/app metadata and `/cgi-bin/sheepfold-api/router-info` diagnostics snapshot for Android/APK AI-preview flows.
- Real parent Android pairing through a short-lived one-time code, single-use backend consumption, token hash storage, and token binding to numeric device ID and MAC.
- Numeric stable device IDs starting at `1`, migrated from legacy display formats and included in device-related log events.
- Configurable blocked-page responder on port `5202`.
- Router-control backend command for Wi-Fi enable/disable, Wi-Fi automation tick, WPS actions, LED actions, blocked-page service, WAN status tick, router diagnostics, and device status changes.
- Device add/status backend action: create or update a device by MAC, add to allowlist, add to blocklist, or add as a known restricted device.
- Temporary access backend action for Android/LuCI/Telegram: stores an expiry, blocks blocklisted devices, marks temporary allowlist membership, and cleans it from the service tick after expiry.
- Backend protection that prevents administrator devices from being added to the blocklist.
- LuCI buttons for adding devices to allowlist/blocklist through the backend command.
- Manual device add from LuCI by MAC/name/IP/type.
- Quick allowlist modal that collects newly connected candidates and adds only the selected candidate.
- Export of settings and known UI data to readable JSON with secret fields masked.
- Log clearing and masked log export.
- Router reboot button through a queued command path.
- Update button that calls the installed updater service and checks GitHub stable releases.
- Wi-Fi page that reads router wireless UCI settings and shows connection QR codes.
- WPS button behavior settings.
- Router LED behavior settings.
- WAN connectivity event logging.
- LuCI settings tab `Information` showing router time, Sheepfold version, internet status, ping to `ya.ru`, OpenWRT/firmware/kernel/model, Wi-Fi radio status, LAN ports, Podkop/AdGuard Home installation/version, uptime/load/memory, and a safe AI context preview for APK.
- Device detection helper with heuristic device types and optional `No restrictions` auto-assignment.
- Auto-assignment to `No restrictions` only when automatic setup of new devices is enabled; a device name alone is not sufficient evidence.
- Router-proxied DeepSeek, Gemini, and Grok providers with versioned parent/child runtime prompts and provider keys stored only on the router.
- Parent Android onboarding, live/file QR scanner, manual pairing, encrypted connection storage, password/PIN/biometric app protection, device actions, notifications, and three internet-state home-screen widgets.
- Separate child Android application with HTTPS status lookup and parent-controlled AI access for devices in a personal group.
- Repository-managed Windows toolchain checks/install scripts and Gradle Wrapper 8.10.2 for both Android applications; Android SDK packages remain outside Git and are installed from Google's verified repository metadata.
- Minimal Telegram adapter through outgoing long polling: configured from LuCI, test message button, chat ID discovery when empty, bot command menu sync, commands for status, device list, internet on/off, Wi-Fi on/off, and support.
- Uninstall script that removes the OpenWRT package while preserving Sheepfold settings/client lists and printing a remaining-settings report.

## Still Target / Incomplete

- Real firewall/nftables enforcement for all access rules is not complete.
- End-to-end live-router verification is still needed for temporary access traffic enforcement because nftables/firewall integration is not complete.
- Full schedule editor and schedule enforcement are still target features.
- A future `/api/v1/*` alias, refresh-token flow, and complete Android editors for every LuCI section remain target work; current authenticated CGI routes cover pairing, devices, global internet state, router information, and AI.
- VK and MAX messenger adapters are documented but not implemented.
- Telegram adapter is not a complete production adapter yet: dangerous actions still need confirmation flows, richer admin binding, better command parsing, and stronger backend enforcement.
- AdGuard Home and Podkop status checks/integration preparation are documented and partially represented in LuCI, but automatic integration changes are not implemented.
- Import currently validates the Sheepfold export file shape in LuCI but does not apply settings through a backend confirmation flow yet.
- The installer downloads the `.ipk` from the latest normal GitHub Release, installs it with `opkg`, then applies the chosen language, automatic detection mode, and detected AdGuard Home/Podkop combination. It intentionally ignores pre-releases because updates use the stable `releases/latest` channel.
- Country-aware connectivity diagnostics are partially implemented for router info/WAN checks with Russia-relevant defaults such as `ya.ru`, `gosuslugi.ru`, and `ntp1.vniiftri.ru`; full country-profile configuration is still target work.
- Router time setup is partially implemented through LuCI/backend NTP/timezone controls; first-run country-aware automatic timezone selection still needs completion.

## Documentation Reading Rule

Documents under `docs/` mix current implementation notes and target product requirements. When a document describes an API, schedule engine, messenger bot, AI assistant, or complete enforcement behavior, treat it as the intended contract unless this status file says the feature is already implemented.
