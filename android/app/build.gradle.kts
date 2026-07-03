import org.gradle.api.tasks.Copy

val sheepfoldVersionCode = 8
val sheepfoldVersionName = "0.1.7"

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
    id("org.jetbrains.kotlin.plugin.compose")
}

android {
    namespace = "app.sheepfold.android"
    compileSdk = 35

    defaultConfig {
        applicationId = "app.sheepfold.android"
        minSdk = 28
        targetSdk = 35
        versionCode = sheepfoldVersionCode
        versionName = sheepfoldVersionName
    }

    buildTypes {
        release {
            isMinifyEnabled = true
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro"
            )
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    kotlinOptions {
        jvmTarget = "17"
    }

    buildFeatures {
        compose = true
    }
}

dependencies {
    implementation("androidx.core:core-ktx:1.13.1")
    implementation("androidx.activity:activity-compose:1.9.3")
    implementation("androidx.lifecycle:lifecycle-runtime-compose:2.8.7")
    implementation("androidx.camera:camera-camera2:1.4.2")
    implementation("androidx.camera:camera-lifecycle:1.4.2")
    implementation("androidx.camera:camera-view:1.4.2")
    implementation(platform("androidx.compose:compose-bom:2024.10.00"))
    implementation("androidx.compose.ui:ui")
    implementation("androidx.compose.material3:material3")
    implementation("com.google.mlkit:barcode-scanning:17.3.0")
}

fun debugApkExportDir(): File {
    val customDir = providers.environmentVariable("SHEEPFOLD_APK_OUTPUT_DIR").orNull
    if (!customDir.isNullOrBlank()) {
        return file(customDir)
    }

    val userProfile = providers.environmentVariable("USERPROFILE").orNull
    if (!userProfile.isNullOrBlank()) {
        return file("$userProfile/Downloads")
    }

    val home = providers.environmentVariable("HOME").orNull
    if (!home.isNullOrBlank()) {
        return file("$home/Downloads")
    }

    return layout.projectDirectory.dir("build/outputs/shared").asFile
}

val copyDebugApkToDownloads by tasks.registering(Copy::class) {
    group = "sheepfold"
    description = "Copies the debug APK to Downloads, or to SHEEPFOLD_APK_OUTPUT_DIR when set."

    val exportDir = debugApkExportDir()
    from(layout.buildDirectory.file("outputs/apk/debug/app-debug.apk"))
    into(exportDir)
    rename { "sheepfold-v$sheepfoldVersionName.apk" }

    doFirst {
        exportDir.mkdirs()
    }
}

afterEvaluate {
    tasks.named("assembleDebug") {
        finalizedBy(copyDebugApkToDownloads)
    }
}
