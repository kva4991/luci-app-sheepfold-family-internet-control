package app.sheepfold.android.router

import android.content.Context
import org.json.JSONObject
import java.net.URL

/** Восстанавливает адрес API после изменения порта Sheepfold в LuCI. §dscqr01 */
object RouterEndpointRecovery {
    private const val defaultApiPath = "/cgi-bin/sheepfold-api"

    fun discoverAndStore(
        context: Context,
        connection: RouterConnectionRequest,
        failedApiUrl: String
    ): String? {
        val failedUrl = runCatching { URL(failedApiUrl) }.getOrNull() ?: return null
        val host = failedUrl.host.takeIf { it.isNotBlank() } ?: return null
        val hostForUrl = if (host.contains(':')) "[$host]" else host
        val discoveryUrl = URL("https://$hostForUrl/.well-known/sheepfold.json")
        val tlsPin = connection.tlsPinSha256
        val tlsSpki = connection.tlsSpkiSha256
        if (tlsPin.isNullOrBlank() && tlsSpki.isNullOrBlank()) return null
        val json = readDiscovery(discoveryUrl, tlsPin, tlsSpki) ?: return null

        val port = json.optString("httpsPort")
            .ifBlank { json.optString("appPort") }
            .toIntOrNull()
            ?.takeIf { it in 1..65535 }
            ?: return null
        val apiPath = json.optString("apiPath")
            .ifBlank { json.optString("apiBase") }
            .ifBlank { defaultApiPath }
            .takeIf { it.startsWith('/') && !it.startsWith("//") }
            ?: return null
        val updatedApiUrl = "https://$hostForUrl:$port$apiPath"

        if (updatedApiUrl == failedApiUrl.trimEnd('/')) return null

        // Discovery доверяем только на уже закреплённом локальном IP и при совпадении
        // TLS-ключа (либо старого certificate pin). Меняется только порт. §dnsbind1
        // После этого сохраняем новый endpoint для экранов, виджетов и фоновых задач.
        SheepfoldConnectionStore.updateApiUrl(context, updatedApiUrl)
        return updatedApiUrl
    }

    private fun readDiscovery(url: URL, tlsPin: String?, tlsSpki: String?): JSONObject? = runCatching {
        val (http, _) = RouterHttps.open(
            url,
            tlsPin,
            allowTrustOnFirstUse = false,
            tlsSpkiSha256 = tlsSpki
        )
        try {
            http.connectTimeout = 3000
            http.readTimeout = 3000
            http.requestMethod = "GET"
            http.instanceFollowRedirects = false
            http.setRequestProperty("Accept", "application/json")
            if (http.responseCode !in 200..299) return@runCatching null

            val json = JSONObject(http.inputStream.bufferedReader(Charsets.UTF_8).use { it.readText() })
            json.takeIf { it.optString("service").equals("sheepfold", ignoreCase = true) }
        } finally {
            http.disconnect()
        }
    }.getOrNull()
}
