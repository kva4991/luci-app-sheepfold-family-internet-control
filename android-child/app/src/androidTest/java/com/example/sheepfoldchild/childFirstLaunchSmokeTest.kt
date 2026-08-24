package com.example.sheepfoldchild

import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

/**
 * Проверяет на Android runtime, что чистая установка детского APK открывает автопоиск Sheepfold,
 * а не административный экран или обязательный ручной ввод адреса
 *
 * Harness удаляет тестовый APK до установки, поэтому тест меняет только данные выделенного эмулятора или
 * явно подтверждённого тестового телефона. Успех не доказывает обнаружение реального роутера и Wi-Fi
 */
@RunWith(AndroidJUnit4::class)
class ChildFirstLaunchSmokeTest {
    @get:Rule
    val composeRule = createAndroidComposeRule<MainActivity>()

    @Test
    fun cleanInstallStartsAutomaticDiscovery() {
        val context = InstrumentationRegistry.getInstrumentation().targetContext

        composeRule
            .onNodeWithText(context.getString(R.string.setup_server_search))
            .assertIsDisplayed()
        composeRule
            .onNodeWithText(context.getString(R.string.setup_searching_hint))
            .assertIsDisplayed()
    }
}
