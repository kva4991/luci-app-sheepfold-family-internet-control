package app.sheepfold.android.router

import android.content.Context
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONArray
import org.json.JSONObject
import java.net.ConnectException
import java.net.NoRouteToHostException
import java.net.URL
import java.net.URLEncoder

/** Безопасная проекция устройства, которую возвращает авторизованный router API. */
data class RouterDevice(
    val id: String,
    val name: String,
    val ip: String,
    val mac: String,
    val group: String,
    val status: String,
    val isAdministrator: Boolean
)

data class RouterWifiModule(
    val name: String,
    val status: String,
    val type: String,
    val path: String,
    val band: String,
    val channel: String,
    val country: String,
    val mode: String
)

data class RouterSnapshot(
    val routerName: String,
    val diagnostics: Map<String, String>,
    val globalBlocked: Boolean,
    val aiAvailable: Boolean,
    val wifiModules: List<RouterWifiModule> = emptyList()
)

data class RouterTimeRange(
    val start: String,
    val end: String
) {
    val encoded: String get() = "$start-$end"
}

data class RouterSchedule(
    val section: String = "",
    val name: String,
    val description: String = "",
    val enabled: Boolean = true,
    val action: String = "block",
    val targetType: String = "group",
    val targets: List<String> = emptyList(),
    val weekdays: List<String> = listOf("mon", "tue", "wed", "thu", "fri"),
    val timeRanges: List<RouterTimeRange> = listOf(RouterTimeRange("21:00", "07:00"))
)

data class RouterGroup(
    val section: String = "",
    val name: String,
    val description: String = "",
    val color: String = "#E8F4EF",
    val personal: Boolean = false,
    val protectedGroup: Boolean = false,
    val autoAssignable: Boolean = false,
    val allowlistOnly: Boolean = false,
    val deviceIds: List<String> = emptyList()
)

data class RouterAdministrator(
    val section: String,
    val id: String,
    val displayName: String,
    val login: String,
    val role: String,
    val allowChildAccessRequests: Boolean
)

data class RouterAdminCapabilities(
    val scheduleWrite: Boolean = false,
    val groupWrite: Boolean = false,
    val wifiControl: Boolean = false,
    val administratorRead: Boolean = true,
    val logRead: Boolean = true,
    val logClear: Boolean = true
)

data class RouterAdminMutation(
    val kind: String,
    val runtimeApplied: Boolean
)

data class RouterAdminConfig(
    val schemaVersion: Int = 1,
    val revision: String = "",
    val bedtime: String = "21:00",
    val wifiEnabled: Boolean = false,
    val capabilities: RouterAdminCapabilities = RouterAdminCapabilities(),
    val schedules: List<RouterSchedule> = emptyList(),
    val groups: List<RouterGroup> = emptyList(),
    val administrators: List<RouterAdministrator> = emptyList(),
    val mutation: RouterAdminMutation? = null
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

/** Все команды выполняются на парном OpenWrt-роутере, а не в локальном состоянии APK. */
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
        parseObjectList(json.optJSONArray("devices")) { item, _ ->
            RouterDevice(
                id = item.optString("id").ifBlank { item.optString("mac") },
                name = item.optString("name").ifBlank { "Неизвестное устройство" },
                ip = item.optString("ip"),
                mac = item.optString("mac"),
                group = item.optString("group"),
                status = item.optString("status", "unknown"),
                isAdministrator = item.flexibleBoolean("adminDevice")
            )
        }
    }

    /** Читает один согласованный снимок расписаний, групп и безопасных данных администраторов. */
    suspend fun loadAdminConfig(): RouterAdminConfig = withContext(Dispatchers.IO) {
        parseAdminConfig(request("GET", ADMIN_CONFIG_PATH))
    }

    /**
     * Запись использует schemaVersion + revision последнего GET. При параллельной
     * правке LuCI backend отвечает revision_conflict вместо тихого last-write-wins.
     */
    suspend fun saveSchedule(config: RouterAdminConfig, schedule: RouterSchedule): RouterAdminConfig =
        withContext(Dispatchers.IO) {
            validateMutationContext(config)
            require(schedule.name.isNotBlank()) { "Название расписания обязательно" }
            require(schedule.targets.isNotEmpty()) { "Выберите устройства или группы" }
            require(schedule.weekdays.isNotEmpty()) { "Выберите дни недели" }
            require(schedule.timeRanges.isNotEmpty()) { "Добавьте хотя бы один интервал" }
            parseAdminConfig(
                request(
                    "POST",
                    "$ADMIN_CONFIG_PATH/schedule/save",
                    mutationContext(config) + mapOf(
                        "section" to schedule.section,
                        "name" to schedule.name.trim(),
                        "description" to schedule.description.trim(),
                        "enabled" to schedule.enabled.flag(),
                        "action" to schedule.action,
                        "targetType" to schedule.targetType,
                        "targets" to schedule.targets.distinct().joinToString(","),
                        "weekdays" to schedule.weekdays.distinct().joinToString(","),
                        "timeRanges" to schedule.timeRanges.distinct().joinToString(",") { it.encoded }
                    )
                )
            )
        }

    suspend fun deleteSchedule(config: RouterAdminConfig, section: String): RouterAdminConfig =
        withContext(Dispatchers.IO) {
            validateMutationContext(config)
            parseAdminConfig(
                request(
                    "POST",
                    "$ADMIN_CONFIG_PATH/schedule/delete",
                    mutationContext(config) + mapOf("section" to section)
                )
            )
        }

    suspend fun saveGroup(config: RouterAdminConfig, group: RouterGroup): RouterAdminConfig =
        withContext(Dispatchers.IO) {
            validateMutationContext(config)
            require(group.name.isNotBlank()) { "Название группы обязательно" }
            parseAdminConfig(
                request(
                    "POST",
                    "$ADMIN_CONFIG_PATH/group/save",
                    mutationContext(config) + mapOf(
                        "section" to group.section,
                        "name" to group.name.trim(),
                        "description" to group.description.trim(),
                        "color" to group.color,
                        "personal" to group.personal.flag(),
                        "allowlistOnly" to group.allowlistOnly.flag(),
                        "deviceIds" to group.deviceIds.distinct().joinToString(",")
                    )
                )
            )
        }

    suspend fun deleteGroup(config: RouterAdminConfig, section: String): RouterAdminConfig =
        withContext(Dispatchers.IO) {
            validateMutationContext(config)
            parseAdminConfig(
                request(
                    "POST",
                    "$ADMIN_CONFIG_PATH/group/delete",
                    mutationContext(config) + mapOf("section" to section)
                )
            )
        }

    suspend fun setWifiEnabled(enabled: Boolean): Boolean = withContext(Dispatchers.IO) {
        request(
            "POST",
            "$ADMIN_CONFIG_PATH/wifi-control",
            mapOf("enable" to enabled.flag(), "confirm" to "1")
        ).flexibleBoolean("enabled")
    }

    suspend fun loadLog(lines: Int = 200): List<String> = withContext(Dispatchers.IO) {
        val safeLines = lines.coerceIn(1, 1000)
        request("GET", "/log?lines=$safeLines").optJSONArray("entries").stringList()
    }

    suspend fun clearLog() = withContext(Dispatchers.IO) {
        request("POST", "/log/clear", mapOf("confirm" to "1"))
        Unit
    }

    suspend fun setGlobalBlock(enabled: Boolean) = withContext(Dispatchers.IO) {
        request(
            method = "POST",
            path = "/global-block",
            form = mapOf("enable" to enabled.flag(), "confirm" to "1")
        )
        Unit
    }

    suspend fun allowDevice(mac: String) = deviceAction("allow", mac)

    suspend fun blockDevice(mac: String) = deviceAction("block", mac)

    suspend fun grantTemporaryAccess(mac: String, minutes: Int = 30) = withContext(Dispatchers.IO) {
        request("POST", "/device/temp-access", mapOf("mac" to mac, "minutes" to minutes.toString()))
        Unit
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
                "includeDiagnostics" to includeDiagnostics.flag()
            )
        )
        Unit
    }

    private suspend fun deviceAction(action: String, mac: String) = withContext(Dispatchers.IO) {
        request("POST", "/device/$action", mapOf("mac" to mac))
        Unit
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
                ?.flexibleBoolean("aiAssistant")
                ?: false,
            wifiModules = parseWifiModules(json.optJSONArray("wifiModules"))
        )
    }

    suspend fun loadChildAccessRequests(): List<ChildAccessRequest> = withContext(Dispatchers.IO) {
        val json = request("GET", "/access-requests")
        parseObjectList(json.optJSONArray("requests")) { item, _ ->
            ChildAccessRequest(
                id = item.optString("id"),
                deviceId = item.optString("deviceId"),
                deviceName = item.optString("deviceName").ifBlank { "Неизвестное устройство" },
                ip = item.optString("ip"),
                mac = item.optString("mac"),
                createdAt = item.optLong("createdAt")
            )
        }
    }

    suspend fun loadAdminNotifications(): List<RouterAdminNotification> = withContext(Dispatchers.IO) {
        val json = request("GET", "/notifications")
        parseObjectList(json.optJSONArray("notifications")) { item, _ ->
            val id = item.optString("id")
            val eventMessage = item.optString("message")
            if (id.isBlank() || eventMessage.isBlank()) null else RouterAdminNotification(
                id = id,
                type = item.optString("type", "system"),
                title = item.optString("title", "Sheepfold"),
                message = eventMessage,
                createdAt = item.optLong("createdAt")
            )
        }
    }

    private fun parseAdminConfig(json: JSONObject): RouterAdminConfig {
        val schemaVersion = json.optInt("schemaVersion", 0)
        if (schemaVersion != ADMIN_CONFIG_SCHEMA_VERSION) {
            throw IllegalStateException("Версия API управления не поддерживается. Обновите Sheepfold на роутере и телефоне.")
        }
        val revision = json.optString("revision")
        if (revision.isBlank()) throw IllegalStateException("Роутер не вернул ревизию настроек.")
        val capabilities = json.optJSONObject("capabilities")
        val mutation = json.optJSONObject("mutation")?.let {
            RouterAdminMutation(
                kind = it.optString("kind"),
                runtimeApplied = it.flexibleBoolean("runtimeApplied", true)
            )
        }
        return RouterAdminConfig(
            schemaVersion = schemaVersion,
            revision = revision,
            bedtime = json.optString("bedtime").ifBlank { "21:00" },
            wifiEnabled = json.flexibleBoolean("wifiEnabled"),
            capabilities = RouterAdminCapabilities(
                scheduleWrite = capabilities?.flexibleBoolean("scheduleWrite") == true,
                groupWrite = capabilities?.flexibleBoolean("groupWrite") == true,
                wifiControl = capabilities?.flexibleBoolean("wifiControl") == true,
                administratorRead = capabilities?.flexibleBoolean("administratorRead", true) != false,
                logRead = capabilities?.flexibleBoolean("logRead", true) != false,
                logClear = capabilities?.flexibleBoolean("logClear", true) != false
            ),
            schedules = parseSchedules(json.optJSONArray("schedules")),
            groups = parseGroups(json.optJSONArray("groups")),
            administrators = parseAdministrators(json.optJSONArray("administrators")),
            mutation = mutation
        )
    }

    private fun parseWifiModules(items: JSONArray?): List<RouterWifiModule> =
        parseObjectList(items) { item, _ ->
            RouterWifiModule(
                name = item.optString("name"),
                status = item.optString("status"),
                type = item.optString("type"),
                path = item.optString("path"),
                band = item.optString("band"),
                channel = item.optString("channel"),
                country = item.optString("country"),
                mode = item.optString("mode")
            )
        }

    private fun parseSchedules(items: JSONArray?): List<RouterSchedule> =
        parseObjectList(items) { item, index ->
            val section = item.optString("section").ifBlank { "schedule-$index" }
            RouterSchedule(
                section = section,
                name = item.optString("name").ifBlank { section },
                description = item.optString("description"),
                enabled = item.flexibleBoolean("enabled", true),
                action = item.optString("action").ifBlank { "block" },
                targetType = item.optString("targetType").ifBlank { "group" },
                targets = item.optJSONArray("targets").stringList(),
                weekdays = item.optJSONArray("weekdays").stringList(),
                timeRanges = parseTimeRanges(item.optJSONArray("timeRanges"))
            )
        }

    private fun parseGroups(items: JSONArray?): List<RouterGroup> =
        parseObjectList(items) { item, index ->
            val section = item.optString("section").ifBlank { "group-$index" }
            RouterGroup(
                section = section,
                name = item.optString("name").ifBlank { section },
                description = item.optString("description"),
                color = item.optString("color").ifBlank { "#E8F4EF" },
                personal = item.flexibleBoolean("personal"),
                protectedGroup = item.flexibleBoolean("protected"),
                autoAssignable = item.flexibleBoolean("autoAssignable"),
                allowlistOnly = item.flexibleBoolean("allowlistOnly"),
                deviceIds = item.optJSONArray("deviceIds").stringList()
            )
        }

    private fun parseAdministrators(items: JSONArray?): List<RouterAdministrator> =
        parseObjectList(items) { item, index ->
            val section = item.optString("section").ifBlank { "administrator-$index" }
            RouterAdministrator(
                section = section,
                id = item.optString("id"),
                displayName = item.optString("displayName")
                    .ifBlank { item.optString("login") }
                    .ifBlank { section },
                login = item.optString("login"),
                role = item.optString("role"),
                allowChildAccessRequests = item.flexibleBoolean("allowChildAccessRequests")
            )
        }

    private fun parseTimeRanges(items: JSONArray?): List<RouterTimeRange> {
        if (items == null) return emptyList()
        return buildList {
            for (index in 0 until items.length()) {
                when (val value = items.opt(index)) {
                    is JSONObject -> {
                        val start = value.optString("start")
                        val end = value.optString("end")
                        if (TIME_PATTERN.matches(start) && TIME_PATTERN.matches(end) && start != end) {
                            add(RouterTimeRange(start, end))
                        }
                    }
                    is String -> parseTimeRange(value)?.let(::add)
                }
            }
        }
    }

    private fun validateMutationContext(config: RouterAdminConfig) {
        require(config.schemaVersion == ADMIN_CONFIG_SCHEMA_VERSION) { "Обновите снимок настроек." }
        require(config.revision.isNotBlank()) { "Сначала обновите настройки с роутера." }
    }

    private fun mutationContext(config: RouterAdminConfig): Map<String, String> = mapOf(
        "schemaVersion" to config.schemaVersion.toString(),
        "expectedRevision" to config.revision
    )

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
        if (tlsPin.isNullOrBlank() && tlsSpki.isNullOrBlank()) {
            throw IllegalStateException("Отпечаток TLS роутера не сохранён. Выполните сопряжение заново.")
        }
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
                val encodedBody = form.entries.joinToString("&") { (key, value) ->
                    "${encode(key)}=${encode(value)}"
                }
                http.doOutput = true
                http.setRequestProperty(
                    "Content-Type",
                    "application/x-www-form-urlencoded; charset=UTF-8"
                )
                http.outputStream.use { it.write(encodedBody.toByteArray(Charsets.UTF_8)) }
            }

            val code = http.responseCode
            val responseBody = (if (code in 200..299) http.inputStream else http.errorStream)
                ?.bufferedReader(Charsets.UTF_8)
                ?.use { it.readText() }
                .orEmpty()
            val json = runCatching { JSONObject(responseBody) }.getOrNull()
            if (code !in 200..299) {
                val errorCode = json?.optString("error").orEmpty()
                val serverMessage = json?.optString("message")
                    ?.ifBlank { errorCode }
                    .orEmpty()
                    .ifBlank { responseBody.ifBlank { "HTTP $code" } }
                RouterSessionFailure.fromHttp(code, errorCode)?.let { throw it }
                throw RouterHttpException(code, errorCode, friendlyApiMessage(errorCode, serverMessage))
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

    private fun parseTimeRange(value: String): RouterTimeRange? {
        val parts = value.split('-', limit = 2)
        if (parts.size != 2 || !TIME_PATTERN.matches(parts[0]) || !TIME_PATTERN.matches(parts[1])) return null
        if (parts[0] == parts[1]) return null
        return RouterTimeRange(parts[0], parts[1])
    }

    private fun friendlyApiMessage(errorCode: String, fallback: String): String = when (errorCode) {
        "revision_conflict" -> "Настройки изменились на роутере. Обновите экран и повторите действие."
        "config_busy" -> "Роутер уже сохраняет настройки. Повторите действие после обновления."
        "unsupported_schema" -> "Версия API управления не поддерживается. Обновите Sheepfold."
        "group_has_devices" -> "Сначала удалите устройства из группы."
        "group_has_schedules" -> "Сначала удалите или переназначьте расписания этой группы."
        "protected_group", "protected_group_name" -> "Системную группу нельзя удалить или переименовать."
        "administrator_group_forbidden" -> "Администраторское устройство нельзя назначить в семейную группу."
        "administrator_schedule_forbidden" -> "Администраторское устройство нельзя ограничить расписанием."
        "wifi_control_failed" -> "Роутер не смог применить состояние Wi-Fi."
        "config_commit_failed", "config_verify_failed" -> "Роутер не подтвердил сохранение и восстановил прежнюю конфигурацию."
        else -> fallback
    }

    private companion object {
        const val ADMIN_CONFIG_SCHEMA_VERSION = 1
        const val ADMIN_CONFIG_PATH = "/api/v1/admin-config"
        val TIME_PATTERN = Regex("(?:[01]\\d|2[0-3]):[0-5]\\d")
    }
}

private fun Boolean.flag(): String = if (this) "1" else "0"

private fun JSONArray?.stringList(): List<String> {
    if (this == null) return emptyList()
    return buildList {
        for (index in 0 until length()) {
            optString(index).takeIf { it.isNotBlank() }?.let(::add)
        }
    }
}

private fun JSONObject.flexibleBoolean(name: String, default: Boolean = false): Boolean {
    if (!has(name) || isNull(name)) return default
    return when (val value = opt(name)) {
        is Boolean -> value
        is Number -> value.toInt() != 0
        is String -> value == "1" || value.equals("true", ignoreCase = true) ||
            value.equals("yes", ignoreCase = true) || value.equals("on", ignoreCase = true)
        else -> default
    }
}

private inline fun <T : Any> parseObjectList(
    items: JSONArray?,
    mapper: (JSONObject, Int) -> T?
): List<T> {
    if (items == null) return emptyList()
    return buildList {
        for (index in 0 until items.length()) {
            val item = items.optJSONObject(index) ?: continue
            mapper(item, index)?.let(::add)
        }
    }
}

private class RouterHttpException(
    val statusCode: Int,
    val errorCode: String,
    message: String
) : IllegalStateException(message)
