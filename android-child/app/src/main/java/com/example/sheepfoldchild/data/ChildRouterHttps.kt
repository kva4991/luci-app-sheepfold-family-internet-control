package com.example.sheepfoldchild.data

import android.content.Context
import java.net.URL
import java.security.MessageDigest
import java.security.cert.CertificateException
import java.security.cert.X509Certificate
import javax.net.ssl.HostnameVerifier
import javax.net.ssl.HttpsURLConnection
import javax.net.ssl.SSLContext
import javax.net.ssl.TrustManager
import javax.net.ssl.X509TrustManager

/** Закрепляет сертификат локального роутера при первом корректном ответе Sheepfold. */
object ChildRouterHttps {
    private const val PREFS = "sheepfold-child-tls"

    class CapturedPin(var value: String? = null)

    fun open(context: Context, url: URL): Pair<HttpsURLConnection, CapturedPin?> {
        require(url.protocol.equals("https", ignoreCase = true)) { "Поддерживается только HTTPS" }
        val key = pinKey(url)
        val expected = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            .getString(key, null)
            ?.trim()
            ?.lowercase()
            ?.takeIf { it.isNotBlank() }
        val captured = if (expected == null) CapturedPin() else null
        val connection = url.openConnection() as HttpsURLConnection
        val trustManager = object : X509TrustManager {
            override fun checkClientTrusted(chain: Array<out X509Certificate>?, authType: String?) = Unit
            override fun getAcceptedIssuers(): Array<X509Certificate> = emptyArray()

            override fun checkServerTrusted(chain: Array<out X509Certificate>, authType: String) {
                val certificate = chain.firstOrNull()
                    ?: throw CertificateException("Роутер вернул пустую цепочку сертификата")
                val actual = sha256Hex(certificate)
                if (expected != null && actual != expected) {
                    throw CertificateException("Сертификат роутера изменился")
                }
                captured?.value = actual
            }
        }
        val sslContext = SSLContext.getInstance("TLS")
        sslContext.init(null, arrayOf<TrustManager>(trustManager), null)
        connection.sslSocketFactory = sslContext.socketFactory
        connection.hostnameVerifier = HostnameVerifier { _, _ -> true }
        return connection to captured
    }

    fun commitCapturedPin(context: Context, url: URL, captured: CapturedPin?) {
        val value = captured?.value?.takeIf { it.isNotBlank() } ?: return
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            .edit()
            .putString(pinKey(url), value)
            .apply()
    }

    private fun pinKey(url: URL): String = "${url.host.lowercase()}:${url.port.takeIf { it > 0 } ?: 443}"

    private fun sha256Hex(certificate: X509Certificate): String =
        MessageDigest.getInstance("SHA-256")
            .digest(certificate.encoded)
            .joinToString("") { byte -> "%02x".format(byte) }
}
