package app.sheepfold.android.ui.main

import app.sheepfold.android.router.ChildAccessRequest
import app.sheepfold.android.router.RouterAdminClient
import app.sheepfold.android.router.RouterAdminConfig
import app.sheepfold.android.router.RouterAdminNotification
import app.sheepfold.android.router.RouterDevice
import app.sheepfold.android.router.RouterSnapshot
import kotlinx.coroutines.currentCoroutineContext
import kotlinx.coroutines.ensureActive

/** Поля вне открытой панели не загружаются и не заменяют её соседние кеши. */
internal data class RouterPanelData(
    val devices: List<RouterDevice>? = null,
    val config: RouterAdminConfig? = null,
    val snapshot: RouterSnapshot? = null,
    val notifications: List<RouterAdminNotification>? = null,
    val accessRequests: List<ChildAccessRequest>? = null,
    val logs: List<String>? = null
)

/** Один владелец набора GET для открытия панели, ручного обновления и read-back команды. */
internal class RouterPanelLoader(
    private val loadDevices: suspend () -> List<RouterDevice>,
    private val loadConfig: suspend () -> RouterAdminConfig,
    private val loadInfo: suspend () -> RouterSnapshot,
    private val loadRequests: suspend () -> List<ChildAccessRequest>,
    private val loadEvents: suspend () -> List<RouterAdminNotification>,
    private val loadLogs: suspend () -> List<String>,
    private val loadChannels: suspend () -> Map<String, List<String>> = { emptyMap() }
) {
    constructor(client: RouterAdminClient) : this(
        client::loadDevices, client::loadAdminConfig, client::loadRouterInfo,
        client::loadChildAccessRequests, client::loadAdminNotifications, { client.loadLog(300) }, client::loadWifiChannels
    )

    suspend fun load(panel: String): RouterPanelData {
        currentCoroutineContext().ensureActive()
        // Публикуем результат целиком: сбой второго GET не смешивает новые строки со старыми правилами
        val data = when (panel) {
            "control", "info" -> RouterPanelData(snapshot = loadInfo())
            "devices", "lists", "schedules", "groups", "administrators" -> {
                val devices = loadDevices()
                RouterPanelData(devices = devices, config = loadConfig())
            }
            "wifi" -> {
                val config = loadConfig()
                val channels = if (config.capabilities.wifiChannelsRead) loadChannels() else emptyMap()
                RouterPanelData(config = config.copy(wifiNetworks = config.wifiNetworks.map {
                    it.copy(channels = channels[it.device].orEmpty())
                }), snapshot = loadInfo())
            }
            "notifications" -> {
                val config = loadConfig()
                val requests = loadRequests()
                RouterPanelData(config = config, accessRequests = requests, notifications = loadEvents())
            }
            "logs" -> {
                val config = loadConfig()
                RouterPanelData(config = config, logs = if (config.capabilities.logRead) loadLogs().reversed() else emptyList())
            }
            // Эти панели локальные либо делают собственный запрос только после явного действия
            "menu", "settings", "feedback", "product" -> RouterPanelData()
            else -> error("Unknown router panel: $panel")
        }
        // Уже отправленный GET может завершиться после ухода с панели, но его ответ применять нельзя
        currentCoroutineContext().ensureActive()
        return data
    }
}
