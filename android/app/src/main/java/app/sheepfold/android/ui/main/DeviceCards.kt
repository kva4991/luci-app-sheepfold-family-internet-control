package app.sheepfold.android.ui.main

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import app.sheepfold.android.R
import app.sheepfold.android.router.RouterDevice

/** Общая карточка списка: технические поля скрыты, но доступны без сетевого запроса. */
@OptIn(ExperimentalLayoutApi::class)
@Composable
internal fun DeviceCard(
    device: RouterDevice,
    onEdit: (() -> Unit)? = null,
    onAction: ((String) -> Unit)? = null,
    writeEnabled: Boolean = false,
    temporaryAccessEnabled: Boolean = false,
    onRemove: (() -> Unit)? = null
) {
    var details by rememberSaveable(device.id) { mutableStateOf(false) }
    var rules by rememberSaveable(device.id) { mutableStateOf(false) }
    val group = device.group.takeUnless { it.isBlank() || it == "Not configured" }
        ?: stringResource(R.string.device_group_unconfigured)
    Card(Modifier.fillMaxWidth(), shape = RoundedCornerShape(8.dp),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant)) {
        Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                Icon(painterResource(deviceTypeOption(device.deviceType).iconRes), deviceTypeLabel(device.deviceType), Modifier.size(32.dp))
                Column(Modifier.weight(1f)) {
                    Text(device.name, style = MaterialTheme.typography.titleMedium)
                    Text(group, style = MaterialTheme.typography.bodySmall)
                }
            }
            // /devices сообщает политику UCI, но не итоговый интернет и не online. §andpanel1
            Text(stringResource(R.string.device_policy_format, deviceStatusLabel(device.status)))
            if (device.isAdministrator) Text(stringResource(R.string.device_is_administrator), style = MaterialTheme.typography.bodySmall)
            if (!device.isAdministrator && device.status !in listOf("allow", "blocked") && onAction != null) {
                OutlinedButton(onClick = { onAction("temp") }, enabled = temporaryAccessEnabled, modifier = Modifier.fillMaxWidth()) {
                    Text(stringResource(R.string.device_allow_30_minutes))
                }
            }
            FlowRow(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                if (onAction != null || onEdit != null) TextButton(onClick = { rules = true }) {
                    Text(stringResource(R.string.device_access_rules))
                }
                TextButton(onClick = { details = !details }) {
                    Text(stringResource(if (details) R.string.device_less_details else R.string.device_more_details))
                }
                if (onRemove != null) TextButton(onClick = onRemove, enabled = writeEnabled) {
                    Text(stringResource(R.string.device_list_remove))
                }
            }
            if (details) DeviceDetails(device)
        }
    }
    if (rules) {
        AlertDialog(
            onDismissRequest = { rules = false },
            title = { Text(stringResource(R.string.device_access_rules)) },
            text = {
                Column(Modifier.verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    Text(device.name)
                    Text(stringResource(R.string.device_policy_format, deviceStatusLabel(device.status)))
                    Text(stringResource(R.string.device_permanent_rules_hint), style = MaterialTheme.typography.bodySmall)
                    if (!device.isAdministrator && onAction != null) {
                        listOf("allow" to R.string.device_add_allowlist, "block" to R.string.device_add_blocklist).forEach { (action, label) ->
                            val status = if (action == "allow") "allow" else "blocked"
                            if (device.status != status) {
                                OutlinedButton(onClick = { rules = false; onAction(action) }, enabled = writeEnabled, modifier = Modifier.fillMaxWidth()) { Text(stringResource(label)) }
                            }
                        }
                    }
                    if (onEdit != null) TextButton(onClick = { rules = false; onEdit() }, enabled = writeEnabled) {
                        Icon(painterResource(R.drawable.ic_action_settings), null, Modifier.size(20.dp))
                        Spacer(Modifier.width(6.dp))
                        Text(stringResource(R.string.action_configure))
                    }
                }
            },
            confirmButton = { TextButton(onClick = { rules = false }) { Text(stringResource(R.string.action_close)) } }
        )
    }
}

@Composable
private fun DeviceDetails(device: RouterDevice) {
    val empty = stringResource(R.string.value_empty)
    HorizontalDivider()
    Text(displayDeviceId(device.id), style = MaterialTheme.typography.bodySmall)
    Text(stringResource(R.string.device_type_format, deviceTypeLabel(device.deviceType)))
    Text(stringResource(R.string.device_ip_format, device.ip.ifBlank { empty }))
    Text(stringResource(R.string.device_mac_format, device.mac.ifBlank { empty }))
}
