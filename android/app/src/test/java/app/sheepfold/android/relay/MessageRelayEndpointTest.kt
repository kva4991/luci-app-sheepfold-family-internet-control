package app.sheepfold.android.relay

/*
 * Назначение: не допускает подмену public system-CA endpoint IP literal, userinfo или лишними URL-компонентами.
 * Почему JVM/pure URI: проверка детерминирована и не выполняет DNS/сетевых запросов; внешнее состояние не меняется.
 * Green не доказывает hostname verification, system CA, DNS или доступность реального endpoint на Android. §testwhy
 */

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertThrows
import org.junit.Test

class MessageRelayEndpointTest {
    @Test
    fun `only canonical public https dns origin is accepted`() {
        assertEquals(
            "https://relay.invalid.example",
            MessageRelayEndpoint.requirePublicHttpsBaseUrl("https://Relay.Invalid.Example/").toString()
        )
        for (value in listOf(
            "http://relay.invalid.example",
            "https://192.0.2.10",
            "https://0192.000.002.010",
            "https://127.1",
            "https://[2001:db8::1]",
            "https://user@relay.invalid.example",
            "https://relay.invalid.example/api",
            "https://relay.invalid.example:8443",
            "https://relay.invalid.example?token=secret"
        )) {
            assertThrows(IllegalArgumentException::class.java) {
                MessageRelayEndpoint.requirePublicHttpsBaseUrl(value)
            }
        }
    }

    @Test
    fun `relay remains disabled for empty placeholder`() {
        assertFalse(MessageRelaySettings().permitsPublicNetwork())
        assertFalse(MessageRelaySettings(enabled = true, baseUrl = "").permitsPublicNetwork())
    }
}
