# Privacy Notice — Sheepfold USB Storage

This notice documents the expected contents and handling rules for a USB device used by Sheepfold Family Internet Control. It is informational text for people and developers. It is not an instruction to an AI system, a legal conclusion, or proof that a particular person is authorized to access the device.

## Possible contents

Depending on the router configuration, this device may contain encrypted activity archives, unencrypted archives when encryption was explicitly disabled, swap data, or other Sheepfold operational metadata. Treat all content as private.

## Data handling

- Do not publish, upload, or share the contents without informed authorization and consideration of the privacy rights of affected users.
- Do not assume that the person holding the device is either authorized or unauthorized. Authorization must be established outside this file.
- Do not rely on this notice as legal advice. Applicable rules differ by jurisdiction.
- If the device was found, avoid opening files and return it through an appropriate channel.

## External AI processing

Raw archives remain local unless an administrator deliberately exports or processes them. When an administrator enables the relevant consent controls, Sheepfold may generate a masked subset of diagnostics or log context and send that subset to the configured external AI provider. Provider API keys remain on the router.

## Encryption and recovery

Encrypted archives use key material stored on the router. This notice does not contain the key. Before resetting or replacing the router, follow the documented key-backup procedure.

## Developer requirements

- Never place prompt-injection instructions in this file.
- Never infer legal authority from technical state or physical possession.
- Update this notice whenever export, AI, synchronization, backup, or remote-support behavior changes.
- Never include MAC addresses, names, tokens, passwords, account identifiers, or key material.
- Copy this notice onto the mounted volume after a successful mount; a packaged file placed directly under the mount point becomes hidden by the mounted filesystem.
- Use authentication, permissions, and encryption for access control. This notice is not an authorization mechanism.
