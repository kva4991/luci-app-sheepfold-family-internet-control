# Parent Android release signing

The repository never contains the production keystore or its passwords. A parent
release build requires all four process environment variables:

```text
SHEEPFOLD_ANDROID_KEYSTORE=/absolute/path/to/sheepfold-parent-release.jks
SHEEPFOLD_ANDROID_KEY_ALIAS=sheepfold-parent
SHEEPFOLD_ANDROID_STORE_PASSWORD=...
SHEEPFOLD_ANDROID_KEY_PASSWORD=...
```

Run the checked-in wrapper only after the variables are present:

```powershell
android\gradlew.bat -p android lintRelease assembleRelease
```

```sh
./android/gradlew -p android lintRelease assembleRelease
```

`assembleRelease`, `bundleRelease`, `packageRelease`, and `installRelease` fail
before packaging when a variable is missing or the keystore file does not exist.
Debug builds remain independent from production signing.

Keep the master keystore on an owner-controlled offline medium and maintain an
encrypted offline backup. CI should receive a narrowly scoped encrypted copy and
password secrets only for an explicit release workflow. Never place a keystore,
password, Base64 keystore dump, or generated `keystore.properties` in Git.

Before distributing the first stable APK, record and verify the signing certificate
fingerprint, install the signed release on at least two physical phones, and test the
only explicitly supported upgrade path. A debug-signed APK cannot be upgraded in
place to a production-signed APK unless the signing identity is the same.
