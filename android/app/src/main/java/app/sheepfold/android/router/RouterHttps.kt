package app.sheepfold.android.router

import java.net.URL
import javax.net.ssl.HttpsURLConnection

object RouterHttps {
    fun open(
        url: URL,
        tlsPinSha256: String?,
        allowTrustOnFirstUse: Boolean
    ): Pair<HttpsURLConnection, RouterTlsPin.CapturedPin?> {
        require(url.protocol.equals("https", ignoreCase = true)) {
            "Административные запросы Sheepfold разрешены только по HTTPS"
        }
        val connection = url.openConnection() as HttpsURLConnection
        val captured = RouterTlsPin.configure(connection, tlsPinSha256, allowTrustOnFirstUse)
        return connection to captured
    }
}