package app.sheepfold.android.ui.main

/*
 * Проверяет реальные TextLayoutResult меню: границы строк не разрывают слова,
 * подписи не обрезаны, а карточки сохраняют переход по ключу. Пустая Activity,
 * локальный масштаб и переводы не меняют настройки телефона, pairing или роутер.
 * Снимки содержат только меню; тест не проверяет содержимое открываемых панелей.
 * Запуск только при правке Android UI или полном прогоне. §testwhy §andlab1
 */
import android.content.res.Configuration
import androidx.activity.ComponentActivity
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.size
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.asAndroidBitmap
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.semantics.SemanticsActions
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.captureToImage
import androidx.compose.ui.test.hasScrollToIndexAction
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performScrollToIndex
import androidx.compose.ui.test.performSemanticsAction
import androidx.compose.ui.text.TextLayoutResult
import androidx.compose.ui.unit.Density
import androidx.compose.ui.unit.dp
import androidx.test.ext.junit.runners.AndroidJUnit4
import app.sheepfold.android.R
import app.sheepfold.android.ui.theme.SheepfoldTheme
import app.sheepfold.android.ui.theme.ThemeMode
import java.io.File
import java.util.Locale
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class MenuLayoutTest {
    @get:Rule
    val compose = createAndroidComposeRule<ComponentActivity>()

    private fun verifyMenu(width: Int, fontScale: Float, language: String = "ru", theme: ThemeMode = ThemeMode.LIGHT) {
        val config = Configuration(compose.activity.resources.configuration).apply {
            setLocale(Locale.forLanguageTag(language))
        }
        val strings = compose.activity.createConfigurationContext(config)
        val items = listOf(
            MainMenuItem("administrators", strings.getString(R.string.tab_administrators), R.drawable.ic_navigation_administrators),
            MainMenuItem("lists", strings.getString(R.string.tab_lists), R.drawable.ic_navigation_lists),
            MainMenuItem("feedback", strings.getString(R.string.tab_feedback), R.drawable.ic_navigation_feedback),
            MainMenuItem("notifications", strings.getString(R.string.tab_notifications), R.drawable.ic_navigation_notifications),
            MainMenuItem("schedules", strings.getString(R.string.tab_schedule), R.drawable.ic_navigation_schedules),
            MainMenuItem("info", strings.getString(R.string.tab_info), R.drawable.ic_navigation_information)
        )
        var opened: String? = null
        compose.setContent {
            SheepfoldTheme(theme) {
                // 600 dp помещаются и на физическом телефоне; системные настройки не трогаем.
                CompositionLocalProvider(LocalDensity provides Density(1f, fontScale)) {
                    Box(Modifier.size(width.dp, 380.dp).background(MaterialTheme.colorScheme.background)) {
                        MenuTab(items) { opened = it }
                    }
                }
            }
        }
        val grid = compose.onNode(hasScrollToIndexAction())
        saveMenuShot(grid.captureToImage().asAndroidBitmap(), language, width, fontScale, theme)
        items.forEachIndexed { index, item ->
            grid.performScrollToIndex(index)
            val title = compose.onNodeWithText(item.title, useUnmergedTree = true)
            title.assertIsDisplayed()
            val layouts = mutableListOf<TextLayoutResult>()
            title.performSemanticsAction(SemanticsActions.GetTextLayoutResult) { action -> action(layouts) }
            assertEquals(1, layouts.size)
            val layout = layouts.single()
            assertFalse("Clipped title height: ${item.title}", layout.didOverflowHeight)
            // Semantics может вернуть параграф по maxWidth, хотя Text уже сжат по содержимому.
            // Поэтому проверяем ширину самих строк, а не ложный didOverflowWidth параграфа.
            for (line in 0 until layout.lineCount) {
                val lineWidth = layout.getLineRight(line) - layout.getLineLeft(line)
                assertTrue("Clipped line in ${item.title}: $lineWidth > ${layout.size.width}", lineWidth <= layout.size.width + 1f)
                assertFalse("Ellipsized title: ${item.title}", layout.isLineEllipsized(line))
            }
            for (line in 0 until layout.lineCount - 1) {
                val end = layout.getLineEnd(line, visibleEnd = true)
                val splitsWord = end in 1 until item.title.length &&
                    item.title[end - 1].isLetterOrDigit() && item.title[end].isLetterOrDigit()
                assertFalse("Word split in ${item.title} at $end ($width dp, scale $fontScale)", splitsWord)
            }
            compose.onNodeWithText(item.title).performClick()
            assertEquals(item.key, opened)
        }
        grid.performScrollToIndex(0)
        if (width == 600 && fontScale == 1f) {
            val first = compose.onNodeWithText(items[0].title).fetchSemanticsNode().boundsInRoot
            val second = compose.onNodeWithText(items[1].title).fetchSemanticsNode().boundsInRoot
            assertTrue("Wide menu must retain multiple columns", second.left > first.left)
        }
        saveMenuShot(grid.captureToImage().asAndroidBitmap(), language, width, fontScale, theme)
    }

    private fun saveMenuShot(bitmap: android.graphics.Bitmap, language: String, width: Int, fontScale: Float, theme: ThemeMode) {
        File(compose.activity.cacheDir, "menu-$language-$width-$fontScale-${theme.name}.png").outputStream().use {
            bitmap.compress(android.graphics.Bitmap.CompressFormat.PNG, 100, it)
        }
    }

    @Test fun narrowPhone() = verifyMenu(320, 1f)
    @Test fun narrowLargeText() = verifyMenu(320, 2f)
    @Test fun phoneLargeText() = verifyMenu(360, 1.3f)
    @Test fun wideMenu() = verifyMenu(600, 1f)
    @Test fun englishLargeText() = verifyMenu(320, 2f, "en")
    @Test fun darkLargeText() = verifyMenu(320, 2f, theme = ThemeMode.DARK)
}
