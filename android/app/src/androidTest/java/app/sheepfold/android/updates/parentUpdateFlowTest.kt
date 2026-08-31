package app.sheepfold.android.updates

// Синтетические APK-байты и HTTPS: проверяем lifecycle/AtomicFile, не устанавливаем APK и не трогаем роутер.
import android.app.Application
import android.content.Intent
import androidx.lifecycle.ViewModelStore
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import app.sheepfold.android.R
import org.json.JSONArray
import org.json.JSONObject
import org.junit.After
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith
import java.io.ByteArrayInputStream
import java.io.File
import java.net.URL
import java.security.MessageDigest
import java.security.cert.Certificate
import java.util.concurrent.atomic.AtomicInteger
import javax.net.ssl.HttpsURLConnection

@RunWith(AndroidJUnit4::class)
class ParentUpdateFlowTest {
    private val instrumentation = InstrumentationRegistry.getInstrumentation()
    private val application = instrumentation.targetContext.applicationContext as Application
    private val stores = mutableListOf<ViewModelStore>()
    private val directories = mutableListOf<File>()
    private val bytes = "synthetic-update-file".toByteArray()
    private val release = ParentRelease("0.2.0",
        "https://github.com/${ParentUpdatePolicy.repository}/releases/download/test/sheepfold-parent-v0.2.0.apk",
        bytes.size.toLong(), MessageDigest.getInstance("SHA-256").digest(bytes).hex())

    private inner class Platform : ParentUpdateInstallation {
        var permission = false
        var installedVersion = "0.1.0"
        val verifications = AtomicInteger()
        override val installed get() = AppIdentity("app.sheepfold.android", 1, installedVersion, setOf("fixture"))
        override fun verify(file: File, release: ParentRelease) {
            verifications.incrementAndGet()
            check(file.isFile && file.readBytes().contentEquals(bytes))
        }
        override fun permissionIntent() = if (permission) null else Intent("test.permission")
        override fun installIntent(file: File) = Intent("test.install")
    }

    private inner class Harness(cached: Boolean = false, permissionAt: Long = 0, granted: Boolean = false) {
        val directory = File(application.cacheDir, "update-flow-${System.nanoTime()}").also {
            check(it.mkdirs()); directories.add(it)
        }
        val platform = Platform().also { it.permission = granted }
        val downloads = AtomicInteger()
        val store = ParentUpdateStore(directory)
        val file get() = File(directory, "parent.apk")
        val client = ParentUpdateClient { url ->
            val payload = if (url == ParentUpdatePolicy.releasesUrl) {
                val asset = JSONObject().put("name", "sheepfold-parent-v${release.version}.apk")
                    .put("browser_download_url", release.url).put("state", "uploaded")
                    .put("size", release.size).put("digest", "sha256:${release.sha256}")
                JSONArray().put(JSONObject().put("draft", false).put("prerelease", false)
                    .put("assets", JSONArray().put(asset))).toString().toByteArray()
            } else {
                check(url == release.url)
                downloads.incrementAndGet()
                bytes
            }
            FakeHttps(url, payload)
        }
        init {
            if (cached) {
                file.writeBytes(bytes)
                store.write(SavedParentUpdate(release, permissionAt))
            }
        }
        fun model() = main {
            ParentAppUpdateModel(application, client, platform, directory).also { model ->
                ViewModelStore().also { it.put("update", model); stores.add(it) }
            }
        }
    }

    @After fun cleanup() {
        main { stores.forEach(ViewModelStore::clear) }
        directories.forEach { it.deleteRecursively() }
    }

    @Test fun downloadAutomaticallyPreparesExactlyOneSystemInstallation() {
        val fixture = Harness(granted = true)
        val model = fixture.model()
        download(model)
        await(model, UpdatePhase.INSTALLING)
        assertEquals(UpdateDestination.INSTALLER, main { model.takeLaunch()?.destination })
        assertNull(main { model.takeLaunch() })
        assertEquals(1, fixture.downloads.get())
        assertTrue(fixture.platform.verifications.get() >= 2)
        assertTrue(fixture.file.isFile)
        main { model.installerReturned(); model.foregrounded() }
        assertEquals(UpdatePhase.READY, main { model.state.phase })
        assertNull(main { model.launchRequest })
    }

    @Test fun grantingPermissionContinuesWithoutAnotherDownloadOrDuplicateLaunch() {
        val fixture = Harness()
        val model = fixture.model()
        download(model)
        await(model, UpdatePhase.WAITING_PERMISSION)
        assertEquals(UpdateDestination.PERMISSION, main { model.takeLaunch()?.destination })
        assertTrue(fixture.store.read()!!.permissionRequestedAt > 0)
        main { fixture.platform.permission = true; model.permissionReturned(); model.foregrounded() }
        await(model, UpdatePhase.INSTALLING)
        assertEquals(UpdateDestination.INSTALLER, main { model.takeLaunch()?.destination })
        assertNull(main { model.takeLaunch() })
        assertEquals(0L, fixture.store.read()!!.permissionRequestedAt)
        assertEquals(1, fixture.downloads.get())
    }

    @Test fun permissionDenialKeepsVerifiedFileForManualRetry() {
        val fixture = Harness()
        val model = fixture.model()
        download(model)
        await(model, UpdatePhase.WAITING_PERMISSION)
        main { model.takeLaunch(); model.permissionReturned() }
        await(model, UpdatePhase.READY)
        assertNull(main { model.launchRequest })
        assertEquals(R.string.app_update_permission_denied, main { model.state.message })
        assertTrue(fixture.file.isFile)
        main { model.install() }
        await(model, UpdatePhase.WAITING_PERMISSION)
        assertEquals(1, fixture.downloads.get())
    }

    @Test fun processRecreationDuringPermissionRestoresAndRevalidatesApk() {
        val fixture = Harness(cached = true, permissionAt = System.currentTimeMillis(), granted = true)
        val model = fixture.model()
        await(model, UpdatePhase.INSTALLING)
        assertEquals(UpdateDestination.INSTALLER, main { model.takeLaunch()?.destination })
        assertTrue(main { model.showUpdatePanel })
        assertTrue(fixture.platform.verifications.get() >= 2)
        assertEquals(0, fixture.downloads.get())
    }

    @Test fun ordinaryColdStartRestoresReadyFileWithoutAutomaticallyInstalling() {
        val fixture = Harness(cached = true, granted = true)
        val model = fixture.model()
        await(model, UpdatePhase.READY)
        main { model.foregrounded() }
        assertNull(main { model.launchRequest })
        main { model.check() }
        await(model, UpdatePhase.READY)
        assertEquals(release, main { model.state.release })
        assertEquals(0, fixture.downloads.get())
    }

    @Test fun restoredActivityCanStillWaitUnderThePermissionScreen() {
        val fixture = Harness(cached = true, permissionAt = System.currentTimeMillis())
        val model = fixture.model()
        await(model, UpdatePhase.WAITING_PERMISSION)
        assertNull(main { model.launchRequest })
        main { fixture.platform.permission = true; model.foregrounded() }
        await(model, UpdatePhase.INSTALLING)
        assertEquals(UpdateDestination.INSTALLER, main { model.takeLaunch()?.destination })
        assertEquals(0, fixture.downloads.get())
    }

    @Test fun expiredOrFuturePermissionDoesNotReopenSystemScreens() {
        for (time in listOf(System.currentTimeMillis() - 31 * 60_000L, System.currentTimeMillis() + 60_000L)) {
            val fixture = Harness(cached = true, permissionAt = time, granted = true)
            val model = fixture.model()
            await(model, UpdatePhase.READY)
            assertNull(main { model.launchRequest })
            assertEquals(0L, fixture.store.read()!!.permissionRequestedAt)
        }
    }

    @Test fun cancelledInstallerDoesNotRepeatAfterProcessRecreation() {
        val fixture = Harness(cached = true, granted = true)
        val model = fixture.model()
        await(model, UpdatePhase.READY)
        main { model.install() }
        await(model, UpdatePhase.INSTALLING)
        main { model.takeLaunch(); model.installerReturned(); stores.last().clear() }
        val restored = fixture.model()
        await(restored, UpdatePhase.READY)
        assertNull(main { restored.launchRequest })
        assertTrue(fixture.file.isFile)
    }

    @Test fun missingInstallerDoesNotDiscardTheDownload() {
        val fixture = Harness(cached = true, granted = true)
        val model = fixture.model()
        await(model, UpdatePhase.READY)
        main { model.install() }
        await(model, UpdatePhase.INSTALLING)
        main { model.takeLaunch(); model.installationFailed() }
        await(model, UpdatePhase.READY)
        assertEquals(R.string.app_update_install_failed, main { model.state.message })
        assertTrue(fixture.file.isFile)
        assertEquals(release, fixture.store.read()!!.release)
        assertEquals(0, fixture.downloads.get())
    }

    @Test fun cacheEvictionOrChangedBytesCannotReachInstaller() {
        for (missing in listOf(true, false)) {
            val fixture = Harness(cached = true, permissionAt = System.currentTimeMillis(), granted = true)
            if (missing) fixture.file.delete() else fixture.file.writeText("damaged")
            val model = fixture.model()
            await(model, UpdatePhase.AVAILABLE)
            assertNull(main { model.launchRequest })
            assertFalse(fixture.file.exists())
            assertNull(fixture.store.read())
        }
    }

    @Test fun completedUpdateClearsTheOldCachedApk() {
        val fixture = Harness(cached = true, granted = true)
        fixture.platform.installedVersion = release.version
        val model = fixture.model()
        await(model, UpdatePhase.IDLE)
        assertFalse(fixture.file.exists())
        assertNull(fixture.store.read())
        assertEquals(0, fixture.platform.verifications.get())
    }

    @Test fun malformedOrForeignStoredMetadataIsNotTrusted() {
        for (value in listOf("x".repeat(4097), "{}")) {
            val fixture = Harness(cached = true)
            File(fixture.directory, "ready.json").writeText(value)
            assertNull(fixture.store.read())
            val model = fixture.model()
            await(model, UpdatePhase.IDLE)
            assertFalse(fixture.file.exists())
        }
        val fixture = Harness(cached = true)
        fixture.store.write(SavedParentUpdate(release.copy(url = "https://example.invalid/evil.apk")))
        assertNull(fixture.store.read())
    }

    @Test fun oversizedCheckpointCannotReplacePreviouslySavedMetadata() {
        val fixture = Harness(cached = true)
        assertThrows(IllegalStateException::class.java) {
            fixture.store.write(SavedParentUpdate(release.copy(url = release.url + "x".repeat(4096))))
        }
        assertEquals(release, fixture.store.read()!!.release)
    }

    private fun download(model: ParentAppUpdateModel) {
        await(model, UpdatePhase.IDLE)
        main { model.check() }
        await(model, UpdatePhase.AVAILABLE)
        main { model.download(); model.download() }
    }

    private fun await(model: ParentAppUpdateModel, phase: UpdatePhase) {
        val deadline = System.nanoTime() + 10_000_000_000L
        while (main { model.state.phase } != phase && System.nanoTime() < deadline) Thread.sleep(10)
        assertEquals(phase, main { model.state.phase })
        instrumentation.waitForIdleSync()
    }

    private fun <T> main(block: () -> T): T {
        var result: Result<T>? = null
        instrumentation.runOnMainSync { result = runCatching(block) }
        return checkNotNull(result).getOrThrow()
    }

    private class FakeHttps(url: String, private val bytes: ByteArray) : HttpsURLConnection(URL(url)) {
        override fun connect() = Unit
        override fun disconnect() = Unit
        override fun usingProxy() = false
        override fun getResponseCode() = 200
        override fun getContentLengthLong() = bytes.size.toLong()
        override fun getInputStream() = ByteArrayInputStream(bytes)
        override fun getCipherSuite() = "fixture"
        override fun getLocalCertificates(): Array<Certificate>? = null
        override fun getServerCertificates(): Array<Certificate> = emptyArray()
    }
}
