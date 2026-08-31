package app.sheepfold.android.router

import org.json.JSONArray
import org.json.JSONObject

internal const val ROUTER_ADMIN_CONFIG_SCHEMA_VERSION = 1
internal val ROUTER_TIME_PATTERN = Regex("(?:[01]\\d|2[0-3]):[0-5]\\d")

/**
 * Единственная граница преобразования administrator API JSON в модели приложения.
 * Транспорт и восстановление адреса остаются в RouterAdminClient, чтобы JSON-совместимость
 * не смешивалась с TLS, токенами и повтором запроса. §apicon1
 */
internal object RouterAdminJson {
    fun parseConfig(json: JSONObject): RouterAdminConfig {
        val schemaVersion = json.optInt("schemaVersion", 0)
        if (schemaVersion != ROUTER_ADMIN_CONFIG_SCHEMA_VERSION) {
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
            wifiRevision = json.optString("wifiRevision"),
            bedtime = json.optString("bedtime").ifBlank { "21:00" },
            wifiEnabled = json.flexibleBoolean("wifiEnabled"),
            capabilities = RouterAdminCapabilities(
                wifiChannelsRead = capabilities?.flexibleBoolean("wifiChannelsRead") == true,
                scheduleWrite = capabilities?.flexibleBoolean("scheduleWrite") == true,
                groupWrite = capabilities?.flexibleBoolean("groupWrite") == true,
                deviceWrite = capabilities?.flexibleBoolean("deviceWrite") == true,
                wifiControl = capabilities?.flexibleBoolean("wifiControl") == true,
                wifiAutomationWrite = capabilities?.flexibleBoolean("wifiAutomationWrite") == true,
                notificationWrite = capabilities?.flexibleBoolean("notificationWrite") == true,
                administratorRead = capabilities?.flexibleBoolean("administratorRead", true) != false,
                logRead = capabilities?.flexibleBoolean("logRead", true) != false,
                logClear = capabilities?.flexibleBoolean("logClear", true) != false
            ),
            schedules = parseSchedules(json.optJSONArray("schedules")),
            groups = parseGroups(json.optJSONArray("groups")),
            administrators = parseAdministrators(json.optJSONArray("administrators")),
            wifiNetworks = parseWifiNetworks(json.optJSONArray("wifiNetworks")),
            wifiAutomation = parseWifiAutomation(json.optJSONObject("wifiAutomation")),
            notificationSettings = parseNotificationSettings(json.optJSONObject("notificationSettings")),
            mutation = mutation
        )
    }

    fun parseWifiModules(items: JSONArray?): List<RouterWifiModule> =
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

    private fun parseWifiNetworks(items: JSONArray?): List<RouterWifiNetwork> =
        parseObjectList(items) { item, _ ->
            RouterWifiNetwork(
                section = item.optString("section"),
                device = item.optString("device"),
                ssid = item.optString("ssid"),
                password = item.optString("password"),
                encryption = item.optString("encryption").ifBlank { "none" },
                channel = item.optString("channel").ifBlank { "auto" },
                enabled = item.flexibleBoolean("enabled", true),
                band = item.optString("band")
            )
        }

    private fun parseWifiAutomation(item: JSONObject?): RouterWifiAutomation = RouterWifiAutomation(
        enableMode = item?.optString("enableMode").takeUnless { it.isNullOrBlank() } ?: "never",
        enableTime = item?.optString("enableTime").takeUnless { it.isNullOrBlank() } ?: "07:00",
        disableMode = item?.optString("disableMode").takeUnless { it.isNullOrBlank() } ?: "never",
        disableTime = item?.optString("disableTime").takeUnless { it.isNullOrBlank() } ?: "23:00"
    )

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
                deviceIds = item.optJSONArray("deviceIds").stringList(),
                scheduleIds = item.optJSONArray("scheduleIds").stringList()
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
                allowChildAccessRequests = item.flexibleBoolean("allowChildAccessRequests")
            )
        }

    private fun parseNotificationSettings(item: JSONObject?): RouterNotificationSettings =
        RouterNotificationSettings(
            simChangeMode = item?.optString("simChangeMode")
                ?.takeIf { it in setOf("all", "new_only", "off") }
                ?: "new_only",
            childWifiMode = item?.optString("childWifiMode")
                ?.takeIf { it in setOf("with_location", "network_only", "off") }
                ?: "off"
        )

    private fun parseTimeRanges(items: JSONArray?): List<RouterTimeRange> {
        if (items == null) return emptyList()
        return buildList {
            for (index in 0 until items.length()) {
                when (val value = items.opt(index)) {
                    is JSONObject -> {
                        val start = value.optString("start")
                        val end = value.optString("end")
                        if (ROUTER_TIME_PATTERN.matches(start) &&
                            ROUTER_TIME_PATTERN.matches(end) && start != end
                        ) {
                            add(RouterTimeRange(start, end))
                        }
                    }
                    is String -> parseTimeRange(value)?.let(::add)
                }
            }
        }
    }

    private fun parseTimeRange(value: String): RouterTimeRange? {
        val parts = value.split('-', limit = 2)
        if (parts.size != 2 || !ROUTER_TIME_PATTERN.matches(parts[0]) ||
            !ROUTER_TIME_PATTERN.matches(parts[1]) || parts[0] == parts[1]
        ) {
            return null
        }
        return RouterTimeRange(parts[0], parts[1])
    }
}

internal fun JSONArray?.stringList(): List<String> {
    if (this == null) return emptyList()
    return buildList {
        for (index in 0 until length()) {
            optString(index).takeIf { it.isNotBlank() }?.let(::add)
        }
    }
}

internal fun JSONObject.flexibleBoolean(name: String, default: Boolean = false): Boolean {
    if (!has(name) || isNull(name)) return default
    return when (val value = opt(name)) {
        is Boolean -> value
        is Number -> value.toInt() != 0
        is String -> value == "1" || value.equals("true", ignoreCase = true) ||
            value.equals("yes", ignoreCase = true) || value.equals("on", ignoreCase = true)
        else -> default
    }
}

internal inline fun <T : Any> parseObjectList(
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
