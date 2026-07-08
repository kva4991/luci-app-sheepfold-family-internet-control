package app.sheepfold.android.router

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.InetAddress
import java.net.URL
import java.net.URLEncoder

data class RouterDevice(
    val id: String,
    val name: String,
    val ip: String,
    val mac: String,
    val group: String,
    val status: String,
    val isAdministrator: Boolean
)

data class RouterSnapshot(
    val routerName: String,
    val diagnostics: Map<String, String>
)

/** Все команды выполняются на роутере с Bearer-токеном, а не в локальном состоянии APK. */
class RouterAdminClient(private val connection: RouterConnectionRequest) {
    suspend fun loadDevices(): List<RouterDevice> = withContext(Dispatchers.IO) {
        val json = request("GET", "/devices")
        val devices = json.optJSONArray("devices") ?: return@withContext emptyList()
        buildList {
            for (index in 0 until devices.length()) {
                val item = devices.optJSONObject(index) ?: continue
                add(
                    RouterDevice(
                        id = item.optString("id").ifBlank { item.optString("mac") },
                        name = item.optString("name").ifBlank { "Неизвестное устройство" },
                        ip = item.optString("ip"),
                        mac = item.optString("mac"),
                        group = item.optString("group"),
                        status = item.optString("status", "unknown"),
                        isAdministrator = item.optBoolean("adminDevice", false)
                    )
                )
            }
        }
    }

    suspend fun setGlobalBlock(enabled: Boolean) = withContext(Dispatchers.IO) {
        request(
            method = "POST",
            path = "/global-block",
            form = mapOf("enable" to if (enabled) "1" else "0", "confirm" to "1")
        )
    }

    suspend fun loadRouterInfo(): RouterSnapshot = withContext(Dispatchers.IO) {
        val json = request("GET", "/router-info")
        val diagnosticsObject = json.optJSONObject("diagnostics")
        val diagnostics = buildMap {
            if (diagnosticsObject != null) {
                val keys = diagnosticsObject.keys()
                while (keys.hasNext()) {
                    val key = keys.next()
                    put(key, diagnosticsObject.optString(key))
                }
            }
        }
        RouterSnapshot(json.optString("routerName", connection.routerName), diagnostics)
    }

    private fun request(
        method: String,
        path: String,
        form: Map<String, String> = emptyMap()
    ): JSONObject {
        var lastError: Throwable? = null
        for (apiBase in candidateApiUrls(connection.apiUrl)) {
            val result = runCatching { requestOnce(apiBase, method, path, form) }
            if (result.isSuccess) return result.getOrThrow()
            lastError = result.exceptionOrNull()
        }
        throw lastError ?: IllegalStateException("Роутер недоступен")
    }

    private fun requestOnce(
        apiBase: String,
        method: String,
        path: String,
        form: Map<String, String>
    ): JSONObject {
        val url = URL("${apiBase.trimEnd('/')}$path")
        if (url.protocol == "http" && !isPrivateLanHost(url.host)) {
            throw IllegalArgumentException("HTTP разрешён только для локального роутера")
        }
        val http = url.openConnection() as HttpURLConnection
        try {
            http.connectTimeout = 5000
            http.readTimeout = 15000
            http.requestMethod = method
            http.instanceFollowRedirects = false
            http.setRequestProperty("Accept", "application/json")
            http.setRequestProperty("X-Sheepfold-Client", "android-admin-v1")
            val bearer = connection.bearerToken
                ?: throw IllegalStateException("Административный токен отсутствует")
            http.setRequestProperty("Authorization", "Bearer $bearer")
            if (method == "POST") {
                val body = form.entries.joinToString("&") { (key, value) ->
                    "${encode(key)}=${encode(value)}"
                }
                http.doOutput = true
                http.setRequestProperty("Content-Type", "application/x-www-form-urlencoded; charset=UTF-8")
                http.outputStream.use { it.write(body.toByteArray(Charsets.UTF_8)) }
            }

            val code = http.responseCode
            val body = (if (code in 200..299) http.inputStream else http.errorStream)
                ?.bufferedReader(Charsets.UTF_8)
                ?.use { it.readText() }
                .orEmpty()
            val json = runCatching { JSONObject(body) }.getOrNull()
            if (code !in 200..299) {
                throw IllegalStateException(
                    json?.optString("message")
                        ?.ifBlank { json.optString("error") }
                        .orEmpty()
                        .ifBlank { body.ifBlank { "HTTP $code" } }
                )
            }
            return json ?: throw IllegalStateException("Роутер вернул некорректный JSON")
        } finally {
            http.disconnect()
        }
    }

    private fun candidateApiUrls(rawApiUrl: String): List<String> {
        val parsed = URL(rawApiUrl)
        val host = if (parsed.host.contains(':')) "[${parsed.host}]" else parsed.host
        val explicitPort = parsed.port.takeIf { it > 0 }
        val httpsPort = when {
            parsed.protocol == "https" && explicitPort != null -> explicitPort
            explicitPort == 5201 -> 5200
            explicitPort != null -> explicitPort
            else -> 5200
        }
        val httpPort = when {
            parsed.protocol == "http" && explicitPort != null -> explicitPort
            explicitPort == 5200 -> 5201
            explicitPort != null -> explicitPort
            else -> 5201
        }
        val result = mutableListOf("https://$host:$httpsPort${parsed.path}")
        if (isPrivateLanHost(parsed.host)) result += "http://$host:$httpPort${parsed.path}"
        return result.distinct()
    }

    private fun isPrivateLanHost(host: String): Boolean {
        val normalized = host.trim().lowercase()
        if (normalized == "localhost" || normalized.endsWith(".local") || normalized.endsWith(".lan")) return true
        return runCatching {
            val address = InetAddress.getByName(normalized)
            address.isAnyLocalAddress || address.isLoopbackAddress || address.isLinkLocalAddress || address.isSiteLocalAddress
        }.getOrDefault(false)
    }

    private fun encode(value: String): String = URLEncoder.encode(value, Charsets.UTF_8.name())
}
