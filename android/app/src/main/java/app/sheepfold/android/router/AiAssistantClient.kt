package app.sheepfold.android.router

import android.content.Context
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONObject
import java.net.URL
import javax.net.ssl.HttpsURLConnection
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
    suspend fun ask(context: Context, request: AiAssistantRequest): String = withContext(Dispatchers.IO) {
        val deviceId = request.connection.deviceId
            ?: throw IllegalStateException("Идентификатор парного устройства отсутствует")
        var lastError: Throwable? = null
        for (apiBase in candidateApiUrls(request.connection.apiUrl)) {
            val result = runCatching { askOnce(request, apiBase, deviceId) }
            if (result.isSuccess) return@withContext result.getOrThrow()
            lastError = result.exceptionOrNull()
            RouterSessionFailure.fromThrowable(lastError)?.let { failure ->
                RouterSessionEvents.report(context.applicationContext, failure)
                throw failure
            }
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
        val tlsPin = request.connection.tlsPinSha256
        val tlsSpki = request.connection.tlsSpkiSha256
        if (tlsPin.isNullOrBlank() && tlsSpki.isNullOrBlank())
            throw IllegalStateException("Отпечаток TLS роутера не сохранён. Выполните сопряжение заново.")
        val (connection, _) = RouterHttps.open(
            url,
            tlsPin,
            allowTrustOnFirstUse = false,
            tlsSpkiSha256 = tlsSpki
        )

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
            val deviceMac = request.connection.deviceMac
                ?: throw IllegalStateException("MAC парного устройства отсутствует. Выполните сопряжение заново.")
            connection.setRequestProperty("Authorization", "Bearer $token")
            connection.setRequestProperty("X-Sheepfold-Device-Id", deviceId)
            connection.setRequestProperty("X-Sheepfold-Device-Mac", deviceMac)
            connection.outputStream.use { output ->
                output.write(body.toByteArray(Charsets.UTF_8))
            }

            val responseBody = readBody(connection)
            if (connection.responseCode !in 200..299) {
                val responseJson = runCatching { JSONObject(responseBody) }.getOrNull()
                val errorCode = responseJson?.optString("error").orEmpty()
                RouterSessionFailure.fromHttp(connection.responseCode, errorCode)?.let { throw it }
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

    private fun readBody(connection: HttpsURLConnection): String {
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
        val httpsPort = parsed.port.takeIf { it > 0 } ?: 5201
        return listOf("https://$host:$httpsPort${parsed.path}")
    }

    private fun urlEncode(value: String): String =
        URLEncoder.encode(value, Charsets.UTF_8.name())
}
