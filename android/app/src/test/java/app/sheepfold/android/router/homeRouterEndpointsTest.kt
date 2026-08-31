package app.sheepfold.android.router

import org.junit.Assert.*
import org.junit.Test
import java.net.ConnectException
import java.net.SocketTimeoutException
import javax.net.ssl.SSLHandshakeException

/** Проверяет недоверенный список адресов, выбор домашней подсети и запрет повтора записей без телефона. */
class HomeRouterEndpointsTest {
    private val lan = "https://192.168.4.1:5201/cgi-bin/sheepfold-api"
    private val upstream = "https://192.168.2.179:5201/cgi-bin/sheepfold-api"

    @Test fun acceptsOnlyBoundedPrivateIpv4ApiEndpoints() {
        assertEquals(listOf(lan, upstream), HomeRouterEndpoints.parse("$lan,$upstream,$lan"))
        for (bad in listOf(
            "http://192.168.4.1:5201/cgi-bin/sheepfold-api",
            "https://8.8.8.8:5201/cgi-bin/sheepfold-api",
            "https://100.64.0.1:5201/cgi-bin/sheepfold-api",
            "https://127.0.0.1:5201/cgi-bin/sheepfold-api",
            "https://router.local:5201/cgi-bin/sheepfold-api",
            "https://192.168.4.1/cgi-bin/sheepfold-api",
            "https://name@192.168.4.1:5201/cgi-bin/sheepfold-api",
            "$lan?token=x", "$lan#fragment", "$lan/../luci", "$lan%0d%0aHeader:x",
            "https://192.168.004.1:5201/cgi-bin/sheepfold-api", "$lan,", "x".repeat(1025)
        )) assertNull(bad, HomeRouterEndpoints.parse(bad))
        assertNull(HomeRouterEndpoints.parse(List(5) { lan }.joinToString(",")))
    }

    @Test fun choosesAnAddressInTheCurrentSubnetWithoutScanning() {
        assertEquals(listOf(upstream, lan), HomeRouterEndpoints.order(lan, listOf(lan, upstream), listOf("192.168.2.45" to 24)))
        assertEquals(listOf(lan, upstream), HomeRouterEndpoints.order(upstream, listOf(lan, upstream), listOf("192.168.4.111" to 24)))
        assertEquals(listOf(lan, upstream), HomeRouterEndpoints.order(lan, listOf(upstream), emptyList()))
        assertEquals(listOf(lan, upstream), HomeRouterEndpoints.order(lan, listOf(upstream), listOf("192.168.2.45" to 0)))
    }

    @Test fun retriesOnlyReadsAndNeverAuthenticationOrTlsFailures() {
        for (error in listOf(ConnectException(), SocketTimeoutException())) {
            assertTrue(HomeRouterEndpoints.mayRetry("GET", error))
            for (method in listOf("POST", "PUT", "DELETE", "PATCH"))
                assertFalse(HomeRouterEndpoints.mayRetry(method, error))
        }
        assertFalse(HomeRouterEndpoints.mayRetry("GET", SSLHandshakeException("wrong pin")))
        assertFalse(HomeRouterEndpoints.mayRetry("GET", IllegalStateException("token rejected")))
        assertNull(RouterSessionFailure.fromHttp(403, "home_network_not_allowed"))
    }
}
