package app.sheepfold.android.router

/*
 * Назначение: проверяет отдельные router-функции parent APK: локальность адреса,
 * строгий SF2 QR и классификацию ошибок сохранённой сессии.
 * Почему JVM: эти правила детерминированы и не требуют телефона, сети или роутера.
 * Тесты не меняют Android state; успех не доказывает реальный TLS, QR-камеру или HTTP.
 */

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.Assert.assertThrows

class RouterConnectionSafetyTest {
    @Test
    fun `manual request accepts private IPv4 only`() {
        val request = SecureRouterConnectionManager().manualRequest(
            "192.168.4.1:5201",
            "owner",
            "pair-code"
        )

        assertEquals("https://192.168.4.1:5201/cgi-bin/sheepfold-api", request.apiUrl)
    }

    @Test
    fun `manual request rejects public IPv4`() {
        assertThrows(IllegalArgumentException::class.java) {
            SecureRouterConnectionManager().manualRequest("8.8.8.8", "owner", "pair-code")
        }
    }

    @Test
    fun `SF2 QR requires and preserves SPKI pin`() {
        val request = SecureRouterConnectionManager().parseQrPayload(
            "SF2|h=192.168.4.1|p=5201|api=/cgi-bin/sheepfold-api|" +
                "name=Home|u=owner|c=pair-code|spki=${"a".repeat(64)}"
        )

        assertEquals("Home", request.routerName)
        assertEquals("owner", request.administratorLogin)
        assertEquals("pair-code", request.temporaryPassword)
        assertEquals("a".repeat(64), request.tlsSpkiSha256)
    }

    @Test
    fun `SF2 QR without SPKI is rejected`() {
        assertThrows(IllegalArgumentException::class.java) {
            SecureRouterConnectionManager().parseQrPayload(
                "SF2|h=192.168.4.1|p=5201|u=owner|c=pair-code"
            )
        }
    }

    @Test
    fun `local address classifier rejects public and loopback addresses`() {
        assertTrue(LocalRouterAddress.isLocalIpLiteral("192.168.4.1"))
        assertTrue(LocalRouterAddress.isLocalIpLiteral("100.100.10.1"))
        assertFalse(LocalRouterAddress.isLocalIpLiteral("8.8.8.8"))
        assertFalse(LocalRouterAddress.isLocalIpLiteral("127.0.0.1"))
    }

    @Test
    fun `session errors distinguish revoked device from rejected token`() {
        val revoked = RouterSessionFailure.fromHttp(401, "device_unbound")
        val rejected = RouterSessionFailure.fromHttp(401, "token_expired")

        assertEquals(RouterPairingLoss.ACCESS_REVOKED, revoked?.reason)
        assertEquals(RouterPairingLoss.TOKEN_REJECTED, rejected?.reason)
    }

    @Test
    fun `temporary server failure does not clear pairing`() {
        assertEquals(null, RouterSessionFailure.fromHttp(503, "server_busy"))
    }
}
