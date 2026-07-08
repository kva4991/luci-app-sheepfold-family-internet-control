package com.example.sheepfoldchild.data

import android.content.Context
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.withContext
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL

class ClientStatusRepository(private val context: Context) {

    companion object {
        private val KEY_ROUTER_URL = stringPreferencesKey("router_base_url")
        private const val ENDPOINT = "/cgi-bin/sheepfold-api/client-status"
        private const val TIMEOUT_MS = 5000
    }

    suspend fun getRouterBaseUrl(): String? {
        return context.clientDataStore.data.first()[KEY_ROUTER_URL]
    }

    suspend fun saveRouterBaseUrl(url: String): String {
        val normalized = normalizeBaseUrl(url)
        context.clientDataStore.edit { prefs -> prefs[KEY_ROUTER_URL] = normalized }
        context.aiDataStore.edit { prefs -> prefs[KEY_ROUTER_URL] = normalized }
        return normalized
    }

    /**
     * Запрашивает статус у роутера.
     * Клиент не передаёт MAC — роутер определяет его по REMOTE_ADDR.
     */
    suspend fun fetchClientStatus(baseUrl: String): Result<ClientStatusResponse> =
        withContext(Dispatchers.IO) {
            var conn: HttpURLConnection? = null
            try {
                val normalized = normalizeBaseUrl(baseUrl)
                val url = URL("$normalized$ENDPOINT")
                conn = url.openConnection() as HttpURLConnection
                conn.connectTimeout = TIMEOUT_MS
                conn.readTimeout = TIMEOUT_MS
                conn.requestMethod = "GET"
                conn.instanceFollowRedirects = false
                conn.setRequestProperty("Accept", "application/json")

                val code = conn.responseCode
                val body = (if (code in 200..299) conn.inputStream else conn.errorStream)
                    ?.bufferedReader(Charsets.UTF_8)
                    ?.use { it.readText() }
                    .orEmpty()

                if (code !in 200..299) {
                    return@withContext Result.failure(Exception(extractError(body, code)))
                }

                val parsed = parseResponse(body)
                if (!parsed.ok) {
                    return@withContext Result.failure(
                        Exception(parsed.error?.message ?: "Роутер не вернул статус устройства")
                    )
                }
                Result.success(parsed)
            } catch (e: Exception) {
                Result.failure(e)
            } finally {
                conn?.disconnect()
            }
        }

    private fun normalizeBaseUrl(rawUrl: String): String {
        val trimmed = rawUrl.trim().trimEnd('/')
        require(trimmed.isNotBlank()) { "Адрес роутера не указан" }

        val withScheme = if (
            trimmed.startsWith("http://", ignoreCase = true) ||
            trimmed.startsWith("https://", ignoreCase = true)
        ) {
            trimmed
        } else {
            "http://$trimmed"
        }

        val parsed = URL(withScheme)
        require(parsed.protocol == "http" || parsed.protocol == "https") {
            "Поддерживаются только HTTP и HTTPS"
        }
        require(parsed.host.isNotBlank()) { "Некорректный адрес роутера" }

        return parsed.toExternalForm().trimEnd('/')
    }

    private fun extractError(json: String, code: Int): String {
        return try {
            val root = JSONObject(json)
            root.optJSONObject("error")?.optString("message")
                ?.takeIf { it.isNotBlank() }
                ?: root.optString("message").takeIf { it.isNotBlank() }
                ?: "HTTP $code"
        } catch (_: Exception) {
            json.takeIf { it.isNotBlank() } ?: "HTTP $code"
        }
    }

    private fun parseResponse(json: String): ClientStatusResponse {
        val root = JSONObject(json)
        val ok = root.optBoolean("ok", false)
        val apiVersion = root.optString("apiVersion").takeIf { it.isNotBlank() }
        val serverTime = root.optString("serverTime").takeIf { it.isNotBlank() }

        val data = root.optJSONObject("data")?.let { d ->
            ClientStatusData(
                deviceName = d.optString("deviceName").takeIf { it.isNotBlank() },
                internetState = d.optString("internetState", "unknown"),
                accessMode = d.optString("accessMode").takeIf { it.isNotBlank() },
                accessEndsAt = d.optString("accessEndsAt").takeIf { it.isNotBlank() },
                minutesRemaining = if (d.has("minutesRemaining") && !d.isNull("minutesRemaining"))
                    d.optInt("minutesRemaining") else null,
                message = d.optString("message").takeIf { it.isNotBlank() }
            )
        }

        val error = root.optJSONObject("error")?.let { e ->
            ApiError(
                code = e.optString("code", "unknown"),
                message = e.optString("message", "Неизвестная ошибка")
            )
        }

        return ClientStatusResponse(ok, apiVersion, serverTime, data, error)
    }
}
