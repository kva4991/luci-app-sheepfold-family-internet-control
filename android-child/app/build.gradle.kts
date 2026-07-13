import org.gradle.api.tasks.Copy

val sheepfoldChildVersionCode = 3
val sheepfoldChildVersionName = "1.2"

plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.android)
    alias(libs.plugins.kotlin.compose)
}

android {
    namespace = "com.example.sheepfoldchild"
    compileSdk = 35

    defaultConfig {
        applicationId = "app.sheepfold.child"
        minSdk = 21
        targetSdk = 35
        versionCode = sheepfoldChildVersionCode
        versionName = sheepfoldChildVersionName
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
        }
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_11
        targetCompatibility = JavaVersion.VERSION_11
        isCoreLibraryDesugaringEnabled = true
    }
    kotlinOptions { jvmTarget = "11" }
    buildFeatures { compose = true }
}

dependencies {
    implementation(libs.androidx.core.ktx)
    implementation(libs.androidx.lifecycle.runtime.ktx)
    implementation(libs.androidx.lifecycle.viewmodel.ktx)
    implementation(libs.androidx.activity.compose)
    implementation(platform(libs.androidx.compose.bom))
    implementation(libs.androidx.ui)
    implementation(libs.androidx.ui.graphics)
    implementation(libs.androidx.ui.tooling.preview)
    implementation(libs.androidx.material3)
    implementation("androidx.compose.material:material-icons-core")
    implementation(libs.androidx.datastore.preferences)
    implementation(libs.kotlinx.coroutines.android)
    coreLibraryDesugaring("com.android.tools:desugar_jdk_libs:2.1.4")
}

fun childDebugApkExportDir(): File {
    val customDir = providers.environmentVariable("SHEEPFOLD_APK_OUTPUT_DIR").orNull
    if (!customDir.isNullOrBlank()) return file(customDir)
    val userProfile = providers.environmentVariable("USERPROFILE").orNull
    if (!userProfile.isNullOrBlank()) return file("$userProfile/Downloads")
    val home = providers.environmentVariable("HOME").orNull
    if (!home.isNullOrBlank()) return file("$home/Downloads")
    return layout.projectDirectory.dir("build/outputs/shared").asFile
}

val copyChildDebugApkToDownloads by tasks.registering(Copy::class) {
    group = "sheepfold"
    description = "Copies the child debug APK to Downloads, or SHEEPFOLD_APK_OUTPUT_DIR."
    val exportDir = childDebugApkExportDir()
    from(layout.buildDirectory.file("outputs/apk/debug/app-debug.apk"))
    into(exportDir)
    rename { "sheepfold-child-v$sheepfoldChildVersionName.apk" }
    doFirst { exportDir.mkdirs() }
}

afterEvaluate {
    tasks.named("assembleDebug") {
        finalizedBy(copyChildDebugApkToDownloads)
    }
}
