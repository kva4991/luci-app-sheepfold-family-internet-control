package app.sheepfold.android.ui.main

/*
 * Декодирует фактически нарисованный Wi-Fi QR независимым ZXing reader и проверяет черновик
 * Только синтетический SSID/пароль, без обращения к сети, сохранения или смены Wi-Fi
 * Не доказывает подключение другого телефона к AP, камеру QR или WPA совместимость
 */
import androidx.compose.ui.graphics.asAndroidBitmap
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.assertTextContains
import androidx.compose.ui.test.captureToImage
import androidx.compose.ui.test.hasContentDescription
import androidx.compose.ui.test.hasScrollToNodeAction
import androidx.compose.ui.test.hasText
import androidx.compose.ui.test.isToggleable
import androidx.compose.ui.test.hasAnyAncestor
import androidx.compose.ui.test.isDialog
import androidx.compose.ui.test.isEnabled
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performScrollToNode
import androidx.compose.ui.test.performTextReplacement
import androidx.test.ext.junit.runners.AndroidJUnit4
import app.sheepfold.android.R
import app.sheepfold.android.router.RouterWifiNetwork
import com.google.zxing.BinaryBitmap
import com.google.zxing.MultiFormatReader
import com.google.zxing.RGBLuminanceSource
import com.google.zxing.common.HybridBinarizer
import org.junit.Assert.assertEquals
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class ParentWifiTest : ParentUiFixture() {
    private val network = RouterWifiNetwork("w1", "radio0", "Fixture;net", "secret:12345", "psk2", "auto", true, "2.4 GHz")
    private fun showWifi(wifi: RouterWifiNetwork = network) {
        show { WifiTab(client, config.copy(wifiEnabled = true, wifiNetworks = listOf(wifi)), emptyList(), false, {}, {}) }
    }
    private fun readQr(ssid: String): String {
        val description = text(R.string.wifi_qr_description, ssid)
        compose.onNode(hasScrollToNodeAction()).performScrollToNode(hasContentDescription(description))
        val bitmap = compose.onNodeWithContentDescription(description).assertIsDisplayed().captureToImage().asAndroidBitmap()
        val pixels = IntArray(bitmap.width * bitmap.height)
        bitmap.getPixels(pixels, 0, bitmap.width, 0, 0, bitmap.width, bitmap.height)
        return MultiFormatReader().decode(BinaryBitmap(HybridBinarizer(RGBLuminanceSource(bitmap.width, bitmap.height, pixels)))).text
    }
    @Test fun qrContainsConfirmedValuesNotDraft() {
        showWifi()
        val expected = wifiQrPayload(network.ssid, network.password, network.encryption)
        assertEquals(expected, readQr(network.ssid))
        val list = compose.onNode(hasScrollToNodeAction())
        list.performScrollToNode(hasText(text(R.string.wifi_ssid)))
        label(R.string.wifi_ssid).performTextReplacement("Unsaved network")
        list.performScrollToNode(hasText(text(R.string.wifi_password)))
        label(R.string.wifi_password).performTextReplacement("Unsaved secret")
        hideKeyboard()
        assertEquals(expected, readQr(network.ssid))
    }
    @Test fun unicodeNetworkSurvivesRenderedQr() {
        val wifi = network.copy(ssid = "Тестовая сеть;家", password = "Тестовый:密码123")
        showWifi(wifi)
        assertEquals(wifiQrPayload(wifi.ssid, wifi.password, wifi.encryption), readQr(wifi.ssid))
    }
    @Test fun globalWifiToggleNeedsConfirmationAndCancelDoesNothing() {
        showWifi()
        compose.onAllNodes(isToggleable())[0].performClick()
        label(R.string.wifi_disable_message).assertIsDisplayed()
        label(R.string.action_cancel).performClick()
        label(R.string.wifi_disable_message).assertDoesNotExist()
        assertEquals(wifiQrPayload(network.ssid, network.password, network.encryption), readQr(network.ssid))
    }

    @Test fun savingWifiRequiresDisconnectWarningAndCancelKeepsDraft() {
        showWifi()
        val list = compose.onNode(hasScrollToNodeAction())
        list.performScrollToNode(hasText(text(R.string.wifi_ssid)))
        label(R.string.wifi_ssid).performTextReplacement("Draft network")
        hideKeyboard()
        val saveNetwork = hasText(text(R.string.settings_save)) and isEnabled()
        list.performScrollToNode(saveNetwork)
        compose.onNode(saveNetwork).performClick()
        label(R.string.wifi_save_confirm_title).assertIsDisplayed()
        compose.onNodeWithText(text(R.string.wifi_save_confirm_message, "Draft network")).assertIsDisplayed()
        compose.onNode(hasText(text(R.string.action_cancel)) and hasAnyAncestor(isDialog())).performClick()
        list.performScrollToNode(hasText(text(R.string.wifi_ssid)))
        label(R.string.wifi_ssid).assertTextContains("Draft network")
    }
}
