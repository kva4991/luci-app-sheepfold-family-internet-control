package app.sheepfold.android.ui.main

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
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
import app.sheepfold.android.router.RouterAdministrator
import app.sheepfold.android.router.RouterDevice

/** Только чтение: учётные записи и QR-привязка по-прежнему управляются в LuCI. */
@Composable
fun ParentDevicesTab(
    administrators: List<RouterAdministrator>,
    devices: List<RouterDevice>,
    currentDeviceId: String,
    isLoading: Boolean,
    onRefresh: () -> Unit
) {
    val groups = remember(administrators, devices, currentDeviceId) {
        groupParentDevices(administrators, devices, currentDeviceId)
    }
    LazyColumn(Modifier.fillMaxSize().padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        item {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(stringResource(R.string.tab_administrators), Modifier.weight(1f), style = MaterialTheme.typography.headlineSmall)
                IconButton(onClick = onRefresh, enabled = !isLoading) {
                    Icon(painterResource(R.drawable.ic_refresh), stringResource(R.string.action_refresh))
                }
            }
            if (isLoading) LinearProgressIndicator(Modifier.fillMaxWidth())
        }
        item {
            val parent = groups.parent
            if (parent != null) {
                Text(parent.displayName, style = MaterialTheme.typography.titleLarge)
                Text(stringResource(R.string.administrator_login_format, parent.login))
                Text(stringResource(if (parent.allowChildAccessRequests)
                    R.string.administrator_access_requests_enabled else R.string.administrator_access_requests_disabled))
            } else if (!isLoading) Text(stringResource(R.string.parent_devices_owner_missing))
        }
        item { Text(stringResource(R.string.parent_devices_mine), style = MaterialTheme.typography.titleMedium) }
        if (!isLoading && groups.mine.isEmpty()) item { Text(stringResource(R.string.parent_devices_empty)) }
        items(groups.mine, key = { "mine-${it.id}" }) { device ->
            ParentDeviceCard(device, currentDeviceId, null)
        }
        item { Text(stringResource(R.string.parent_devices_others), style = MaterialTheme.typography.titleMedium) }
        if (!isLoading && groups.others.isEmpty()) item { Text(stringResource(R.string.parent_devices_empty)) }
        items(groups.others, key = { "other-${it.id}" }) { device ->
            val owner = administrators.singleOrNull {
                device.administratorLogin.isNotBlank() && it.login == device.administratorLogin
            }
            ParentDeviceCard(device, currentDeviceId, owner?.displayName ?: stringResource(R.string.parent_devices_unknown_owner))
        }
    }
}

@Composable
private fun ParentDeviceCard(device: RouterDevice, currentDeviceId: String, owner: String?) {
    var details by rememberSaveable(device.id) { mutableStateOf(false) }
    Card(Modifier.fillMaxWidth(), shape = RoundedCornerShape(8.dp),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant)) {
        Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                Icon(painterResource(deviceTypeOption(device.deviceType).iconRes), null, Modifier.size(32.dp))
                Column(Modifier.weight(1f)) {
                    Text(device.name, style = MaterialTheme.typography.titleMedium)
                    if (device.id == currentDeviceId) Text(stringResource(R.string.parent_devices_current))
                    if (owner != null) Text(owner, style = MaterialTheme.typography.bodySmall)
                }
            }
            TextButton(onClick = { details = !details }) {
                Text(stringResource(if (details) R.string.device_less_details else R.string.device_more_details))
            }
            if (details) {
                Text(displayDeviceId(device.id))
                Text(stringResource(R.string.device_ip_format, device.ip.ifBlank { stringResource(R.string.value_empty) }))
                Text(stringResource(R.string.device_mac_format, device.mac.ifBlank { stringResource(R.string.value_empty) }))
            }
        }
    }
}
