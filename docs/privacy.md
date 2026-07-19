# Privacy Policy And Data Handling

Current Russian privacy draft:

- [Политика приватности и обработки данных](privacy.ru.md)

Sheepfold is designed as a family self-hosted tool by default: no mandatory developer cloud and no hidden telemetry. The optional feedback form is the narrow exception: it sends only user-entered fields and a separately consented allowlisted diagnostic report to the project owner's Yandex Cloud endpoint. The report excludes raw UCI configuration, device identifiers and names, SSIDs, logs, browsing history, passwords, tokens, and API keys.

Local device detection may inspect bounded DHCP, mDNS, SSDP/UPnP and WS-Discovery metadata. An
UPnP description may be fetched only from the exact numeric IPv4 sender currently present on LAN,
without DNS, redirects, router-self access, control URLs, or an unbounded response. WS-Discovery
XAddrs are never opened. Raw stable UUID/serial values stay in temporary router RAM; only versioned
HMAC-SHA-256 components and non-identifying service/model diagnostics may be persisted. The local
HMAC secret is not exported. A match on another MAC creates only a parent-facing resemblance
suggestion and never links records or grants/copies access policy (§devident1).

Sheepfold does not identify Google, Yandex, or another user account from passive network traffic.
TLS/QUIC may reveal that a service is being used, but not a reliable login, e-mail address, or
account contents. Sheepfold does not perform TLS interception; any future account linking must use
an explicit consented OAuth flow and must not become a LAN device identity signal (§devident1).

The explicitly installed child APK may use visible Android phone-state/phone-number permissions to send a best-effort active-SIM snapshot to the home router. Android can omit the number. Sheepfold does not read calls or SMS and does not request ICCID, IMSI, or IMEI. The router keeps a bounded long-term local history of available numbers; readable exports mask it, while a full encrypted backup may contain it. A detected change and an available number may also enter the local journal, administrator notification queue, configured messenger, or user-selected log storage; they are not sent to the Sheepfold developer (§simchg1).

Optional child Wi-Fi network reporting is disabled by default. When enabled, the child APK may report an SSID, a one-way network fingerprint, and optionally the phone's last available location to the home router. Raw BSSID is hashed on the phone and is not transmitted. Coordinates describe the phone, not a verified access-point address. While the home router is unavailable, up to 100 prepared reports may remain in the child app's private storage; disabling the feature removes that queue. Router entries and their coordinates expire after 90 days and the whole bounded history can be cleared in LuCI; notifications may also reach the configured family messenger or user-selected log storage, but are not sent to the Sheepfold developer (§childwifi1).

An optional external AI compute worker is only a future design. It is not required for internet control and is not currently implemented. Before any external hop, the router must remove secrets, pseudonymize direct identifiers, minimize context, and show a preview when sensitive family data is involved. Pseudonymized data must not be described as fully anonymous. A public Sheepfold Compute service would require a separate privacy/legal revision and security review (§aiexec1, §aimask1).

A future child AI safety conversation is a separate highly sensitive category. It must not be auto-forwarded merely because a person is the router administrator: the parent may be the source of danger. In a validated immediate threat, a future safety router may send the minimum rescue alert to a safe parent when that is the fastest effective help, without forwarding the full conversation. Sheepfold must not promise confidentiality the architecture cannot technically enforce (§aichild).

A human psychologist or other consultant connected through an external service is a separate data recipient. No case is sent automatically: the user must see the recipient, verified role, purpose, masked summary, selected excerpts, cost, retention, and deletion terms. Child cases require the separate child-safety protocol (§aiescal, §aichild).

The UI must explicitly ask whether to send the displayed data to the named consultant. The acknowledgement is unchecked by default. Consent to an LLM, the user agreement, or an earlier consultation does not authorize a new human recipient, purpose, or additional data.

A child's statement, network signal, or model inference about a possible offence is highly sensitive and is not evidence. Sheepfold never calls, messages, or transfers family data to police, child-protection, emergency dispatch, courts, or another state recipient. It may show a verified contact and help the person prepare what to say, but the person must initiate the contact. This has no emergency-reporting exception. Sheepfold must also refuse help to conceal continuing violence, destroy evidence, fabricate an alibi, or intimidate witnesses (§ailegal, §aichild, §aigov0).

When an external AI provider is selected, that provider processes the submitted text under its own terms and applicable law. Sheepfold does not initiate state disclosure, but it cannot promise that an external operator will never be legally compelled to disclose data it already holds. Context minimization and a future local-model mode reduce this separate risk.

Before app-store publication or production release, this document should be reviewed and adapted for the target countries and app-store requirements.
