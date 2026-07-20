package app.sheepfold.android.router

import app.sheepfold.android.diagnostics.DiagnosticLog
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONObject
import java.net.ConnectException
import java.net.SocketTimeoutException
import java.net.UnknownHostException
import java.net.URL
import java.net.URLEncoder
import javax.net.ssl.SSLException

/** Выполняет сопряжение по HTTPS, закрепляет TLS-ключ и локальный IP роутера. */
class SecureRouterConnectionManager {
    suspend fun connect(request: RouterConnectionRequest): RouterConnectionRequest = withContext(Dispatchers.IO) {
        require(!request.administratorLogin.isNullOrBlank()) { "Укажите логин администратора" }
        require(!request.temporaryPassword.isNullOrBlank()) { "Укажите временный код сопряжения" }

        var lastError: Throwable? = null
        val allowHostname = !request.tlsSpkiSha256.isNullOrBlank()
        val candidates = candidateApiUrls(request.apiUrl, allowHostname)
        DiagnosticLog.info(
            "pair.connect.started",
            "candidateCount" to candidates.size,
            "spki" to !request.tlsSpkiSha256.isNullOrBlank(),
            "legacyPin" to !request.tlsPinSha256.isNullOrBlank()
        )
        for (apiUrl in candidates) {
            val startedAt = System.nanoTime()
            DiagnosticLog.info("pair.candidate.started", "api" to apiUrl)
            val result = runCatching { pair(request, apiUrl) }
            if (result.isSuccess) {
                DiagnosticLog.info(
                    "pair.candidate.succeeded",
                    "api" to apiUrl,
                    "durationMs" to elapsedMs(startedAt)
                )
                return@withContext result.getOrThrow()
            }
            DiagnosticLog.error(
                "pair.candidate.failed",
                result.exceptionOrNull(),
                "api" to apiUrl,
                "durationMs" to elapsedMs(startedAt)
            )
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
            ).also { request ->
                request.tlsSpkiSha256 = parseSpkiPin(
                    json.optString("tlsSpkiSha256").ifBlank { json.optString("spkiSha256") },
                    required = false
                )
                DiagnosticLog.info(
                    "pair.qr.parsed",
                    "format" to "json",
                    "api" to normalizedUrl,
                    "spki" to !request.tlsSpkiSha256.isNullOrBlank()
                )
            }
        }

        if (value.startsWith("SF1|") || value.startsWith("SF2|")) {
            val qrVersion = value.substringBefore('|')
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
                append(if (host.contains(':') && !host.startsWith('[')) "[$host]" else host)
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
            ).also { request ->
                request.tlsSpkiSha256 = parseSpkiPin(fields["spki"].orEmpty(), required = qrVersion == "SF2")
                DiagnosticLog.info(
                    "pair.qr.parsed",
                    "format" to qrVersion,
                    "api" to request.apiUrl,
                    "spki" to !request.tlsSpkiSha256.isNullOrBlank()
                )
            }
        }

        DiagnosticLog.warn("pair.qr.rejected", "reason" to "unsupported_format")
        throw IllegalArgumentException("QR-код не является кодом сопряжения Sheepfold")
    }

    fun manualRequest(address: String, login: String, code: String): RouterConnectionRequest {
        require(login.isNotBlank()) { "Укажите логин администратора" }
        require(code.isNotBlank()) { "Укажите временный код сопряжения" }
        val apiUrl = normalizeApiUrl(address)
        require(LocalRouterAddress.isIpLiteral(URL(apiUrl).host)) {
            "Для ручного подключения укажите IP-адрес роутера"
        }
        return RouterConnectionRequest(
            apiUrl = apiUrl,
            routerName = URL(apiUrl).host,
            temporaryPassword = code.trim(),
            administratorLogin = login.trim()
        )
    }

    private suspend fun pair(request: RouterConnectionRequest, apiUrl: String): RouterConnectionRequest {
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
            allowTrustOnFirstUse = request.tlsPinSha256.isNullOrBlank() && request.tlsSpkiSha256.isNullOrBlank(),
            tlsSpkiSha256 = request.tlsSpkiSha256
        )
        try {
            val requestStartedAt = System.nanoTime()
            connection.connectTimeout = 5000
            // Backend атомарно выдаёт права и токен, а на слабом роутере UCI commit
            // может занять больше нескольких секунд. Таймаут остаётся ниже CGI-лимита
            // uhttpd (30 секунд), чтобы APK успел получить однозначный ответ. §pairlat1
            connection.readTimeout = 20000
            connection.requestMethod = "POST"
            connection.doOutput = true
            connection.instanceFollowRedirects = false
            connection.setRequestProperty("Content-Type", "application/x-www-form-urlencoded; charset=UTF-8")
            connection.setRequestProperty("Accept", "application/json")
            connection.setRequestProperty("User-Agent", "Sheepfold Android")
            connection.setRequestProperty("X-Sheepfold-Client", "android-admin-v1")
            DiagnosticLog.info(
                "pair.http.sending",
                "url" to url.toString(),
                "contentBytes" to body.toByteArray(Charsets.UTF_8).size
            )
            connection.outputStream.use { it.write(body.toByteArray(Charsets.UTF_8)) }

            val responseCode = connection.responseCode
            val responseBody = (if (responseCode in 200..299) connection.inputStream else connection.errorStream)
                ?.bufferedReader(Charsets.UTF_8)
                ?.use { it.readText() }
                .orEmpty()
            val json = runCatching { JSONObject(responseBody) }.getOrNull()
            DiagnosticLog.info(
                "pair.http.response",
                "status" to responseCode,
                "durationMs" to elapsedMs(requestStartedAt),
                "bodyBytes" to responseBody.toByteArray(Charsets.UTF_8).size,
                "errorCode" to json?.optString("error").orEmpty()
            )
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
            DiagnosticLog.info(
                "pair.response.validated",
                "deviceId" to deviceId,
                "routerName" to json.optString("routerName")
            )

            val connected = RouterConnectionRequest(
                apiUrl = apiUrl,
                routerName = json.optString("routerName").ifBlank { request.routerName },
                administratorLogin = request.administratorLogin
            ).also { connected ->
                connected.bearerToken = token
                connected.deviceId = deviceId
                connected.deviceMac = mac
                connected.tlsPinSha256 = capturedPin?.value ?: request.tlsPinSha256
                connected.tlsSpkiSha256 = request.tlsSpkiSha256
            }

            try {
                // Ответ /pair ещё не доказывает, что UCI-права попали в основной
                // конфиг. До сохранения credential проверяем его обычным защищённым
                // запросом, иначе APK может открыть главное окно без привязки. §pairtx1
                RouterAdminClient(connected).verifyAdministratorAccess()
            } catch (error: Exception) {
                DiagnosticLog.error("pair.authorization.failed", error, "deviceId" to deviceId)
                throw IllegalStateException(
                    "Роутер выдал токен, но не подтвердил привязку телефона к администратору. " +
                        "Закройте и снова откройте настройки администратора в LuCI, затем отсканируйте новый QR-код.",
                    error
                )
            }
            DiagnosticLog.info("pair.authorization.succeeded", "deviceId" to deviceId)
            return connected
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

    private fun candidateApiUrls(rawApiUrl: String, allowHostname: Boolean): List<String> {
        val parsed = URL(normalizeApiUrl(rawApiUrl))
        val path = parsed.path
        val httpsPort = parsed.port.takeIf { it > 0 } ?: 5201
        return LocalRouterAddress.resolvedUrlHosts(parsed.host, allowHostname).map { host ->
            "https://$host:$httpsPort$path"
        }
    }

    // Backend-коды переводим здесь, чтобы QR-экран не показывал родителю null/undefined. §dscqr01
    private fun pairingErrorMessage(errorCode: String, serverMessage: String, responseCode: Int): String =
        when (errorCode.trim()) {
            "device_not_resolved" -> "Роутер Sheepfold найден, но пока не определил этот телефон в локальной сети. Подождите несколько секунд и повторите сканирование."
            "device_blocklisted" -> "Это устройство находится в чёрном списке и не может быть назначено администратору."
            "pairing_busy" -> "Роутер уже выполняет привязку этого администратора. Подождите несколько секунд и отсканируйте новый QR-код."
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
        val pinMismatch = generateSequence(error) { it.cause }
            .mapNotNull { it.message }
            .any { message ->
                message.contains("отпечатком", ignoreCase = true) ||
                    message.contains("публичный ключ роутера", ignoreCase = true)
            }
        val message = when (error) {
            is SocketTimeoutException -> "Роутер Sheepfold найден по адресу $host, но не успел завершить привязку. Откройте настройки администратора в LuCI, создайте новый QR-код и повторите попытку."
            is ConnectException -> "Не удалось подключиться к Sheepfold по адресу $host. Убедитесь, что сервис запущен на роутере."
            is UnknownHostException -> "Не удалось найти роутер Sheepfold в текущей сети."
            is SSLException -> if (pinMismatch) {
                "Публичный TLS-ключ роутера не совпал с QR-кодом. Не продолжайте подключение: откройте настройки администратора на доверенном роутере и создайте новый QR-код."
            } else {
                "Не удалось установить защищённое соединение с роутером Sheepfold."
            }
            else -> error?.message
                ?.takeUnless { it.isBlank() || it.equals("undefined", true) || it.equals("null", true) }
                ?: "Не удалось подключиться к роутеру Sheepfold по адресу $host."
        }
        return IllegalStateException(message, error)
    }

    private fun parseSpkiPin(rawPin: String, required: Boolean): String? {
        val pin = rawPin.trim().lowercase()
        if (pin.isBlank()) {
            require(!required) { "Защищённый QR-код не содержит отпечаток публичного ключа роутера" }
            return null
        }
        require(pin.matches(Regex("^[0-9a-f]{64}$"))) {
            "QR-код содержит некорректный отпечаток публичного ключа роутера"
        }
        return pin
    }

    private fun encode(value: String): String = URLEncoder.encode(value, Charsets.UTF_8.name())

    private fun elapsedMs(startedAt: Long): Long = (System.nanoTime() - startedAt) / 1_000_000L
}
