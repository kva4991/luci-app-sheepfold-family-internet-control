# Privacy Policy And Data Handling

Current Russian privacy draft:

- [Политика приватности и обработки данных](privacy.ru.md)

Sheepfold is designed as a family self-hosted tool by default: no mandatory developer cloud and no hidden telemetry. The optional feedback form is the narrow exception: it sends only user-entered fields and a separately consented allowlisted diagnostic report to the project owner's Yandex Cloud endpoint. The report excludes raw UCI configuration, device identifiers and names, SSIDs, logs, browsing history, passwords, tokens, and API keys.

An optional external AI compute worker is only a future design. It is not required for internet control and is not currently implemented. Before any external hop, the router must remove secrets, pseudonymize direct identifiers, minimize context, and show a preview when sensitive family data is involved. Pseudonymized data must not be described as fully anonymous. A public Sheepfold Compute service would require a separate privacy/legal revision and security review (§aiexec1, §aimask1).

A future child AI safety conversation is a separate highly sensitive category. It must not be auto-forwarded merely because a person is the router administrator: the parent may be the source of danger. In a validated immediate threat, a future safety router may send the minimum rescue alert to a safe parent when that is the fastest effective help, without forwarding the full conversation. Sheepfold must not promise confidentiality the architecture cannot technically enforce (§aichild).

A human psychologist or other consultant connected through an external service is a separate data recipient. No case is sent automatically: the user must see the recipient, verified role, purpose, masked summary, selected excerpts, cost, retention, and deletion terms. Child cases require the separate child-safety protocol (§aiescal, §aichild).

The UI must explicitly ask whether to send the displayed data to the named consultant. The acknowledgement is unchecked by default. Consent to an LLM, the user agreement, or an earlier consultation does not authorize a new human recipient, purpose, or additional data.

A child's statement, network signal, or model inference about a possible offence is highly sensitive and is not evidence. Sheepfold never calls, messages, or transfers family data to police, child-protection, emergency dispatch, courts, or another state recipient. It may show a verified contact and help the person prepare what to say, but the person must initiate the contact. This has no emergency-reporting exception. Sheepfold must also refuse help to conceal continuing violence, destroy evidence, fabricate an alibi, or intimidate witnesses (§ailegal, §aichild, §aigov0).

When an external AI provider is selected, that provider processes the submitted text under its own terms and applicable law. Sheepfold does not initiate state disclosure, but it cannot promise that an external operator will never be legally compelled to disclose data it already holds. Context minimization and a future local-model mode reduce this separate risk.

Before app-store publication or production release, this document should be reviewed and adapted for the target countries and app-store requirements.
