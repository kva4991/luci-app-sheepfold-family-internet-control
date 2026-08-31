package app.sheepfold.android.ui.main

/*
 * JVM-проверка точного набора запросов каждой панели и запрета частичного/отменённого результата
 * Подставляет функции чтения: не меняет телефон, уведомления, UCI и сеть
 * Не заменяет проверку Compose-навигации и фактических HTTP на физическом стенде
 */
import app.sheepfold.android.router.RouterAdminCapabilities
import app.sheepfold.android.router.RouterAdminConfig
import app.sheepfold.android.router.RouterSnapshot
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.CoroutineStart
import kotlinx.coroutines.NonCancellable
import kotlinx.coroutines.launch
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.withContext
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.IOException

class RouterPanelLoaderTest {
    private class Fixture {
        val reads = mutableListOf<String>()
        var config = RouterAdminConfig()
        val snapshot = RouterSnapshot("Fixture", emptyMap(), false, false)
        var failAt: String? = null
        var waitInfo: suspend () -> Unit = {}
        fun record(name: String) {
            reads += name
            if (name == failAt) throw IOException("Fixture read failed")
        }
        val loader = RouterPanelLoader(
            loadDevices = { record("devices"); emptyList() },
            loadConfig = { record("config"); config },
            loadInfo = { record("info"); waitInfo(); snapshot },
            loadRequests = { record("requests"); emptyList() },
            loadEvents = { record("events"); emptyList() },
            loadLogs = { record("logs"); listOf("old", "new") },
            loadChannels = { record("channels"); mapOf("radio0" to listOf("1", "6", "11")) }
        )
    }

    @Test
    fun controlAndInfoReadOnlySnapshot() = runBlocking {
        for (panel in listOf("control", "info")) {
            val fixture = Fixture()
            val data = fixture.loader.load(panel)
            assertEquals(listOf("info"), fixture.reads)
            assertEquals(fixture.snapshot, data.snapshot)
            assertNull(data.config)
            assertNull(data.devices)
            assertNull(data.notifications)
            assertNull(data.accessRequests)
            assertNull(data.logs)
        }
    }

    @Test
    fun devicePanelsReadOnlyInventoryAndConfig() = runBlocking {
        for (panel in listOf("devices", "lists", "schedules", "groups", "administrators")) {
            val fixture = Fixture()
            val data = fixture.loader.load(panel)
            assertEquals(listOf("devices", "config"), fixture.reads)
            assertEquals(emptyList<Any>(), data.devices)
            assertEquals(fixture.config, data.config)
            assertNull(data.snapshot)
            assertNull(data.notifications)
        }
    }

    @Test
    fun wifiDoesNotReadDevicesOrNotifications() = runBlocking {
        val fixture = Fixture()
        fixture.loader.load("wifi")
        assertEquals(listOf("config", "info"), fixture.reads)
    }

    @Test fun wifiChannelsAreFetchedOnlyWithCapability() = runBlocking {
        val fixture = Fixture()
        fixture.config = fixture.config.copy(capabilities = RouterAdminCapabilities(wifiChannelsRead = true))
        fixture.loader.load("wifi")
        assertEquals(listOf("config", "channels", "info"), fixture.reads)
        fixture.reads.clear()
        fixture.loader.load("control")
        assertEquals(listOf("info"), fixture.reads)
    }

    @Test
    fun notificationsReadSettingsRequestsAndEventsOnly() = runBlocking {
        val fixture = Fixture()
        val data = fixture.loader.load("notifications")
        assertEquals(listOf("config", "requests", "events"), fixture.reads)
        assertEquals(emptyList<Any>(), data.notifications)
        assertEquals(emptyList<Any>(), data.accessRequests)
    }

    @Test
    fun logsReadFreshCapabilitiesAndNewestEntriesFirst() = runBlocking {
        val fixture = Fixture()
        val data = fixture.loader.load("logs")
        assertEquals(listOf("config", "logs"), fixture.reads)
        assertEquals(listOf("new", "old"), data.logs)
        fixture.reads.clear()
        fixture.config = fixture.config.copy(capabilities = RouterAdminCapabilities(logRead = false))
        assertEquals(emptyList<String>(), fixture.loader.load("logs").logs)
        assertEquals(listOf("config"), fixture.reads)
    }

    @Test
    fun localPanelsDoNotTriggerNetworkReads() = runBlocking {
        val fixture = Fixture()
        for (panel in listOf("menu", "settings", "feedback", "product")) {
            assertEquals(RouterPanelData(), fixture.loader.load(panel))
        }
        assertTrue(fixture.reads.isEmpty())
    }

    @Test
    fun reopeningAndManualRefreshFetchTheSamePanelAgain() = runBlocking {
        val fixture = Fixture()
        fixture.loader.load("control")
        fixture.loader.load("control")
        fixture.loader.load("devices")
        fixture.loader.load("control")
        assertEquals(listOf("info", "info", "devices", "config", "info"), fixture.reads)
    }

    @Test
    fun failedPanelReadDoesNotPublishPartialState() = runBlocking {
        val fixture = Fixture()
        val previous = RouterPanelData(snapshot = fixture.snapshot)
        var visible = previous
        fixture.failAt = "config"
        var failed = false
        try {
            visible = fixture.loader.load("devices")
        } catch (_: IOException) {
            failed = true
        }
        assertTrue(failed)
        assertEquals(previous, visible)
        assertEquals(listOf("devices", "config"), fixture.reads)
    }

    @Test
    fun cancelledReadCannotPublishEvenIfTransportFinishesLate() = runBlocking {
        val fixture = Fixture()
        val gate = CompletableDeferred<Unit>()
        fixture.waitInfo = { withContext(NonCancellable) { gate.await() } }
        var applied = false
        val job = launch(start = CoroutineStart.UNDISPATCHED) {
            fixture.loader.load("control")
            applied = true
        }
        assertEquals(listOf("info"), fixture.reads)
        job.cancel()
        gate.complete(Unit)
        job.join()
        assertTrue(job.isCancelled)
        assertFalse(applied)
    }
}
