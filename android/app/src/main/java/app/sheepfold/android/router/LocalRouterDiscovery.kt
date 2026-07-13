package app.sheepfold.android.router

import android.content.Context
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import android.net.wifi.WifiManager
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
        if (state.transport != ActiveTransport.WIFI && state.transport != ActiveTransport.ETHERNET) {
            return@withContext null
        }
        val host = state.gatewayHost ?: return@withContext null
        val url = URL("https://$host:5201/.well-known/sheepfold.json")
        val (connection, _) = RouterHttps.open(url, tlsPinSha256 = null, allowTrustOnFirstUse = true)
        try {
            connection.connectTimeout = 2500
            connection.readTimeout = 2500
            connection.requestMethod = "GET"
            val code = connection.responseCode
            if (code !in 200..299) return@withContext null
            val body = connection.inputStream.bufferedReader().use { it.readText() }
            val json = JSONObject(body)
            if (!json.optString("service").equals("sheepfold", ignoreCase = true)) return@withContext null
            val port = json.optString("httpsPort").ifBlank { json.optString("appPort") }.ifBlank { "5201" }
            val path = json.optString("apiPath").ifBlank { "/cgi-bin/sheepfold-api" }
            LocalSheepfoldDiscovery(
                gatewayHost = host,
                apiUrl = "https://$host:$port${if (path.startsWith('/')) path else "/$path"}",
                routerName = json.optString("routerName").ifBlank { host }
            )
        } catch (_: Exception) {
            null
        } finally {
            connection.disconnect()
        }
    }
}
