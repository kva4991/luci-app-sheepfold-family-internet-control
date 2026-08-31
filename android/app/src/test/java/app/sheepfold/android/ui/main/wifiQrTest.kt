package app.sheepfold.android.ui.main

/*
 * Проверяет текст Wi-Fi QR через независимый ZXing parser, включая спецсимволы
 * JVM не меняет Wi-Fi; растровый QR и Unicode проверяются отдельно на Android
 */
import com.google.zxing.BarcodeFormat
import com.google.zxing.Result
import com.google.zxing.client.result.WifiResultParser
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Test

class WifiQrTest {
    @Test fun specialCharactersRoundTrip() {
        val ssid = "Test;net,:\\\""
        val password = "secret;,:\\\""
        val payload = wifiQrPayload(ssid, password, "sae-mixed")
        val parsed = WifiResultParser().parse(Result(payload, null, null, BarcodeFormat.QR_CODE))
        assertEquals(ssid, parsed.ssid)
        assertEquals(password, parsed.password)
        assertEquals("WPA", parsed.networkEncryption)
    }
    @Test fun openNetworkOmitsSavedPassword() {
        val payload = wifiQrPayload("Test", "must-not-leak", "none")
        assertEquals("WIFI:T:nopass;S:Test;;", payload)
        assertFalse(payload.contains("must-not-leak"))
    }
    @Test fun wepAndWpaTypesAreExplicit() {
        assertEquals("WIFI:T:WEP;S:Test;P:12345;;", wifiQrPayload("Test", "12345", "wep"))
        for (mode in listOf("psk2", "sae", "sae-mixed", "psk-mixed")) {
            assertEquals("WIFI:T:WPA;S:Test;P:12345678;;", wifiQrPayload("Test", "12345678", mode))
        }
    }
}
