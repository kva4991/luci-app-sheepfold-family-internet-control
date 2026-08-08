package app.sheepfold.android.ui.main

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Checkbox
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.ScrollableTabRow
import androidx.compose.material3.Tab
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import app.sheepfold.android.R
import app.sheepfold.android.router.RouterAdminClient
import app.sheepfold.android.router.RouterAdminConfig
import app.sheepfold.android.router.RouterDevice
import kotlinx.coroutines.launch

@Composable
internal fun DevicesTab(
    client: RouterAdminClient,
    config: RouterAdminConfig,
    devices: List<RouterDevice>,
    isLoading: Boolean,
    onConfigChanged: (RouterAdminConfig) -> Unit,
    onRefresh: () -> Unit
) {
    val scope = rememberCoroutineScope()
    var editingDevice by remember { mutableStateOf<RouterDevice?>(null) }
    var mutating by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    val canWriteDevices = config.capabilities.deviceWrite && config.revision.isNotBlank()
    val updateRouterText = stringResource(R.string.devices_update_router)
    val runtimePendingText = stringResource(R.string.management_runtime_pending)

    fun saveDevice(device: RouterDevice) {
        if (!canWriteDevices) {
            error = updateRouterText
            return
        }
        mutating = true
        error = null
        scope.launch {
            runCatching { client.saveDevice(config, device) }
                .onSuccess { updated ->
                    onConfigChanged(updated)
                    error = if (updated.mutation?.runtimeApplied == false) runtimePendingText else null
                    editingDevice = null
                    onRefresh()
                }
                .onFailure { error = it.message }
            mutating = false
        }
    }

    fun runAction(device: RouterDevice, action: String) {
        if (action != "temp" && !canWriteDevices) {
            error = updateRouterText
            return
        }
        mutating = true
        error = null
        scope.launch {
            runCatching {
                when (action) {
                    "allow" -> client.saveDevice(config, device.copy(status = "allow"), updateProfile = false)
                    "block" -> client.saveDevice(config, device.copy(status = "blocked"), updateProfile = false)
                    else -> {
                        client.grantTemporaryAccess(device.mac, 30)
                        null
                    }
                }
            }.onSuccess { updated ->
                updated?.let {
                    onConfigChanged(it)
                    error = if (it.mutation?.runtimeApplied == false) runtimePendingText else null
                }
                onRefresh()
            }.onFailure { error = it.message }
            mutating = false
        }
    }

    LazyColumn(
        modifier = Modifier.fillMaxSize().padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp)
    ) {
        item {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text(stringResource(R.string.devices_title), style = MaterialTheme.typography.headlineSmall)
                OutlinedButton(onClick = onRefresh, enabled = !isLoading && !mutating) {
                    Text(stringResource(R.string.action_refresh))
                }
            }
            error?.let { Text(it, color = MaterialTheme.colorScheme.error) }
            if (!canWriteDevices) Text(updateRouterText)
        }
        if (!isLoading && devices.isEmpty()) item { Text(stringResource(R.string.devices_empty)) }
        items(devices, key = { it.id }) { device ->
            DeviceSummaryCard(
                device = device,
                onEdit = { editingDevice = device },
                onAction = { runAction(device, it) },
                writeEnabled = canWriteDevices && !isLoading && !mutating,
                temporaryAccessEnabled = !isLoading && !mutating
            )
        }
    }

    editingDevice?.let { device ->
        DeviceEditorDialog(
            device = device,
            groups = config.groups,
            saving = mutating,
            error = error,
            onDismiss = {
                editingDevice = null
                error = null
            },
            onSave = ::saveDevice
        )
    }
}

@Composable
internal fun DeviceListsTab(
    client: RouterAdminClient,
    config: RouterAdminConfig,
    devices: List<RouterDevice>,
    isLoading: Boolean,
    onConfigChanged: (RouterAdminConfig) -> Unit,
    onRefresh: () -> Unit
) {
    val scope = rememberCoroutineScope()
    var selectedTab by remember { mutableIntStateOf(0) }
    var candidateStatus by remember { mutableStateOf<String?>(null) }
    var mutating by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    val canWriteDevices = config.capabilities.deviceWrite && config.revision.isNotBlank()
    val updateRouterText = stringResource(R.string.devices_update_router)
    val runtimePendingText = stringResource(R.string.management_runtime_pending)
    val labels = listOf(
        stringResource(R.string.tab_all_devices),
        stringResource(R.string.tab_allowlist),
        stringResource(R.string.tab_blocklist)
    )
    val shownDevices = when (selectedTab) {
        1 -> devices.filter { it.status == "allow" }
        2 -> devices.filter { it.status == "blocked" }
        else -> devices
    }

    fun applyStatuses(selectedDevices: List<RouterDevice>, status: String) {
        if (!canWriteDevices) {
            error = updateRouterText
            return
        }
        mutating = true
        error = null
        scope.launch {
            var currentConfig = config
            var runtimePending = false
            runCatching {
                selectedDevices.forEach { device ->
                    currentConfig = client.saveDevice(
                        currentConfig,
                        device.copy(status = status),
                        updateProfile = false
                    )
                    runtimePending = runtimePending || currentConfig.mutation?.runtimeApplied == false
                }
            }.onSuccess {
                onConfigChanged(currentConfig)
                error = if (runtimePending) runtimePendingText else null
            }.onFailure {
                error = it.message
            }
            candidateStatus = null
            mutating = false
            onRefresh()
        }
    }

    Column(Modifier.fillMaxSize()) {
        ScrollableTabRow(selectedTabIndex = selectedTab) {
            labels.forEachIndexed { index, label ->
                Tab(selected = selectedTab == index, onClick = { selectedTab = index }, text = { Text(label) })
            }
        }
        LazyColumn(
            modifier = Modifier.fillMaxSize().padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            if (selectedTab > 0) {
                item {
                    Button(
                        onClick = { candidateStatus = if (selectedTab == 1) "allow" else "blocked" },
                        enabled = canWriteDevices && !isLoading && !mutating,
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        Text(stringResource(R.string.device_list_add))
                    }
                    if (!canWriteDevices) Text(updateRouterText)
                    error?.let { Text(it, color = MaterialTheme.colorScheme.error) }
                }
            }
            if (!isLoading && shownDevices.isEmpty()) item { Text(stringResource(R.string.devices_empty)) }
            items(shownDevices, key = { it.id }) { device ->
                ListDeviceCard(
                    device = device,
                    removable = selectedTab > 0,
                    enabled = canWriteDevices && !isLoading && !mutating,
                    onRemove = { applyStatuses(listOf(device), "new") }
                )
            }
        }
    }

    candidateStatus?.let { targetStatus ->
        DeviceCandidatesDialog(
            targetStatus = targetStatus,
            devices = devices,
            saving = mutating,
            onDismiss = { if (!mutating) candidateStatus = null },
            onConfirm = { applyStatuses(it, targetStatus) }
        )
    }
}

@Composable
private fun DeviceSummaryCard(
    device: RouterDevice,
    onEdit: () -> Unit,
    onAction: (String) -> Unit,
    writeEnabled: Boolean,
    temporaryAccessEnabled: Boolean
) {
    val emptyValue = stringResource(R.string.value_empty)
    Card(colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant)) {
        Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(5.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.fillMaxWidth()) {
                Icon(
                    painter = painterResource(deviceTypeOption(device.deviceType).iconRes),
                    contentDescription = deviceTypeLabel(device.deviceType),
                    modifier = Modifier.size(32.dp)
                )
                Text(
                    "${displayDeviceId(device.id)} ${if (device.isAdministrator) "♛ " else ""}${device.name}",
                    modifier = Modifier.padding(start = 10.dp).weight(1f),
                    style = MaterialTheme.typography.titleMedium
                )
                IconButton(onClick = onEdit, enabled = writeEnabled) {
                    Icon(
                        painter = painterResource(R.drawable.ic_action_settings),
                        contentDescription = stringResource(R.string.action_configure)
                    )
                }
            }
            Text(stringResource(R.string.device_status_format, deviceStatusLabel(device.status)))
            Text(stringResource(R.string.device_type_format, deviceTypeLabel(device.deviceType)))
            Text(stringResource(R.string.device_ip_format, device.ip.ifBlank { emptyValue }))
            Text(stringResource(R.string.device_mac_format, device.mac.ifBlank { emptyValue }))
            Text(stringResource(R.string.device_group_format, device.group.ifBlank { emptyValue }))
            if (!device.isAdministrator) {
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    if (device.status != "allow") {
                        OutlinedButton(
                            onClick = { onAction("allow") },
                            enabled = writeEnabled,
                            modifier = Modifier.weight(1f)
                        ) { Text(stringResource(R.string.action_allow)) }
                    }
                    if (device.status != "blocked") {
                        OutlinedButton(
                            onClick = { onAction("block") },
                            enabled = writeEnabled,
                            modifier = Modifier.weight(1f)
                        ) { Text(stringResource(R.string.action_block)) }
                    }
                }
                if (device.status != "allow" && device.status != "blocked") {
                    OutlinedButton(
                        onClick = { onAction("temp") },
                        enabled = temporaryAccessEnabled,
                        modifier = Modifier.fillMaxWidth()
                    ) { Text("+30") }
                }
            }
        }
    }
}

@Composable
private fun ListDeviceCard(
    device: RouterDevice,
    removable: Boolean,
    enabled: Boolean,
    onRemove: () -> Unit
) {
    Card(colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant)) {
        Row(
            modifier = Modifier.fillMaxWidth().padding(12.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Icon(
                painter = painterResource(deviceTypeOption(device.deviceType).iconRes),
                contentDescription = deviceTypeLabel(device.deviceType),
                modifier = Modifier.size(30.dp)
            )
            Column(Modifier.padding(start = 10.dp).weight(1f)) {
                Text("${displayDeviceId(device.id)} ${device.name}", style = MaterialTheme.typography.titleMedium)
                Text("${device.ip}  ${device.mac}", style = MaterialTheme.typography.bodySmall)
            }
            if (removable) {
                IconButton(onClick = onRemove, enabled = enabled) {
                    Icon(
                        painter = painterResource(R.drawable.ic_delete),
                        contentDescription = stringResource(R.string.device_list_remove)
                    )
                }
            }
        }
    }
}

@Composable
private fun DeviceCandidatesDialog(
    targetStatus: String,
    devices: List<RouterDevice>,
    saving: Boolean,
    onDismiss: () -> Unit,
    onConfirm: (List<RouterDevice>) -> Unit
) {
    var filter by remember(targetStatus) { mutableStateOf("") }
    var selectedMacs by remember(targetStatus) { mutableStateOf(emptySet<String>()) }
    var validationError by remember(targetStatus) { mutableStateOf<String?>(null) }
    val normalizedFilter = filter.trim().lowercase()
    val candidates = devices
        .filter { device ->
            !device.isAdministrator && device.status != targetStatus &&
                (targetStatus != "blocked" || device.status != "allow")
        }
        .filter { device ->
            normalizedFilter.isBlank() || listOf(
                device.id,
                "#${device.id.removePrefix("#")}",
                device.name,
                device.ip,
                device.mac
            ).any { it.lowercase().contains(normalizedFilter) }
        }
        .sortedWith(
            compareByDescending<RouterDevice> { it.mac in selectedMacs }
                .thenByDescending { it.id.removePrefix("#").toIntOrNull() ?: 0 }
        )
    val targetLabel = deviceStatusLabel(targetStatus)
    val allowConflictText = stringResource(R.string.device_list_conflict_allow)

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(stringResource(R.string.device_list_add_title, targetLabel)) },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                OutlinedTextField(
                    value = filter,
                    onValueChange = { filter = it },
                    label = { Text(stringResource(R.string.device_list_filter_hint)) },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth()
                )
                validationError?.let { Text(it, color = MaterialTheme.colorScheme.error) }
                if (candidates.isEmpty()) {
                    Text(stringResource(R.string.device_list_candidates_empty))
                } else {
                    LazyColumn(
                        modifier = Modifier.fillMaxWidth().heightIn(max = 420.dp),
                        verticalArrangement = Arrangement.spacedBy(4.dp)
                    ) {
                        items(candidates, key = { it.id }) { device ->
                            Row(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .clickable(enabled = !saving) {
                                        selectedMacs = selectedMacs.toggle(device.mac)
                                    }
                                    .padding(vertical = 7.dp),
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                Column(Modifier.weight(1f)) {
                                    Text("${displayDeviceId(device.id)} ${device.name}")
                                    Text(
                                        "${device.ip}  ${device.mac}",
                                        style = MaterialTheme.typography.bodySmall
                                    )
                                    Text(deviceStatusLabel(device.status), style = MaterialTheme.typography.bodySmall)
                                }
                                Checkbox(
                                    checked = device.mac in selectedMacs,
                                    onCheckedChange = { selectedMacs = selectedMacs.toggle(device.mac) },
                                    enabled = !saving
                                )
                            }
                        }
                    }
                }
            }
        },
        confirmButton = {
            Button(
                enabled = !saving && selectedMacs.isNotEmpty(),
                onClick = {
                    val selected = devices.filter { it.mac in selectedMacs }
                    if (targetStatus == "allow" && selected.any { it.status == "blocked" }) {
                        validationError = allowConflictText
                    } else {
                        onConfirm(selected)
                    }
                }
            ) { Text(stringResource(R.string.action_add_selected)) }
        },
        dismissButton = {
            TextButton(onClick = onDismiss, enabled = !saving) {
                Text(stringResource(R.string.action_cancel))
            }
        }
    )
}

private fun Set<String>.toggle(value: String): Set<String> =
    if (value in this) this - value else this + value
