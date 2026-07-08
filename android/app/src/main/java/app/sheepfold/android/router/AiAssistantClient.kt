package app.sheepfold.android.router

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.InetAddress
import java.net.URL
import java.net.URLEncoder

data class AiAssistantRequest(
    val connection: RouterConnectionRequest,
    val provider: String,
    val model: String,
    val message: String,
    val includeRouterInfo: Boolean,
    val includeProgramLog: Boolean,
    val googleAccount: String
)

object AiAssistantClient {
    suspend fun ask(request: AiAssistantRequest): String = withContext(Dispatchers.IO) {
        val deviceId = request.connection.deviceId
            ?: throw IllegalStateException("Идентификатор парного устройства отсутствует")
        var lastError: Throwable? = null
        for (apiBase in candidateApiUrls(request.connection.apiUrl)) {
            val result = runCatching { askOnce(request, apiBase, deviceId) }
            if (result.isSuccess) return@withContext result.getOrThrow()
            lastError = result.exceptionOrNull()
        }
        throw lastError ?: IllegalStateException("Роутер не смог получить ответ ИИ")
    }

    private fun askOnce(request: AiAssistantRequest, apiBase: String, deviceId: String): String {
        val apiUrl = "${apiBase.trimEnd('/')}/ai-assistant"
        val body = listOf(
            "message" to request.message,
            "includeInfo" to if (request.includeRouterInfo) "1" else "0",
            "includeLogs" to if (request.includeProgramLog) "1" else "0",
            "googleAccount" to request.googleAccount,
            "deviceId" to deviceId,
            "clientRole" to "parent",
            "isAdministrator" to "1"
        ).joinToString("&") { (key, value) ->
            "${urlEncode(key)}=${urlEncode(value)}"
        }
        val url = URL(apiUrl)
        if (url.protocol == "http" && !isPrivateLanHost(url.host)) {
            throw IllegalArgumentException("HTTP разрешён только для локального роутера")
        }
        val connection = url.openConnection() as HttpURLConnection

        try {
            connection.connectTimeout = 5000
            connection.readTimeout = 45000
            connection.requestMethod = "POST"
            connection.doOutput = true
            connection.instanceFollowRedirects = false
            connection.setRequestProperty("Content-Type", "application/x-www-form-urlencoded; charset=UTF-8")
            connection.setRequestProperty("Accept", "application/json")
            connection.setRequestProperty("User-Agent", "Sheepfold Android")
            connection.setRequestProperty("X-Sheepfold-Client", "android-admin-v1")
            val token = request.connection.bearerToken
                ?: throw IllegalStateException("Административный токен отсутствует")
            connection.setRequestProperty("Authorization", "Bearer $token")
            connection.outputStream.use { output ->
                output.write(body.toByteArray(Charsets.UTF_8))
            }

            val responseBody = readBody(connection)
            if (connection.responseCode !in 200..299) {
                throw IllegalStateException(apiError(responseBody).ifBlank {
                    "Роутер не смог получить ответ ИИ."
                })
            }

            return extractAnswer(responseBody)
        } finally {
            connection.disconnect()
        }
    }

    private fun extractAnswer(body: String): String {
        val json = JSONObject(body)
        if (!json.optBoolean("ok", true) && json.has("error")) {
            throw IllegalStateException(apiError(body))
        }
        json.optJSONObject("data")
            ?.optString("answer")
            ?.trim()
            ?.takeIf { it.isNotBlank() }
            ?.let { return it }
        val deepSeek = json.optJSONArray("choices")
            ?.optJSONObject(0)
            ?.optJSONObject("message")
            ?.optString("content")
            .orEmpty()
            .trim()
        val gemini = json.optJSONArray("candidates")
            ?.optJSONObject(0)
            ?.optJSONObject("content")
            ?.optJSONArray("parts")
            ?.optJSONObject(0)
            ?.optString("text")
            .orEmpty()
            .trim()
        return deepSeek.ifBlank { gemini }.ifBlank {
            json.optString("output_text")
                .ifBlank { json.optString("answer") }
                .ifBlank { "ИИ вернул пустой ответ." }
        }
    }

    private fun apiError(body: String): String {
        val json = runCatching { JSONObject(body) }.getOrNull()
        return json?.optJSONObject("error")?.optString("message").orEmpty()
            .ifBlank { json?.optString("message").orEmpty() }
            .ifBlank {
                val value = json?.opt("error")
                if (value is String) value else ""
            }
            .ifBlank { body.trim() }
    }

    private fun readBody(connection: HttpURLConnection): String {
        val stream = if (connection.responseCode in 200..299) {
            connection.inputStream
        } else {
            connection.errorStream ?: connection.inputStream
        }
        return stream.bufferedReader(Charsets.UTF_8).use { reader -> reader.readText() }
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

    private fun urlEncode(value: String): String =
        URLEncoder.encode(value, Charsets.UTF_8.name())
}
