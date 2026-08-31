package app.sheepfold.android.ui.main

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
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
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.painter.Painter
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.ui.unit.dp
import app.sheepfold.android.R
import app.sheepfold.android.router.RouterAdminClient
import app.sheepfold.android.router.RouterAdminConfig
import app.sheepfold.android.router.RouterDevice
import app.sheepfold.android.router.RouterGroup
import app.sheepfold.android.router.RouterSchedule
import kotlinx.coroutines.launch

private val groupPastelColors = listOf(
    "#E8F4EF", "#EEF2FF", "#FFF4DD", "#FCEEEE", "#EDF7FB",
    "#F5F0FF", "#EEF8E7", "#F8F1E8", "#EAF3F8"
)
private val groupCardTextColor = Color(0xFF172033)

/** Редактор групп использует тот же UCI/runtime-контракт, что LuCI, через router API. */
@Composable
fun GroupsTab(
    client: RouterAdminClient,
    config: RouterAdminConfig,
    devices: List<RouterDevice>,
    isLoading: Boolean,
    onConfigChanged: (RouterAdminConfig) -> Unit,
    onRefresh: () -> Unit,
    workspace: ParentWorkspace = remember { ParentWorkspace() }
) {
    val scope = workspace.scope
    var isSaving by workspace.groupTask.busy
    var message by workspace.groupTask.message
    var messageIsError by workspace.groupTask.isError
    val editor = workspace.group
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
        reloadDevices: Boolean,
        afterSuccess: () -> Unit = {}
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
                    afterSuccess()
                }
                .onFailure {
                    if (it is kotlinx.coroutines.CancellationException) throw it
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
            onClick = {
                message = null
                workspace.group = FormDraft(RouterGroup(name = "", color = nextGroupColor(groups)), config.revision)
            },
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
                val visibleDeviceNames = group.deviceIds.take(5).map { id ->
                    devices.firstOrNull { it.id == id }?.name ?: "#$id"
                }
                val hiddenDeviceCount = (group.deviceIds.size - visibleDeviceNames.size).coerceAtLeast(0)
                Card(
                    colors = CardDefaults.cardColors(
                        containerColor = parseGroupColor(group.color),
                        contentColor = groupCardTextColor
                    )
                ) {
                    Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                        Text(
                            group.name,
                            style = MaterialTheme.typography.titleMedium,
                            fontWeight = FontWeight.SemiBold
                        )
                        if (group.description.isNotBlank()) Text(group.description)
                        Text(
                            stringResource(
                                R.string.groups_members_format,
                                visibleDeviceNames.joinToString(", ")
                                    .ifBlank { stringResource(R.string.value_empty) }
                            )
                        )
                        if (hiddenDeviceCount > 0) {
                            Text(stringResource(R.string.groups_members_more_format, hiddenDeviceCount))
                        }
                        Text(stringResource(R.string.groups_schedules_format, scheduleReferences.size))
                        if (group.personal) Text(stringResource(R.string.groups_personal))
                        if (group.autoAssignable) Text(stringResource(R.string.groups_auto_assignable))
                        if (group.allowlistOnly) Text(stringResource(R.string.groups_allowlist_only))
                        if (group.protectedGroup) Text(stringResource(R.string.groups_protected_note))
                        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.End) {
                            GroupActionButton(
                                icon = painterResource(R.drawable.ic_action_settings),
                                description = stringResource(R.string.action_edit),
                                onClick = {
                                    message = null
                                    workspace.group = FormDraft(group, config.revision)
                                },
                                enabled = canWrite && !isSaving
                            )
                            GroupActionButton(
                                icon = painterResource(R.drawable.ic_delete),
                                description = stringResource(R.string.action_delete),
                                onClick = { pendingDelete = group },
                                enabled = canWrite && !isSaving && !group.protectedGroup
                            )
                        }
                    }
                }
            }
        }
    }

    editor?.let { form ->
        GroupEditorDialog(
            initial = form.original,
            form = form,
            devices = devices.filterNot { it.isAdministrator },
            schedules = config.schedules.filter { it.targetType == "group" },
            isSaving = isSaving,
            backendError = message.takeIf { messageIsError },
            onDismiss = {
                workspace.group = null
                message = null
            },
            onSave = { updated ->
                applyMutation(
                    block = { client.saveGroup(config.copy(revision = form.revision), updated) },
                    successText = savedText,
                    reloadDevices = true,
                    afterSuccess = { workspace.group = null }
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
    form: FormDraft<RouterGroup>,
    devices: List<RouterDevice>,
    schedules: List<RouterSchedule>,
    isSaving: Boolean,
    backendError: String?,
    onDismiss: () -> Unit,
    onSave: (RouterGroup) -> Unit
) {
    var name by form.field({ it.name }) { value, next -> value.copy(name = next) }
    var description by form.field({ it.description }) { value, next -> value.copy(description = next) }
    var color by form.field({ it.color }) { value, next -> value.copy(color = next) }
    var personal by form.field({ it.personal }) { value, next -> value.copy(personal = next) }
    var allowlistOnly by form.field({ it.allowlistOnly }) { value, next -> value.copy(allowlistOnly = next) }
    var selectedDeviceIds by form.field({ it.deviceIds.toSet() }) { value, next -> value.copy(deviceIds = next.toList()) }
    var selectedScheduleIds by form.field({ it.scheduleIds.toSet() }) { value, next -> value.copy(scheduleIds = next.toList()) }
    val dismiss = rememberDraftDismiss(form.dirty, isSaving, onDismiss)
    var validationError by remember { mutableStateOf<String?>(null) }
    val nameRequiredText = stringResource(R.string.validation_group_name_required)
    val isNew = initial.section.isBlank()
    val scheduleConflict = remember(selectedScheduleIds, schedules) {
        findSelectedGroupScheduleConflict(selectedScheduleIds, schedules)
    }

    AlertDialog(
        onDismissRequest = dismiss,
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
                backendError?.let { Text(it, color = MaterialTheme.colorScheme.error) }
                validationError?.let { Text(it, color = MaterialTheme.colorScheme.error) }
                OutlinedTextField(
                    value = name,
                    onValueChange = { name = it.take(80) },
                    label = { Text(stringResource(R.string.groups_name)) },
                    enabled = !isSaving && !initial.protectedGroup,
                    modifier = Modifier.fillMaxWidth(),
                    singleLine = true
                )
                OutlinedTextField(
                    value = description,
                    enabled = !isSaving,
                    onValueChange = { description = it.take(240) },
                    label = { Text(stringResource(R.string.groups_description)) },
                    modifier = Modifier.fillMaxWidth(),
                    minLines = 2
                )
                GroupColorPicker(selectedColor = color, onSelect = { color = it }, enabled = !isSaving)
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                    Text(stringResource(R.string.groups_personal))
                    Switch(
                        checked = personal,
                        enabled = !isSaving && isNew,
                        onCheckedChange = { personal = it }
                    )
                }
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                    Text(stringResource(R.string.groups_allowlist_only), modifier = Modifier.weight(1f))
                    Switch(checked = allowlistOnly, onCheckedChange = { allowlistOnly = it }, enabled = !isSaving)
                }
                Text(stringResource(R.string.groups_schedules))
                if (schedules.isEmpty()) {
                    Text(stringResource(R.string.groups_schedules_empty))
                } else {
                    schedules.forEach { schedule ->
                        ParentSelectionRow(
                            label = schedule.name,
                            enabled = !isSaving,
                            checked = schedule.section in selectedScheduleIds,
                            onCheckedChange = { checked ->
                                selectedScheduleIds = if (checked) {
                                    selectedScheduleIds + schedule.section
                                } else {
                                    selectedScheduleIds - schedule.section
                                }
                            }
                        )
                    }
                }
                scheduleConflict?.let { (first, second) ->
                    Text(
                        stringResource(R.string.groups_schedule_conflict_warning, first, second),
                        color = MaterialTheme.colorScheme.error
                    )
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
                        enabled = !isSaving,
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
                        else -> onSave(
                            initial.copy(
                                name = name.trim(),
                                description = description.trim(),
                                color = color.uppercase(),
                                personal = personal,
                                allowlistOnly = allowlistOnly,
                                deviceIds = selectedDeviceIds.toList(),
                                scheduleIds = schedules.map { it.section }.filter { it in selectedScheduleIds }
                            )
                        )
                    }
                }
            ) { Text(stringResource(R.string.settings_save)) }
        },
        dismissButton = {
            TextButton(onClick = dismiss, enabled = !isSaving) { Text(stringResource(R.string.action_cancel)) }
        }
    )
}

@Composable
private fun GroupActionButton(
    icon: Painter,
    description: String,
    onClick: () -> Unit,
    enabled: Boolean
) {
    IconButton(onClick = onClick, enabled = enabled) {
        Icon(painter = icon, contentDescription = description)
    }
}

@Composable
private fun GroupColorPicker(selectedColor: String, onSelect: (String) -> Unit, enabled: Boolean) {
    Text(stringResource(R.string.groups_color))
    groupPastelColors.chunked(5).forEachIndexed { rowIndex, rowColors ->
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            rowColors.forEachIndexed { columnIndex, colorValue ->
                val selected = selectedColor.equals(colorValue, ignoreCase = true)
                val colorNumber = rowIndex * 5 + columnIndex + 1
                val colorDescription = stringResource(R.string.groups_color_option, colorNumber)
                Box(
                    modifier = Modifier
                        .size(40.dp)
                        .clip(RoundedCornerShape(6.dp))
                        .background(parseGroupColor(colorValue))
                        .border(
                            width = if (selected) 3.dp else 1.dp,
                            color = if (selected) MaterialTheme.colorScheme.primary else Color(0xFF8A94A3),
                            shape = RoundedCornerShape(6.dp)
                        )
                        .semantics { contentDescription = colorDescription }
                        .clickable(enabled = enabled) { onSelect(colorValue) }
                )
            }
        }
    }
}

private fun nextGroupColor(groups: List<RouterGroup>): String {
    val usedColors = groups.map { it.color.uppercase() }.toSet()
    return groupPastelColors.firstOrNull { it !in usedColors }
        ?: groupPastelColors[groups.size % groupPastelColors.size]
}

private fun parseGroupColor(value: String): Color = runCatching {
    Color(android.graphics.Color.parseColor(value))
}.getOrDefault(Color(0xFFE8F4EF))
