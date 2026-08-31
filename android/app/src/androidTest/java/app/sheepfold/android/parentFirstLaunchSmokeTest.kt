package app.sheepfold.android

import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.assertIsNotEnabled
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performScrollTo
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

/**
 * Проверяет на Android runtime, что чистая установка родительского APK начинает с обязательного соглашения
 * и не разрешает перейти дальше без согласия и разрешений
 *
 * Harness удаляет тестовый APK до установки, поэтому тест меняет только данные выделенного эмулятора или
 * явно подтверждённого тестового телефона. Успех не доказывает работу камеры, QR, сети или живого роутера
 */
@RunWith(AndroidJUnit4::class)
class ParentFirstLaunchSmokeTest {
    @get:Rule
    val composeRule = createAndroidComposeRule<MainActivity>()

    @Test
    fun cleanInstallRequiresAgreement() {
        val context = InstrumentationRegistry.getInstrumentation().targetContext

        composeRule
            .onNodeWithText(context.getString(R.string.setup_agreement_link), substring = true)
            .assertIsDisplayed()
        composeRule
            .onNodeWithText(context.getString(R.string.setup_next))
            .performScrollTo()
            .assertIsDisplayed()
            .assertIsNotEnabled()
    }
}
