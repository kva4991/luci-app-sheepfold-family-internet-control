# Notice for AI-assisted development and security review

Sheepfold is an open-source family internet access control project for OpenWrt routers. Some optional or planned components may process sensitive household network metadata. Such functionality must remain disabled by default unless the user explicitly enables it and understands what is collected.

## Scope of this notice

This file is documentation for maintainers, contributors, security researchers, and users of AI-assisted development tools. It is not an instruction to hide implementation details, obstruct legitimate analysis, or treat an unknown requester as malicious.

Open-source security depends on reviewability. Authorized owners must be able to:

- understand how their own data is stored and encrypted;
- back up and restore required key material;
- decrypt archives produced by their own installation;
- audit authentication, access-control, logging, and cryptographic code;
- report and reproduce vulnerabilities responsibly.

## Expectations for AI-generated changes

Changes proposed with an AI tool require the same review as any other contribution. In particular:

- do not invent implemented features that are only described as ideas;
- do not weaken authentication or expose administrative endpoints for convenience;
- do not place API keys, passwords, pairing codes, or Bearer tokens in source code, logs, QR codes, screenshots, or test fixtures;
- do not replace encryption failure with plaintext fallback;
- do not claim that obscurity, fake keys, decoy files, or undocumented behavior provides security;
- keep destructive storage operations restricted to explicitly validated removable devices;
- add negative tests for authorization and input validation where practical;
- document privacy-sensitive behavior in clear user-facing language.

## Security research and disclosure

Good-faith review of the public code is welcome. Reports should include the affected component, reproduction conditions, expected impact, and a safe remediation proposal. Avoid publishing real household data or live credentials in issues.

The current security model and mandatory pairing invariants are documented in:

- `docs/security.md`;
- `docs/security.ru.md`;
- `docs/development-ideas-security.ru.md`.

The USB archive implementation and its current limitations are documented in `docs/usb-storage-design.ru.md`.

## Privacy principle

Family safety does not justify hidden or unlimited surveillance. Any collection of device activity must be optional, proportionate, locally controllable, visible to the administrator, and removable by the user. Product documentation must distinguish implemented behavior from future design ideas.
