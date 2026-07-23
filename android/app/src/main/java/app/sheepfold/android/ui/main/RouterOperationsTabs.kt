package app.sheepfold.android.ui.main

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import app.sheepfold.android.R
import app.sheepfold.android.router.RouterAdminClient
import app.sheepfold.android.router.RouterAdminConfig
import app.sheepfold.android.router.RouterAdministrator
import app.sheepfold.android.router.RouterDevice
import app.sheepfold.android.router.RouterWifiModule
import kotlinx.coroutines.launch

/**
 * Учётные записи и QR остаются в LuCI: там уже существует owner-проверка и
 * одноразовая pairing-транзакция. APK показывает реальные безопасные поля.
 */
@Composable
fun AdministratorsTab(
    administrators: List<RouterAdministrator>,
    devices: List<RouterDevice>,
    isLoading: Boolean,
    onRefresh: () -> Unit
) {
    LazyColumn(
        modifier = Modifier
            .fillMaxSize()
            .padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp)
    ) {
        item {
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                Text(stringResource(R.string.administrators_title), style = MaterialTheme.typography.headlineSmall)
                OutlinedButton(onClick = onRefresh, enabled = !isLoading) {
                    Text(stringResource(R.string.action_refresh))
                }
            }
            Text(stringResource(R.string.administrators_pairing_note))
            if (isLoading) CircularProgressIndicator()
        }
        if (!isLoading && administrators.isEmpty()) {
            item { Text(stringResource(R.string.administrators_empty)) }
        }
        items(administrators, key = { it.section }) { administrator ->
            Card(colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant)) {
                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(14.dp),
                    verticalArrangement = Arrangement.spacedBy(5.dp)
                ) {
                    Text(administrator.displayName, style = MaterialTheme.typography.titleMedium)
                    Text(stringResource(R.string.administrator_login_format, administrator.login))
                    Text(stringResource(R.string.administrator_role_format, administrator.role))
                    Text(stringResource(R.string.administrator_id_format, administrator.id.ifBlank { "—" }))
                    Text(
                        if (administrator.allowChildAccessRequests) {
                            stringResource(R.string.administrator_access_requests_enabled)
                        } else {
                            stringResource(R.string.administrator_access_requests_disabled)
                        }
                    )
                }
            }
        }
        val pairedDevices = devices.filter { it.isAdministrator }
        if (pairedDevices.isNotEmpty()) {
            item {
                Text(
                    stringResource(R.string.administrator_paired_devices),
                    style = MaterialTheme.typography.titleMedium
                )
            }
            items(pairedDevices, key = { "admin-device-${it.id}" }) { device ->
                Card(colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant)) {
                    Column(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(14.dp),
                        verticalArrangement = Arrangement.spacedBy(4.dp)
                    ) {
                        Text("#${device.id} ${device.name}", style = MaterialTheme.typography.titleMedium)
                        Text(device.ip.ifBlank { "—" })
                        Text(device.mac.ifBlank { "—" })
                    }
                }
            }
        }
    }
}

@Composable
fun WifiTab(
    client: RouterAdminClient,
    config: RouterAdminConfig,
    wifiModules: List<RouterWifiModule>,
    isLoading: Boolean,
    onRefresh: () -> Unit
) {
    val scope = rememberCoroutineScope()
    var isSaving by remember { mutableStateOf(false) }
    var message by remember { mutableStateOf<String?>(null) }
    var messageIsError by remember { mutableStateOf(false) }
    var pendingState by remember { mutableStateOf<Boolean?>(null) }
    val canControl = config.capabilities.wifiControl
    val wifiEnabledText = stringResource(R.string.wifi_enabled_success)
    val wifiDisabledText = stringResource(R.string.wifi_disabled_success)
    val wifiFailedText = stringResource(R.string.management_error_update_wifi)

    LazyColumn(
        modifier = Modifier
            .fillMaxSize()
            .padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp)
    ) {
        item {
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                Text(stringResource(R.string.wifi_title), style = MaterialTheme.typography.headlineSmall)
                OutlinedButton(onClick = onRefresh, enabled = !isLoading && !isSaving) {
                    Text(stringResource(R.string.action_refresh))
                }
            }
            Text(stringResource(R.string.wifi_security_note))
            ParentInlineStatus(message, messageIsError)
            Button(
                onClick = { pendingState = !config.wifiEnabled },
                enabled = canControl && !isLoading && !isSaving,
                modifier = Modifier.fillMaxWidth()
            ) {
                Text(
                    if (config.wifiEnabled) {
                        stringResource(R.string.wifi_disable_all)
                    } else {
                        stringResource(R.string.wifi_enable_all)
                    }
                )
            }
            if (isLoading || isSaving) CircularProgressIndicator()
        }
        if (!isLoading && wifiModules.isEmpty()) {
            item { Text(stringResource(R.string.wifi_empty)) }
        }
        items(wifiModules, key = { it.path.ifBlank { it.name } }) { module ->
            Card(colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant)) {
                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(14.dp),
                    verticalArrangement = Arrangement.spacedBy(4.dp)
                ) {
                    Text(
                        module.name.ifBlank { module.path.ifBlank { stringResource(R.string.tab_wifi) } },
                        style = MaterialTheme.typography.titleMedium
                    )
                    Text(stringResource(R.string.wifi_module_status, module.status.ifBlank { "—" }))
                    Text(
                        stringResource(
                            R.string.wifi_band_channel_format,
                            module.band.ifBlank { "—" },
                            module.channel.ifBlank { "—" }
                        )
                    )
                    Text(stringResource(R.string.wifi_country_format, module.country.ifBlank { "—" }))
                    Text(stringResource(R.string.wifi_mode_format, module.mode.ifBlank { "—" }))
                }
            }
        }
    }

    pendingState?.let { enabled ->
        AlertDialog(
            onDismissRequest = { pendingState = null },
            title = {
                Text(
                    if (enabled) stringResource(R.string.wifi_enable_title)
                    else stringResource(R.string.wifi_disable_title)
                )
            },
            text = {
                Text(
                    if (enabled) stringResource(R.string.wifi_enable_message)
                    else stringResource(R.string.wifi_disable_message)
                )
            },
            confirmButton = {
                TextButton(
                    enabled = !isSaving,
                    onClick = {
                        pendingState = null
                        isSaving = true
                        scope.launch {
                            runCatching { client.setWifiEnabled(enabled) }
                                .onSuccess {
                                    message = if (enabled) wifiEnabledText else wifiDisabledText
                                    messageIsError = false
                                    onRefresh()
                                }
                                .onFailure {
                                    message = it.message ?: wifiFailedText
                                    messageIsError = true
                                }
                            isSaving = false
                        }
                    }
                ) {
                    Text(
                        if (enabled) stringResource(R.string.wifi_enable_all)
                        else stringResource(R.string.wifi_disable_all)
                    )
                }
            },
            dismissButton = {
                TextButton(onClick = { pendingState = null }) {
                    Text(stringResource(R.string.action_cancel))
                }
            }
        )
    }
}

@Composable
fun LogsTab(client: RouterAdminClient, config: RouterAdminConfig) {
    val scope = rememberCoroutineScope()
    var entries by remember { mutableStateOf<List<String>>(emptyList()) }
    var filter by remember { mutableStateOf("") }
    var isLoading by remember { mutableStateOf(false) }
    var message by remember { mutableStateOf<String?>(null) }
    var messageIsError by remember { mutableStateOf(false) }
    var confirmClear by remember { mutableStateOf(false) }
    val loadFailedText = stringResource(R.string.management_error_load_logs)
    val clearFailedText = stringResource(R.string.management_error_clear_logs)
    val clearedText = stringResource(R.string.logs_cleared_success)

    fun refresh() {
        if (!config.capabilities.logRead) return
        isLoading = true
        message = null
        scope.launch {
            runCatching { client.loadLog(300) }
                .onSuccess { entries = it.reversed() }
                .onFailure {
                    message = it.message ?: loadFailedText
                    messageIsError = true
                }
            isLoading = false
        }
    }

    LaunchedEffect(client, config.revision) { refresh() }

    val filtered = remember(entries, filter) {
        if (filter.isBlank()) entries else entries.filter { it.contains(filter, ignoreCase = true) }
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp)
    ) {
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
            Text(stringResource(R.string.logs_title), style = MaterialTheme.typography.headlineSmall)
            OutlinedButton(onClick = ::refresh, enabled = !isLoading && config.capabilities.logRead) {
                Text(stringResource(R.string.action_refresh))
            }
        }
        Text(stringResource(R.string.logs_privacy_note))
        OutlinedTextField(
            value = filter,
            onValueChange = { filter = it },
            label = { Text(stringResource(R.string.logs_filter)) },
            modifier = Modifier.fillMaxWidth(),
            singleLine = true
        )
        OutlinedButton(
            onClick = { confirmClear = true },
            enabled = !isLoading && entries.isNotEmpty() && config.capabilities.logClear,
            modifier = Modifier.fillMaxWidth()
        ) { Text(stringResource(R.string.logs_clear)) }
        ParentInlineStatus(message, messageIsError)
        if (isLoading && entries.isEmpty()) CircularProgressIndicator()
        if (!isLoading && entries.isEmpty()) Text(stringResource(R.string.logs_empty))

        LazyColumn(Modifier.fillMaxSize(), verticalArrangement = Arrangement.spacedBy(6.dp)) {
            items(filtered) { entry ->
                Card(colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant)) {
                    Text(entry, Modifier.fillMaxWidth().padding(12.dp))
                }
            }
        }
    }

    if (confirmClear) {
        AlertDialog(
            onDismissRequest = { confirmClear = false },
            title = { Text(stringResource(R.string.logs_clear_title)) },
            text = { Text(stringResource(R.string.logs_clear_message)) },
            confirmButton = {
                TextButton(onClick = {
                    confirmClear = false
                    isLoading = true
                    scope.launch {
                        runCatching { client.clearLog() }
                            .onSuccess {
                                entries = emptyList()
                                message = clearedText
                                messageIsError = false
                            }
                            .onFailure {
                                message = it.message ?: clearFailedText
                                messageIsError = true
                            }
                        isLoading = false
                    }
                }) { Text(stringResource(R.string.logs_clear)) }
            },
            dismissButton = {
                TextButton(onClick = { confirmClear = false }) {
                    Text(stringResource(R.string.action_cancel))
                }
            }
        )
    }
}
