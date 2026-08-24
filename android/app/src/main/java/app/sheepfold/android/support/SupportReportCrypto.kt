package app.sheepfold.android.support

import android.util.Base64
import app.sheepfold.android.router.SupportReportConfig
import com.google.crypto.tink.HybridEncrypt
import com.google.crypto.tink.RegistryConfiguration
import com.google.crypto.tink.TinkJsonProtoKeysetFormat
import com.google.crypto.tink.hybrid.HybridConfig
import org.json.JSONObject
import java.nio.charset.StandardCharsets

const val SUPPORT_REPORT_CRYPTO_SUITE = "HPKE-X25519-HKDF-SHA256-CHACHA20POLY1305"

data class EncryptedSupportReport(
    val reportId: String,
    val recipientKeyId: String,
    val ciphertext: String
)

/** HPKE выполняется на телефоне: домашний и центральный роутеры видят только ciphertext. */
object SupportReportCrypto {
    fun encrypt(report: PreparedSupportReport, config: SupportReportConfig): EncryptedSupportReport {
        validateConfig(config)
        val keysetBytes = decodeCanonicalBase64Url(config.recipientPublicKeyset)
        val keysetJson = keysetBytes.toString(StandardCharsets.UTF_8)
        requirePublicHpkeKeyset(keysetJson)

        HybridConfig.register()
        val keyset = TinkJsonProtoKeysetFormat.parseKeysetWithoutSecret(keysetJson)
        val encryptor = keyset.getPrimitive(RegistryConfiguration.get(), HybridEncrypt::class.java)
        val ciphertextBytes = encryptor.encrypt(
            report.payloadJson.toByteArray(StandardCharsets.UTF_8),
            contextInfo(report.reportId, config.recipientKeyId)
        )
        require(ciphertextBytes.size in 32..config.maxCiphertextBytes) {
            "Зашифрованный отчёт превышает допустимый размер."
        }
        return EncryptedSupportReport(
            reportId = report.reportId,
            recipientKeyId = config.recipientKeyId,
            ciphertext = Base64.encodeToString(
                ciphertextBytes,
                Base64.URL_SAFE or Base64.NO_WRAP or Base64.NO_PADDING
            )
        )
    }

    fun contextInfo(reportId: String, recipientKeyId: String): ByteArray = (
        "sheepfold-support-report-payload-v1\n" +
            "reportId=$reportId\n" +
            "recipientKeyId=$recipientKeyId\n"
        ).toByteArray(StandardCharsets.UTF_8)

    private fun validateConfig(config: SupportReportConfig) {
        require(config.cryptoSuite == SUPPORT_REPORT_CRYPTO_SUITE) {
            "Роутер предложил неподдерживаемый способ шифрования."
        }
        require(config.recipientKeyId.matches(Regex("[a-z0-9][a-z0-9._-]{0,63}"))) {
            "Роутер вернул некорректный идентификатор ключа."
        }
        require(config.maxCiphertextBytes in 32..1_048_576) {
            "Роутер вернул некорректный лимит отчёта."
        }
    }

    private fun decodeCanonicalBase64Url(value: String): ByteArray {
        require(value.isNotEmpty() && value.matches(Regex("[A-Za-z0-9_-]+"))) {
            "Публичный ключ отчётов имеет некорректный формат."
        }
        val decoded = runCatching { Base64.decode(value, Base64.URL_SAFE or Base64.NO_WRAP) }
            .getOrElse { throw IllegalArgumentException("Публичный ключ отчётов повреждён.", it) }
        val canonical = Base64.encodeToString(
            decoded,
            Base64.URL_SAFE or Base64.NO_WRAP or Base64.NO_PADDING
        )
        require(canonical == value) { "Публичный ключ отчётов записан неканонично." }
        return decoded
    }

    private fun requirePublicHpkeKeyset(keysetJson: String) {
        val keys = JSONObject(keysetJson).optJSONArray("key")
            ?: throw IllegalArgumentException("В наборе ключей нет публичного ключа.")
        require(keys.length() in 1..4) { "Набор ключей имеет неожиданный размер." }
        for (index in 0 until keys.length()) {
            val keyData = keys.getJSONObject(index).getJSONObject("keyData")
            require(keyData.optString("keyMaterialType") == "ASYMMETRIC_PUBLIC") {
                "Приложение принимает только публичный ключ отчётов."
            }
            require(keyData.optString("typeUrl") == "type.googleapis.com/google.crypto.tink.HpkePublicKey") {
                "Роутер вернул ключ неподдерживаемого типа."
            }
        }
    }
}
