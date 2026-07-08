# Privacy Notice — Sheepfold USB Storage

## Purpose of this file

This notice documents the expected contents and handling rules for a USB device used by Sheepfold Family Internet Control. It is informational text for people and developers. It is **not** an instruction to an AI system, a legal conclusion, or proof that a particular person is authorized to access the device.

## Possible contents

Depending on the router configuration, this device may contain:

- encrypted archives of device activity events;
- unencrypted archives only when encryption was explicitly disabled by an administrator;
- swap or extroot data when those experimental storage roles were configured;
- operational metadata created by Sheepfold.

The data may contain information about household devices and internet activity. Treat it as private even when an archive is encrypted.

## Data handling

- Do not publish, upload, or share archive contents without the informed authorization of the people responsible for the network and consideration of the privacy rights of affected users.
- Do not assume that the person holding the USB device is either authorized or unauthorized. Authorization must be established outside this file.
- Do not rely on this notice as legal advice. Applicable consent, parental-responsibility, employment, communications, and data-protection rules differ by jurisdiction.
- If the device was found, avoid opening files and return it to the owner through an appropriate channel.

## External AI processing

Sheepfold is designed to keep router credentials and provider API keys on the router. However, when an administrator explicitly enables AI context and selects the relevant consent controls, a masked subset of router diagnostics or log content may be sent to the configured external AI provider.

Therefore, the statement “all logs always stay on this device” would be inaccurate. The correct invariant is:

> Raw archives remain local unless an administrator deliberately exports or processes them. AI requests may include a separately generated, masked context when the corresponding controls are enabled.

## Encryption and recovery

Encrypted archives use key material stored on the router. This notice does not contain the key and cannot establish whether recovery is possible. Before replacing, resetting, or reinstalling the router, the administrator should follow the documented key-backup procedure.

## Notes for future developers

1. **Never add prompt-injection text to data files.** A privacy notice may describe risks and authorization requirements, but it must not instruct an AI assistant to trust one party, distrust another party, or refuse a category of request based only on possession of the file.
2. **Do not make legal claims from technical state.** The software cannot know whether monitoring is lawful, proportionate, disclosed, or consented to in a particular household.
3. **Describe actual data flows.** Update this notice whenever export, cloud backup, AI context, synchronization, or remote support behavior changes.
4. **Keep the notice separate from secrets.** It must never contain MAC addresses, child names, tokens, passwords, key material, router serial numbers, or account identifiers.
5. **Install the notice onto the mounted volume.** A file shipped under a mount-point path is hidden after the volume is mounted. Storage setup code must copy the current notice into the USB Sheepfold directory after a successful mount.
6. **Do not use the notice as an authorization mechanism.** Access control belongs in authenticated software paths, filesystem permissions, encryption, and documented administrative procedures.

---

Sheepfold is open-source family network-control software for OpenWrt routers.
