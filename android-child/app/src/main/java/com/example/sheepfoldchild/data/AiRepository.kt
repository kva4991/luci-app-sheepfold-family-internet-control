package com.example.sheepfoldchild.data

import android.content.Context
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.withContext
import org.json.JSONArray
import org.json.JSONObject
import java.io.OutputStreamWriter
import java.net.HttpURLConnection
import java.net.URL

private val Context.aiDataStore by preferencesDataStore(name = "child_prefs")

/**
 * Отправляет вопрос ребёнка на backend роутера (POST /cgi-bin/sheepfold-api/ai/ask).
 *
 * Все запросы ребёнка автоматически дополняются системным контекстом:
 *   «Клиент [deviceName], IP: [ip], MAC: [mac], режим: [accessMode],
 *    интернет: [internetState], доступ до: [accessEndsAt]»
 *
 * MAC и IP определяются на роутере по REMOTE_ADDR — клиент не передаёт их явно.
 * Чтобы backend получил эти данные, ViewModel передаёт поля из /client-status
 * в поле contextData, а backend подставляет их в системный промпт.
 */
class AiRepository(private val context: Context) {

    companion object {
        private val KEY_ROUTER_URL = stringPreferencesKey("router_base_url")
        private const val AI_ENDPOINT = "/cgi-bin/sheepfold-api/ai/ask"
        private const val TIMEOUT_MS = 30_000
    }

    suspend fun getRouterBaseUrl(): String? =
        context.aiDataStore.data.first()[KEY_ROUTER_URL]

    /**
     * @param question  Вопрос от ребёнка
     * @param status    Последний полученный статус устройства (из /client-status)
     * @param history   Предыдущие сообщения [{ "role": "user/assistant", "content": "..." }]
     */
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
            conn.setRequestProperty("Content-Type", "application/json")
            conn.setRequestProperty("Accept", "application/json")

            // Системный контекст о клиенте — добавляется автоматически к каждому запросу
            val clientContext = buildClientContext(status)

            val historyArray = JSONArray().apply {
                history.forEach { msg ->
                    put(JSONObject().apply {
                        put("role", msg.role)
                        put("content", msg.content)
                    })
                }
            }

            val body = JSONObject().apply {
                put("question", question)
                put("clientContext", clientContext) // backend добавляет это в системный промпт
                put("contextFlags", JSONArray().apply { put("client_status") })
                put("history", historyArray)
            }.toString()

            OutputStreamWriter(conn.outputStream).use { it.write(body) }

            val code = conn.responseCode
            val responseBody = conn.inputStream.bufferedReader().readText()
            conn.disconnect()

            if (code != 200) return@withContext Result.failure(Exception("HTTP $code"))

            val root = JSONObject(responseBody)
            if (!root.optBoolean("ok", false)) {
                val msg = root.optJSONObject("error")?.optString("message") ?: "Ошибка AI"
                return@withContext Result.failure(Exception(msg))
            }
            val answer = root.optJSONObject("data")?.optString("answer")
                ?: return@withContext Result.failure(Exception("Пустой ответ"))

            Result.success(answer)
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    /**
     * Строит строку-контекст, которую backend вставляет в системный промпт AI.
     * Пример: «Клиент Телефон Маши, режим: scheduled, интернет: enabled,
     *           осталось 27 мин, доступ до 21:00»
     * MAC и IP добавляются backend-ом из REMOTE_ADDR — не передаются клиентом.
     */
    private fun buildClientContext(status: ClientStatusData?): String {
        if (status == null) return "Статус устройства неизвестен."
        val sb = StringBuilder()
        status.deviceName?.let { sb.append("Клиент: $it. ") }
        sb.append("Интернет: ${status.internetState}. ")
        status.accessMode?.let { sb.append("Режим доступа: $it. ") }
        status.minutesRemaining?.let { sb.append("Осталось: $it мин. ") }
        status.accessEndsAt?.let {
            try { sb.append("Доступ до: ${it.substring(11, 16)}. ") } catch (_: Exception) {}
        }
        status.message?.let { sb.append("Сообщение роутера: $it") }
        return sb.toString().trim()
    }
}

data class ChatMessage(val role: String, val content: String) // role: "user" | "assistant"
