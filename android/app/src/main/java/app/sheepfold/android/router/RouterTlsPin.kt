package app.sheepfold.android.router

import android.content.Context
import app.sheepfold.android.diagnostics.DiagnosticLog
import java.security.MessageDigest
import java.security.cert.CertificateException
import java.security.cert.X509Certificate
import javax.net.ssl.HostnameVerifier
import javax.net.ssl.HttpsURLConnection
import javax.net.ssl.SSLContext
import javax.net.ssl.TrustManager
import javax.net.ssl.X509TrustManager

/** Проверяет старый pin сертификата или предпочтительный SPKI pin из QR v2. §tlspinv2 */
object RouterTlsPin {
    private const val PREFS = "sheepfold-app"
    private const val KEY = "routerTlsPinSha256"

    class CapturedPin(var value: String? = null)

    fun read(context: Context?): String? =
        context?.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            ?.getString(KEY, "")
            ?.trim()
            ?.lowercase()
            ?.takeIf { it.isNotBlank() }

    fun save(context: Context, pin: String) {
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            .edit()
            .putString(KEY, pin.trim().lowercase())
            .apply()
    }

    fun clear(context: Context) {
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            .edit()
            .remove(KEY)
            .apply()
    }

    private fun sha256Hex(bytes: ByteArray): String {
        val digest = MessageDigest.getInstance("SHA-256")
        return digest.digest(bytes)
            .joinToString("") { byte -> "%02x".format(byte) }
    }

    fun certificateSha256(certificate: X509Certificate): String = sha256Hex(certificate.encoded)

    fun spkiSha256(certificate: X509Certificate): String = sha256Hex(certificate.publicKey.encoded)

    /** Оставлено для совместимости с сохранёнными отпечатками старых версий. */
    fun sha256Hex(certificate: X509Certificate): String = certificateSha256(certificate)

    fun configure(
        connection: HttpsURLConnection,
        expectedPin: String?,
        allowTrustOnFirstUse: Boolean,
        expectedSpki: String? = null
    ): CapturedPin? {
        val normalizedExpected = expectedPin?.trim()?.lowercase()?.takeIf { it.isNotBlank() }
        val normalizedSpki = expectedSpki?.trim()?.lowercase()?.takeIf { it.isNotBlank() }
        // Handshake происходит после configure(), поэтому возвращаем изменяемый holder заранее.
        val captured = if (normalizedExpected == null && normalizedSpki == null && allowTrustOnFirstUse) CapturedPin() else null
        val trustManager = object : X509TrustManager {
            override fun checkClientTrusted(chain: Array<out X509Certificate>?, authType: String?) {}

            override fun getAcceptedIssuers(): Array<X509Certificate> = emptyArray()

            override fun checkServerTrusted(chain: Array<out X509Certificate>, authType: String) {
                val leaf = chain.firstOrNull()
                    ?: throw CertificateException("Пустая цепочка сертификата роутера")
                val certificatePin = certificateSha256(leaf)
                val spkiPin = spkiSha256(leaf)
                when {
                    // SPKI имеет приоритет: перевыпуск сертификата с тем же ключом
                    // не должен разрывать уже защищённое подключение.
                    normalizedSpki != null && spkiPin != normalizedSpki -> {
                        DiagnosticLog.warn("tls.pin.rejected", "mode" to "spki")
                        throw CertificateException("Публичный ключ роутера не совпадает с отпечатком из QR-кода")
                    }
                    normalizedSpki != null -> DiagnosticLog.info("tls.pin.accepted", "mode" to "spki")
                    normalizedExpected != null && certificatePin != normalizedExpected -> {
                        DiagnosticLog.warn("tls.pin.rejected", "mode" to "certificate")
                        throw CertificateException("Сертификат роутера не совпадает с сохранённым отпечатком")
                    }
                    normalizedExpected != null -> DiagnosticLog.info("tls.pin.accepted", "mode" to "certificate")
                    !allowTrustOnFirstUse -> {
                        DiagnosticLog.warn("tls.pin.rejected", "mode" to "missing")
                        throw CertificateException("Для HTTPS нужен сохранённый отпечаток сертификата роутера")
                    }
                    else -> {
                        captured?.value = certificatePin
                        DiagnosticLog.info("tls.pin.accepted", "mode" to "tofu")
                    }
                }
            }
        }
        val sslContext = SSLContext.getInstance("TLS")
        sslContext.init(null, arrayOf<TrustManager>(trustManager), null)
        connection.sslSocketFactory = sslContext.socketFactory
        connection.hostnameVerifier = HostnameVerifier { _, _ -> true }
        return captured
    }
}
