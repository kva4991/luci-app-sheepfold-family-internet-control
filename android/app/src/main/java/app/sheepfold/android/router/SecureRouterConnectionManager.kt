package app.sheepfold.android.router

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONObject
import java.net.ConnectException
import java.net.SocketTimeoutException
import java.net.UnknownHostException
import java.net.URL
import java.net.URLEncoder
import javax.net.ssl.SSLException

/** Выполняет сопряжение только по HTTPS и закрепляет сертификат роутера при первом успехе. */
class SecureRouterConnectionManager {
    suspend fun connect(request: RouterConnectionRequest): RouterConnectionRequest = withContext(Dispatchers.IO) {
        require(!request.administratorLogin.isNullOrBlank()) { "Укажите логин администратора" }
        require(!request.temporaryPassword.isNullOrBlank()) { "Укажите временный код сопряжения" }

        var lastError: Throwable? = null
        for (apiUrl in candidateApiUrls(request.apiUrl)) {
            val result = runCatching { pair(request, apiUrl) }
            if (result.isSuccess) return@withContext result.getOrThrow()
            lastError = friendlyConnectionError(result.exceptionOrNull(), apiUrl)
        }
        throw lastError ?: IllegalStateException("Не удалось подключиться к роутеру Sheepfold")
    }

    fun parseQrPayload(payload: String): RouterConnectionRequest {
        val value = payload.trim()
        if (value.startsWith("{")) {
            val json = JSONObject(value)
            val rawUrl = json.optString("apiUrl")
                .ifBlank { json.optString("routerUrl") }
                .ifBlank { json.optString("routerAddress") }
                .ifBlank { json.optString("host") }
            val normalizedUrl = normalizeApiUrl(rawUrl)
            return RouterConnectionRequest(
                apiUrl = normalizedUrl,
                routerName = json.optString("routerName")
                    .ifBlank { json.optString("name") }
                    .ifBlank { URL(normalizedUrl).host },
                temporaryPassword = json.optString("temporaryPassword")
                    .ifBlank { json.optString("pairingToken") }
                    .ifBlank { json.optString("token") }
                    .ifBlank { json.optString("code") }
                    .ifBlank { null },
                administratorLogin = json.optString("administratorLogin")
                    .ifBlank { json.optString("adminLogin") }
                    .ifBlank { json.optString("login") }
                    .ifBlank { null }
            )
        }

        if (value.startsWith("SF1|")) {
            val fields = value.split('|')
                .drop(1)
                .mapNotNull { field ->
                    val separator = field.indexOf('=')
                    if (separator <= 0) null else field.substring(0, separator) to field.substring(separator + 1)
                }
                .toMap()
            val host = fields["h"].orEmpty()
            val port = fields["p"].orEmpty()
            val apiPath = fields["api"].orEmpty().ifBlank { "/cgi-bin/sheepfold-api" }
            val address = buildString {
                append(host)
                if (port.isNotBlank()) append(':').append(port)
                append(if (apiPath.startsWith('/')) apiPath else "/$apiPath")
            }
            return RouterConnectionRequest(
                apiUrl = normalizeApiUrl(address),
                routerName = fields["name"].orEmpty().ifBlank { host },
                temporaryPassword = fields["c"].orEmpty()
                    .ifBlank { fields["token"].orEmpty() }
                    .ifBlank { null },
                administratorLogin = fields["u"].orEmpty().ifBlank { null }
            )
        }

        throw IllegalArgumentException("QR-код не является кодом сопряжения Sheepfold")
    }

    fun manualRequest(address: String, login: String, code: String): RouterConnectionRequest {
        require(login.isNotBlank()) { "Укажите логин администратора" }
        require(code.isNotBlank()) { "Укажите временный код сопряжения" }
        val apiUrl = normalizeApiUrl(address)
        return RouterConnectionRequest(
            apiUrl = apiUrl,
            routerName = URL(apiUrl).host,
            temporaryPassword = code.trim(),
            administratorLogin = login.trim()
        )
    }

    private fun pair(request: RouterConnectionRequest, apiUrl: String): RouterConnectionRequest {
        val url = URL("${apiUrl.trimEnd('/')}/pair")
        require(url.protocol.equals("https", ignoreCase = true)) {
            "Сопряжение выполняется только по HTTPS"
        }
        val body = listOf(
            "login" to request.administratorLogin.orEmpty(),
            "code" to request.temporaryPassword.orEmpty(),
            "client" to "android"
        ).joinToString("&") { (key, value) ->
            "${encode(key)}=${encode(value)}"
        }
        val (connection, capturedPin) = RouterHttps.open(
            url = url,
            tlsPinSha256 = request.tlsPinSha256,
            allowTrustOnFirstUse = request.tlsPinSha256.isNullOrBlank()
        )
        try {
            connection.connectTimeout = 5000
            connection.readTimeout = 7000
            connection.requestMethod = "POST"
            connection.doOutput = true
            connection.instanceFollowRedirects = false
            connection.setRequestProperty("Content-Type", "application/x-www-form-urlencoded; charset=UTF-8")
            connection.setRequestProperty("Accept", "application/json")
            connection.setRequestProperty("User-Agent", "Sheepfold Android")
            connection.setRequestProperty("X-Sheepfold-Client", "android-admin-v1")
            connection.outputStream.use { it.write(body.toByteArray(Charsets.UTF_8)) }

            val responseCode = connection.responseCode
            val responseBody = (if (responseCode in 200..299) connection.inputStream else connection.errorStream)
                ?.bufferedReader(Charsets.UTF_8)
                ?.use { it.readText() }
                .orEmpty()
            val json = runCatching { JSONObject(responseBody) }.getOrNull()
            if (responseCode !in 200..299 || json?.optBoolean("paired", false) != true) {
                val errorCode = json?.optString("error").orEmpty()
                val serverMessage = json?.optString("message").orEmpty()
                throw IllegalStateException(pairingErrorMessage(errorCode, serverMessage, responseCode))
            }

            val token = json.optString("token").trim()
            require(token.isNotBlank()) { "Роутер не выдал административный токен" }
            val mac = json.optString("mac").trim()
            val deviceId = json.optString("deviceId").trim().ifBlank {
                mac.takeIf { it.matches(Regex("^([0-9A-Fa-f]{2}:){5}[0-9A-Fa-f]{2}$")) }
                    ?.let { "device_${it.replace(":", "").lowercase()}" }
                    .orEmpty()
            }
            require(deviceId.isNotBlank()) { "Роутер не вернул идентификатор парного устройства" }

            return RouterConnectionRequest(
                apiUrl = apiUrl,
                routerName = json.optString("routerName").ifBlank { request.routerName },
                administratorLogin = request.administratorLogin
            ).also { connected ->
                connected.bearerToken = token
                connected.deviceId = deviceId
                connected.deviceMac = mac
                connected.tlsPinSha256 = capturedPin?.value ?: request.tlsPinSha256
            }
        } finally {
            connection.disconnect()
        }
    }

    private fun normalizeApiUrl(rawAddress: String): String {
        val trimmed = rawAddress.trim().trimEnd('/')
        require(trimmed.isNotBlank()) { "Адрес роутера не указан" }
        val withScheme = if (
            trimmed.startsWith("http://", true) || trimmed.startsWith("https://", true)
        ) trimmed else "https://$trimmed"
        val parsed = URL(withScheme)
        require(parsed.protocol == "https" || parsed.protocol == "http") { "Поддерживается только HTTPS" }
        require(parsed.host.isNotBlank()) { "Некорректный адрес роутера" }
        val path = parsed.path.trimEnd('/').let { current ->
            if (current.endsWith("/cgi-bin/sheepfold-api")) current else "$current/cgi-bin/sheepfold-api"
        }.replace("//cgi-bin", "/cgi-bin")
        val port = parsed.port.takeIf { it > 0 }
        val host = if (parsed.host.contains(':')) "[${parsed.host}]" else parsed.host
        val scheme = if (parsed.protocol.equals("http", ignoreCase = true)) "https" else parsed.protocol
        return "$scheme://$host${port?.let { ":$it" }.orEmpty()}$path"
    }

    private fun candidateApiUrls(rawApiUrl: String): List<String> {
        val parsed = URL(normalizeApiUrl(rawApiUrl))
        val host = if (parsed.host.contains(':')) "[${parsed.host}]" else parsed.host
        val path = parsed.path
        val httpsPort = parsed.port.takeIf { it > 0 } ?: 5201
        return listOf("https://$host:$httpsPort$path")
    }

    // Backend-коды переводим здесь, чтобы QR-экран не показывал родителю null/undefined. §dscqr01
    private fun pairingErrorMessage(errorCode: String, serverMessage: String, responseCode: Int): String =
        when (errorCode.trim()) {
            "device_not_resolved" -> "Роутер Sheepfold найден, но пока не определил этот телефон в локальной сети. Подождите несколько секунд и повторите сканирование."
            "device_blocklisted" -> "Это устройство находится в чёрном списке и не может быть назначено администратору."
            "rate_limited" -> "Слишком много попыток подключения. Подождите несколько минут и попробуйте снова."
            "invalid_login" -> "В QR-коде указан некорректный логин администратора. Создайте новый код в LuCI."
            "invalid_code", "pairing_rejected" -> "Временный код недействителен или уже использован. Закройте и снова откройте настройки администратора в LuCI, затем отсканируйте новый QR-код."
            "token_generation_failed" -> "Роутер не смог завершить привязку устройства. Проверьте журнал Sheepfold в LuCI."
            else -> serverMessage.trim()
                .takeUnless { it.isBlank() || it.equals("undefined", true) || it.equals("null", true) }
                ?: "Роутер Sheepfold отклонил подключение (HTTP $responseCode). Создайте новый QR-код и повторите попытку."
        }

    private fun friendlyConnectionError(error: Throwable?, apiUrl: String): Throwable {
        if (error is IllegalStateException && !error.message.isNullOrBlank()) return error

        val host = runCatching { URL(apiUrl).let { "${it.host}:${it.port.takeIf { port -> port > 0 } ?: 443}" } }
            .getOrDefault("роутеру")
        val message = when (error) {
            is SocketTimeoutException -> "Роутер Sheepfold не ответил вовремя по адресу $host. Проверьте порт приложения в LuCI."
            is ConnectException -> "Не удалось подключиться к Sheepfold по адресу $host. Убедитесь, что сервис запущен на роутере."
            is UnknownHostException -> "Не удалось найти роутер Sheepfold в текущей сети."
            is SSLException -> "Не удалось установить защищённое соединение с роутером Sheepfold."
            else -> error?.message
                ?.takeUnless { it.isBlank() || it.equals("undefined", true) || it.equals("null", true) }
                ?: "Не удалось подключиться к роутеру Sheepfold по адресу $host."
        }
        return IllegalStateException(message, error)
    }

    private fun encode(value: String): String = URLEncoder.encode(value, Charsets.UTF_8.name())
}
