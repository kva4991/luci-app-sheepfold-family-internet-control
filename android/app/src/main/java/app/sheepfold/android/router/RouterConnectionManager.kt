package app.sheepfold.android.router

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL

data class RouterConnectionRequest(
    val apiUrl: String,
    val routerName: String
)

class RouterConnectionManager {
    fun getAutoRouterAddress(): String? = "192.168.1.1"

    fun parseQrPayload(payload: String): RouterConnectionRequest {
        val trimmed = payload.trim()
        if (trimmed.startsWith("{")) {
            val json = JSONObject(trimmed)
            val rawUrl = json.optString("apiUrl")
                .ifBlank { json.optString("routerUrl") }
                .ifBlank { json.optString("routerAddress") }
                .ifBlank { json.optString("host") }
            val apiUrl = normalizeRouterUrl(rawUrl)
            val routerName = json.optString("routerName")
                .ifBlank { json.optString("name") }
                .ifBlank { hostName(apiUrl) }
            return RouterConnectionRequest(apiUrl = apiUrl, routerName = routerName)
        }

        val apiUrl = normalizeRouterUrl(trimmed)
        return RouterConnectionRequest(apiUrl = apiUrl, routerName = hostName(apiUrl))
    }

    suspend fun testConnection(request: RouterConnectionRequest): Boolean = withContext(Dispatchers.IO) {
        val connection = URL(request.apiUrl).openConnection() as HttpURLConnection
        try {
            connection.connectTimeout = 2500
            connection.readTimeout = 2500
            connection.requestMethod = "GET"
            connection.instanceFollowRedirects = false
            connection.connect()
            connection.responseCode in 200..499
        } finally {
            connection.disconnect()
        }
    }

    private fun normalizeRouterUrl(value: String): String {
        require(value.isNotBlank()) { "QR код не содержит адрес роутера" }
        val withScheme = if (value.startsWith("http://") || value.startsWith("https://")) {
            value
        } else {
            "http://$value"
        }
        return withScheme.trimEnd('/')
    }

    private fun hostName(apiUrl: String): String {
        return runCatching { URL(apiUrl).host }
            .getOrDefault(apiUrl)
            .ifBlank { "router" }
    }
}
