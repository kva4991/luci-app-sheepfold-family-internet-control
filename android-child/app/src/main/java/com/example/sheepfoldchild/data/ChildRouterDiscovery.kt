package com.example.sheepfoldchild.data

import android.content.Context
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import android.net.wifi.WifiManager
import android.os.Build
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONObject
import java.net.Inet4Address
import java.net.URL
import javax.net.ssl.HttpsURLConnection

data class ChildRouterDiscoveryResult(
    val routerBaseUrl: String,
    val routerName: String
)

/** Ищет Sheepfold только на шлюзе активной Wi-Fi/Ethernet-сети. */
object ChildRouterDiscovery {
    private const val DEFAULT_API_PORT = 5201
    private const val TIMEOUT_MS = 2500

    suspend fun discover(context: Context): ChildRouterDiscoveryResult? = withContext(Dispatchers.IO) {
        val gatewayHost = activeGateway(context) ?: return@withContext null
        val hostForUrl = if (gatewayHost.contains(':')) "[$gatewayHost]" else gatewayHost
        val markerUrls = listOf(
            URL("https://$hostForUrl/.well-known/sheepfold.json"),
            URL("https://$hostForUrl:$DEFAULT_API_PORT/.well-known/sheepfold.json")
        )

        for (markerUrl in markerUrls) {
            val marker = readMarker(context, markerUrl) ?: continue
            val apiPort = marker.optString("httpsPort")
                .ifBlank { marker.optString("appPort") }
                .toIntOrNull()
                ?.takeIf { it in 1..65535 }
                ?: DEFAULT_API_PORT
            val apiPath = marker.optString("apiPath")
                .ifBlank { marker.optString("apiBase") }
                .ifBlank { "/cgi-bin/sheepfold-api" }
                .let { if (it.startsWith('/')) it else "/$it" }
            val routerBaseUrl = "https://$hostForUrl:$apiPort"
            val pingUrl = URL("$routerBaseUrl${apiPath.trimEnd('/')}/ping")

            if (!verifyApi(context, pingUrl)) continue
            return@withContext ChildRouterDiscoveryResult(
                routerBaseUrl = routerBaseUrl,
                routerName = marker.optString("routerName").ifBlank { gatewayHost }
            )
        }

        null
    }

    private fun activeGateway(context: Context): String? {
        val connectivity = context.getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            val network = connectivity.activeNetwork ?: return null
            val capabilities = connectivity.getNetworkCapabilities(network) ?: return null
            val localTransport = capabilities.hasTransport(NetworkCapabilities.TRANSPORT_WIFI) ||
                capabilities.hasTransport(NetworkCapabilities.TRANSPORT_ETHERNET)
            if (!localTransport) return null
            return connectivity.getLinkProperties(network)
                ?.routes
                ?.firstOrNull { it.isDefaultRoute && it.gateway is Inet4Address }
                ?.gateway
                ?.hostAddress
        }

        @Suppress("DEPRECATION")
        val networkInfo = connectivity.activeNetworkInfo ?: return null
        @Suppress("DEPRECATION")
        if (!networkInfo.isConnected || networkInfo.type != ConnectivityManager.TYPE_WIFI) return null
        val wifi = context.applicationContext.getSystemService(Context.WIFI_SERVICE) as WifiManager
        @Suppress("DEPRECATION")
        val gateway = wifi.dhcpInfo?.gateway ?: 0
        if (gateway == 0) return null
        return listOf(
            gateway and 0xff,
            gateway shr 8 and 0xff,
            gateway shr 16 and 0xff,
            gateway shr 24 and 0xff
        ).joinToString(".")
    }

    private fun readMarker(context: Context, url: URL): JSONObject? = runCatching {
        val (connection, _) = ChildRouterHttps.open(context, url)
        try {
            prepareGet(connection)
            if (connection.responseCode !in 200..299) return@runCatching null
            JSONObject(connection.inputStream.bufferedReader().use { it.readText() })
                .takeIf { it.optString("service").equals("sheepfold", ignoreCase = true) }
        } finally {
            connection.disconnect()
        }
    }.getOrNull()

    private fun verifyApi(context: Context, url: URL): Boolean = runCatching {
        val (connection, capturedPin) = ChildRouterHttps.open(context, url)
        try {
            prepareGet(connection)
            if (connection.responseCode !in 200..299) return@runCatching false
            val json = JSONObject(connection.inputStream.bufferedReader().use { it.readText() })
            val belongsToSheepfold = json.optString("service").equals("sheepfold", ignoreCase = true) ||
                json.optString("app").equals("sheepfold", ignoreCase = true)
            if (belongsToSheepfold) {
                // Закрепляем сертификат только после проверки маркера самого API,
                // а не после ответа произвольного HTTPS-сервера на адресе шлюза.
                ChildRouterHttps.commitCapturedPin(context, url, capturedPin)
            }
            belongsToSheepfold
        } finally {
            connection.disconnect()
        }
    }.getOrDefault(false)

    private fun prepareGet(connection: HttpsURLConnection) {
        connection.connectTimeout = TIMEOUT_MS
        connection.readTimeout = TIMEOUT_MS
        connection.requestMethod = "GET"
        connection.instanceFollowRedirects = false
        connection.setRequestProperty("Accept", "application/json")
        connection.setRequestProperty("User-Agent", "Sheepfold Child Android")
    }
}
