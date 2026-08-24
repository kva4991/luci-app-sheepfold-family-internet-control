package app.sheepfold.android

import android.util.Base64
import androidx.test.ext.junit.runners.AndroidJUnit4
import app.sheepfold.android.router.SupportReportConfig
import app.sheepfold.android.support.PreparedSupportReport
import app.sheepfold.android.support.SUPPORT_REPORT_CRYPTO_SUITE
import app.sheepfold.android.support.SupportReportCrypto
import com.google.crypto.tink.HybridDecrypt
import com.google.crypto.tink.KeysetHandle
import com.google.crypto.tink.RegistryConfiguration
import com.google.crypto.tink.TinkJsonProtoKeysetFormat
import com.google.crypto.tink.hybrid.HpkeParameters
import com.google.crypto.tink.hybrid.HybridConfig
import org.junit.Assert.assertArrayEquals
import org.junit.Test
import org.junit.runner.RunWith

/**
 * Проверяет реальную Android/Tink совместимость HPKE-параметров баг-репорта
 *
 * Вход: временная пара ключей и синтетический plaintext без пользовательских данных
 * Выход: ciphertext расшифровывается только приватным ключом при том же context info
 * Ограничение: тест не проверяет HTTPS, подпись роутера и центральный сервер
 */
@RunWith(AndroidJUnit4::class)
class SupportReportCryptoTest {
    @Test
    fun hpkeCiphertextDecryptsWithOperatorPrivateKey() {
        HybridConfig.register()
        val parameters = HpkeParameters.builder()
            .setKemId(HpkeParameters.KemId.DHKEM_X25519_HKDF_SHA256)
            .setKdfId(HpkeParameters.KdfId.HKDF_SHA256)
            .setAeadId(HpkeParameters.AeadId.CHACHA20_POLY1305)
            .setVariant(HpkeParameters.Variant.NO_PREFIX)
            .build()
        val privateKeyset = KeysetHandle.generateNew(parameters)
        val publicKeysetJson = TinkJsonProtoKeysetFormat.serializeKeysetWithoutSecret(
            privateKeyset.publicKeysetHandle
        )
        val encodedPublicKeyset = Base64.encodeToString(
            publicKeysetJson.toByteArray(Charsets.UTF_8),
            Base64.URL_SAFE or Base64.NO_WRAP or Base64.NO_PADDING
        )
        val report = PreparedSupportReport(
            reportId = "EREREREREREREREREREREQ",
            payloadJson = "{\"schemaVersion\":1,\"reportId\":\"EREREREREREREREREREREQ\"}"
        )
        val config = SupportReportConfig(
            recipientKeyId = "operator-test-v1",
            recipientPublicKeyset = encodedPublicKeyset,
            cryptoSuite = SUPPORT_REPORT_CRYPTO_SUITE,
            maxCiphertextBytes = 48_000
        )

        val encrypted = SupportReportCrypto.encrypt(report, config)
        val ciphertext = Base64.decode(encrypted.ciphertext, Base64.URL_SAFE or Base64.NO_WRAP)
        val decryptor = privateKeyset.getPrimitive(
            RegistryConfiguration.get(),
            HybridDecrypt::class.java
        )
        val plaintext = decryptor.decrypt(
            ciphertext,
            SupportReportCrypto.contextInfo(report.reportId, config.recipientKeyId)
        )

        assertArrayEquals(report.payloadJson.toByteArray(Charsets.UTF_8), plaintext)
    }
}
