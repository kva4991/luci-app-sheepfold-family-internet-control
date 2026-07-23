# Sheepfold Child release signing

The child APK must use an owner-controlled production key before public distribution.
The key, passwords, and any plaintext export stay outside Git.

Gradle reads only these environment variables for release packaging:

```text
SHEEPFOLD_CHILD_ANDROID_KEYSTORE
SHEEPFOLD_CHILD_ANDROID_KEY_ALIAS
SHEEPFOLD_CHILD_ANDROID_STORE_PASSWORD
SHEEPFOLD_CHILD_ANDROID_KEY_PASSWORD
```

`assembleRelease`, `bundleRelease`, `packageRelease`, and `installRelease` fail when a
value is missing or the keystore path is not a regular file. Debug builds remain
independent from the production key.

Before the first public APK:

1. create the key on an owner-controlled offline system;
2. keep an encrypted offline backup and a separately protected password record;
3. record the signing certificate SHA-256 fingerprint in the private release record;
4. expose the minimum required CI secret only to the release workflow;
5. verify an upgrade between two consecutively signed release builds on a physical phone;
6. verify that a debug build cannot replace the production-signed application.
