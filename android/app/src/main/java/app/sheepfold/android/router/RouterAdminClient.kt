package app.sheepfold.android.router

import android.content.Context
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONObject
import java.net.URL
import java.net.ConnectException
import java.net.NoRouteToHostException
import java.net.URLEncoder

data class RouterDevice(
    val id: String,
    val name: String,
    val ip: String,
    val mac: String,
    val group: String,
    val status: String,
    val isAdministrator: Boolean
)

data class RouterSnapshot(
    val routerName: String,
    val diagnostics: Map<String, String>,
    val globalBlocked: Boolean,
    val aiAvailable: Boolean
)

data class ChildAccessRequest(
    val id: String,
    val deviceId: String,
    val deviceName: String,
    val ip: String,
    val mac: String,
    val createdAt: Long
)

data class RouterAdminNotification(
    val id: String,
    val type: String,
    val title: String,
    val message: String,
    val createdAt: Long
)

/** Все команды выполняются на роутере с Bearer-токеном, а не в локальном состоянии APK. */
class RouterAdminClient(
    private val connection: RouterConnectionRequest,
    context: Context? = null
) {
    private val appContext = context?.applicationContext
    private var activeApiUrl = connection.apiUrl

    /** Подтверждает, что сохранённый токен уже связан с админским устройством на роутере. */
    suspend fun verifyAdministratorAccess() = withContext(Dispatchers.IO) {
        request("GET", "/router-info")
        Unit
    }

    suspend fun loadDevices(): List<RouterDevice> = withContext(Dispatchers.IO) {
        val json = request("GET", "/devices")
        val devices = json.optJSONArray("devices") ?: return@withContext emptyList()
        buildList {
            for (index in 0 until devices.length()) {
                val item = devices.optJSONObject(index) ?: continue
                add(
                    RouterDevice(
                        id = item.optString("id").ifBlank { item.optString("mac") },
                        name = item.optString("name").ifBlank { "Неизвестное устройство" },
                        ip = item.optString("ip"),
                        mac = item.optString("mac"),
                        group = item.optString("group"),
                        status = item.optString("status", "unknown"),
                        isAdministrator = item.optBoolean("adminDevice", false)
                    )
                )
            }
        }
    }

    suspend fun setGlobalBlock(enabled: Boolean) = withContext(Dispatchers.IO) {
        request(
            method = "POST",
            path = "/global-block",
            form = mapOf("enable" to if (enabled) "1" else "0", "confirm" to "1")
        )
    }

    suspend fun allowDevice(mac: String) = deviceAction("allow", mac)

    suspend fun blockDevice(mac: String) = deviceAction("block", mac)

    suspend fun grantTemporaryAccess(mac: String, minutes: Int = 30) = withContext(Dispatchers.IO) {
        request("POST", "/device/temp-access", mapOf("mac" to mac, "minutes" to minutes.toString()))
    }

    suspend fun submitFeedback(
        category: String,
        subject: String,
        message: String,
        contact: String,
        includeDiagnostics: Boolean
    ) = withContext(Dispatchers.IO) {
        request(
            method = "POST",
            path = "/feedback",
            form = mapOf(
                "category" to category,
                "subject" to subject,
                "message" to message,
                "contact" to contact,
                "includeDiagnostics" to if (includeDiagnostics) "1" else "0"
            )
        )
    }

    private suspend fun deviceAction(action: String, mac: String) = withContext(Dispatchers.IO) {
        request("POST", "/device/$action", mapOf("mac" to mac))
    }

    suspend fun loadRouterInfo(): RouterSnapshot = withContext(Dispatchers.IO) {
        val json = request("GET", "/router-info")
        val diagnosticsObject = json.optJSONObject("diagnostics")
        val diagnostics = buildMap {
            if (diagnosticsObject != null) {
                val keys = diagnosticsObject.keys()
                while (keys.hasNext()) {
                    val key = keys.next()
                    put(key, diagnosticsObject.optString(key))
                }
            }
        }
        RouterSnapshot(
            routerName = json.optString("routerName", connection.routerName),
            diagnostics = diagnostics,
            globalBlocked = diagnostics["globalBlocked"] == "1",
            aiAvailable = json.optJSONObject("capabilities")
                ?.optBoolean("aiAssistant", false)
                ?: false
        )
    }

    suspend fun loadChildAccessRequests(): List<ChildAccessRequest> = withContext(Dispatchers.IO) {
        val json = request("GET", "/access-requests")
        val requests = json.optJSONArray("requests") ?: return@withContext emptyList()
        buildList {
            for (index in 0 until requests.length()) {
                val item = requests.optJSONObject(index) ?: continue
                add(
                    ChildAccessRequest(
                        id = item.optString("id"),
                        deviceId = item.optString("deviceId"),
                        deviceName = item.optString("deviceName").ifBlank { "Неизвестное устройство" },
                        ip = item.optString("ip"),
                        mac = item.optString("mac"),
                        createdAt = item.optLong("createdAt")
                    )
                )
            }
        }
    }

    suspend fun loadAdminNotifications(): List<RouterAdminNotification> = withContext(Dispatchers.IO) {
        val json = request("GET", "/notifications")
        val notifications = json.optJSONArray("notifications") ?: return@withContext emptyList()
        buildList {
            for (index in 0 until notifications.length()) {
                val item = notifications.optJSONObject(index) ?: continue
                val id = item.optString("id")
                val message = item.optString("message")
                if (id.isBlank() || message.isBlank()) continue
                add(
                    RouterAdminNotification(
                        id = id,
                        type = item.optString("type", "system"),
                        title = item.optString("title", "Sheepfold"),
                        message = message,
                        createdAt = item.optLong("createdAt")
                    )
                )
            }
        }
    }

    private fun request(
        method: String,
        path: String,
        form: Map<String, String> = emptyMap()
    ): JSONObject {
        val firstAttempt = runCatching { requestOnce(activeApiUrl, method, path, form) }
        if (firstAttempt.isSuccess) return firstAttempt.getOrThrow()

        val firstError = firstAttempt.exceptionOrNull()
        reportSessionFailure(firstError)?.let { throw it }
        if (appContext != null && endpointCanBeRecovered(firstError)) {
            val recoveredApiUrl = RouterEndpointRecovery.discoverAndStore(
                appContext,
                connection,
                activeApiUrl
            )
            if (recoveredApiUrl != null) {
                activeApiUrl = recoveredApiUrl
                val recoveredAttempt = runCatching { requestOnce(activeApiUrl, method, path, form) }
                if (recoveredAttempt.isSuccess) return recoveredAttempt.getOrThrow()
                val recoveredError = recoveredAttempt.exceptionOrNull()
                reportSessionFailure(recoveredError)?.let { throw it }
                throw recoveredError ?: IllegalStateException("Роутер недоступен")
            }
        }

        throw firstError ?: IllegalStateException("Роутер недоступен")
    }

    private fun requestOnce(
        apiBase: String,
        method: String,
        path: String,
        form: Map<String, String>
    ): JSONObject {
        val url = URL("${apiBase.trimEnd('/')}$path")
        val tlsPin = connection.tlsPinSha256
        val tlsSpki = connection.tlsSpkiSha256
        if (tlsPin.isNullOrBlank() && tlsSpki.isNullOrBlank())
            throw IllegalStateException("Отпечаток TLS роутера не сохранён. Выполните сопряжение заново.")
        val (http, _) = RouterHttps.open(
            url,
            tlsPin,
            allowTrustOnFirstUse = false,
            tlsSpkiSha256 = tlsSpki
        )
        try {
            http.connectTimeout = 5000
            http.readTimeout = 15000
            http.requestMethod = method
            http.instanceFollowRedirects = false
            http.setRequestProperty("Accept", "application/json")
            http.setRequestProperty("X-Sheepfold-Client", "android-admin-v1")
            val bearer = connection.bearerToken
                ?: throw IllegalStateException("Административный токен отсутствует")
            val deviceId = connection.deviceId
                ?: throw IllegalStateException("Идентификатор парного устройства отсутствует")
            val deviceMac = connection.deviceMac
                ?: throw IllegalStateException("MAC парного устройства отсутствует. Выполните сопряжение заново.")
            http.setRequestProperty("Authorization", "Bearer $bearer")
            http.setRequestProperty("X-Sheepfold-Device-Id", deviceId)
            http.setRequestProperty("X-Sheepfold-Device-Mac", deviceMac)
            if (method == "POST") {
                val body = form.entries.joinToString("&") { (key, value) ->
                    "${encode(key)}=${encode(value)}"
                }
                http.doOutput = true
                http.setRequestProperty("Content-Type", "application/x-www-form-urlencoded; charset=UTF-8")
                http.outputStream.use { it.write(body.toByteArray(Charsets.UTF_8)) }
            }

            val code = http.responseCode
            val body = (if (code in 200..299) http.inputStream else http.errorStream)
                ?.bufferedReader(Charsets.UTF_8)
                ?.use { it.readText() }
                .orEmpty()
            val json = runCatching { JSONObject(body) }.getOrNull()
            if (code !in 200..299) {
                val errorCode = json?.optString("error").orEmpty()
                val serverMessage = json?.optString("message")
                    ?.ifBlank { errorCode }
                    .orEmpty()
                    .ifBlank { body.ifBlank { "HTTP $code" } }
                RouterSessionFailure.fromHttp(code, errorCode)?.let { throw it }
                throw RouterHttpException(
                    code,
                    errorCode,
                    serverMessage
                )
            }
            return json ?: throw IllegalStateException("Роутер вернул некорректный JSON")
        } finally {
            http.disconnect()
        }
    }

    private fun endpointCanBeRecovered(error: Throwable?): Boolean =
        error is ConnectException ||
            error is NoRouteToHostException ||
            error is RouterHttpException && error.statusCode == 404

    private fun reportSessionFailure(error: Throwable?): RouterSessionException? =
        RouterSessionFailure.fromThrowable(error)?.also { failure ->
            appContext?.let { RouterSessionEvents.report(it, failure) }
        }

    private fun encode(value: String): String = URLEncoder.encode(value, Charsets.UTF_8.name())
}

private class RouterHttpException(
    val statusCode: Int,
    val errorCode: String,
    message: String
) : IllegalStateException(message)
