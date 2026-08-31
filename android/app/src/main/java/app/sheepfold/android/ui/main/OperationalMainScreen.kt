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
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import app.sheepfold.android.R
import app.sheepfold.android.router.bearerToken
import app.sheepfold.android.router.deviceId
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
import kotlinx.coroutines.CancellationException
import java.net.SocketTimeoutException

/** Рабочий экран: данные и команды всегда приходят с подключённого роутера. */
@Composable
fun OperationalMainScreen(
    appUpdates: app.sheepfold.android.updates.ParentAppUpdateModel,
    connection: RouterConnectionRequest,
    themeMode: ThemeMode,
    onThemeModeChange: (ThemeMode) -> Unit,
    onLanguageChange: (AppLanguage) -> Unit,
    onLockNow: () -> Unit,
    onDisconnect: () -> Unit,
    workspace: ParentWorkspace = remember { ParentWorkspace() }
) {
    val context = LocalContext.current
    workspace.bind(connection)
    val scope = workspace.scope
    val client = remember(connection.apiUrl, connection.bearerToken) {
        RouterAdminClient(connection, context.applicationContext)
    }
    val loader = remember(client) { RouterPanelLoader(client) }
    val refreshFailedText = stringResource(R.string.router_refresh_failed)
    val blockEnabledText = stringResource(R.string.router_global_block_enabled)
    val internetEnabledText = stringResource(R.string.router_internet_enabled)
    var devices by workspace.devices
    var adminConfig by workspace.config
    var notifications by workspace.notifications
    val snapshot by workspace.snapshot
    var logs by workspace.logs
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
    var selectedTabKey by rememberSaveable(connection.apiUrl) { mutableStateOf("control") }
    val refreshVersion = workspace.refreshes[selectedTabKey] ?: 0
    // Старый запрос не должен снять индикатор или показать ошибку уже открытой соседней панели
    var isLoading by remember(client, selectedTabKey, refreshVersion) { mutableStateOf(true) }
    var message by remember(client, selectedTabKey, refreshVersion) { mutableStateOf<String?>(null) }
    var controlBusy by workspace.controlBusy
    var controlMessage by workspace.controlMessage
    val selectedTabIndex = tabs.indexOfFirst { it.key == selectedTabKey }.coerceAtLeast(0)

    fun acceptPanel(data: RouterPanelData) {
        data.devices?.let { devices = it }
        data.config?.let { adminConfig = it }
        data.snapshot?.let {
            workspace.acceptSnapshot(it)
            SheepfoldWidgetRenderer.storeState(context, it.globalBlocked)
        }
        data.notifications?.let { notifications = it }
        data.logs?.let { logs = it }
        data.accessRequests?.forEach { request ->
            SheepfoldNotifications.notifyAccessRequestOnce(context, request)
        }
        data.notifications?.forEach { event ->
            SheepfoldNotifications.notifyAdminEventOnce(context, event)
        }
    }

    fun refresh() {
        // Блокируем второй клик до перерисовки отключённой кнопки
        if (isLoading || (selectedTabKey == "control" && controlBusy)) return
        isLoading = true
        if (selectedTabKey == "control") controlMessage = null
        workspace.refresh(selectedTabKey)
    }

    LaunchedEffect(client, selectedTabKey, refreshVersion) {
        if (selectedTabKey == "control") controlMessage = null
        try {
            acceptPanel(loader.load(selectedTabKey))
        } catch (error: CancellationException) {
            throw error
        } catch (error: Exception) {
            if (selectedTabKey == "control") workspace.controlUnknown.value = true
            message = if (error is SocketTimeoutException) context.getString(R.string.router_refresh_timeout)
            else error.message ?: refreshFailedText
        } finally {
            isLoading = false
        }
    }

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
        if (selectedTabKey != "control") {
            message?.let { Text(it, color = MaterialTheme.colorScheme.error, modifier = Modifier.padding(16.dp)) }
        }
        when (selectedTabKey) {
            "control" -> ControlTab(
                routerName = snapshot?.routerName ?: connection.routerName,
                globalBlocked = snapshot?.globalBlocked.takeUnless { workspace.controlUnknown.value },
                lastUpdated = workspace.receivedAt.value,
                isLoading = isLoading || controlBusy,
                message = controlMessage ?: message,
                onRefresh = ::refresh,
                onBlock = { enabled ->
                    if (controlBusy || isLoading || workspace.controlUnknown.value || snapshot == null) return@ControlTab
                    controlBusy = true
                    controlMessage = null
                    scope.launch {
                        try {
                            client.setGlobalBlock(enabled)
                            // Кнопки ждут read-back только управления; соседние панели здесь не загружаются
                            acceptPanel(loader.load("control"))
                            controlMessage = if (enabled) blockEnabledText else internetEnabledText
                        } catch (error: CancellationException) {
                            throw error
                        } catch (error: Exception) {
                            workspace.controlUnknown.value = true
                            controlMessage = if (error is SocketTimeoutException) context.getString(R.string.router_refresh_timeout)
                            else error.message ?: refreshFailedText
                        } finally {
                            controlBusy = false
                        }
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
                onRefresh = ::refresh,
                workspace = workspace
            )
            "lists" -> DeviceListsTab(
                workspace = workspace,
                client = client,
                config = adminConfig,
                devices = devices,
                isLoading = isLoading,
                onConfigChanged = { adminConfig = it },
                onRefresh = ::refresh
            )
            "schedules" -> SchedulesTab(
                workspace = workspace,
                client = client,
                config = adminConfig,
                devices = devices,
                isLoading = isLoading,
                onConfigChanged = { adminConfig = it },
                onRefresh = ::refresh
            )
            "groups" -> GroupsTab(
                workspace = workspace,
                client = client,
                config = adminConfig,
                devices = devices,
                isLoading = isLoading,
                onConfigChanged = { adminConfig = it },
                onRefresh = ::refresh
            )
            "administrators" -> ParentDevicesTab(adminConfig.administrators, devices, connection.deviceId.orEmpty(), isLoading, ::refresh)
            "wifi" -> WifiTab(
                workspace = workspace,
                client = client,
                config = adminConfig,
                wifiModules = snapshot?.wifiModules.orEmpty(),
                isLoading = isLoading,
                onConfigChanged = { adminConfig = it },
                onRefresh = ::refresh
            )
            "product" -> productTab?.content?.invoke()
            "notifications" -> NotificationsTab(
                workspace = workspace,
                client = client,
                config = adminConfig,
                notifications = notifications,
                isLoading = isLoading,
                onConfigChanged = { adminConfig = it },
                onRefresh = ::refresh
            )
            "logs" -> LogsTab(client, adminConfig, logs, isLoading, ::refresh, onCleared = { logs = emptyList() })
            "info" -> RouterInfoTab(snapshot = snapshot, isLoading = isLoading, onRefresh = ::refresh, appUpdates = appUpdates)
            "feedback" -> FeedbackTab(client, workspace)
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
private fun RouterInfoTab(snapshot: RouterSnapshot?, isLoading: Boolean, onRefresh: () -> Unit, appUpdates: app.sheepfold.android.updates.ParentAppUpdateModel) {
    val emptyValue = stringResource(R.string.value_empty)
    LazyColumn(
        modifier = Modifier
            .fillMaxSize()
            .padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp)
    ) {
        item {
            ParentAppUpdateSection(appUpdates)
            Spacer(Modifier.height(16.dp))
            androidx.compose.material3.HorizontalDivider()
        }
        item {
            Text(stringResource(R.string.router_info_title), style = MaterialTheme.typography.headlineSmall)
            Spacer(Modifier.height(8.dp))
            OutlinedButton(onClick = onRefresh, enabled = !isLoading) {
                Icon(
                    painter = painterResource(R.drawable.ic_refresh),
                    contentDescription = null,
                    modifier = Modifier.size(20.dp)
                )
                Spacer(Modifier.width(8.dp))
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
