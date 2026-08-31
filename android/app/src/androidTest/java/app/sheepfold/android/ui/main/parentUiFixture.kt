package app.sheepfold.android.ui.main

/*
 * Общая пустая Activity для component-тестов; сами тесты не запускают MainActivity или worker
 * Клиент без TLS pin, токена и Context откажет до сети; реальные настройки не читаются
 * Тесты проверяют UI/callback, но не подтверждают успешную запись на роутер
 */
import androidx.activity.ComponentActivity
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusManager
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.platform.LocalSoftwareKeyboardController
import androidx.compose.ui.platform.SoftwareKeyboardController
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.onRoot
import androidx.compose.ui.test.captureToImage
import androidx.compose.ui.graphics.asAndroidBitmap
import android.graphics.Bitmap
import java.io.File
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat
import app.sheepfold.android.router.RouterAdminCapabilities
import app.sheepfold.android.router.RouterAdminClient
import app.sheepfold.android.router.RouterAdminConfig
import app.sheepfold.android.router.RouterConnectionRequest
import app.sheepfold.android.router.RouterDevice
import app.sheepfold.android.ui.theme.SheepfoldTheme
import app.sheepfold.android.ui.theme.ThemeMode
import org.junit.Rule

abstract class ParentUiFixture {
    @get:Rule val compose = createAndroidComposeRule<ComponentActivity>()
    protected val client = RouterAdminClient(RouterConnectionRequest("https://127.0.0.1:1", "Fixture"))
    protected val config = RouterAdminConfig(revision = "fixture", capabilities = RouterAdminCapabilities(
        groupWrite = true, scheduleWrite = true, deviceWrite = true, wifiControl = true, notificationWrite = true
    ))
    protected fun device(admin: Boolean = false) = RouterDevice(
        "17", "Fixture phone", "192.0.2.17", "02:00:00:00:00:17", "Family", "phone", false, "default", admin
    )
    protected fun text(id: Int, vararg args: Any) = compose.activity.getString(id, *args)
    protected fun label(id: Int) = compose.onNodeWithText(text(id))
    protected fun icon(id: Int) = compose.onNodeWithContentDescription(text(id))
    protected fun savePanelScreenshot(name: String) {
        val bitmap = compose.onRoot().captureToImage().asAndroidBitmap()
        File(compose.activity.cacheDir, name).outputStream().use {
            check(bitmap.compress(Bitmap.CompressFormat.PNG, 100, it))
        }
    }
    private lateinit var focus: FocusManager
    private var keyboard: SoftwareKeyboardController? = null
    protected fun hideKeyboard() {
        compose.runOnIdle { focus.clearFocus(force = true); keyboard?.hide() }
        compose.waitUntil(5_000) {
            ViewCompat.getRootWindowInsets(compose.activity.window.decorView)?.isVisible(WindowInsetsCompat.Type.ime()) != true
        }
    }
    protected fun show(content: @Composable () -> Unit) {
        compose.setContent {
            focus = LocalFocusManager.current
            keyboard = LocalSoftwareKeyboardController.current
            SheepfoldTheme(ThemeMode.LIGHT) { Box(Modifier.fillMaxSize()) { content() } }
        }
    }
}
