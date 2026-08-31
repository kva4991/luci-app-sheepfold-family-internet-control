package app.sheepfold.android.router

/** Безопасная проекция устройства, которую возвращает авторизованный router API. */
data class RouterDevice(
    val id: String,
    val name: String,
    val ip: String,
    val mac: String,
    val group: String,
    val deviceType: String,
    val manualDeviceType: Boolean,
    val status: String,
    val isAdministrator: Boolean,
    val administratorLogin: String = ""
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

/** Авторизованная проекция одной точки доступа из OpenWrt wireless UCI. */
data class RouterWifiNetwork(
    val section: String,
    val device: String,
    val ssid: String,
    val password: String,
    val encryption: String,
    val channel: String,
    val enabled: Boolean,
    val band: String,
    val channels: List<String> = emptyList()
)

data class RouterWifiAutomation(
    val enableMode: String = "never",
    val enableTime: String = "07:00",
    val disableMode: String = "never",
    val disableTime: String = "23:00"
)

data class RouterSnapshot(
    val routerName: String,
    val diagnostics: Map<String, String>,
    val globalBlocked: Boolean,
    val aiAvailable: Boolean,
    val wifiModules: List<RouterWifiModule> = emptyList()
)

/** Публичная часть конфигурации шифрования баг-репортов; секретного ключа здесь нет. */
data class SupportReportConfig(
    val recipientKeyId: String,
    val recipientPublicKeyset: String,
    val cryptoSuite: String,
    val maxCiphertextBytes: Int
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
    val deviceIds: List<String> = emptyList(),
    val scheduleIds: List<String> = emptyList()
)

data class RouterAdministrator(
    val section: String,
    val id: String,
    val displayName: String,
    val login: String,
    val allowChildAccessRequests: Boolean
)

data class RouterNotificationSettings(
    val simChangeMode: String = "new_only",
    val childWifiMode: String = "off"
)

data class RouterAdminCapabilities(
    val scheduleWrite: Boolean = false,
    val groupWrite: Boolean = false,
    val deviceWrite: Boolean = false,
    val wifiControl: Boolean = false,
    val wifiAutomationWrite: Boolean = false,
    val notificationWrite: Boolean = false,
    val administratorRead: Boolean = true,
    val logRead: Boolean = true,
    val logClear: Boolean = true,
    val wifiChannelsRead: Boolean = false
)

data class RouterAdminMutation(
    val kind: String,
    val runtimeApplied: Boolean
)

data class RouterAdminConfig(
    val schemaVersion: Int = 1,
    val revision: String = "",
    val wifiRevision: String = "",
    val bedtime: String = "21:00",
    val wifiEnabled: Boolean = false,
    val capabilities: RouterAdminCapabilities = RouterAdminCapabilities(),
    val schedules: List<RouterSchedule> = emptyList(),
    val groups: List<RouterGroup> = emptyList(),
    val administrators: List<RouterAdministrator> = emptyList(),
    val wifiNetworks: List<RouterWifiNetwork> = emptyList(),
    val wifiAutomation: RouterWifiAutomation = RouterWifiAutomation(),
    val notificationSettings: RouterNotificationSettings = RouterNotificationSettings(),
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
