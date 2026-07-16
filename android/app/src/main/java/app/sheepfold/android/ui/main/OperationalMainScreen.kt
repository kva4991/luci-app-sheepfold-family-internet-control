package app.sheepfold.android.ui.main

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
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
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import app.sheepfold.android.R
import app.sheepfold.android.router.bearerToken
import app.sheepfold.android.router.RouterAdminClient
import app.sheepfold.android.router.RouterConnectionRequest
import app.sheepfold.android.router.RouterDevice
import app.sheepfold.android.router.RouterSnapshot
import app.sheepfold.android.notifications.SheepfoldNotifications
import app.sheepfold.android.ui.theme.ThemeMode
import app.sheepfold.android.widget.SheepfoldWidgetRenderer
import kotlinx.coroutines.launch

/** Рабочий экран: данные и команды всегда приходят с подключённого роутера. */
@Composable
fun OperationalMainScreen(
    connection: RouterConnectionRequest,
    themeMode: ThemeMode,
    onThemeModeChange: (ThemeMode) -> Unit,
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
    var snapshot by remember { mutableStateOf<RouterSnapshot?>(null) }
    // APK один для обоих IPK: вкладка появляется только после подтверждения
    // capability от уже авторизованного роутера. §prodvar
    val productTab = productFeatureTab(connection, snapshot?.aiAvailable == true)
    val tabs = listOf(
        stringResource(R.string.tab_control),
        stringResource(R.string.tab_devices),
        stringResource(R.string.tab_lists),
        stringResource(R.string.tab_schedule),
        stringResource(R.string.tab_groups),
        stringResource(R.string.tab_administrators),
        stringResource(R.string.tab_wifi)
    ) + listOfNotNull(productTab?.title) + listOf(
        stringResource(R.string.tab_logs),
        stringResource(R.string.tab_info),
        stringResource(R.string.tab_feedback),
        stringResource(R.string.tab_settings)
    )
    var selectedTab by remember { mutableIntStateOf(0) }
    var isLoading by remember { mutableStateOf(false) }
    var message by remember { mutableStateOf<String?>(null) }
    val featureIndex = if (productTab == null) -1 else 7
    val logsIndex = if (productTab == null) 7 else 8
    val infoIndex = logsIndex + 1
    val feedbackIndex = infoIndex + 1

    fun refresh() {
        isLoading = true
        message = null
        scope.launch {
            runCatching {
                devices = client.loadDevices()
                snapshot = client.loadRouterInfo().also {
                    SheepfoldWidgetRenderer.storeState(context, it.globalBlocked)
                }
                client.loadChildAccessRequests().forEach { request ->
                    SheepfoldNotifications.notifyAccessRequestOnce(context, request)
                }
                client.loadAdminNotifications().forEach { event ->
                    SheepfoldNotifications.notifyAdminEventOnce(context, event)
                }
            }.onFailure { message = it.message ?: refreshFailedText }
            isLoading = false
        }
    }

    LaunchedEffect(connection.apiUrl) { refresh() }

    Column(modifier = Modifier.fillMaxSize()) {
        ScrollableTabRow(selectedTabIndex = selectedTab) {
            tabs.forEachIndexed { index, title ->
                Tab(
                    selected = selectedTab == index,
                    onClick = { selectedTab = index },
                    text = { Text(title) }
                )
            }
        }
        when (selectedTab) {
            0 -> ControlTab(
                routerName = snapshot?.routerName ?: connection.routerName,
                globalBlocked = snapshot?.globalBlocked ?: false,
                isLoading = isLoading,
                message = message,
                onRefresh = ::refresh,
                onBlock = { enabled ->
                    isLoading = true
                    scope.launch {
                        runCatching { client.setGlobalBlock(enabled) }
                            .onSuccess {
                                message = if (enabled) blockEnabledText else internetEnabledText
                                refresh()
                            }
                            .onFailure { message = it.message }
                        isLoading = false
                    }
                }
            )
            1 -> DevicesTab(devices, isLoading, ::refresh) { device, action ->
                isLoading = true
                scope.launch {
                    runCatching {
                        when (action) {
                            "allow" -> client.allowDevice(device.mac)
                            "block" -> client.blockDevice(device.mac)
                            else -> client.grantTemporaryAccess(device.mac, 30)
                        }
                    }.onFailure { message = it.message }
                    refresh()
                }
            }
            2 -> DeviceListsTab(devices)
            3 -> PlaceholderTab(stringResource(R.string.tab_schedule))
            4 -> PlaceholderTab(stringResource(R.string.tab_groups))
            5 -> PlaceholderTab(stringResource(R.string.tab_administrators))
            6 -> PlaceholderTab(stringResource(R.string.tab_wifi))
            featureIndex -> productTab?.content?.invoke()
            logsIndex -> PlaceholderTab(stringResource(R.string.tab_logs))
            infoIndex -> RouterInfoTab(snapshot = snapshot, isLoading = isLoading, onRefresh = ::refresh)
            feedbackIndex -> FeedbackTab(client)
            else -> SettingsTab(themeMode, onThemeModeChange, onDisconnect)
        }
    }
}

@Composable
private fun ControlTab(
    routerName: String,
    globalBlocked: Boolean,
    isLoading: Boolean,
    message: String?,
    onRefresh: () -> Unit,
    onBlock: (Boolean) -> Unit
) {
    Column(
        modifier = Modifier.padding(20.dp),
        verticalArrangement = Arrangement.spacedBy(14.dp)
    ) {
        Text(stringResource(R.string.router_label_format, routerName), style = MaterialTheme.typography.headlineSmall)
        Text(stringResource(R.string.router_commands_direct))
        Button(
            onClick = { onBlock(false) },
            enabled = !isLoading,
            modifier = Modifier.fillMaxWidth(),
            colors = ButtonDefaults.buttonColors(
                containerColor = if (!globalBlocked) Color(0xFF178447) else Color(0xFFB9DCCB),
                contentColor = if (!globalBlocked) Color.White else Color(0xFF315B45)
            )
        ) { Text(stringResource(R.string.router_internet_is_enabled)) }
        Button(
            onClick = { onBlock(true) },
            enabled = !isLoading,
            modifier = Modifier.fillMaxWidth(),
            colors = ButtonDefaults.buttonColors(
                containerColor = if (globalBlocked) Color(0xFFC62828) else Color(0xFFE8B9B9),
                contentColor = if (globalBlocked) Color.White else Color(0xFF6D3030)
            )
        ) { Text(stringResource(R.string.router_internet_is_disabled)) }
        OutlinedButton(onClick = onRefresh, enabled = !isLoading, modifier = Modifier.fillMaxWidth()) {
            Text(stringResource(R.string.action_refresh))
        }
        if (isLoading) CircularProgressIndicator()
        message?.let { Text(it) }
    }
}

@Composable
private fun DevicesTab(
    devices: List<RouterDevice>,
    isLoading: Boolean,
    onRefresh: () -> Unit,
    onAction: (RouterDevice, String) -> Unit
) {
    val emptyValue = stringResource(R.string.value_empty)
    LazyColumn(
        modifier = Modifier
            .fillMaxSize()
            .padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp)
    ) {
        item {
            Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                Text(stringResource(R.string.devices_title), style = MaterialTheme.typography.headlineSmall)
                OutlinedButton(onClick = onRefresh, enabled = !isLoading) {
                    Text(stringResource(R.string.action_refresh))
                }
            }
        }
        if (!isLoading && devices.isEmpty()) {
            item { Text(stringResource(R.string.devices_empty)) }
        }
        items(devices, key = { it.id }) { device ->
            Card(colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant)) {
                Column(
                    modifier = Modifier.padding(14.dp),
                    verticalArrangement = Arrangement.spacedBy(4.dp)
                ) {
                    Text((if (device.isAdministrator) "♛ " else "") + device.name)
                    Text(stringResource(R.string.device_status_format, device.status))
                    Text(stringResource(R.string.device_ip_format, device.ip.ifBlank { emptyValue }))
                    Text(stringResource(R.string.device_mac_format, device.mac.ifBlank { emptyValue }))
                    Text(stringResource(R.string.device_group_format, device.group.ifBlank { emptyValue }))
                    if (!device.isAdministrator) {
                        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            if (device.status != "allow") {
                                OutlinedButton(onClick = { onAction(device, "allow") }, modifier = Modifier.weight(1f)) {
                                    Text(stringResource(R.string.action_allow))
                                }
                            }
                            if (device.status != "blocked") {
                                OutlinedButton(onClick = { onAction(device, "block") }, modifier = Modifier.weight(1f)) {
                                    Text(stringResource(R.string.action_block))
                                }
                            }
                            if (device.status != "allow" && device.status != "blocked") {
                                OutlinedButton(onClick = { onAction(device, "temp") }, modifier = Modifier.weight(1f)) {
                                    Text("+30")
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun DeviceListsTab(devices: List<RouterDevice>) {
    var selected by remember { mutableIntStateOf(0) }
    val labels = listOf(stringResource(R.string.tab_all_devices), stringResource(R.string.tab_allowlist), stringResource(R.string.tab_blocklist))
    val filtered = when (selected) {
        1 -> devices.filter { it.status == "allow" }
        2 -> devices.filter { it.status == "blocked" }
        else -> devices
    }
    Column(Modifier.fillMaxSize()) {
        ScrollableTabRow(selectedTabIndex = selected) {
            labels.forEachIndexed { index, label ->
                Tab(selected = selected == index, onClick = { selected = index }, text = { Text(label) })
            }
        }
        LazyColumn(Modifier.fillMaxSize().padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            items(filtered, key = { it.id }) { device ->
                Card(colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant)) {
                    Text("#${device.id} ${device.name}", Modifier.fillMaxWidth().padding(14.dp))
                }
            }
        }
    }
}

@Composable
private fun PlaceholderTab(title: String) {
    Column(Modifier.fillMaxSize().padding(20.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
        Text(title, style = MaterialTheme.typography.headlineSmall)
        Text(stringResource(R.string.section_router_managed))
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

@Composable
private fun SettingsTab(
    themeMode: ThemeMode,
    onThemeModeChange: (ThemeMode) -> Unit,
    onDisconnect: () -> Unit
) {
    Column(
        modifier = Modifier.padding(20.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        Text(stringResource(R.string.settings_title), style = MaterialTheme.typography.headlineSmall)
        ThemeMode.entries.forEach { mode ->
            OutlinedButton(
                onClick = { onThemeModeChange(mode) },
                modifier = Modifier.fillMaxWidth()
            ) {
                Text((if (themeMode == mode) "✓ " else "") + themeModeLabel(mode))
            }
        }
        Button(onClick = onDisconnect, modifier = Modifier.fillMaxWidth()) {
            Text(stringResource(R.string.settings_disconnect))
        }
    }
}

@Composable
private fun themeModeLabel(mode: ThemeMode): String = stringResource(
    when (mode) {
        ThemeMode.SYSTEM -> R.string.settings_theme_system
        ThemeMode.LIGHT -> R.string.settings_theme_light
        ThemeMode.DARK -> R.string.settings_theme_dark
    }
)
