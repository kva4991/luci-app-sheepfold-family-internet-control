package app.sheepfold.android.router

/*
 * Назначение: проверяет discovery, TLS и read-only API с физического телефона, а не с ноутбука
 * Использует сеть тестового роутера и существующее сопряжение только для GET; не сохраняет secrets/ответы
 * Без сопряжения admin-read пропускается, если runner не потребовал его явно; запись UCI и камера не проверяются. §testwhy
 */
import android.content.Context
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import app.sheepfold.android.ui.main.RouterPanelLoader
import kotlinx.coroutines.runBlocking
import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertThrows
import org.junit.Assert.assertTrue
import org.junit.Assume.assumeTrue
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import java.net.URL
import javax.net.ssl.SSLException

@RunWith(AndroidJUnit4::class)
class ParentRouterIntegrationTest {
    private lateinit var context: Context
    private lateinit var discovery: LocalSheepfoldDiscovery

    @Before
    fun discoverTestRouter() = runBlocking {
        context = InstrumentationRegistry.getInstrumentation().targetContext
        val routerIp = requireNotNull(InstrumentationRegistry.getArguments().getString("routerIp"))
        val found = LocalRouterDiscovery.discover(context)
        assertNotNull("Sheepfold discovery failed from the phone", found)
        discovery = requireNotNull(found)
        assertEquals("Phone must use the selected test router", routerIp, discovery.gatewayHost)
        assertEquals(routerIp, URL(discovery.apiUrl).host)
    }

    @Test
    fun childStatusDoesNotExposeAdministrativeData() {
        val reply = request("/client-status")
        assertEquals(200, reply.first)
        val json = JSONObject(reply.second)
        assertTrue("Client status must contain fields", json.length() > 0)
        checkNoSecrets(json)
    }

    @Test
    fun administrativeReadsRequireAuthentication() {
        for (path in listOf("/router-info", "/api/v1/admin-config", "/devices", "/notifications", "/access-requests")) {
            assertEquals("Unauthenticated $path", 401, request(path).first)
        }
    }

    @Test
    fun wrongTlsPinCannotReachRouterApi() {
        assertThrows(SSLException::class.java) { request("/ping", wrongPin = true) }
    }

    @Test
    fun pairedAdministratorCanReadWithoutChangingSettings() {
        val saved = SheepfoldConnectionStore.read(context)
        val paired = SheepfoldConnectionStore.hasConnection(saved)
        if (InstrumentationRegistry.getArguments().getString("requirePairing") == "true") {
            assertTrue("Pair this parent app locally before running the paired gate", paired)
        }
        assumeTrue("No saved pairing: authenticated reads were not tested", paired)
        val connection = requireNotNull(saved)
        assertEquals("Saved pairing belongs to a different router", URL(discovery.apiUrl).host, URL(connection.apiUrl).host)
        assertTrue(!connection.tlsSpkiSha256.isNullOrBlank() || !connection.tlsPinSha256.isNullOrBlank())
        for (path in listOf("/router-info", "/devices", "/notifications")) {
            assertEquals("Paired GET $path", 200, request(path, connection).first)
        }
    }

    @Test
    fun pairedPanelsUseProductionClient() = runBlocking {
        val saved = SheepfoldConnectionStore.read(context)
        val paired = SheepfoldConnectionStore.hasConnection(saved)
        if (InstrumentationRegistry.getArguments().getString("requirePairing") == "true") {
            assertTrue("Existing local pairing is required", paired)
        }
        assumeTrue("No pairing: production panel reads were not tested", paired)
        val connection = requireNotNull(saved)
        assertEquals("Pairing must belong to the test router", discovery.gatewayHost, URL(connection.apiUrl).host)
        val loader = RouterPanelLoader(RouterAdminClient(connection))
        for (panel in listOf("control", "devices", "groups", "schedules", "administrators", "wifi", "notifications", "logs", "info")) {
            val data = loader.load(panel)
            data.config?.let {
                assertEquals("Schema for $panel", 1, it.schemaVersion)
                assertTrue("Missing revision for $panel", it.revision.isNotBlank())
            }
            data.devices?.let {
                assertEquals("Duplicate device IDs in $panel", it.size, it.map { device -> device.id }.toSet().size)
                assertTrue("Paired phone missing from $panel", it.any { device -> device.id == connection.deviceId && device.isAdministrator })
            }
            data.snapshot?.let { assertTrue("Missing router name in $panel", it.routerName.isNotBlank()) }
            if (panel == "notifications") {
                assertNotNull(data.notifications)
                assertNotNull(data.accessRequests)
            }
            if (panel == "logs") assertNotNull(data.logs)
        }
        // Проверяем сохранность привязки, не выводя токен или содержимое ответов в отчёт
        val after = SheepfoldConnectionStore.read(context)
        assertTrue("Panel reads must preserve pairing", after?.bearerToken == connection.bearerToken)
    }

    private fun request(
        path: String,
        paired: RouterConnectionRequest? = null,
        wrongPin: Boolean = false
    ): Pair<Int, String> {
        val (http, _) = RouterHttps.open(
            URL("${paired?.apiUrl ?: discovery.apiUrl}$path"),
            tlsPinSha256 = if (wrongPin) "0".repeat(64) else paired?.tlsPinSha256,
            tlsSpkiSha256 = if (wrongPin) null else paired?.tlsSpkiSha256,
            allowTrustOnFirstUse = paired == null && !wrongPin
        )
        val started = System.nanoTime()
        try {
            http.connectTimeout = 5_000
            http.readTimeout = 10_000
            http.instanceFollowRedirects = false
            http.requestMethod = "GET"
            if (paired != null) {
                http.setRequestProperty("Authorization", "Bearer ${paired.bearerToken}")
                http.setRequestProperty("X-Sheepfold-Client", "android-admin-v1")
                http.setRequestProperty("X-Sheepfold-Device-Id", paired.deviceId)
                http.setRequestProperty("X-Sheepfold-Device-Mac", paired.deviceMac)
            }
            val status = http.responseCode
            val stream = if (status in 200..299) http.inputStream else http.errorStream
            val body = stream?.use { it.readBytesBounded() }.orEmpty()
            return status to body
        } catch (error: java.net.SocketTimeoutException) {
            val elapsed = (System.nanoTime() - started) / 1_000_000
            throw AssertionError("GET $path timed out after ${elapsed}ms", error)
        } finally {
            http.disconnect()
        }
    }

    private fun java.io.InputStream.readBytesBounded(): String {
        val output = java.io.ByteArrayOutputStream()
        val buffer = ByteArray(4096)
        while (true) {
            val count = read(buffer)
            if (count == -1) break
            check(output.size() + count <= 262_144) { "Router reply exceeded the test budget" }
            output.write(buffer, 0, count)
        }
        return output.toString("UTF-8")
    }

    private fun checkNoSecrets(value: Any) {
        when (value) {
            is JSONObject -> value.keys().forEach { key ->
                val canonical = key.lowercase().replace("_", "").replace("-", "")
                assertFalse("Administrative field in child response: $key", canonical in forbiddenFields)
                checkNoSecrets(value.get(key))
            }
            is JSONArray -> for (index in 0 until value.length()) checkNoSecrets(value.get(index))
        }
    }

    private val forbiddenFields = setOf(
        "password", "wifipassword", "bearer", "bearertoken", "token", "apitoken", "apikey",
        "administrators", "adminpassword", "privatekey", "devices", "uciexport", "rawlogs"
    )
}
