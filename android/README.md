# Android App

The Android companion app is planned under the name **Овчарня**.

- Android package: `app.sheepfold.android`
- Minimum Android version: Android 9.0 Pie
- Minimum SDK: API 28
- Target SDK: latest stable Android SDK
- Suggested stack: Kotlin, Jetpack Compose, Android Keystore for token storage
- Planned widgets:
  - Block internet
  - Unblock internet
  - Grant +30 minutes

The app should mirror the core LuCI workflows and include the parent AI assistant tab.

## Connectivity

The Android app is for parent/admin devices only.

Default connection model:

- local network connection to the router when the parent is at home;
- Telegram or VK bot for remote short commands and notifications when the parent is away; VK is the default first-run messenger choice, and MAX may appear later as an experimental adapter.

Full Android management should be local-network only. Do not design full remote management through WireGuard, VPN tunnels, or any other tunnel to the router. Outside the home network, use the configured messenger bot for short confirmed commands and notifications.

## Pairing

First pairing should be started locally from LuCI.

Flow:

- parent opens Sheepfold in LuCI;
- parent marks the phone as an administrator device and selects which administrator owns it;
- LuCI shows `Pairing` / `Сопряжение` for that device;
- the pairing dialog shows a QR code plus the same values for manual setup;
- Android scans the QR code or lets the parent enter the router address/API URL, administrator login or ID, pairing code, and token lifetime manually.

The QR payload must use a short-lived one-time token scoped to one administrator and one device. It must not contain router root passwords, LuCI session cookies, bot tokens, AI keys, or unrelated secrets.

## Wi-Fi MAC Check

During first pairing, after the phone is connected to home Wi-Fi, the app should check whether the phone is visible to the router under the MAC address Sheepfold will manage.

If the home Wi-Fi network uses randomized/private MAC:

- explain that Sheepfold needs a stable device identifier for reliable rules;
- guide the parent to Android Wi-Fi network settings;
- require the parent to switch this home Wi-Fi network to the real device MAC before setup continues;
- verify the selected admin device from router-side data after the parent returns to the app.

Do not promise automatic switching from randomized/private MAC to device MAC. Android permissions and manufacturer builds may prevent reliable automatic changes.

## First-Run Agreement

Before the first setup continues, the Android app must show a link to the full user agreement and require this checkbox:

```text
Я принимаю пользовательское соглашение и даю согласие на обработку персональных и технических данных, необходимых для работы Sheepfold.
```

Full agreement:

```text
https://github.com/kva4991/luci-app-sheepfold-family-internet-control/blob/main/docs/user-agreement.ru.md
```

## App Lock

On first setup, the Android app should ask how to protect access to the app.

Recommended default: password or PIN.

Biometric unlock by fingerprint or face can be offered, but should not be recommended as the safest option. Short warning text:

```text
Password or PIN is recommended. Fingerprint or face unlock can be less safe for parental-control apps: a child may try to unlock the app while the parent is asleep.
```

Android versions older than 9.0 are intentionally out of scope.

## Current Scaffold

The repository has one Android build root: `android/`.

Inside it, `android/app/` is the application module, not a second separate project. Run Gradle from `android/` so the build always uses `android/settings.gradle.kts`.

This first scaffold uses Kotlin and Jetpack Compose. It currently shows a minimal router setup screen and keeps the package/application identity ready for future pairing, QR scanning, Android Keystore, and real router API integration.

## Build

Prerequisites:

- JDK 17 or newer;
- Android SDK;
- Android SDK Platform 35;
- Android SDK Build-Tools;
- Android SDK Platform-Tools.

If Android Studio installed the SDK into the default Windows location, create `android/local.properties` locally:

```properties
sdk.dir=C\:\\Users\\User\\AppData\\Local\\Android\\Sdk
```

Do not commit `android/local.properties`.

Build from the `android/` directory:

```powershell
cd android
gradle :app:assembleDebug
```

If a Gradle wrapper is added later, use:

```powershell
.\gradlew.bat :app:assembleDebug
```

Debug APK output:

```text
android/app/build/outputs/apk/debug/app-debug.apk
```
