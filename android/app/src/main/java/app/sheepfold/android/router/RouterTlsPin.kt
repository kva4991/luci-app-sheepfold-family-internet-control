package app.sheepfold.android.router

import android.content.Context
import java.security.MessageDigest
import java.security.cert.CertificateException
import java.security.cert.X509Certificate
import javax.net.ssl.HostnameVerifier
import javax.net.ssl.HttpsURLConnection
import javax.net.ssl.SSLContext
import javax.net.ssl.TrustManager
import javax.net.ssl.X509TrustManager

/** SHA-256 pin локального TLS-сертификата роутера (TOFU при сопряжении, затем строгая проверка). */
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

    fun sha256Hex(certificate: X509Certificate): String {
        val digest = MessageDigest.getInstance("SHA-256")
        return digest.digest(certificate.encoded)
            .joinToString("") { byte -> "%02x".format(byte) }
    }

    fun configure(
        connection: HttpsURLConnection,
        expectedPin: String?,
        allowTrustOnFirstUse: Boolean
    ): CapturedPin? {
        val normalizedExpected = expectedPin?.trim()?.lowercase()?.takeIf { it.isNotBlank() }
        // Handshake происходит после configure(), поэтому возвращаем изменяемый holder заранее.
        val captured = if (normalizedExpected == null && allowTrustOnFirstUse) CapturedPin() else null
        val trustManager = object : X509TrustManager {
            override fun checkClientTrusted(chain: Array<out X509Certificate>?, authType: String?) {}

            override fun getAcceptedIssuers(): Array<X509Certificate> = emptyArray()

            override fun checkServerTrusted(chain: Array<out X509Certificate>, authType: String) {
                val leaf = chain.firstOrNull()
                    ?: throw CertificateException("Пустая цепочка сертификата роутера")
                val pin = sha256Hex(leaf)
                when {
                    normalizedExpected != null && pin != normalizedExpected ->
                        throw CertificateException("Сертификат роутера не совпадает с сохранённым отпечатком")
                    normalizedExpected == null && !allowTrustOnFirstUse ->
                        throw CertificateException("Для HTTPS нужен сохранённый отпечаток сертификата роутера")
                    normalizedExpected == null && allowTrustOnFirstUse ->
                        captured?.value = pin
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
