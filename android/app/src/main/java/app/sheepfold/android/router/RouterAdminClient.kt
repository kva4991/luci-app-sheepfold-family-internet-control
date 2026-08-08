package app.sheepfold.android.router

import android.content.Context
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONObject
import java.net.ConnectException
import java.net.NoRouteToHostException
import java.net.URL
import java.net.URLEncoder

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
                deviceType = item.optString("deviceType", "unknown"),
                manualDeviceType = item.flexibleBoolean("manualDeviceType"),
                status = item.optString("status", "unknown"),
                isAdministrator = item.flexibleBoolean("adminDevice")
            )
        }
    }

    /** Читает один согласованный снимок расписаний, групп и безопасных данных администраторов. */
    suspend fun loadAdminConfig(): RouterAdminConfig = withContext(Dispatchers.IO) {
        RouterAdminJson.parseConfig(request("GET", ADMIN_CONFIG_PATH))
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
            RouterAdminJson.parseConfig(
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
            RouterAdminJson.parseConfig(
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
            RouterAdminJson.parseConfig(
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
                        "deviceIds" to group.deviceIds.distinct().joinToString(","),
                        // Наличие флага отличает новый клиент с пустым выбором от
                        // старого APK, который вообще не умел менять расписания группы. §grpsch1
                        "scheduleIdsPresent" to "1",
                        "scheduleIds" to group.scheduleIds.distinct().joinToString(",")
                    )
                )
            )
        }

    suspend fun deleteGroup(config: RouterAdminConfig, section: String): RouterAdminConfig =
        withContext(Dispatchers.IO) {
            validateMutationContext(config)
            RouterAdminJson.parseConfig(
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

    suspend fun saveWifiNetwork(
        config: RouterAdminConfig,
        network: RouterWifiNetwork
    ): RouterAdminConfig = withContext(Dispatchers.IO) {
        require(config.wifiRevision.isNotBlank()) { "Роутер не вернул ревизию Wi-Fi." }
        require(network.section.isNotBlank()) { "Неизвестная секция Wi-Fi." }
        require(network.ssid.isNotBlank()) { "Введите имя Wi-Fi сети." }
        RouterAdminJson.parseConfig(
            request(
                "POST",
                "$ADMIN_CONFIG_PATH/wifi/save",
                mutationContext(config) + mapOf(
                    "expectedWifiRevision" to config.wifiRevision,
                    "section" to network.section,
                    "ssid" to network.ssid.trim(),
                    "password" to network.password,
                    "encryption" to network.encryption,
                    "channel" to network.channel,
                    "enabled" to network.enabled.flag(),
                    "confirm" to "1"
                )
            )
        )
    }

    suspend fun saveWifiAutomation(
        config: RouterAdminConfig,
        automation: RouterWifiAutomation
    ): RouterAdminConfig = withContext(Dispatchers.IO) {
        validateMutationContext(config)
        require(automation.enableMode in WIFI_AUTOMATION_MODES) { "Неизвестный режим включения Wi-Fi." }
        require(automation.disableMode in WIFI_AUTOMATION_MODES) { "Неизвестный режим выключения Wi-Fi." }
        require(automation.enableTime.matches(ROUTER_TIME_PATTERN)) { "Проверьте время включения Wi-Fi." }
        require(automation.disableTime.matches(ROUTER_TIME_PATTERN)) { "Проверьте время выключения Wi-Fi." }
        RouterAdminJson.parseConfig(
            request(
                "POST",
                "$ADMIN_CONFIG_PATH/wifi-automation/save",
                mutationContext(config) + mapOf(
                    "enableMode" to automation.enableMode,
                    "enableTime" to automation.enableTime,
                    "disableMode" to automation.disableMode,
                    "disableTime" to automation.disableTime,
                    "confirmRisk" to (automation.disableMode == "time").flag()
                )
            )
        )
    }

    suspend fun saveNotificationSettings(
        config: RouterAdminConfig,
        settings: RouterNotificationSettings
    ): RouterAdminConfig = withContext(Dispatchers.IO) {
        validateMutationContext(config)
        require(settings.simChangeMode in setOf("all", "new_only", "off")) {
            "Неизвестный режим уведомлений о SIM-карте."
        }
        require(settings.childWifiMode in setOf("with_location", "network_only", "off")) {
            "Неизвестный режим уведомлений о Wi-Fi."
        }
        RouterAdminJson.parseConfig(
            request(
                "POST",
                "$ADMIN_CONFIG_PATH/notifications/save",
                mutationContext(config) + mapOf(
                    "simChangeMode" to settings.simChangeMode,
                    "childWifiMode" to settings.childWifiMode
                )
            )
        )
    }

    suspend fun saveDevice(
        config: RouterAdminConfig,
        device: RouterDevice,
        updateProfile: Boolean = true
    ): RouterAdminConfig = withContext(Dispatchers.IO) {
        validateMutationContext(config)
        require(device.mac.matches(MAC_PATTERN)) { "Некорректный MAC-адрес устройства." }
        require(device.status in DEVICE_STATUSES) { "Неизвестный статус устройства." }
        if (updateProfile) {
            require(device.name.isNotBlank()) { "Введите имя устройства." }
            require(device.deviceType in DEVICE_TYPES) { "Неизвестный тип устройства." }
        }
        RouterAdminJson.parseConfig(
            request(
                "POST",
                "$ADMIN_CONFIG_PATH/device/save",
                mutationContext(config) + mapOf(
                    "mac" to device.mac,
                    "name" to device.name.trim(),
                    "group" to device.group.trim(),
                    "deviceType" to device.deviceType,
                    "status" to device.status,
                    "updateProfile" to updateProfile.flag()
                )
            )
        )
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
            wifiModules = RouterAdminJson.parseWifiModules(json.optJSONArray("wifiModules"))
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

    private fun validateMutationContext(config: RouterAdminConfig) {
        require(config.schemaVersion == ROUTER_ADMIN_CONFIG_SCHEMA_VERSION) { "Обновите снимок настроек." }
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

    private fun friendlyApiMessage(errorCode: String, fallback: String): String = when (errorCode) {
        "revision_conflict" -> "Настройки изменились на роутере. Обновите экран и повторите действие."
        "config_busy" -> "Роутер уже сохраняет настройки. Повторите действие после обновления."
        "unsupported_schema" -> "Версия API управления не поддерживается. Обновите Sheepfold."
        "group_has_devices" -> "Сначала удалите устройства из группы."
        "group_has_schedules" -> "Сначала удалите или переназначьте расписания этой группы."
        "schedule_not_found", "invalid_group_schedule" ->
            "Одно из расписаний больше не существует. Обновите экран и повторите действие."
        "group_schedule_type_forbidden" ->
            "К группе можно прикрепить только расписание, созданное для групп."
        "duplicate_group_schedule", "too_many_group_schedules", "invalid_group_schedule_presence" ->
            "Проверьте выбранные расписания группы."
        "protected_group", "protected_group_name" -> "Системную группу нельзя удалить или переименовать."
        "administrator_group_forbidden" -> "Администраторское устройство нельзя назначить в семейную группу."
        "administrator_schedule_forbidden" -> "Администраторское устройство нельзя ограничить расписанием."
        "administrator_device_forbidden" -> "Администраторское устройство нельзя лишить администраторских настроек."
        "device_not_found" -> "Устройство больше не найдено. Обновите список."
        "device_save_failed" -> "Роутер не смог применить настройки устройства."
        "invalid_device_name", "invalid_device_group", "invalid_device_type",
        "invalid_device_status", "invalid_device_profile_flag" ->
            "Проверьте имя, группу, тип и статус устройства."
        "wifi_control_failed" -> "Роутер не смог применить состояние Wi-Fi."
        "invalid_sim_change_mode", "invalid_child_wifi_mode" ->
            "Проверьте выбранные режимы уведомлений."
        "wifi_network_not_found", "wifi_radio_not_found" ->
            "Сеть Wi-Fi изменилась на роутере. Обновите экран и повторите действие."
        "wifi_reload_failed" ->
            "Wi-Fi не перезапустился, поэтому роутер восстановил прежние настройки."
        "invalid_wifi_ssid", "invalid_wifi_password", "wifi_password_required",
        "invalid_wifi_encryption", "invalid_wifi_channel", "invalid_wifi_enabled" ->
            "Проверьте имя сети, пароль, тип защиты, канал и состояние Wi-Fi."
        "invalid_wifi_automation_mode", "invalid_wifi_automation_time" ->
            "Проверьте режим и время автоматизации Wi-Fi."
        "config_commit_failed", "config_verify_failed" -> "Роутер не подтвердил сохранение и восстановил прежнюю конфигурацию."
        else -> fallback
    }

    private companion object {
        const val ADMIN_CONFIG_PATH = "/api/v1/admin-config"
        val MAC_PATTERN = Regex("(?:[0-9A-Fa-f]{2}:){5}[0-9A-Fa-f]{2}")
        val WIFI_AUTOMATION_MODES = setOf("never", "time")
        val DEVICE_STATUSES = setOf("allow", "blocked", "restricted", "scheduled", "new")
        val DEVICE_TYPES = setOf(
            "unknown", "phone", "tablet", "computer", "tv", "media_player", "smart_watch",
            "console", "printer", "server", "camera", "speaker", "vacuum", "smart_home",
            "engineering", "smart", "network", "router", "network_switch"
        )
    }
}

private fun Boolean.flag(): String = if (this) "1" else "0"

private class RouterHttpException(
    val statusCode: Int,
    val errorCode: String,
    message: String
) : IllegalStateException(message)
