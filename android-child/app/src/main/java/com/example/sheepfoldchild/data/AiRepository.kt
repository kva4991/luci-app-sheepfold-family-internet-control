package com.example.sheepfoldchild.data

import android.content.Context
import androidx.datastore.preferences.core.stringPreferencesKey
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.withContext
import org.json.JSONObject
import java.io.OutputStreamWriter
import java.net.HttpURLConnection
import java.net.URL
import java.net.URLEncoder

/**
 * Отправляет вопрос на фактический backend Sheepfold:
 * POST /cgi-bin/sheepfold-api/ai-assistant, application/x-www-form-urlencoded.
 *
 * Провайдер и модель выбираются только на роутере. Детское приложение не
 * запрашивает диагностику или журналы и поэтому не нуждается в токене админа.
 */
class AiRepository(private val context: Context) {

    companion object {
        private val KEY_ROUTER_URL = stringPreferencesKey("router_base_url")
        private const val AI_ENDPOINT = "/cgi-bin/sheepfold-api/ai-assistant"
        private const val TIMEOUT_MS = 30_000
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
        try {
            val url = URL("${baseUrl.trimEnd('/')}$AI_ENDPOINT")
            val conn = url.openConnection() as HttpURLConnection
            conn.requestMethod = "POST"
            conn.doOutput = true
            conn.connectTimeout = TIMEOUT_MS
            conn.readTimeout = TIMEOUT_MS
            conn.setRequestProperty("Content-Type", "application/x-www-form-urlencoded; charset=UTF-8")
            conn.setRequestProperty("Accept", "application/json")

            val prompt = buildPrompt(question, status, history)
            val body = "message=${URLEncoder.encode(prompt, Charsets.UTF_8.name())}"
            OutputStreamWriter(conn.outputStream, Charsets.UTF_8).use { it.write(body) }

            val code = conn.responseCode
            val responseBody = (if (code in 200..299) conn.inputStream else conn.errorStream)
                ?.bufferedReader(Charsets.UTF_8)
                ?.use { it.readText() }
                .orEmpty()
            conn.disconnect()

            if (code !in 200..299) {
                return@withContext Result.failure(Exception(extractError(responseBody, code)))
            }

            val answer = extractAnswer(responseBody)
                ?: return@withContext Result.failure(Exception("Провайдер вернул пустой ответ"))
            Result.success(answer)
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    private fun buildPrompt(
        question: String,
        status: ClientStatusData?,
        history: List<ChatMessage>
    ): String {
        val result = StringBuilder()
        val recentHistory = history.takeLast(8)
        if (recentHistory.isNotEmpty()) {
            result.append("Предыдущий разговор:\n")
            recentHistory.forEach { message ->
                val role = if (message.role == "assistant") "Помощник" else "Пользователь"
                result.append(role).append(": ").append(message.content.take(800)).append('\n')
            }
            result.append('\n')
        }
        result.append("Контекст устройства: ").append(buildClientContext(status)).append("\n\n")
        result.append("Вопрос: ").append(question.trim())
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

    private fun buildClientContext(status: ClientStatusData?): String {
        if (status == null) return "статус неизвестен"
        return buildString {
            status.deviceName?.let { append("устройство $it; ") }
            append("интернет ${status.internetState}; ")
            status.accessMode?.let { append("режим $it; ") }
            status.minutesRemaining?.let { append("осталось $it мин.; ") }
            status.accessEndsAt?.let { append("изменение доступа $it; ") }
            status.message?.let { append(it) }
        }.trim().trimEnd(';')
    }
}

data class ChatMessage(val role: String, val content: String)
