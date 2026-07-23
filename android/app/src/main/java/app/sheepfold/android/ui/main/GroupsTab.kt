package app.sheepfold.android.ui.main

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
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
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import app.sheepfold.android.R
import app.sheepfold.android.router.RouterAdminClient
import app.sheepfold.android.router.RouterAdminConfig
import app.sheepfold.android.router.RouterDevice
import app.sheepfold.android.router.RouterGroup
import kotlinx.coroutines.launch

/** Редактор групп использует тот же UCI/runtime-контракт, что LuCI, через router API. */
@Composable
fun GroupsTab(
    client: RouterAdminClient,
    config: RouterAdminConfig,
    devices: List<RouterDevice>,
    isLoading: Boolean,
    onConfigChanged: (RouterAdminConfig) -> Unit,
    onRefresh: () -> Unit
) {
    val scope = rememberCoroutineScope()
    var isSaving by remember { mutableStateOf(false) }
    var message by remember { mutableStateOf<String?>(null) }
    var messageIsError by remember { mutableStateOf(false) }
    var editor by remember { mutableStateOf<RouterGroup?>(null) }
    var pendingDelete by remember { mutableStateOf<RouterGroup?>(null) }
    val groups = config.groups
    val canWrite = config.capabilities.groupWrite && config.revision.isNotBlank()
    val runtimePendingText = stringResource(R.string.management_runtime_pending)
    val changeFailedText = stringResource(R.string.management_error_change_group)
    val savedText = stringResource(R.string.group_saved_success)
    val deletedText = stringResource(R.string.group_deleted_success)

    fun applyMutation(
        block: suspend () -> RouterAdminConfig,
        successText: String,
        reloadDevices: Boolean
    ) {
        isSaving = true
        message = null
        scope.launch {
            runCatching { block() }
                .onSuccess { updated ->
                    onConfigChanged(updated)
                    message = if (updated.mutation?.runtimeApplied == false) {
                        "$successText $runtimePendingText"
                    } else {
                        successText
                    }
                    messageIsError = updated.mutation?.runtimeApplied == false
                    if (reloadDevices) onRefresh()
                }
                .onFailure {
                    message = it.message ?: changeFailedText
                    messageIsError = true
                }
            isSaving = false
        }
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
            Text(stringResource(R.string.groups_title), style = MaterialTheme.typography.headlineSmall)
            OutlinedButton(onClick = onRefresh, enabled = !isLoading && !isSaving) {
                Text(stringResource(R.string.action_refresh))
            }
        }
        Text(stringResource(R.string.groups_router_contract_note))
        Button(
            onClick = { editor = RouterGroup(name = "") },
            enabled = canWrite && !isLoading && !isSaving,
            modifier = Modifier.fillMaxWidth()
        ) { Text(stringResource(R.string.groups_add)) }
        ParentInlineStatus(message, messageIsError)
        if ((isLoading || isSaving) && groups.isEmpty()) androidx.compose.material3.CircularProgressIndicator()
        if (!isLoading && groups.isEmpty()) Text(stringResource(R.string.groups_empty))

        LazyColumn(Modifier.fillMaxSize(), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            items(groups, key = { it.section }) { group ->
                val scheduleReferences = config.schedules.filter {
                    it.targetType == "group" && (group.section in it.targets || group.name in it.targets)
                }
                Card(colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant)) {
                    Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                        Text(group.name, style = MaterialTheme.typography.titleMedium)
                        if (group.description.isNotBlank()) Text(group.description)
                        Text(stringResource(R.string.groups_color_format, group.color))
                        Text(
                            stringResource(
                                R.string.groups_members_format,
                                group.deviceIds.map { id ->
                                    devices.firstOrNull { it.id == id }?.name ?: "#$id"
                                }.joinToString(", ").ifBlank { stringResource(R.string.value_empty) }
                            )
                        )
                        Text(stringResource(R.string.groups_schedules_format, scheduleReferences.size))
                        if (group.personal) Text(stringResource(R.string.groups_personal))
                        if (group.autoAssignable) Text(stringResource(R.string.groups_auto_assignable))
                        if (group.allowlistOnly) Text(stringResource(R.string.groups_allowlist_only))
                        if (group.protectedGroup) Text(stringResource(R.string.groups_protected_note))
                        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            OutlinedButton(
                                onClick = { editor = group },
                                enabled = canWrite && !isSaving,
                                modifier = Modifier.weight(1f)
                            ) {
                                Text(stringResource(R.string.action_edit))
                            }
                            OutlinedButton(
                                onClick = { pendingDelete = group },
                                enabled = canWrite && !isSaving && !group.protectedGroup,
                                modifier = Modifier.weight(1f)
                            ) {
                                Text(stringResource(R.string.action_delete))
                            }
                        }
                    }
                }
            }
        }
    }

    editor?.let { group ->
        GroupEditorDialog(
            initial = group,
            devices = devices.filterNot { it.isAdministrator },
            isSaving = isSaving,
            onDismiss = { editor = null },
            onSave = { updated ->
                editor = null
                applyMutation(
                    block = { client.saveGroup(config, updated) },
                    successText = savedText,
                    reloadDevices = true
                )
            }
        )
    }

    pendingDelete?.let { group ->
        val scheduleCount = config.schedules.count {
            it.targetType == "group" && (group.section in it.targets || group.name in it.targets)
        }
        val blocked = group.deviceIds.isNotEmpty() || scheduleCount > 0
        AlertDialog(
            onDismissRequest = { pendingDelete = null },
            title = { Text(stringResource(R.string.groups_delete_title)) },
            text = {
                Text(
                    if (blocked) {
                        stringResource(R.string.groups_delete_blocked)
                    } else {
                        stringResource(R.string.groups_delete_message, group.name)
                    }
                )
            },
            confirmButton = {
                if (!blocked) {
                    TextButton(
                        enabled = !isSaving,
                        onClick = {
                            pendingDelete = null
                            applyMutation(
                                block = { client.deleteGroup(config, group.section) },
                                successText = deletedText,
                                reloadDevices = true
                            )
                        }
                    ) { Text(stringResource(R.string.action_delete)) }
                }
            },
            dismissButton = {
                TextButton(onClick = { pendingDelete = null }) {
                    Text(stringResource(R.string.action_cancel))
                }
            }
        )
    }
}

@Composable
private fun GroupEditorDialog(
    initial: RouterGroup,
    devices: List<RouterDevice>,
    isSaving: Boolean,
    onDismiss: () -> Unit,
    onSave: (RouterGroup) -> Unit
) {
    var name by remember(initial.section, initial.name) { mutableStateOf(initial.name) }
    var description by remember(initial.section, initial.description) { mutableStateOf(initial.description) }
    var color by remember(initial.section, initial.color) { mutableStateOf(initial.color) }
    var personal by remember(initial.section, initial.personal) { mutableStateOf(initial.personal) }
    var allowlistOnly by remember(initial.section, initial.allowlistOnly) {
        mutableStateOf(initial.allowlistOnly)
    }
    var selectedDeviceIds by remember(initial.section, initial.deviceIds) {
        mutableStateOf(initial.deviceIds.toSet())
    }
    var validationError by remember { mutableStateOf<String?>(null) }
    val nameRequiredText = stringResource(R.string.validation_group_name_required)
    val colorInvalidText = stringResource(R.string.validation_group_color_invalid)
    val isNew = initial.section.isBlank()

    AlertDialog(
        onDismissRequest = onDismiss,
        title = {
            Text(
                if (isNew) stringResource(R.string.groups_add)
                else stringResource(R.string.groups_edit_title)
            )
        },
        text = {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .verticalScroll(rememberScrollState()),
                verticalArrangement = Arrangement.spacedBy(10.dp)
            ) {
                validationError?.let { Text(it, color = MaterialTheme.colorScheme.error) }
                OutlinedTextField(
                    value = name,
                    onValueChange = { name = it.take(80) },
                    label = { Text(stringResource(R.string.groups_name)) },
                    enabled = !initial.protectedGroup,
                    modifier = Modifier.fillMaxWidth(),
                    singleLine = true
                )
                OutlinedTextField(
                    value = description,
                    onValueChange = { description = it.take(240) },
                    label = { Text(stringResource(R.string.groups_description)) },
                    modifier = Modifier.fillMaxWidth(),
                    minLines = 2
                )
                OutlinedTextField(
                    value = color,
                    onValueChange = { color = it.take(7) },
                    label = { Text(stringResource(R.string.groups_color)) },
                    supportingText = { Text("#E8F4EF") },
                    modifier = Modifier.fillMaxWidth(),
                    singleLine = true
                )
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                    Text(stringResource(R.string.groups_personal))
                    Switch(
                        checked = personal,
                        enabled = isNew,
                        onCheckedChange = { personal = it }
                    )
                }
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                    Text(stringResource(R.string.groups_allowlist_only), modifier = Modifier.weight(1f))
                    Switch(checked = allowlistOnly, onCheckedChange = { allowlistOnly = it })
                }
                Text(stringResource(R.string.groups_members))
                devices.forEach { device ->
                    ParentSelectionRow(
                        label = buildString {
                            append("#${device.id} ${device.name}")
                            if (device.group.isNotBlank() && device.id !in selectedDeviceIds) {
                                append(" · ${device.group}")
                            }
                        },
                        checked = device.id in selectedDeviceIds,
                        onCheckedChange = { checked ->
                            selectedDeviceIds = if (checked) {
                                selectedDeviceIds + device.id
                            } else {
                                selectedDeviceIds - device.id
                            }
                        }
                    )
                }
            }
        },
        confirmButton = {
            TextButton(
                enabled = !isSaving,
                onClick = {
                    when {
                        name.isBlank() -> validationError = nameRequiredText
                        !Regex("#[0-9A-Fa-f]{6}").matches(color) -> {
                            validationError = colorInvalidText
                        }
                        else -> onSave(
                            initial.copy(
                                name = name.trim(),
                                description = description.trim(),
                                color = color.uppercase(),
                                personal = personal,
                                allowlistOnly = allowlistOnly,
                                deviceIds = selectedDeviceIds.toList()
                            )
                        )
                    }
                }
            ) { Text(stringResource(R.string.settings_save)) }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) { Text(stringResource(R.string.action_cancel)) }
        }
    )
}
