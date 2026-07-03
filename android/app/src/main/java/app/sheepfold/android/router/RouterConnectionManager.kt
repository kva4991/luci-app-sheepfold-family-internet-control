package app.sheepfold.android.router

import android.content.Context
import android.net.ConnectivityManager
import android.net.LinkProperties
import android.net.RouteInfo
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.Inet4Address
import java.net.URL

data class RouterConnectionRequest(
    val apiUrl: String,
    val routerName: String,
    val temporaryPassword: String? = null,
    val administratorLogin: String? = null
)

data class LocalSheepfoldDiscovery(
    val gatewayHost: String,
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
            val temporaryPassword = json.optString("temporaryPassword")
                .ifBlank { json.optString("pairingToken") }
                .ifBlank { json.optString("token") }
                .ifBlank { json.optString("code") }
                .ifBlank { null }
            val administratorLogin = json.optString("administratorLogin")
                .ifBlank { json.optString("adminLogin") }
                .ifBlank { json.optString("login") }
                .ifBlank { null }
            return RouterConnectionRequest(
                apiUrl = apiUrl,
                routerName = routerName,
                temporaryPassword = temporaryPassword,
                administratorLogin = administratorLogin
            )
        }

        if (trimmed.startsWith("SF1|")) {
            val fields = trimmed.split('|')
                .drop(1)
                .mapNotNull { field ->
                    val separatorIndex = field.indexOf('=')
                    if (separatorIndex <= 0) {
                        null
                    } else {
                        field.substring(0, separatorIndex) to field.substring(separatorIndex + 1)
                    }
                }
                .toMap()

            val baseUrl = normalizeRouterUrl(fields["h"].orEmpty())
            val apiPath = fields["api"].orEmpty().trim()
            val apiUrl = when {
                apiPath.isBlank() -> baseUrl
                apiPath.startsWith("http://") || apiPath.startsWith("https://") -> normalizeRouterUrl(apiPath)
                apiPath.startsWith("/") -> "$baseUrl$apiPath"
                else -> "$baseUrl/$apiPath"
            }

            return RouterConnectionRequest(
                apiUrl = apiUrl,
                routerName = fields["name"].orEmpty().ifBlank { hostName(baseUrl) },
                temporaryPassword = fields["c"].orEmpty()
                    .ifBlank { fields["token"].orEmpty() }
                    .ifBlank { null },
                administratorLogin = fields["u"].orEmpty().ifBlank { null }
            )
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

    suspend fun discoverLocalSheepfold(context: Context): LocalSheepfoldDiscovery? = withContext(Dispatchers.IO) {
        val gatewayHost = currentGatewayHost(context) ?: getAutoRouterAddress() ?: return@withContext null
        val probeUrls = listOf(
            "http://$gatewayHost/cgi-bin/luci/admin/services/sheepfold/api/ping",
            "http://$gatewayHost/cgi-bin/luci/admin/sheepfold/api/ping",
            "http://$gatewayHost/.well-known/sheepfold.json"
        )

        probeUrls.firstNotNullOfOrNull { url ->
            probeSheepfold(url, gatewayHost)
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

    private fun probeSheepfold(url: String, gatewayHost: String): LocalSheepfoldDiscovery? {
        val connection = URL(url).openConnection() as HttpURLConnection
        return try {
            connection.connectTimeout = 1200
            connection.readTimeout = 1200
            connection.requestMethod = "GET"
            connection.instanceFollowRedirects = false
            connection.connect()
            if (connection.responseCode !in 200..299) {
                return null
            }

            val body = connection.inputStream.bufferedReader().use { it.readText() }
            if (!body.contains("sheepfold", ignoreCase = true)) {
                return null
            }

            val routerName = runCatching {
                JSONObject(body).optString("routerName")
                    .ifBlank { JSONObject(body).optString("name") }
            }.getOrNull().orEmpty().ifBlank { gatewayHost }

            LocalSheepfoldDiscovery(
                gatewayHost = gatewayHost,
                apiUrl = url.removeSuffix("/ping"),
                routerName = routerName
            )
        } catch (_: Exception) {
            null
        } finally {
            connection.disconnect()
        }
    }

    private fun currentGatewayHost(context: Context): String? {
        val connectivityManager = context.getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager
        val linkProperties = connectivityManager.getLinkProperties(connectivityManager.activeNetwork)
            ?: return null

        return defaultIpv4Route(linkProperties)
            ?.gateway
            ?.hostAddress
    }

    private fun defaultIpv4Route(linkProperties: LinkProperties): RouteInfo? {
        return linkProperties.routes.firstOrNull { route ->
            route.isDefaultRoute && route.gateway is Inet4Address
        }
    }
}
