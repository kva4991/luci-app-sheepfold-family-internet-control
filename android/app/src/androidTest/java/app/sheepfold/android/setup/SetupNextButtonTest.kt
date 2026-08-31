package app.sheepfold.android.setup

/*
 * Проверяет пиксели стрелки в обеих темах и принадлежность кнопки прокручиваемой странице
 * Пустая Activity и synthetic connector не сопрягают телефон и не очищают пользовательские данные
 * Запуск только по задаче UI или в полном Android-прогоне. §testwhy §uicontrast §iconcat1
 */
import androidx.activity.ComponentActivity
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.size
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.asAndroidBitmap
import androidx.compose.ui.graphics.luminance
import androidx.compose.ui.graphics.toPixelMap
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.assertIsEnabled
import androidx.compose.ui.test.assertIsNotDisplayed
import androidx.compose.ui.test.assertIsNotEnabled
import androidx.compose.ui.test.captureToImage
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performScrollTo
import androidx.compose.ui.unit.Density
import androidx.compose.ui.unit.dp
import androidx.test.ext.junit.runners.AndroidJUnit4
import app.sheepfold.android.R
import app.sheepfold.android.ui.setup.RoundNextButton
import app.sheepfold.android.ui.setup.RouterSetupViewModel
import app.sheepfold.android.ui.setup.SafeRouterSetupScreen
import app.sheepfold.android.ui.theme.SheepfoldTheme
import app.sheepfold.android.ui.theme.ThemeMode
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import java.io.File

@RunWith(AndroidJUnit4::class)
class SetupNextButtonTest {
    @get:Rule
    val compose = createAndroidComposeRule<ComponentActivity>()

    private fun verifyButton(theme: ThemeMode, enabled: Boolean, fontScale: Float = 1f) {
        var clicks = 0
        compose.setContent {
            SheepfoldTheme(theme) {
                CompositionLocalProvider(LocalDensity provides Density(LocalDensity.current.density, fontScale)) {
                    RoundNextButton(enabled, { clicks++ })
                }
            }
        }
        val next = compose.onNodeWithText(compose.activity.getString(R.string.setup_next))
        next.assertIsDisplayed()
        if (enabled) next.assertIsEnabled() else next.assertIsNotEnabled()
        val image = next.captureToImage()
        val pixels = image.toPixelMap()
        val arrow = pixels[(pixels.width * 0.55f).toInt(), (pixels.height * 0.4f).toInt()].luminance()
        val background = pixels[(pixels.width * 0.12f).toInt(), (pixels.height * 0.5f).toInt()].luminance()
        val contrast = (maxOf(arrow, background) + 0.05f) / (minOf(arrow, background) + 0.05f)
        assertTrue("Rendered arrow contrast $contrast", contrast >= 4.5f)
        assertEquals(pixels.width, pixels.height)
        // Снимки не содержат пользовательских данных и остаются в каталоге тестового приложения
        File(compose.activity.getExternalFilesDir(null), "next-${theme.name}-$enabled-$fontScale.png").outputStream().use {
            image.asAndroidBitmap().compress(android.graphics.Bitmap.CompressFormat.PNG, 100, it)
        }
        next.performClick()
        assertEquals(if (enabled) 1 else 0, clicks)
    }

    @Test fun lightActive() = verifyButton(ThemeMode.LIGHT, true)
    @Test fun lightDisabled() = verifyButton(ThemeMode.LIGHT, false)
    @Test fun darkActive() = verifyButton(ThemeMode.DARK, true)
    @Test fun darkDisabled() = verifyButton(ThemeMode.DARK, false)
    @Test fun largeText() = verifyButton(ThemeMode.LIGHT, true, 2f)

    @Test
    fun nextScrollsWithAgreementContent() {
        val model = RouterSetupViewModel { error("Unexpected network call") }
        compose.setContent {
            SheepfoldTheme(ThemeMode.LIGHT) {
                Box(Modifier.size(320.dp, 320.dp).background(MaterialTheme.colorScheme.background)) {
                    SafeRouterSetupScreen(model) { error("Unexpected pairing") }
                }
            }
        }
        val next = compose.onNodeWithText(compose.activity.getString(R.string.setup_next))
        next.assertIsNotDisplayed()
        next.performScrollTo().assertIsDisplayed().assertIsNotEnabled()
        compose.onNodeWithText("Sheepfold", useUnmergedTree = true).performScrollTo()
        next.assertIsNotDisplayed()
    }
}
