package app.sheepfold.android.ui.main

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.ScrollableTabRow
import androidx.compose.material3.Tab
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import app.sheepfold.android.R
import app.sheepfold.android.router.bearerToken
import app.sheepfold.android.router.RouterAdminClient
import app.sheepfold.android.router.RouterAdminConfig
import app.sheepfold.android.router.RouterAdminNotification
import app.sheepfold.android.router.RouterConnectionRequest
import app.sheepfold.android.router.RouterDevice
import app.sheepfold.android.router.RouterSnapshot
import app.sheepfold.android.notifications.SheepfoldNotifications
import app.sheepfold.android.ui.theme.AppLanguage
import app.sheepfold.android.ui.theme.ThemeMode
import app.sheepfold.android.widget.SheepfoldWidgetRenderer
import kotlinx.coroutines.launch

/** Рабочий экран: данные и команды всегда приходят с подключённого роутера. */
@Composable
fun OperationalMainScreen(
    connection: RouterConnectionRequest,
    themeMode: ThemeMode,
    onThemeModeChange: (ThemeMode) -> Unit,
    onLanguageChange: (AppLanguage) -> Unit,
    onLockNow: () -> Unit,
    onDisconnect: () -> Unit
) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val client = remember(connection.apiUrl, connection.bearerToken) {
        RouterAdminClient(connection, context.applicationContext)
    }
    val refreshFailedText = stringResource(R.string.router_refresh_failed)
    val blockEnabledText = stringResource(R.string.router_global_block_enabled)
    val internetEnabledText = stringResource(R.string.router_internet_enabled)
    var devices by remember { mutableStateOf<List<RouterDevice>>(emptyList()) }
    var adminConfig by remember { mutableStateOf(RouterAdminConfig()) }
    var notifications by remember { mutableStateOf<List<RouterAdminNotification>>(emptyList()) }
    var snapshot by remember { mutableStateOf<RouterSnapshot?>(null) }
    // APK один для обоих IPK: вкладка появляется только после подтверждения
    // capability от уже авторизованного роутера. §prodvar
    val productTab = productFeatureTab(connection, snapshot?.aiAvailable == true)
    val tabs = buildList {
        add(MainMenuItem("control", stringResource(R.string.tab_control), R.drawable.ic_navigation_control))
        add(MainMenuItem("menu", stringResource(R.string.tab_menu), R.drawable.ic_navigation_menu))
        add(MainMenuItem("devices", stringResource(R.string.tab_devices), R.drawable.ic_navigation_devices))
        add(MainMenuItem("lists", stringResource(R.string.tab_lists), R.drawable.ic_navigation_lists))
        add(MainMenuItem("schedules", stringResource(R.string.tab_schedule), R.drawable.ic_navigation_schedules))
        add(MainMenuItem("groups", stringResource(R.string.tab_groups), R.drawable.ic_navigation_groups))
        add(MainMenuItem("administrators", stringResource(R.string.tab_administrators), R.drawable.ic_navigation_administrators))
        add(MainMenuItem("wifi", stringResource(R.string.tab_wifi), R.drawable.ic_navigation_wifi))
        productTab?.let { add(MainMenuItem("product", it.title, it.iconRes)) }
        add(MainMenuItem("notifications", stringResource(R.string.tab_notifications), R.drawable.ic_navigation_notifications))
        add(MainMenuItem("logs", stringResource(R.string.tab_logs), R.drawable.ic_navigation_logs))
        add(MainMenuItem("info", stringResource(R.string.tab_info), R.drawable.ic_navigation_information))
        add(MainMenuItem("feedback", stringResource(R.string.tab_feedback), R.drawable.ic_navigation_feedback))
        add(MainMenuItem("settings", stringResource(R.string.tab_settings), R.drawable.ic_navigation_settings))
    }
    var selectedTabKey by remember { mutableStateOf("control") }
    var isLoading by remember { mutableStateOf(false) }
    var message by remember { mutableStateOf<String?>(null) }
    val selectedTabIndex = tabs.indexOfFirst { it.key == selectedTabKey }.coerceAtLeast(0)

    suspend fun reloadRouterState() {
        // Сначала собираем полный снимок. Иначе сбой последнего запроса оставит на
        // экране смесь новых устройств и старых правил, которую легко принять за
        // уже применённую конфигурацию.
        val loadedDevices = client.loadDevices()
        val loadedConfig = client.loadAdminConfig()
        val loadedSnapshot = client.loadRouterInfo()
        val accessRequests = client.loadChildAccessRequests()
        val loadedNotifications = client.loadAdminNotifications()

        devices = loadedDevices
        adminConfig = loadedConfig
        snapshot = loadedSnapshot
        notifications = loadedNotifications
        SheepfoldWidgetRenderer.storeState(context, loadedSnapshot.globalBlocked)
        accessRequests.forEach { request ->
            SheepfoldNotifications.notifyAccessRequestOnce(context, request)
        }
        loadedNotifications.forEach { event ->
            SheepfoldNotifications.notifyAdminEventOnce(context, event)
        }
    }

    fun refresh() {
        isLoading = true
        message = null
        scope.launch {
            runCatching { reloadRouterState() }
                .onFailure { message = it.message ?: refreshFailedText }
            isLoading = false
        }
    }

    LaunchedEffect(connection.apiUrl) { refresh() }

    Column(modifier = Modifier.fillMaxSize()) {
        ScrollableTabRow(selectedTabIndex = selectedTabIndex) {
            tabs.forEach { destination ->
                Tab(
                    selected = selectedTabKey == destination.key,
                    onClick = { selectedTabKey = destination.key },
                    icon = {
                        Icon(
                            painter = painterResource(destination.iconRes),
                            contentDescription = null,
                            modifier = Modifier.size(22.dp)
                        )
                    },
                    text = { Text(destination.title) }
                )
            }
        }
        when (selectedTabKey) {
            "control" -> ControlTab(
                routerName = snapshot?.routerName ?: connection.routerName,
                globalBlocked = snapshot?.globalBlocked ?: false,
                isLoading = isLoading,
                message = message,
                onRefresh = ::refresh,
                onBlock = { enabled ->
                    isLoading = true
                    message = null
                    scope.launch {
                        runCatching {
                            client.setGlobalBlock(enabled)
                            // Команда и последующее чтение являются одной UI-операцией:
                            // кнопки нельзя разблокировать до получения фактического
                            // состояния роутера.
                            reloadRouterState()
                        }
                            .onSuccess {
                                message = if (enabled) blockEnabledText else internetEnabledText
                            }
                            .onFailure { message = it.message ?: refreshFailedText }
                        isLoading = false
                    }
                }
            )
            "menu" -> MenuTab(
                items = tabs.filterNot { it.key == "control" || it.key == "menu" },
                onOpen = { selectedTabKey = it }
            )
            "devices" -> DevicesTab(
                client = client,
                config = adminConfig,
                devices = devices,
                isLoading = isLoading,
                onConfigChanged = { adminConfig = it },
                onRefresh = ::refresh
            )
            "lists" -> DeviceListsTab(
                client = client,
                config = adminConfig,
                devices = devices,
                isLoading = isLoading,
                onConfigChanged = { adminConfig = it },
                onRefresh = ::refresh
            )
            "schedules" -> SchedulesTab(
                client = client,
                config = adminConfig,
                devices = devices,
                isLoading = isLoading,
                onConfigChanged = { adminConfig = it },
                onRefresh = ::refresh
            )
            "groups" -> GroupsTab(
                client = client,
                config = adminConfig,
                devices = devices,
                isLoading = isLoading,
                onConfigChanged = { adminConfig = it },
                onRefresh = ::refresh
            )
            "administrators" -> AdministratorsTab(adminConfig.administrators, devices, isLoading, ::refresh)
            "wifi" -> WifiTab(
                client = client,
                config = adminConfig,
                wifiModules = snapshot?.wifiModules.orEmpty(),
                isLoading = isLoading,
                onConfigChanged = { adminConfig = it },
                onRefresh = ::refresh
            )
            "product" -> productTab?.content?.invoke()
            "notifications" -> NotificationsTab(
                client = client,
                config = adminConfig,
                notifications = notifications,
                isLoading = isLoading,
                onConfigChanged = { adminConfig = it }
            )
            "logs" -> LogsTab(client, adminConfig)
            "info" -> RouterInfoTab(snapshot = snapshot, isLoading = isLoading, onRefresh = ::refresh)
            "feedback" -> FeedbackTab(client)
            else -> SettingsTab(
                themeMode = themeMode,
                onThemeModeChange = onThemeModeChange,
                onLanguageChange = onLanguageChange,
                onLockNow = onLockNow,
                onDisconnect = onDisconnect
            )
        }
    }
}

@Composable
private fun RouterInfoTab(snapshot: RouterSnapshot?, isLoading: Boolean, onRefresh: () -> Unit) {
    val emptyValue = stringResource(R.string.value_empty)
    LazyColumn(
        modifier = Modifier
            .fillMaxSize()
            .padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp)
    ) {
        item {
            Text(stringResource(R.string.router_info_title), style = MaterialTheme.typography.headlineSmall)
            Spacer(Modifier.height(8.dp))
            OutlinedButton(onClick = onRefresh, enabled = !isLoading) {
                Text(stringResource(R.string.action_refresh))
            }
        }
        snapshot?.diagnostics?.entries?.sortedBy { it.key }?.let { entries ->
            items(entries) { entry ->
                Card(colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant)) {
                    Row(modifier = Modifier.fillMaxWidth().padding(12.dp)) {
                        Text(entry.key, modifier = Modifier.weight(1f))
                        Text(entry.value.ifBlank { emptyValue }, modifier = Modifier.weight(1f))
                    }
                }
            }
        }
    }
}
