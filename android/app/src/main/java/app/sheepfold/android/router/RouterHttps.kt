package app.sheepfold.android.router

import java.net.URL
import javax.net.ssl.HttpsURLConnection

object RouterHttps {
    fun open(
        url: URL,
        tlsPinSha256: String?,
        allowTrustOnFirstUse: Boolean,
        tlsSpkiSha256: String? = null
    ): Pair<HttpsURLConnection, RouterTlsPin.CapturedPin?> {
        require(url.protocol.equals("https", ignoreCase = true)) {
            "Административные запросы Sheepfold разрешены только по HTTPS"
        }
        // После discovery/pairing сохраняется IP, поэтому последующие запросы
        // не должны заново разрешать hostname и становиться уязвимыми к DNS rebinding. §dnsbind1
        require(LocalRouterAddress.isLocalIpLiteral(url.host)) {
            "Сохранённый адрес роутера больше не является локальным IP. Выполните сопряжение заново"
        }
        val connection = url.openConnection() as HttpsURLConnection
        val captured = RouterTlsPin.configure(
            connection,
            tlsPinSha256,
            allowTrustOnFirstUse,
            expectedSpki = tlsSpkiSha256
        )
        return connection to captured
    }
}
