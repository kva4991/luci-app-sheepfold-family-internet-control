import org.gradle.api.tasks.Copy

val sheepfoldChildVersionCode = 13
val sheepfoldChildVersionName = "1.12"


val childReleaseSigningEnvironment = mapOf(
    "SHEEPFOLD_CHILD_ANDROID_KEYSTORE" to providers.environmentVariable("SHEEPFOLD_CHILD_ANDROID_KEYSTORE").orNull,
    "SHEEPFOLD_CHILD_ANDROID_KEY_ALIAS" to providers.environmentVariable("SHEEPFOLD_CHILD_ANDROID_KEY_ALIAS").orNull,
    "SHEEPFOLD_CHILD_ANDROID_STORE_PASSWORD" to providers.environmentVariable("SHEEPFOLD_CHILD_ANDROID_STORE_PASSWORD").orNull,
    "SHEEPFOLD_CHILD_ANDROID_KEY_PASSWORD" to providers.environmentVariable("SHEEPFOLD_CHILD_ANDROID_KEY_PASSWORD").orNull,
)
val childReleaseSigningConfigured = childReleaseSigningEnvironment.values.all { !it.isNullOrBlank() }

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
        minSdk = 28
        targetSdk = 35
        versionCode = sheepfoldChildVersionCode
        versionName = sheepfoldChildVersionName
    }
    signingConfigs {
        if (childReleaseSigningConfigured) {
            create("release") {
                storeFile = file(childReleaseSigningEnvironment.getValue("SHEEPFOLD_CHILD_ANDROID_KEYSTORE")!!)
                keyAlias = childReleaseSigningEnvironment.getValue("SHEEPFOLD_CHILD_ANDROID_KEY_ALIAS")!!
                storePassword = childReleaseSigningEnvironment.getValue("SHEEPFOLD_CHILD_ANDROID_STORE_PASSWORD")!!
                keyPassword = childReleaseSigningEnvironment.getValue("SHEEPFOLD_CHILD_ANDROID_KEY_PASSWORD")!!
            }
        }
    }

    buildTypes {
        release {
            if (childReleaseSigningConfigured) signingConfig = signingConfigs.getByName("release")
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


val verifyChildReleaseSigning by tasks.registering {
    group = "verification"
    description = "Fails child release packaging unless all external Sheepfold signing secrets are present."
    doLast {
        val missing = childReleaseSigningEnvironment.filterValues { it.isNullOrBlank() }.keys.sorted()
        if (missing.isNotEmpty()) {
            throw org.gradle.api.GradleException(
                "Missing child Android release-signing environment variables: ${missing.joinToString(", ")}"
            )
        }
        val keystore = file(requireNotNull(childReleaseSigningEnvironment["SHEEPFOLD_CHILD_ANDROID_KEYSTORE"]))
        if (!keystore.isFile) {
            throw org.gradle.api.GradleException("Child Android release keystore does not exist: $keystore")
        }
    }
}

tasks.matching {
    it.name in setOf("assembleRelease", "bundleRelease", "packageRelease", "installRelease")
}.configureEach {
    dependsOn(verifyChildReleaseSigning)
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
    if (!userProfile.isNullOrBlank()) {
        return file("$userProfile/Documents/pesochnica")
    }
    val home = providers.environmentVariable("HOME").orNull
    if (!home.isNullOrBlank()) return file("$home/Documents/pesochnica")
    return layout.projectDirectory.dir("build/outputs/shared").asFile
}

val copyChildDebugApkToExportDir by tasks.registering(Copy::class) {
    group = "sheepfold"
    description = "Copies the child debug APK to the explicit Sheepfold artifact directory."
    // Внешняя папка может содержать временные файлы других процессов. Gradle не
    // должен считать весь пользовательский каталог собственным tracked output.
    doNotTrackState("The user-selected artifact directory is shared with external files.")
    val exportDir = childDebugApkExportDir()
    from(layout.buildDirectory.file("outputs/apk/debug/app-debug.apk"))
    into(exportDir)
    rename { "sheepfold-child-v$sheepfoldChildVersionName.apk" }
    doFirst {
        exportDir.mkdirs()
        exportDir.listFiles { file ->
            file.isFile && file.name.startsWith("sheepfold-child-v") && file.extension == "apk" &&
                file.name != "sheepfold-child-v$sheepfoldChildVersionName.apk"
        }?.forEach(File::delete)
    }
}

val exportChildDebugApk by tasks.registering {
    group = "sheepfold"
    description = "Builds the unified child APK and explicitly copies it to the artifact directory."
    dependsOn("assembleDebug")
    finalizedBy(copyChildDebugApkToExportDir)
}
