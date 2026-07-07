package com.example.sheepfoldchild.data

import android.content.Context
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.withContext
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL

private val Context.dataStore by preferencesDataStore(name = "child_prefs")

class ClientStatusRepository(private val context: Context) {

    companion object {
        private val KEY_ROUTER_URL = stringPreferencesKey("router_base_url")
        private const val ENDPOINT = "/cgi-bin/sheepfold-api/client-status"
        private const val TIMEOUT_MS = 5000
    }

    suspend fun getRouterBaseUrl(): String? {
        return context.dataStore.data.first()[KEY_ROUTER_URL]
    }

    suspend fun saveRouterBaseUrl(url: String) {
        context.dataStore.edit { prefs ->
            prefs[KEY_ROUTER_URL] = url.trimEnd('/')
        }
    }

    /**
     * Запрашивает статус у роутера.
     * Клиент не передаёт MAC — роутер определяет его по REMOTE_ADDR.
     */
    suspend fun fetchClientStatus(baseUrl: String): Result<ClientStatusResponse> =
        withContext(Dispatchers.IO) {
            try {
                val url = URL("${baseUrl.trimEnd('/')}$ENDPOINT")
                val conn = url.openConnection() as HttpURLConnection
                conn.connectTimeout = TIMEOUT_MS
                conn.readTimeout = TIMEOUT_MS
                conn.requestMethod = "GET"
                conn.setRequestProperty("Accept", "application/json")

                val code = conn.responseCode
                val body = conn.inputStream.bufferedReader().readText()
                conn.disconnect()

                if (code != 200) {
                    return@withContext Result.failure(
                        Exception("HTTP $code")
                    )
                }

                Result.success(parseResponse(body))
            } catch (e: Exception) {
                Result.failure(e)
            }
        }

    private fun parseResponse(json: String): ClientStatusResponse {
        val root = JSONObject(json)
        val ok = root.optBoolean("ok", false)
        val apiVersion = root.optString("apiVersion", null)
        val serverTime = root.optString("serverTime", null)

        val data = if (root.has("data") && !root.isNull("data")) {
            val d = root.getJSONObject("data")
            ClientStatusData(
                deviceName = d.optString("deviceName", null),
                internetState = d.optString("internetState", "unknown"),
                accessMode = d.optString("accessMode", null),
                accessEndsAt = d.optString("accessEndsAt", null),
                minutesRemaining = if (d.has("minutesRemaining") && !d.isNull("minutesRemaining"))
                    d.getInt("minutesRemaining") else null,
                message = d.optString("message", null)
            )
        } else null

        val error = if (root.has("error") && !root.isNull("error")) {
            val e = root.getJSONObject("error")
            ApiError(
                code = e.optString("code", "unknown"),
                message = e.optString("message", "Неизвестная ошибка")
            )
        } else null

        return ClientStatusResponse(ok, apiVersion, serverTime, data, error)
    }
}
