package com.example.sheepfoldchild.data

import android.content.Context
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.withContext
import org.json.JSONObject
import java.net.URL
import javax.net.ssl.HttpsURLConnection

class ClientStatusRepository(private val context: Context) {

    companion object {
        private val KEY_ROUTER_URL = stringPreferencesKey("router_base_url")
        private const val ENDPOINT = "/cgi-bin/sheepfold-api/client-status"
        private const val ACCESS_REQUEST_ENDPOINT = "/cgi-bin/sheepfold-api/access-request"
        private const val TIMEOUT_MS = 5000
        private const val DEFAULT_HTTPS_PORT = 5201
    }

    suspend fun getRouterBaseUrl(): String? =
        context.clientDataStore.data.first()[KEY_ROUTER_URL]

    suspend fun saveRouterBaseUrl(url: String): String {
        val normalized = preferredBaseUrl(url)
        saveSelectedBaseUrl(normalized)
        return normalized
    }

    /** Только HTTPS — cleartext HTTP запрещён политикой приложения. */
    suspend fun fetchClientStatus(baseUrl: String): Result<ClientStatusResponse> =
        withContext(Dispatchers.IO) {
            val candidate = preferredBaseUrl(baseUrl)
            fetchFrom(candidate).onSuccess { saveSelectedBaseUrl(candidate) }
        }

    suspend fun requestThirtyMinutes(baseUrl: String): Result<Unit> = withContext(Dispatchers.IO) {
        var connection: HttpsURLConnection? = null
        val candidate = preferredBaseUrl(baseUrl)
        try {
            val url = URL("${candidate.trimEnd('/')}$ACCESS_REQUEST_ENDPOINT")
            val (https, capturedPin) = ChildRouterHttps.open(context, url)
            connection = https
            connection.connectTimeout = TIMEOUT_MS
            connection.readTimeout = TIMEOUT_MS
            connection.requestMethod = "POST"
            connection.instanceFollowRedirects = false
            connection.setRequestProperty("Accept", "application/json")
            connection.setRequestProperty("Content-Type", "application/x-www-form-urlencoded")
            connection.doOutput = true
            connection.outputStream.use { it.write(ByteArray(0)) }

            val code = connection.responseCode
            val body = (if (code in 200..299) connection.inputStream else connection.errorStream)
                ?.bufferedReader(Charsets.UTF_8)
                ?.use { it.readText() }
                .orEmpty()
            if (code !in 200..299) {
                Result.failure(Exception(extractError(body, code)))
            } else {
                val root = JSONObject(body)
                if (!root.optBoolean("ok", false)) {
                    Result.failure(Exception(root.optString("message", "Не удалось отправить просьбу")))
                } else {
                    ChildRouterHttps.commitCapturedPin(context, url, capturedPin)
                    saveSelectedBaseUrl(candidate)
                    Result.success(Unit)
                }
            }
        } catch (error: Exception) {
            Result.failure(error)
        } finally {
            connection?.disconnect()
        }
    }

    private fun fetchFrom(baseUrl: String): Result<ClientStatusResponse> {
        var connection: HttpsURLConnection? = null
        return try {
            val url = URL("${baseUrl.trimEnd('/')}$ENDPOINT")
            if (url.protocol != "https") {
                return Result.failure(IllegalArgumentException("Поддерживается только HTTPS"))
            }

            val (https, capturedPin) = ChildRouterHttps.open(context, url)
            connection = https
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
                    require(parsed.app == "sheepfold") { "Ответ не принадлежит Sheepfold" }
                    ChildRouterHttps.commitCapturedPin(context, url, capturedPin)
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
        saveProductRouterUrl(context, baseUrl)
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
        val httpsPort = explicitPort ?: DEFAULT_HTTPS_PORT
        val hostForUrl = if (host.contains(':')) "[$host]" else host
        return listOf("https://$hostForUrl:$httpsPort$path".trimEnd('/'))
    }

    private fun parseRouterUrl(rawUrl: String): URL {
        val trimmed = rawUrl.trim().trimEnd('/')
        require(trimmed.isNotBlank()) { "Адрес роутера не указан" }
        val withScheme = when {
            trimmed.startsWith("https://", ignoreCase = true) -> trimmed
            trimmed.startsWith("http://", ignoreCase = true) ->
                "https://${trimmed.removePrefix("http://").removePrefix("HTTP://")}"
            else -> "https://$trimmed"
        }
        val parsed = URL(withScheme)
        require(parsed.protocol == "https") { "Поддерживается только HTTPS" }
        require(parsed.host.isNotBlank()) { "Некорректный адрес роутера" }
        return parsed
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
                canRequestAccessExtension = value.optBoolean("canRequestAccessExtension", false),
                productStatus = parseProductStatus(value),
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
            app = root.optString("app").takeIf { it.isNotBlank() },
            ok = root.optBoolean("ok", false),
            apiVersion = root.optString("apiVersion").takeIf { it.isNotBlank() },
            serverTime = root.optString("serverTime").takeIf { it.isNotBlank() },
            data = data,
            error = error
        )
    }
}
