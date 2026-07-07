package app.sheepfold.android.router

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONObject
import java.net.HttpURLConnection
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
        val apiUrl = "${request.connection.apiUrl.trimEnd('/')}/ai-assistant"
        val body = listOf(
            "provider" to request.provider,
            "model" to request.model,
            "message" to request.message,
            "includeInfo" to if (request.includeRouterInfo) "1" else "0",
            "includeLogs" to if (request.includeProgramLog) "1" else "0",
            "googleAccount" to request.googleAccount
        ).joinToString("&") { (key, value) ->
            "${urlEncode(key)}=${urlEncode(value)}"
        }
        val connection = URL(apiUrl).openConnection() as HttpURLConnection

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
            request.connection.bearerToken?.takeIf { it.isNotBlank() }?.let { token ->
                connection.setRequestProperty("Authorization", "Bearer $token")
            }
            connection.outputStream.use { output ->
                output.write(body.toByteArray(Charsets.UTF_8))
            }

            val responseBody = readBody(connection)
            if (connection.responseCode !in 200..299) {
                throw IllegalStateException(apiError(responseBody).ifBlank {
                    "Роутер не смог получить ответ ИИ."
                })
            }

            extractAnswer(responseBody)
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

    private fun urlEncode(value: String): String =
        URLEncoder.encode(value, Charsets.UTF_8.name())
}
