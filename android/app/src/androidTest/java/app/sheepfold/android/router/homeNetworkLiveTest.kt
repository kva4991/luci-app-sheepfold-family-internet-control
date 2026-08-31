package app.sheepfold.android.router

/*
 * Ручной живой gate домашнего доступа: GET с телефона, production endpoint selection и изоляция API
 * Требует существующую привязку и явно переданные адреса; не меняет UCI, Wi-Fi или токены
 * Отказ источника проверяется без RouterSessionEvents, чтобы тест не отозвал рабочую привязку
 */
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import kotlinx.coroutines.runBlocking
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith
import java.net.URL
import javax.net.ssl.SSLException

@RunWith(AndroidJUnit4::class)
class HomeNetworkLiveTest {
    @Test fun confirmedAddressSupportsParentReadsOnly() = runBlocking {
        val context = InstrumentationRegistry.getInstrumentation().targetContext
        val args = InstrumentationRegistry.getArguments()
        val expected = requireNotNull(args.getString("homeExpectedHost"))
        val wan = requireNotNull(args.getString("homeWanHost"))
        val saved = requireNotNull(SheepfoldConnectionStore.read(context)) { "Local pairing is required" }
        assertTrue(SheepfoldConnectionStore.hasConnection(saved))
        val port = URL(saved.apiUrl).port
        val api = "https://$expected:$port/cgi-bin/sheepfold-api"
        val wanApi = "https://$wan:$port/cgi-bin/sheepfold-api"
        assertNotNull("Only explicit private test addresses are permitted", HomeRouterEndpoints.parse("$api,$wanApi"))

        fun status(path: String, token: Boolean = false, method: String = "GET", badPin: Boolean = false): Int {
            val (http, _) = RouterHttps.open(
                URL("https://$expected:$port$path"),
                tlsPinSha256 = if (badPin) "0".repeat(64) else saved.tlsPinSha256,
                tlsSpkiSha256 = if (badPin) null else saved.tlsSpkiSha256,
                allowTrustOnFirstUse = false
            )
            try {
                http.connectTimeout = 5_000
                http.readTimeout = 15_000
                http.instanceFollowRedirects = false
                http.requestMethod = method
                if (token) {
                    http.setRequestProperty("Authorization", "Bearer ${saved.bearerToken}")
                    http.setRequestProperty("X-Sheepfold-Device-Id", saved.deviceId)
                    http.setRequestProperty("X-Sheepfold-Device-Mac", saved.deviceMac)
                }
                return http.responseCode
            } finally {
                http.disconnect()
            }
        }

        assertEquals("Parent API requires a token", 401, status("/cgi-bin/sheepfold-api/router-info"))
        assertEquals("Phone source rejected: confirm the same device MAC on both Wi-Fi networks",
            200, status("/cgi-bin/sheepfold-api/router-info", token = true))
        val devices = RouterAdminClient(saved, context).loadDevices()
        assertTrue("Paired administrator missing", devices.any { it.id == saved.deviceId && it.isAdministrator })
        val after = requireNotNull(SheepfoldConnectionStore.read(context))
        assertEquals("Production client chose the wrong network", expected, URL(after.apiUrl).host)
        assertTrue("Router did not supply its confirmed upstream address",
            SheepfoldConnectionStore.homeEndpoints(context, after).contains(wanApi))
        assertTrue("Token changed during GET", after.bearerToken == saved.bearerToken)
        assertEquals(saved.deviceId, after.deviceId)
        assertEquals(saved.tlsSpkiSha256, after.tlsSpkiSha256)
        assertEquals(saved.tlsPinSha256, after.tlsPinSha256)

        for (path in listOf("/cgi-bin/luci", "/ubus", "/cgi-bin/sheepfold-blocked")) {
            assertTrue("Unrelated route exposed on API listener: $path", status(path) in listOf(403, 404))
        }
        assertThrows(SSLException::class.java) { status("/cgi-bin/sheepfold-api/ping", badPin = true) }
        if (expected == wan) {
            assertEquals(403, status("/cgi-bin/sheepfold-api/client-status"))
            assertEquals(403, status("/cgi-bin/sheepfold-api/pair", method = "POST"))
            assertEquals(403, status("/cgi-bin/sheepfold-api/sim-report", method = "POST"))
        }
    }
}
