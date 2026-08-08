package app.sheepfold.android.ui.main

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ExposedDropdownMenuBox
import androidx.compose.material3.ExposedDropdownMenuDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.MenuAnchorType
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import app.sheepfold.android.R
import app.sheepfold.android.router.RouterDevice
import app.sheepfold.android.router.RouterGroup

private const val UNCONFIGURED_GROUP = "Not configured"

/** Редактор пишет профиль устройства на роутер только после явного сохранения. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
internal fun DeviceEditorDialog(
    device: RouterDevice,
    groups: List<RouterGroup>,
    saving: Boolean,
    error: String?,
    onDismiss: () -> Unit,
    onSave: (RouterDevice) -> Unit
) {
    var name by remember(device.mac) { mutableStateOf(device.name) }
    var group by remember(device.mac) { mutableStateOf(device.group.ifBlank { UNCONFIGURED_GROUP }) }
    var deviceType by remember(device.mac) { mutableStateOf(device.deviceType) }
    var status by remember(device.mac) { mutableStateOf(device.status) }
    var groupExpanded by remember { mutableStateOf(false) }
    var typeExpanded by remember { mutableStateOf(false) }
    var statusExpanded by remember { mutableStateOf(false) }
    val selectedType = deviceTypeOption(deviceType)
    val groupOptions = listOf(UNCONFIGURED_GROUP) + groups.map { it.name }.filter { it.isNotBlank() }

    AlertDialog(
        onDismissRequest = { if (!saving) onDismiss() },
        title = { Text(stringResource(R.string.device_edit_title, device.id.removePrefix("#"))) },
        text = {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .verticalScroll(rememberScrollState()),
                verticalArrangement = Arrangement.spacedBy(10.dp)
            ) {
                OutlinedTextField(
                    value = name,
                    onValueChange = { name = it },
                    label = { Text(stringResource(R.string.device_name_label)) },
                    enabled = !saving,
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth()
                )
                ExposedDropdownMenuBox(
                    expanded = groupExpanded,
                    onExpandedChange = { if (!saving && !device.isAdministrator) groupExpanded = !groupExpanded }
                ) {
                    OutlinedTextField(
                        value = if (group == UNCONFIGURED_GROUP) {
                            stringResource(R.string.device_group_unconfigured)
                        } else group,
                        onValueChange = {},
                        readOnly = true,
                        label = { Text(stringResource(R.string.device_group_label)) },
                        trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(groupExpanded) },
                        enabled = !saving && !device.isAdministrator,
                        modifier = Modifier
                            .menuAnchor(
                                MenuAnchorType.PrimaryNotEditable,
                                enabled = !saving && !device.isAdministrator
                            )
                            .fillMaxWidth()
                    )
                    ExposedDropdownMenu(
                        expanded = groupExpanded,
                        onDismissRequest = { groupExpanded = false }
                    ) {
                        groupOptions.distinct().forEach { option ->
                            DropdownMenuItem(
                                text = {
                                    Text(
                                        if (option == UNCONFIGURED_GROUP) {
                                            stringResource(R.string.device_group_unconfigured)
                                        } else option
                                    )
                                },
                                onClick = {
                                    group = option
                                    groupExpanded = false
                                }
                            )
                        }
                    }
                }
                ExposedDropdownMenuBox(
                    expanded = typeExpanded,
                    onExpandedChange = { if (!saving) typeExpanded = !typeExpanded }
                ) {
                    OutlinedTextField(
                        value = stringResource(selectedType.labelRes),
                        onValueChange = {},
                        readOnly = true,
                        label = { Text(stringResource(R.string.device_type_label)) },
                        leadingIcon = {
                            Icon(
                                painter = painterResource(selectedType.iconRes),
                                contentDescription = null
                            )
                        },
                        trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(typeExpanded) },
                        enabled = !saving,
                        modifier = Modifier
                            .menuAnchor(MenuAnchorType.PrimaryNotEditable, enabled = !saving)
                            .fillMaxWidth()
                    )
                    ExposedDropdownMenu(
                        expanded = typeExpanded,
                        onDismissRequest = { typeExpanded = false }
                    ) {
                        deviceTypeOptions.forEach { option ->
                            DropdownMenuItem(
                                leadingIcon = {
                                    Icon(
                                        painter = painterResource(option.iconRes),
                                        contentDescription = null
                                    )
                                },
                                text = { Text(stringResource(option.labelRes)) },
                                onClick = {
                                    deviceType = option.code
                                    typeExpanded = false
                                }
                            )
                        }
                    }
                }
                Text(
                    stringResource(R.string.device_type_manual_hint),
                    style = MaterialTheme.typography.bodySmall
                )
                ExposedDropdownMenuBox(
                    expanded = statusExpanded,
                    onExpandedChange = { if (!saving && !device.isAdministrator) statusExpanded = !statusExpanded }
                ) {
                    OutlinedTextField(
                        value = deviceStatusLabel(status),
                        onValueChange = {},
                        readOnly = true,
                        label = { Text(stringResource(R.string.device_access_label)) },
                        trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(statusExpanded) },
                        enabled = !saving && !device.isAdministrator,
                        modifier = Modifier
                            .menuAnchor(
                                MenuAnchorType.PrimaryNotEditable,
                                enabled = !saving && !device.isAdministrator
                            )
                            .fillMaxWidth()
                    )
                    ExposedDropdownMenu(
                        expanded = statusExpanded,
                        onDismissRequest = { statusExpanded = false }
                    ) {
                        deviceStatusCodes.forEach { option ->
                            DropdownMenuItem(
                                text = { Text(deviceStatusLabel(option)) },
                                onClick = {
                                    status = option
                                    statusExpanded = false
                                }
                            )
                        }
                    }
                }
                error?.let {
                    Text(
                        it,
                        color = MaterialTheme.colorScheme.error,
                        modifier = Modifier.padding(top = 4.dp)
                    )
                }
            }
        },
        confirmButton = {
            Button(
                enabled = !saving && name.isNotBlank(),
                onClick = {
                    onSave(
                        device.copy(
                            name = name.trim(),
                            group = if (device.isAdministrator) UNCONFIGURED_GROUP else group,
                            deviceType = deviceType,
                            manualDeviceType = deviceType != "unknown",
                            status = if (device.isAdministrator) "allow" else status
                        )
                    )
                }
            ) {
                Text(stringResource(R.string.action_save))
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss, enabled = !saving) {
                Text(stringResource(R.string.action_cancel))
            }
        }
    )
}
