package app.sheepfold.android.setup

/*
 * Проверяет пересоздание Activity во время одноразового сопряжения и восстановление шага Compose
 * Использует пустую ComponentActivity и synthetic connector, без API, камеры, UCI и рабочего store
 * Реальный телефон нужен для Android lifecycle; успех не доказывает process-death recovery или сеть. §testwhy §pairtx1
 */
import androidx.activity.ComponentActivity
import androidx.compose.ui.test.junit4.StateRestorationTester
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import app.sheepfold.android.R
import app.sheepfold.android.router.RouterConnectionRequest
import app.sheepfold.android.ui.setup.RouterSetupViewModel
import app.sheepfold.android.ui.setup.SafeRouterSetupScreen
import kotlinx.coroutines.CompletableDeferred
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertSame
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicInteger

@RunWith(AndroidJUnit4::class)
class RouterSetupLifecycleTest {
    @get:Rule
    val compose = createAndroidComposeRule<ComponentActivity>()

    private fun request() = RouterConnectionRequest("https://192.0.2.1:5201/cgi-bin/sheepfold-api", "Synthetic")

    private fun factory(connect: suspend (RouterConnectionRequest) -> RouterConnectionRequest) =
        object : ViewModelProvider.Factory {
            @Suppress("UNCHECKED_CAST")
            override fun <T : ViewModel> create(modelClass: Class<T>): T {
                check(modelClass == RouterSetupViewModel::class.java)
                return RouterSetupViewModel(connect) as T
            }
        }

    @Test
    fun recreationDuringPairingKeepsOneAttempt() {
        val calls = AtomicInteger()
        val started = CountDownLatch(1)
        val reply = CompletableDeferred<RouterConnectionRequest>()
        val factory = factory {
            calls.incrementAndGet()
            started.countDown()
            reply.await()
        }
        lateinit var before: RouterSetupViewModel
        compose.activityRule.scenario.onActivity { activity ->
            before = ViewModelProvider(activity, factory)[RouterSetupViewModel::class.java]
            before.connect(request())
        }
        assertTrue(started.await(5, TimeUnit.SECONDS))
        compose.activityRule.scenario.recreate()
        compose.activityRule.scenario.onActivity { activity ->
            val after = ViewModelProvider(activity, factory)[RouterSetupViewModel::class.java]
            assertSame(before, after)
            assertTrue(after.busy)
            after.connect(request())
        }
        val expected = request()
        reply.complete(expected)
        compose.waitUntil(5_000) { before.connected != null }
        assertSame(expected, before.connected)
        assertFalse(before.failed)
        assertEquals(1, calls.get())
    }

    @Test
    fun recreationKeepsVerifiedResultUntilCompletion() {
        val expected = request()
        val factory = factory { expected }
        lateinit var before: RouterSetupViewModel
        compose.activityRule.scenario.onActivity { activity ->
            before = ViewModelProvider(activity, factory)[RouterSetupViewModel::class.java]
            before.connect(request())
        }
        compose.waitUntil(5_000) { before.connected != null }
        compose.activityRule.scenario.recreate()
        compose.activityRule.scenario.onActivity { activity ->
            val after = ViewModelProvider(activity, factory)[RouterSetupViewModel::class.java]
            assertSame(expected, after.connected)
            after.discardResult()
            assertEquals(null, after.connected)
        }
    }

    @Test
    fun leavingActivityCancelsWithoutReportingRouterFailure() {
        val cancelled = CountDownLatch(1)
        val started = CountDownLatch(1)
        val factory = factory {
            started.countDown()
            try { CompletableDeferred<RouterConnectionRequest>().await() }
            finally { cancelled.countDown() }
        }
        lateinit var model: RouterSetupViewModel
        compose.activityRule.scenario.onActivity { activity ->
            model = ViewModelProvider(activity, factory)[RouterSetupViewModel::class.java]
            model.connect(request())
        }
        assertTrue(started.await(5, TimeUnit.SECONDS))
        compose.activityRule.scenario.close()
        assertTrue(cancelled.await(5, TimeUnit.SECONDS))
        assertFalse(model.failed)
    }

    @Test
    fun setupStepSurvivesStateRestoration() {
        val model = RouterSetupViewModel { error("Unexpected network call") }
        val manual = compose.activity.getString(R.string.setup_manual)
        val address = compose.activity.getString(R.string.setup_router_address)
        val restoration = StateRestorationTester(compose)
        restoration.setContent { SafeRouterSetupScreen(model, pairingOnly = true) { error("Unexpected pairing") } }
        compose.onNodeWithText(manual).performClick()
        compose.onNodeWithText(address).assertIsDisplayed()
        restoration.emulateSavedInstanceStateRestore()
        compose.onNodeWithText(address).assertIsDisplayed()
    }
}
