package app.sheepfold.android.router

import android.content.Context
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import android.net.wifi.WifiManager
import app.sheepfold.android.diagnostics.DiagnosticLog
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONObject
import java.net.Inet4Address
import java.net.URL

enum class ActiveTransport { WIFI, ETHERNET, CELLULAR, OTHER, NONE }

data class LocalNetworkState(
    val transport: ActiveTransport,
    val gatewayHost: String?,
    val wifiName: String?,
    val reportedDeviceMac: String?
)

data class LocalSheepfoldDiscovery(
    val gatewayHost: String,
    val apiUrl: String,
    val routerName: String
)

object LocalRouterDiscovery {
    fun networkState(context: Context): LocalNetworkState {
        val connectivity = context.getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager
        val network = connectivity.activeNetwork
        val capabilities = network?.let(connectivity::getNetworkCapabilities)
        val transport = when {
            capabilities == null -> ActiveTransport.NONE
            capabilities.hasTransport(NetworkCapabilities.TRANSPORT_WIFI) -> ActiveTransport.WIFI
            capabilities.hasTransport(NetworkCapabilities.TRANSPORT_ETHERNET) -> ActiveTransport.ETHERNET
            capabilities.hasTransport(NetworkCapabilities.TRANSPORT_CELLULAR) -> ActiveTransport.CELLULAR
            else -> ActiveTransport.OTHER
        }
        val gateway = network?.let(connectivity::getLinkProperties)
            ?.routes
            ?.firstOrNull { it.isDefaultRoute && it.gateway is Inet4Address }
            ?.gateway
            ?.hostAddress
        val wifi = if (transport == ActiveTransport.WIFI) {
            context.applicationContext.getSystemService(Context.WIFI_SERVICE) as WifiManager
        } else null
        val info = runCatching { wifi?.connectionInfo }.getOrNull()
        val ssid = info?.ssid?.removeSurrounding("\"")?.takeUnless { it == "<unknown ssid>" }
        val mac = info?.macAddress?.takeUnless { it == "02:00:00:00:00:00" }
        return LocalNetworkState(transport, gateway, ssid, mac)
    }

    suspend fun discover(context: Context): LocalSheepfoldDiscovery? = withContext(Dispatchers.IO) {
        val state = networkState(context)
        DiagnosticLog.info(
            "discovery.started",
            "transport" to state.transport.name,
            "gateway" to state.gatewayHost.orEmpty()
        )
        if (state.transport != ActiveTransport.WIFI && state.transport != ActiveTransport.ETHERNET) {
            DiagnosticLog.warn("discovery.skipped", "reason" to "unsupported_transport")
            return@withContext null
        }
        val host = state.gatewayHost ?: run {
            DiagnosticLog.warn("discovery.skipped", "reason" to "gateway_missing")
            return@withContext null
        }

        // Сначала читаем discovery через штатный HTTPS LuCI. Порт Sheepfold может быть
        // изменён, поэтому начинать поиск только с жёстко заданного :5201 нельзя. §dscqr01
        val discoveryUrls = listOf(
            URL("https://$host/.well-known/sheepfold.json"),
            URL("https://$host:5201/.well-known/sheepfold.json")
        )
        for (url in discoveryUrls) {
            DiagnosticLog.info("discovery.document.request", "url" to url.toString())
            val json = readSheepfoldJson(url) ?: continue
            val port = json.optString("httpsPort")
                .ifBlank { json.optString("appPort") }
                .toIntOrNull()
                ?.takeIf { it in 1..65535 }
                ?: 5201
            val path = json.optString("apiPath")
                .ifBlank { json.optString("apiBase") }
                .ifBlank { "/cgi-bin/sheepfold-api" }
                .let { if (it.startsWith('/')) it else "/$it" }
            val apiUrl = "https://$host:$port$path"

            // Наличие статического JSON ещё не означает, что отдельный API-uhttpd запущен.
            // Проверяем сам endpoint, иначе следующий экран обещает найденный сервер зря.
            if (!isSheepfoldApi(URL("${apiUrl.trimEnd('/')}/ping"))) {
                DiagnosticLog.warn("discovery.api.rejected", "api" to apiUrl)
                continue
            }

            DiagnosticLog.info("discovery.succeeded", "api" to apiUrl)
            return@withContext LocalSheepfoldDiscovery(
                gatewayHost = host,
                apiUrl = apiUrl,
                routerName = json.optString("routerName").ifBlank { host }
            )
        }

        DiagnosticLog.warn("discovery.not_found", "gateway" to host)
        null
    }

    private fun readSheepfoldJson(url: URL): JSONObject? = runCatching {
        val (connection, _) = RouterHttps.open(url, tlsPinSha256 = null, allowTrustOnFirstUse = true)
        try {
            connection.connectTimeout = 2500
            connection.readTimeout = 2500
            connection.requestMethod = "GET"
            if (connection.responseCode !in 200..299) return@runCatching null
            val json = JSONObject(connection.inputStream.bufferedReader().use { it.readText() })
            json.takeIf { it.optString("service").equals("sheepfold", ignoreCase = true) }
        } finally {
            connection.disconnect()
        }
    }.onFailure { error ->
        DiagnosticLog.error("discovery.document.failed", error, "url" to url.toString())
    }.getOrNull()

    private fun isSheepfoldApi(url: URL): Boolean = runCatching {
        val (connection, _) = RouterHttps.open(url, tlsPinSha256 = null, allowTrustOnFirstUse = true)
        try {
            connection.connectTimeout = 2500
            connection.readTimeout = 2500
            connection.requestMethod = "GET"
            if (connection.responseCode !in 200..299) return@runCatching false
            val json = JSONObject(connection.inputStream.bufferedReader().use { it.readText() })
            json.optString("service").equals("sheepfold", ignoreCase = true) ||
                json.optString("app").equals("sheepfold", ignoreCase = true)
        } finally {
            connection.disconnect()
        }
    }.onFailure { error ->
        DiagnosticLog.error("discovery.api.failed", error, "url" to url.toString())
    }.getOrDefault(false)
}
