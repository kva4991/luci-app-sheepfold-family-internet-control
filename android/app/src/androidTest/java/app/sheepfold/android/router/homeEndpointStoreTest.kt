package app.sheepfold.android.router

import android.content.Context
import android.content.ContextWrapper
import android.content.SharedPreferences
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import org.junit.After
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith
import java.util.UUID

/** Проверяет настоящие Preferences/Keystore, но изолирует все preference names от привязки владельца. */
@RunWith(AndroidJUnit4::class)
class HomeEndpointStoreTest {
    private val base = InstrumentationRegistry.getInstrumentation().targetContext
    private val prefix = "home-endpoint-test-${UUID.randomUUID()}-"
    private val files = mutableSetOf<String>()
    private val context = object : ContextWrapper(base) {
        override fun getSharedPreferences(name: String, mode: Int): SharedPreferences {
            val isolated = prefix + name
            files += isolated
            return base.getSharedPreferences(isolated, mode)
        }
    }
    private val lan = "https://192.168.4.1:5201/cgi-bin/sheepfold-api"
    private val upstream = "https://192.168.2.179:5201/cgi-bin/sheepfold-api"

    private fun connection(token: String) = RouterConnectionRequest(lan, "Synthetic router", administratorLogin = "testParent").also {
        it.bearerToken = token
        it.deviceId = "test-device"
        it.deviceMac = "02:00:00:00:00:11"
        it.tlsSpkiSha256 = "a".repeat(64)
    }

    @After fun removeOnlyTestPreferences() {
        files.forEach { base.deleteSharedPreferences(it) }
    }

    @Test fun storesOnlyValidCandidatesForTheCurrentSession() {
        val request = connection("synthetic-session-one")
        SheepfoldConnectionStore.save(context, request)
        SheepfoldConnectionStore.rememberHomeEndpoints(context, request, "$lan,$upstream")
        assertEquals(listOf(lan, upstream), SheepfoldConnectionStore.homeEndpoints(context, request))
        SheepfoldConnectionStore.rememberHomeEndpoints(context, request, "https://example.org:443/cgi-bin/sheepfold-api")
        assertEquals(listOf(lan, upstream), SheepfoldConnectionStore.homeEndpoints(context, request))
        SheepfoldConnectionStore.updateApiUrl(context, upstream, request)
        val stored = SheepfoldConnectionStore.read(context)!!
        assertEquals(upstream, stored.apiUrl)
        assertEquals(request.bearerToken, stored.bearerToken)
        assertEquals(request.tlsSpkiSha256, stored.tlsSpkiSha256)
    }

    @Test fun staleResponseCannotRestoreAddressesAfterRebindingOrLogout() {
        val old = connection("synthetic-session-old")
        SheepfoldConnectionStore.save(context, old)
        SheepfoldConnectionStore.rememberHomeEndpoints(context, old, "$lan,$upstream")
        val fresh = connection("synthetic-session-fresh")
        SheepfoldConnectionStore.save(context, fresh)
        SheepfoldConnectionStore.rememberHomeEndpoints(context, old, upstream)
        SheepfoldConnectionStore.updateApiUrl(context, upstream, old)
        assertEquals(emptyList<String>(), SheepfoldConnectionStore.homeEndpoints(context, fresh))
        assertEquals(lan, SheepfoldConnectionStore.read(context)!!.apiUrl)
        SheepfoldConnectionStore.clearForPairing(context, RouterPairingLoss.ACCESS_REVOKED)
        SheepfoldConnectionStore.rememberHomeEndpoints(context, fresh, upstream)
        SheepfoldConnectionStore.updateApiUrl(context, upstream, fresh)
        assertNull(SheepfoldConnectionStore.read(context))
        assertEquals(emptyList<String>(), SheepfoldConnectionStore.homeEndpoints(context, fresh))
    }

    @Test fun staleAuthorizationFailureDoesNotRemoveFreshPairing() {
        val old = connection("synthetic-session-old")
        SheepfoldConnectionStore.save(context, old)
        val fresh = connection("synthetic-session-fresh")
        SheepfoldConnectionStore.save(context, fresh)
        val failure = RouterSessionFailure.fromHttp(401, "token_invalid")!!
        RouterSessionEvents.report(context, failure, old)
        assertEquals(fresh.bearerToken, SheepfoldConnectionStore.read(context)!!.bearerToken)
        assertNull(SheepfoldConnectionStore.consumePairingLoss(context))
        RouterSessionEvents.report(context, failure, fresh)
        assertNull(SheepfoldConnectionStore.read(context))
        assertEquals(RouterPairingLoss.TOKEN_REJECTED, SheepfoldConnectionStore.consumePairingLoss(context))
    }
}
