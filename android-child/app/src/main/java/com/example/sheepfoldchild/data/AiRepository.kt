package com.example.sheepfoldchild.data

import android.content.Context
import androidx.datastore.preferences.core.stringPreferencesKey
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.withContext
import org.json.JSONObject
import java.io.OutputStreamWriter
import java.net.URL
import java.net.URLEncoder
import javax.net.ssl.HttpsURLConnection

/** Отправляет детский запрос на AI backend Sheepfold через роутер. */
class AiRepository(private val context: Context) {

    companion object {
        private val KEY_ROUTER_URL = stringPreferencesKey("router_base_url")
        private const val AI_ENDPOINT = "/cgi-bin/sheepfold-api/ai-assistant"
        private const val TIMEOUT_MS = 30_000
        private const val CONSENT_VERSION = "child-ai-v1"
        private const val DEFAULT_HTTPS_PORT = 5201
    }

    suspend fun getRouterBaseUrl(): String? =
        context.aiDataStore.data.first()[KEY_ROUTER_URL]
            ?: context.clientDataStore.data.first()[KEY_ROUTER_URL]

    suspend fun ask(
        baseUrl: String,
        question: String,
        status: ClientStatusData?,
        history: List<ChatMessage>
    ): Result<String> = withContext(Dispatchers.IO) {
        val deviceId = status?.deviceId?.trim().orEmpty()
        val clientRole = status?.clientRole?.trim().orEmpty()
        if (deviceId.isBlank() || clientRole.isBlank()) {
            return@withContext Result.failure(
                IllegalStateException("Роутер ещё не подтвердил идентификатор и роль устройства")
            )
        }
        val checkedStatus = status
            ?: return@withContext Result.failure(
                IllegalStateException("Роутер ещё не подтвердил статус устройства")
            )
        if (status.productStatus.personalGroupRequired) {
            return@withContext Result.failure(
                IllegalStateException("Попросите родителя поместить ваше устройство в вашу личную группу, тогда ИИ-помощник откроется.")
            )
        }

        val formBody = listOf(
            "message" to buildPrompt(question, checkedStatus, history),
            "deviceId" to deviceId,
            "clientRole" to clientRole,
            "isAdministrator" to if (checkedStatus.isAdministrator) "1" else "0",
            "consentVersion" to CONSENT_VERSION
        ).joinToString("&") { (key, value) ->
            "${encode(key)}=${encode(value)}"
        }

        askOnce(preferredBaseUrl(baseUrl), formBody)
    }

    private fun preferredBaseUrl(rawUrl: String): String = candidateBaseUrls(rawUrl).first()

    private fun askOnce(baseUrl: String, formBody: String): Result<String> {
        var connection: HttpsURLConnection? = null
        return try {
            val url = URL("${baseUrl.trimEnd('/')}$AI_ENDPOINT")
            if (url.protocol != "https") {
                return Result.failure(IllegalArgumentException("Поддерживается только HTTPS"))
            }

            val (https, capturedPin) = ChildRouterHttps.open(context, url)
            connection = https
            connection.requestMethod = "POST"
            connection.doOutput = true
            connection.connectTimeout = TIMEOUT_MS
            connection.readTimeout = TIMEOUT_MS
            connection.instanceFollowRedirects = false
            connection.setRequestProperty("Content-Type", "application/x-www-form-urlencoded; charset=UTF-8")
            connection.setRequestProperty("Accept", "application/json")
            connection.setRequestProperty("X-Sheepfold-Client", "android-child-v1")
            OutputStreamWriter(connection.outputStream, Charsets.UTF_8).use { it.write(formBody) }

            val code = connection.responseCode
            val responseBody = (if (code in 200..299) connection.inputStream else connection.errorStream)
                ?.bufferedReader(Charsets.UTF_8)
                ?.use { it.readText() }
                .orEmpty()

            if (code !in 200..299) {
                Result.failure(Exception(extractError(responseBody, code)))
            } else {
                val answer = extractAnswer(responseBody)
                if (answer.isNullOrBlank()) {
                    Result.failure(Exception("Провайдер вернул пустой ответ"))
                } else {
                    ChildRouterHttps.commitCapturedPin(context, url, capturedPin)
                    Result.success(answer)
                }
            }
        } catch (error: Exception) {
            Result.failure(error)
        } finally {
            connection?.disconnect()
        }
    }

    private fun candidateBaseUrls(rawBaseUrl: String): List<String> {
        val parsed = parseRouterUrl(rawBaseUrl)
        val host = if (parsed.host.contains(':')) "[${parsed.host}]" else parsed.host
        val path = parsed.path
            .trimEnd('/')
            .removeSuffix("/cgi-bin/sheepfold-api/ai-assistant")
            .removeSuffix("/cgi-bin/sheepfold-api")
        val explicitPort = parsed.port.takeIf { it > 0 }
        val httpsPort = explicitPort ?: DEFAULT_HTTPS_PORT
        return listOf("https://$host:$httpsPort$path".trimEnd('/'))
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

    private fun encode(value: String): String =
        URLEncoder.encode(value, Charsets.UTF_8.name())

    private fun buildPrompt(
        question: String,
        status: ClientStatusData,
        history: List<ChatMessage>
    ): String {
        val result = StringBuilder()
        val recentHistory = history.takeLast(8)
        if (recentHistory.isNotEmpty()) {
            result.append("Предыдущий разговор:\n")
            recentHistory.forEach { message ->
                val role = if (message.role == "assistant") "Помощник" else "Ребёнок"
                result.append(role).append(": ").append(message.content.take(800)).append('\n')
            }
            result.append('\n')
        }
        result.append("Безопасный контекст доступа: ").append(buildClientContext(status)).append("\n\n")
        result.append("Вопрос ребёнка: ").append(question.trim())
        return result.toString().take(12_000)
    }

    private fun extractAnswer(json: String): String? {
        val root = JSONObject(json)
        root.optJSONObject("data")?.optString("answer")
            ?.takeIf { it.isNotBlank() }
            ?.let { return it }
        root.optJSONArray("choices")
            ?.optJSONObject(0)
            ?.optJSONObject("message")
            ?.optString("content")
            ?.takeIf { it.isNotBlank() }
            ?.let { return it }
        root.optJSONArray("candidates")
            ?.optJSONObject(0)
            ?.optJSONObject("content")
            ?.optJSONArray("parts")
            ?.optJSONObject(0)
            ?.optString("text")
            ?.takeIf { it.isNotBlank() }
            ?.let { return it }
        return null
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

    private fun buildClientContext(status: ClientStatusData): String = buildString {
        append("идентификатор ").append(status.deviceId).append("; ")
        append("роль ").append(status.clientRole).append("; ")
        append("интернет ").append(status.internetState).append("; ")
        status.accessMode?.let { append("режим ").append(it).append("; ") }
        status.minutesRemaining?.let { append("осталось ").append(it).append(" мин.; ") }
        status.message?.let { append(it) }
    }.trim().trimEnd(';')
}

data class ChatMessage(val role: String, val content: String)
