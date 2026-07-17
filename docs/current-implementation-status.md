# Current Implementation Status

Last checked: 2026-07-17.

Automated tests are grouped into overlapping problem categories (`smoke`, `luci`, `access`, `devices`, `sites`, `backend`, `android`, `security`, `messaging`, `ai`, `packaging`, and `tooling`). See [`test-strategy.ru.md`](test-strategy.ru.md) (§testcat); the category-map test prevents new test files from being left unassigned.

Before committing or pushing the current `main` working tree, follow the evidence-based checklist in [`merge-readiness-plan.ru.md`](merge-readiness-plan.ru.md). It separates locally verified work from scenarios that still require a live OpenWRT router or a real Android device.

Current OpenWRT package version in the repository:

```text
luci-app-sheepfold-family-internet-control_0.1.0-197_all.ipk
```

The package uses `Architecture: all` because it contains LuCI assets, shell scripts, UCI defaults, init/hotplug scripts, CGI endpoints, and rpcd ACL files without native binaries.

The `Sheepfold` / `Sheepfold - AI Support` boundary is implemented for both
router package formats and documented in
[`product-variants.ru.md`](product-variants.ru.md). A canonical GitHub Actions
matrix prepares both editions from one variant module and uses the pinned
official OpenWrt SDK to build IPK for 24.10.7 and a real apk-tools v3 package for
25.12.5. All four files keep the same installed package identity, so Standard ↔
AI Support is an upgrade/reinstall that preserves `/etc/config/sheepfold`;
filenames and payloads remain distinct. The workflow validates metadata,
creates SHA256SUMS/build manifest, and attaches only a complete matrix to a
normal release (§prodvar, §owrtci1). The workflow still needs its first remote
GitHub run and a live-router round-trip before a public stable release.

## Working In The Current Package

- LuCI entry point for `Sheepfold Family Internet Control`.
- UCI config `/etc/config/sheepfold` with default app settings.
- Asset cache busting through `ui_asset_version` and JS/CSS query suffixes.
- LuCI modularization (§frontmod): `overview.js` was reduced from 8624 to about 6420 physical lines. In addition to router backend/info/maintenance, QR, secure random, device types, logs and shared controls, focused modules now own device inventory merging (§devinv), device/access-list editors (§devmut, §lstxcl1), schedule calculations and panel, group/admin models, panels and modal editors, device table/selection behavior, editable Wi-Fi cards, messenger settings, site-list runtime status, and the settings draft lifecycle.
- HTTPS-only local Android discovery/API service on the configurable Sheepfold port, default `5201`, with certificate pinning in both Android applications.
- Public discovery data through `/.well-known/sheepfold.json`.
- Parent Android recovery after a configured Sheepfold port change: the client re-reads pinned HTTPS discovery, stores the new endpoint, and does not retry commands after an ambiguous timeout.
- CGI endpoint `/cgi-bin/sheepfold-api` with current router/app metadata and `/cgi-bin/sheepfold-api/router-info` diagnostics snapshot for Android/APK AI-preview flows.
- Real parent Android pairing through a short-lived one-time code, single-use backend consumption, token hash storage, and token binding to numeric device ID and MAC.
- Numeric stable device IDs starting at `1`, migrated from legacy display formats and included in device-related log events.
- Configurable blocked-page responder on port `5202`.
- Router-control backend command for Wi-Fi enable/disable, Wi-Fi automation tick, WPS actions, LED actions, blocked-page service, WAN status tick, router diagnostics, and device status changes.
- Reversible `Disable IPv6 on the router` control in Settings -> Misc: disabled by default, forced on for current Podkop integration modes, applied through a Sheepfold-owned sysctl file, and restored to the previous kernel state when automatic compatibility is no longer needed (§ipv6pod).
- Device add/status backend action: create or update a device by MAC, add to allowlist, add to blocklist, or add as a known restricted device.
- Allowlist/blocklist and administrator-device changes apply UCI and synchronize nftables immediately without reloading the LuCI page.
- Temporary access backend action for Android/LuCI/Telegram: stores an expiry in a separate temporary status, never overrides the device blocklist or global internet block, does not pollute the user allowlist, and is cleaned by the service tick after expiry.
- Backend protection that prevents administrator devices from being added to the blocklist.
- Real fw4/nftables enforcement with separate sets for the device blocklist and internet-only restrictions. The device blocklist denies forwarding and router input; schedules, restricted status, and the configured new-device restriction deny only internet forwarding. The global block keeps its explicit exemptions. Sheepfold uses only its own fw4 sets/chains and does not alter Podkop packet marks or routing tables.
- Schedule evaluator for device/group targets, overnight ranges, configurable same-level conflict result (`off` by default), conflict journaling, effective client status, and scheduled firewall synchronization. Live-router timing and transition tests are still required.
- LuCI buttons for adding devices to allowlist/blocklist through the backend command.
- Manual device add from LuCI by MAC/name/IP/type.
- Quick allowlist modal that collects newly connected candidates and adds only the selected candidate.
- Export of settings and known UI data to readable JSON with secret fields masked.
- Import/export v2 for all Sheepfold sections, static DHCP leases and Wi-Fi UCI: readable JSON masks secrets, while the full backup uses password-derived AES-256-GCM. Import validates the payload, rejects conflicting device lists, preserves matching masked secrets, applies UCI changes, and refreshes router services (§cfgbak1).
- Log clearing and masked log export.
- Router reboot button through a queued command path.
- Update button that calls the installed updater service and checks GitHub stable releases. A shared adapter selects `opkg` on OpenWrt 24.10 and older or `apk` v3 on 25.12 and newer. Before installation, the updater validates the official asset path, package container, internal name/version/architecture and format-specific safety; a failed installation restores the previous Sheepfold config but does not claim a binary rollback (§pkgmgr1, §updsafe).
- Wi-Fi page that reads router wireless UCI settings and shows connection QR codes.
- Persistent emergency-useful site cards and initial runtime enforcement: UCI-backed domains, dnsmasq nftset integration when supported, base-domain resolver fallback, and narrow TCP/UDP web exceptions that do not open LuCI/SSH/API (§emerg1). Shared-CDN and multi-domain sites still require live-router verification.
- WPS button behavior settings.
- Router LED behavior settings.
- WAN connectivity event logging.
- LuCI settings tab `Information` showing router time, Sheepfold version, internet status, ping to `ya.ru`, OpenWRT/firmware/kernel/model, Wi-Fi radio status, LAN ports, Podkop/AdGuard Home installation/version, uptime/load/memory, and a safe AI context preview for APK.
- Device detection helper with heuristic device types and optional `No restrictions` auto-assignment.
- Auto-assignment to `No restrictions` only when automatic setup of new devices is enabled; a device name alone is not sufficient evidence.
- Router-proxied DeepSeek, Gemini, and Grok providers with versioned parent/child runtime prompts and provider keys stored only on the router. The exact implemented request path and its current limits are recorded in [`ai-assistant-development/current-implementation.ru.md`](ai-assistant-development/current-implementation.ru.md) (§aiimpl1).
- Parent Android onboarding, live/file QR scanner, manual pairing, encrypted connection storage, password/PIN/biometric app protection, device actions, notifications, and three internet-state home-screen widgets.
- Separate child Android application with HTTPS status lookup and parent-controlled AI access for devices in a personal group.
- Repository-managed Windows toolchain checks/install scripts and Gradle Wrapper 8.10.2 for both Android applications; Android SDK packages remain outside Git and are installed from Google's verified repository metadata.
- Canonical OpenWrt release workflow for Standard/AI Support IPK and OpenWrt APK, with SDK-feed boundary tests and optional repository signing secrets (§owrtci1).
- Minimal Telegram adapter through outgoing long polling: configured from LuCI, test message button, chat ID discovery when empty, bot command menu sync, commands for status, device list, internet on/off, Wi-Fi on/off, and support.
- Resilient per-source site-list updater: bounded downloads and archive extraction, format normalization, deduplication, atomic last-known-good caches, background cache bootstrap after reboot, daily retry after failure, authenticated failure/recovery notifications, and rejection of unexpectedly shortened large sources until explicit acceptance (§slstres).
- LuCI source diagnostics for site lists: each configured source shows its last working domain count, last successful update, failure count/reason and next retry without exposing the URL in runtime status. A suspiciously reduced file shows `before / new` counts and requires a separate 10-second confirmation before acceptance (§slstres).
- Transactional runtime application of site allowlists/blocklists: selectable `auto|adguard|sheepfold` executor, local dnsmasq `nftset` plus Sheepfold-owned nftables sets, one API-managed AdGuard Home URL filter that preserves user filters, built-in fallback after an unconfirmed AdGuard result, fail-open behavior before a verified allowlist exists, and rollback of DNS/readiness/firewall state after an application failure (§dompol). Live-router validation remains required.
- Standard and AI Support test packages now keep their runtime jobs separate, while both declare the HTTPS and network-client dependencies required on a clean router.
- Optional `Feedback / suggestions` tab in LuCI and the parent APK. The authenticated router backend validates and rate-limits messages, then forwards only the displayed fields to a configurable Yandex Cloud Function/API Gateway endpoint; the child APK has no feedback tab (§feedback).
- Uninstall script that removes the OpenWRT package while preserving Sheepfold settings/client lists and printing a remaining-settings report.

## Still Target / Incomplete

- LuCI modularization is not finished. Schedule, group, administrator and device editors are now separate modules. Editors receive fields, selectors, validation and persistence through explicit callbacks and do not read UCI or arbitrary `overview.js` state directly. Administrator QR/token creation and access mutation, plus device UCI/DHCP/firewall application, deliberately remain in the coordinator. The next step is storage/log orchestration (§frontmod, §pairsec, §devmut).
- Emergency-useful domain exceptions and schedule enforcement are implemented initially but still require live-router verification for DNS variants, shared CDN addresses, time transitions, overnight ranges, conflict changes, firewall reload, and interaction with all higher-priority rules (§emerg1).
- End-to-end live-router verification is still needed for blocklist, global block, temporary access, firewall reload recovery, and all four AdGuard Home/Podkop profiles.
- LuCI has a functional UCI schedule editor with allow/block actions, group or device targets, weekday selection, multiple intervals, overnight ranges, duplication, deletion, and disabling without deletion. `Settings → Misc` also controls whether internet stays off or on for a same-level schedule conflict while preserving the warning and journal event.
- `Settings → Misc` shows the fixed order that effective-status and firewall currently enforce. Editing is intentionally disabled until one configurable `access_priority` implementation is shared by LuCI, status API, schedules, and nftables.
- A future `/api/v1/*` alias, refresh-token flow, and complete Android editors for every LuCI section remain target work; current authenticated CGI routes cover pairing, devices, global internet state, router information, and AI.

## AdGuard Home resilience

- The managed feed is fetched through local `uhttpd` and compared with the active file before refresh; cached AdGuard rules alone are not treated as proof that updates still work.
- Three consecutive synchronization failures create one administrator notification; the first later success creates one recovery notification.
- A token rotation disables the previously owned exact URL before storing the new URL. Ownership metadata is mode `0600` and never appears in status or logs.
- Deleted filters are recreated, renamed filters are restored, duplicate exact URLs are rejected, and all writes remain restricted to the Sheepfold-owned URL filter.
- The service retries an active AdGuard policy every 300 seconds by default and still reacts immediately to DHCP/device-signal changes.
- Parent Android tabs for schedules, groups, administrators, Wi-Fi and logs are currently placeholders; the complete editors still exist only in LuCI.
- VK and MAX messenger adapters are documented but not implemented.
- Telegram adapter is not a complete production adapter yet: dangerous actions still need confirmation flows, richer admin binding, better command parsing, and stronger backend enforcement.
- AdGuard Home site filtering is represented in LuCI and implemented through the local API. Podkop remains compatibility-oriented: Sheepfold detects it and preserves its routing state but does not manage Podkop routes.
- AdGuard Home automatic management owns only the Sheepfold URL filter. It reads `/control/status`, `/control/dns_info`, `/control/filtering/status`, and uses read-only `/control/filtering/check_host` for reserved `.test` control rules; global protection, upstreams, clients, DHCP, logs, TLS and user rules are not automatically changed (§aghplan).
- The AdGuard adapter enforces an exact API endpoint/query allowlist, bounded response time/size, fresh response files, schema checks, and distinct failure reasons. It records only safe DNS aggregates, rejects a stopped server or disabled global protection, tolerates unavailable optional DNS diagnostics without removing a confirmed filter, and keeps the built-in fallback. A successful engine check requires exact rule text and the Sheepfold filter ID for global block, emergency allow and an active strict IPv4 class. LuCI still distinguishes this from the unverified LAN-client DNS path. A fake HTTP server verifies this contract; live-router validation remains required (§aghplan).
- Site allowlist/blocklist source files are consumed by the runtime domain policy, and LuCI reports whether filtering is confirmed in AdGuard Home, active through Sheepfold, running through fallback, waiting, unsupported, manual/unverified, or failed. All four topology modes and API failure paths still require live-router tests; DNS-level filtering does not inspect URLs/content and does not yet prevent external DNS, DoH, VPN, proxy, or direct-IP bypass (§slstres, §dompol, §uirunfx).
- The installer downloads the matching IPK or OpenWrt APK from the latest normal GitHub Release, installs it through the native package manager, then applies the chosen language, automatic detection mode, and detected AdGuard Home/Podkop combination. It intentionally ignores pre-releases because updates use the stable `releases/latest` channel (§pkgmgr1).
- Country-aware connectivity diagnostics are partially implemented for router info/WAN checks with Russia-relevant defaults such as `ya.ru`, `gosuslugi.ru`, and `ntp1.vniiftri.ru`; full country-profile configuration is still target work.
- Router time setup is partially implemented through LuCI/backend NTP/timezone controls; first-run country-aware automatic timezone selection still needs completion.

## Documentation Reading Rule

Documents under `docs/` mix current implementation notes and target product requirements. When a document describes an API, schedule engine, messenger bot, AI assistant, or complete enforcement behavior, treat it as the intended contract unless this status file says the feature is already implemented.

The latest evidence-based local verification is recorded in [`implementation-audit-2026-07-16.ru.md`](implementation-audit-2026-07-16.ru.md) (§implaudit).
