package app.sheepfold.android.ui.main

import android.graphics.Bitmap
import androidx.compose.foundation.Image
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ExposedDropdownMenuBox
import androidx.compose.material3.ExposedDropdownMenuDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.MenuAnchorType
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.unit.dp
import app.sheepfold.android.R
import app.sheepfold.android.router.RouterAdminClient
import app.sheepfold.android.router.RouterAdminConfig
import app.sheepfold.android.router.RouterWifiModule
import app.sheepfold.android.router.RouterWifiNetwork
import com.google.zxing.BarcodeFormat
import com.google.zxing.MultiFormatWriter
import kotlinx.coroutines.launch

@Composable
fun WifiTab(
    client: RouterAdminClient,
    config: RouterAdminConfig,
    wifiModules: List<RouterWifiModule>,
    isLoading: Boolean,
    onConfigChanged: (RouterAdminConfig) -> Unit,
    onRefresh: () -> Unit
) {
    val scope = rememberCoroutineScope()
    var isSaving by remember { mutableStateOf(false) }
    var message by remember { mutableStateOf<String?>(null) }
    var messageIsError by remember { mutableStateOf(false) }
    var pendingGlobalState by remember { mutableStateOf<Boolean?>(null) }
    val canControl = config.capabilities.wifiControl
    val canSaveAutomation = config.capabilities.wifiAutomationWrite && config.revision.isNotBlank()
    val wifiEnabledText = stringResource(R.string.wifi_enabled_success)
    val wifiDisabledText = stringResource(R.string.wifi_disabled_success)
    val wifiFailedText = stringResource(R.string.management_error_update_wifi)
    val wifiSavedText = stringResource(R.string.wifi_saved_success)
    val wifiAutomationSavedText = stringResource(R.string.wifi_automation_saved)
    val runtimePendingText = stringResource(R.string.management_runtime_pending)

    fun saveNetwork(network: RouterWifiNetwork) {
        isSaving = true
        message = null
        scope.launch {
            runCatching { client.saveWifiNetwork(config, network) }
                .onSuccess {
                    onConfigChanged(it)
                    val runtimePending = it.mutation?.runtimeApplied == false
                    message = if (runtimePending) {
                        "$wifiSavedText $runtimePendingText"
                    } else {
                        wifiSavedText
                    }
                    messageIsError = runtimePending
                }
                .onFailure {
                    message = it.message ?: wifiFailedText
                    messageIsError = true
                }
            isSaving = false
        }
    }

    fun saveAutomation(automation: app.sheepfold.android.router.RouterWifiAutomation) {
        isSaving = true
        message = null
        scope.launch {
            runCatching { client.saveWifiAutomation(config, automation) }
                .onSuccess {
                    onConfigChanged(it)
                    message = wifiAutomationSavedText
                    messageIsError = false
                }
                .onFailure {
                    message = it.message ?: wifiFailedText
                    messageIsError = true
                }
            isSaving = false
        }
    }

    LazyColumn(
        modifier = Modifier
            .fillMaxSize()
            .padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp)
    ) {
        item {
            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.SpaceBetween
            ) {
                Text(stringResource(R.string.wifi_title), style = MaterialTheme.typography.headlineSmall)
                Switch(
                    checked = config.wifiEnabled,
                    enabled = canControl && !isLoading && !isSaving,
                    onCheckedChange = { pendingGlobalState = it }
                )
            }
            Text(stringResource(R.string.wifi_security_note))
            ParentInlineStatus(message, messageIsError)
            if (isLoading || isSaving) CircularProgressIndicator()
        }
        if (!isLoading && config.wifiNetworks.isEmpty()) {
            item { Text(stringResource(R.string.wifi_empty)) }
        }
        items(config.wifiNetworks, key = { it.section }) { network ->
            WifiNetworkCard(
                network = network,
                enabled = !isSaving && canControl,
                onSave = ::saveNetwork
            )
        }
        if (config.wifiNetworks.isEmpty() && wifiModules.isNotEmpty()) {
            items(wifiModules, key = { it.path.ifBlank { it.name } }) { module ->
                Card(colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant)) {
                    Column(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(14.dp),
                        verticalArrangement = Arrangement.spacedBy(4.dp)
                    ) {
                        Text(module.name.ifBlank { module.path }, style = MaterialTheme.typography.titleMedium)
                        Text(stringResource(R.string.wifi_module_status, module.status))
                        Text(stringResource(R.string.wifi_band_channel_format, module.band, module.channel))
                    }
                }
            }
        }
        item {
            WifiAutomationCard(
                current = config.wifiAutomation,
                enabled = canSaveAutomation && !isLoading && !isSaving,
                onSave = ::saveAutomation
            )
            if (!canSaveAutomation) Text(stringResource(R.string.wifi_automation_update_router))
        }
    }

    pendingGlobalState?.let { enabled ->
        AlertDialog(
            onDismissRequest = { pendingGlobalState = null },
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
                        pendingGlobalState = null
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
                TextButton(onClick = { pendingGlobalState = null }) {
                    Text(stringResource(R.string.action_cancel))
                }
            }
        )
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun WifiNetworkCard(
    network: RouterWifiNetwork,
    enabled: Boolean,
    onSave: (RouterWifiNetwork) -> Unit
) {
    var ssid by remember(network.section, network.ssid) { mutableStateOf(network.ssid) }
    var password by remember(network.section, network.password) { mutableStateOf(network.password) }
    var encryption by remember(network.section, network.encryption) { mutableStateOf(network.encryption) }
    var channel by remember(network.section, network.channel) { mutableStateOf(network.channel) }
    var networkEnabled by remember(network.section, network.enabled) { mutableStateOf(network.enabled) }
    var passwordVisible by remember { mutableStateOf(false) }
    var securityExpanded by remember { mutableStateOf(false) }
    var channelExpanded by remember { mutableStateOf(false) }
    val securityOptions = listOf("sae-mixed", "psk2", "sae", "psk-mixed", "wep", "none")
        .let { options -> if (network.encryption in options) options else listOf(network.encryption) + options }
    val channelOptions = listOf("auto", "1", "6", "11", "36", "44", "149")
        .let { options -> if (network.channel in options) options else listOf(network.channel) + options }
    val edited = network.copy(
        ssid = ssid.trim(),
        password = password,
        encryption = encryption,
        channel = channel,
        enabled = networkEnabled
    )
    // QR должен содержать подтверждённые роутером данные, а не ещё не сохранённый черновик формы.
    val qrBitmap = remember(network.ssid, network.password, network.encryption) {
        wifiQrBitmap(wifiQrPayload(network.ssid, network.password, network.encryption))
    }

    Card(colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant)) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(14.dp),
            verticalArrangement = Arrangement.spacedBy(9.dp)
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.SpaceBetween
            ) {
                Text(
                    ssid.ifBlank { stringResource(R.string.wifi_network_unnamed) },
                    style = MaterialTheme.typography.titleMedium
                )
                Switch(checked = networkEnabled, onCheckedChange = { networkEnabled = it }, enabled = enabled)
            }
            if (network.band.isNotBlank()) {
                Text(stringResource(R.string.wifi_band_format, network.band))
            }
            OutlinedTextField(
                value = ssid,
                onValueChange = { ssid = it },
                label = { Text(stringResource(R.string.wifi_ssid)) },
                modifier = Modifier.fillMaxWidth(),
                enabled = enabled,
                singleLine = true
            )
            OutlinedTextField(
                value = password,
                onValueChange = { password = it },
                label = { Text(stringResource(R.string.wifi_password)) },
                modifier = Modifier.fillMaxWidth(),
                enabled = enabled && encryption != "none",
                singleLine = true,
                visualTransformation = if (passwordVisible) VisualTransformation.None else PasswordVisualTransformation(),
                trailingIcon = {
                    TextButton(onClick = { passwordVisible = !passwordVisible }) {
                        Text(
                            stringResource(
                                if (passwordVisible) R.string.action_hide else R.string.action_show
                            )
                        )
                    }
                }
            )
            ExposedDropdownMenuBox(
                expanded = securityExpanded,
                onExpandedChange = { securityExpanded = !securityExpanded }
            ) {
                OutlinedTextField(
                    value = encryption,
                    onValueChange = {},
                    readOnly = true,
                    label = { Text(stringResource(R.string.wifi_security)) },
                    trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(securityExpanded) },
                    modifier = Modifier
                        .menuAnchor(MenuAnchorType.PrimaryNotEditable, enabled = enabled)
                        .fillMaxWidth(),
                    enabled = enabled
                )
                ExposedDropdownMenu(
                    expanded = securityExpanded,
                    onDismissRequest = { securityExpanded = false }
                ) {
                    securityOptions.distinct().forEach { option ->
                        DropdownMenuItem(
                            text = { Text(wifiSecurityLabel(option)) },
                            onClick = {
                                encryption = option
                                securityExpanded = false
                            }
                        )
                    }
                }
            }
            ExposedDropdownMenuBox(
                expanded = channelExpanded,
                onExpandedChange = { channelExpanded = !channelExpanded }
            ) {
                OutlinedTextField(
                    value = if (channel == "auto") stringResource(R.string.wifi_channel_auto) else channel,
                    onValueChange = {},
                    readOnly = true,
                    label = { Text(stringResource(R.string.wifi_channel)) },
                    trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(channelExpanded) },
                    modifier = Modifier
                        .menuAnchor(MenuAnchorType.PrimaryNotEditable, enabled = enabled)
                        .fillMaxWidth(),
                    enabled = enabled
                )
                ExposedDropdownMenu(
                    expanded = channelExpanded,
                    onDismissRequest = { channelExpanded = false }
                ) {
                    channelOptions.distinct().forEach { option ->
                        DropdownMenuItem(
                            text = {
                                Text(
                                    if (option == "auto") stringResource(R.string.wifi_channel_auto)
                                    else option
                                )
                            },
                            onClick = {
                                channel = option
                                channelExpanded = false
                            }
                        )
                    }
                }
            }
            qrBitmap?.let {
                Image(
                    bitmap = it.asImageBitmap(),
                    contentDescription = stringResource(R.string.wifi_qr_description, network.ssid),
                    modifier = Modifier
                        .size(220.dp)
                        .align(Alignment.CenterHorizontally)
                )
                Text(
                    stringResource(R.string.wifi_qr_hint),
                    modifier = Modifier.align(Alignment.CenterHorizontally)
                )
            }
            Button(
                onClick = { onSave(edited) },
                enabled = enabled && edited.ssid.isNotBlank(),
                modifier = Modifier.fillMaxWidth()
            ) {
                Text(stringResource(R.string.settings_save))
            }
        }
    }
}

@Composable
private fun wifiSecurityLabel(value: String): String = when (value) {
    "none" -> stringResource(R.string.wifi_security_open)
    "psk2" -> "WPA2-PSK"
    "sae" -> "WPA3-SAE"
    "sae-mixed" -> "WPA2/WPA3"
    "psk-mixed" -> "WPA/WPA2"
    "wep" -> "WEP"
    else -> value
}

internal fun wifiQrPayload(ssid: String, password: String, encryption: String): String {
    fun escape(value: String) = buildString {
        value.forEach { character ->
            if (character in charArrayOf('\\', ';', ',', ':', '"')) append('\\')
            append(character)
        }
    }
    val qrType = when (encryption) {
        "none" -> "nopass"
        "wep" -> "WEP"
        else -> "WPA"
    }
    val secret = if (encryption == "none") "" else "P:${escape(password)};"
    return "WIFI:T:$qrType;S:${escape(ssid)};$secret;"
}

private fun wifiQrBitmap(payload: String): Bitmap? {
    if (payload.isBlank()) return null
    return runCatching {
        val matrix = MultiFormatWriter().encode(payload, BarcodeFormat.QR_CODE, 512, 512)
        Bitmap.createBitmap(matrix.width, matrix.height, Bitmap.Config.ARGB_8888).also { bitmap ->
            for (y in 0 until matrix.height) {
                for (x in 0 until matrix.width) {
                    bitmap.setPixel(x, y, if (matrix[x, y]) android.graphics.Color.BLACK else android.graphics.Color.WHITE)
                }
            }
        }
    }.getOrNull()
}
