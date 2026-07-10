package com.example.sheepfoldchild.data

import android.content.Context
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.withContext
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.InetAddress
import java.net.URL

class ClientStatusRepository(private val context: Context) {

    companion object {
        private val KEY_ROUTER_URL = stringPreferencesKey("router_base_url")
        private const val ENDPOINT = "/cgi-bin/sheepfold-api/client-status"
        private const val TIMEOUT_MS = 5000
        private const val DEFAULT_HTTPS_PORT = 5200
        private const val DEFAULT_HTTP_PORT = 5201
    }

    suspend fun getRouterBaseUrl(): String? =
        context.clientDataStore.data.first()[KEY_ROUTER_URL]

    suspend fun saveRouterBaseUrl(url: String): String {
        val normalized = preferredBaseUrl(url)
        saveSelectedBaseUrl(normalized)
        return normalized
    }

    /** HTTPS проверяется первым; HTTP допускается только для локального адреса. */
    suspend fun fetchClientStatus(baseUrl: String): Result<ClientStatusResponse> =
        withContext(Dispatchers.IO) {
            var lastError: Throwable? = null
            for (candidate in candidateBaseUrls(baseUrl)) {
                val result = fetchFrom(candidate)
                if (result.isSuccess) {
                    saveSelectedBaseUrl(candidate)
                    return@withContext result
                }
                lastError = result.exceptionOrNull()
            }
            Result.failure(lastError ?: IllegalStateException("Роутер Sheepfold недоступен"))
        }

    private fun fetchFrom(baseUrl: String): Result<ClientStatusResponse> {
        var connection: HttpURLConnection? = null
        return try {
            val url = URL("${baseUrl.trimEnd('/')}$ENDPOINT")
            if (url.protocol == "http" && !isPrivateLanHost(url.host)) {
                return Result.failure(IllegalArgumentException("HTTP разрешён только для локального роутера"))
            }

            connection = url.openConnection() as HttpURLConnection
            connection.connectTimeout = TIMEOUT_MS
            connection.readTimeout = TIMEOUT_MS
            connection.requestMethod = "GET"
            connection.instanceFollowRedirects = false
            connection.setRequestProperty("Accept", "application/json")

            val code = connection.responseCode
            val body = (if (code in 200..299) connection.inputStream else connection.errorStream)
                ?.bufferedReader(Charsets.UTF_8)
                ?.use { it.readText() }
                .orEmpty()

            if (code !in 200..299) {
                Result.failure(Exception(extractError(body, code)))
            } else {
                val parsed = parseResponse(body)
                if (parsed.ok) {
                    Result.success(parsed)
                } else {
                    Result.failure(Exception(parsed.error?.message ?: "Роутер не вернул статус устройства"))
                }
            }
        } catch (error: Exception) {
            Result.failure(error)
        } finally {
            connection?.disconnect()
        }
    }

    private suspend fun saveSelectedBaseUrl(baseUrl: String) {
        context.clientDataStore.edit { prefs -> prefs[KEY_ROUTER_URL] = baseUrl }
        context.aiDataStore.edit { prefs -> prefs[KEY_ROUTER_URL] = baseUrl }
    }

    private fun preferredBaseUrl(rawUrl: String): String = candidateBaseUrls(rawUrl).first()

    private fun candidateBaseUrls(rawUrl: String): List<String> {
        val parsed = parseRouterUrl(rawUrl)
        val host = parsed.host
        val path = parsed.path
            .trimEnd('/')
            .removeSuffix("/cgi-bin/sheepfold-api/client-status")
            .removeSuffix("/cgi-bin/sheepfold-api")
        val explicitPort = parsed.port.takeIf { it > 0 }
        val httpsPort = when {
            explicitPort == DEFAULT_HTTP_PORT -> DEFAULT_HTTPS_PORT
            explicitPort != null -> explicitPort
            else -> DEFAULT_HTTPS_PORT
        }
        val httpPort = when {
            explicitPort == DEFAULT_HTTPS_PORT -> DEFAULT_HTTP_PORT
            explicitPort != null -> explicitPort
            else -> DEFAULT_HTTP_PORT
        }
        val hostForUrl = if (host.contains(':')) "[$host]" else host
        val https = "https://$hostForUrl:$httpsPort$path".trimEnd('/')
        val candidates = mutableListOf(https)
        if (isPrivateLanHost(host)) {
            candidates += "http://$hostForUrl:$httpPort$path".trimEnd('/')
        }
        return candidates.distinct()
    }

    private fun parseRouterUrl(rawUrl: String): URL {
        val trimmed = rawUrl.trim().trimEnd('/')
        require(trimmed.isNotBlank()) { "Адрес роутера не указан" }
        val withScheme = if (
            trimmed.startsWith("http://", ignoreCase = true) ||
            trimmed.startsWith("https://", ignoreCase = true)
        ) trimmed else "https://$trimmed"
        val parsed = URL(withScheme)
        require(parsed.protocol == "http" || parsed.protocol == "https") {
            "Поддерживаются только HTTP и HTTPS"
        }
        require(parsed.host.isNotBlank()) { "Некорректный адрес роутера" }
        return parsed
    }

    private fun isPrivateLanHost(host: String): Boolean {
        val normalized = host.trim().lowercase()
        if (normalized == "localhost" || normalized.endsWith(".local") || normalized.endsWith(".lan")) {
            return true
        }
        return runCatching {
            val address = InetAddress.getByName(normalized)
            address.isAnyLocalAddress || address.isLoopbackAddress || address.isLinkLocalAddress || address.isSiteLocalAddress
        }.getOrDefault(false)
    }

    private fun extractError(json: String, code: Int): String = try {
        val root = JSONObject(json)
        root.optJSONObject("error")?.optString("message")
            ?.takeIf { it.isNotBlank() }
            ?: root.optString("message").takeIf { it.isNotBlank() }
            ?: "HTTP $code"
    } catch (_: Exception) {
        json.takeIf { it.isNotBlank() } ?: "HTTP $code"
    }

    private fun parseResponse(json: String): ClientStatusResponse {
        val root = JSONObject(json)
        val data = root.optJSONObject("data")?.let { value ->
            ClientStatusData(
                deviceId = value.optString("deviceId").takeIf { it.isNotBlank() },
                deviceName = value.optString("deviceName").takeIf { it.isNotBlank() },
                isAdministrator = value.optBoolean("isAdministrator", false),
                clientRole = value.optString("clientRole", "child"),
                personalGroupName = value.optString("personalGroupName").takeIf { it.isNotBlank() },
                childAiAllowed = value.optBoolean("childAiAllowed", false),
                personalGroupRequired = value.optBoolean("personalGroupRequired", false),
                internetState = value.optString("internetState", "unknown"),
                accessMode = value.optString("accessMode").takeIf { it.isNotBlank() },
                accessEndsAt = value.optString("accessEndsAt").takeIf { it.isNotBlank() },
                minutesRemaining = if (value.has("minutesRemaining") && !value.isNull("minutesRemaining")) {
                    value.optInt("minutesRemaining")
                } else null,
                message = value.optString("message").takeIf { it.isNotBlank() }
            )
        }
        val error = root.optJSONObject("error")?.let { value ->
            ApiError(
                code = value.optString("code", "unknown"),
                message = value.optString("message", "Неизвестная ошибка")
            )
        }
        return ClientStatusResponse(
            ok = root.optBoolean("ok", false),
            apiVersion = root.optString("apiVersion").takeIf { it.isNotBlank() },
            serverTime = root.optString("serverTime").takeIf { it.isNotBlank() },
            data = data,
            error = error
        )
    }
}
