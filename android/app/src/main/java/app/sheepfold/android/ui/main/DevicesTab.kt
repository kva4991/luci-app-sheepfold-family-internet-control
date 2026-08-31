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
    onRefresh: () -> Unit,
    workspace: ParentWorkspace = remember { ParentWorkspace() }
) {
    val scope = workspace.scope
    val editingDevice = workspace.device
    var mutating by workspace.deviceTask.busy
    var error by workspace.deviceTask.message
    val canWriteDevices = config.capabilities.deviceWrite && config.revision.isNotBlank()
    val updateRouterText = stringResource(R.string.devices_update_router)
    val runtimePendingText = stringResource(R.string.management_runtime_pending)
    val shownDevices = filterDevices(devices, workspace.deviceFilter)

    fun saveDevice(device: RouterDevice) {
        if (!canWriteDevices) {
            error = updateRouterText
            return
        }
        mutating = true
        error = null
        scope.launch {
            val revision = editingDevice?.revision ?: config.revision
            runCatching { client.saveDevice(config.copy(revision = revision), device) }
                .onSuccess { updated ->
                    onConfigChanged(updated)
                    error = if (updated.mutation?.runtimeApplied == false) runtimePendingText else null
                    workspace.device = null
                    onRefresh()
                }
                .onFailure { if (it is kotlinx.coroutines.CancellationException) throw it; error = it.message }
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
            }.onFailure { if (it is kotlinx.coroutines.CancellationException) throw it; error = it.message }
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
                Text(stringResource(R.string.devices_title), style = MaterialTheme.typography.headlineSmall, modifier = Modifier.weight(1f))
                IconButton(onClick = onRefresh, enabled = !isLoading && !mutating) {
                    Icon(painterResource(R.drawable.ic_refresh), stringResource(R.string.action_refresh))
                }
            }
            error?.let { Text(it, color = MaterialTheme.colorScheme.error) }
            if (!canWriteDevices) Text(updateRouterText)
        }
        item { DeviceFilterField(workspace.deviceFilter) { workspace.deviceFilter = it } }
        if (!isLoading && devices.isEmpty()) item { Text(stringResource(R.string.devices_empty)) }
        else if (!isLoading && shownDevices.isEmpty()) item { Text(stringResource(R.string.device_filter_empty)) }
        items(shownDevices, key = { it.id }) { device ->
            DeviceCard(
                device = device,
                onEdit = { workspace.device = FormDraft(device, config.revision) },
                onAction = { runAction(device, it) },
                writeEnabled = canWriteDevices && !isLoading && !mutating,
                temporaryAccessEnabled = !isLoading && !mutating
            )
        }
    }

    editingDevice?.let { form ->
        DeviceEditorDialog(
            device = form.original,
            form = form,
            groups = config.groups,
            saving = mutating,
            error = error,
            onDismiss = {
                workspace.device = null
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
    onRefresh: () -> Unit,
    workspace: ParentWorkspace = remember { ParentWorkspace() }
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
    val listDevices = when (selectedTab) {
        1 -> devices.filter { it.status == "allow" }
        2 -> devices.filter { it.status == "blocked" }
        else -> devices
    }
    val shownDevices = filterDevices(listDevices, workspace.listFilter)

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
            item { DeviceFilterField(workspace.listFilter) { workspace.listFilter = it } }
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
            if (!isLoading && shownDevices.isEmpty()) item { Text(stringResource(if (listDevices.isEmpty()) R.string.devices_empty else R.string.device_filter_empty)) }
            items(shownDevices, key = { it.id }) { device ->
                DeviceCard(
                    device = device,
                    writeEnabled = canWriteDevices && !isLoading && !mutating,
                    onRemove = if (selectedTab > 0) ({ applyStatuses(listOf(device), "new") }) else null
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
