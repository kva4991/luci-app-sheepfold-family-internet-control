package app.sheepfold.android.ui.main

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
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
import androidx.compose.material3.Checkbox
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
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
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import app.sheepfold.android.R
import app.sheepfold.android.router.RouterAdminClient
import app.sheepfold.android.router.RouterAdminConfig
import app.sheepfold.android.router.RouterDevice
import app.sheepfold.android.router.RouterGroup
import app.sheepfold.android.router.RouterSchedule
import app.sheepfold.android.router.RouterTimeRange
import kotlinx.coroutines.launch

internal val weekdayDefinitions = listOf(
    "mon" to R.string.weekday_mon,
    "tue" to R.string.weekday_tue,
    "wed" to R.string.weekday_wed,
    "thu" to R.string.weekday_thu,
    "fri" to R.string.weekday_fri,
    "sat" to R.string.weekday_sat,
    "sun" to R.string.weekday_sun
)

/** Полный редактор расписаний поверх единого router-side контракта. */
@Composable
fun SchedulesTab(
    client: RouterAdminClient,
    config: RouterAdminConfig,
    devices: List<RouterDevice>,
    isLoading: Boolean,
    onConfigChanged: (RouterAdminConfig) -> Unit,
    onRefresh: () -> Unit,
    workspace: ParentWorkspace = remember { ParentWorkspace() }
) {
    val scope = workspace.scope
    var isSaving by workspace.scheduleTask.busy
    var message by workspace.scheduleTask.message
    var messageIsError by workspace.scheduleTask.isError
    val editor = workspace.schedule
    var pendingDelete by remember { mutableStateOf<RouterSchedule?>(null) }
    val schedules = config.schedules
    val groups = config.groups
    val canWrite = config.capabilities.scheduleWrite && config.revision.isNotBlank()
    val runtimePendingText = stringResource(R.string.management_runtime_pending)
    val changeFailedText = stringResource(R.string.management_error_change_schedule)
    val enabledText = stringResource(R.string.schedule_enabled_success)
    val disabledText = stringResource(R.string.schedule_disabled_success)
    val savedText = stringResource(R.string.schedule_saved_success)
    val deletedText = stringResource(R.string.schedule_deleted_success)
    val copySuffix = stringResource(R.string.action_copy_suffix)

    fun applyMutation(
        block: suspend () -> RouterAdminConfig,
        successText: String,
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
        Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
            Text(stringResource(R.string.schedule_title), style = MaterialTheme.typography.headlineSmall)
            OutlinedButton(onClick = onRefresh, enabled = !isLoading && !isSaving) {
                Text(stringResource(R.string.action_refresh))
            }
        }
        Text(stringResource(R.string.schedule_router_contract_note))
        Button(
            onClick = {
                message = null
                val firstGroup = groups.firstOrNull()?.section
                val firstDevice = devices.firstOrNull { !it.isAdministrator }?.id
                val targetType = if (firstGroup != null) "group" else "device"
                val targets = listOfNotNull(firstGroup ?: firstDevice)
                workspace.schedule = FormDraft(RouterSchedule(
                    name = "",
                    targetType = targetType,
                    targets = targets,
                    timeRanges = listOf(RouterTimeRange(config.bedtime, "07:00"))
                ), config.revision)
            },
            enabled = canWrite && !isLoading && !isSaving &&
                (groups.isNotEmpty() || devices.any { !it.isAdministrator }),
            modifier = Modifier.fillMaxWidth()
        ) {
            Text(stringResource(R.string.schedule_add))
        }
        ParentInlineStatus(message, messageIsError)
        if ((isLoading || isSaving) && schedules.isEmpty()) CircularProgressIndicator()
        if (!isLoading && schedules.isEmpty()) Text(stringResource(R.string.schedule_empty))

        LazyColumn(
            modifier = Modifier.fillMaxSize(),
            verticalArrangement = Arrangement.spacedBy(10.dp)
        ) {
            items(schedules, key = { it.section }) { schedule ->
                Card(colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant)) {
                    Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween
                        ) {
                            Text(schedule.name, style = MaterialTheme.typography.titleMedium, modifier = Modifier.weight(1f))
                            Switch(
                                checked = schedule.enabled,
                                enabled = canWrite && !isSaving,
                                onCheckedChange = { enabled ->
                                    applyMutation(
                                        block = { client.saveSchedule(config, schedule.copy(enabled = enabled)) },
                                        successText = if (enabled) enabledText else disabledText
                                    )
                                }
                            )
                        }
                        if (schedule.description.isNotBlank()) Text(schedule.description)
                        Text(
                            if (schedule.action == "allow") {
                                stringResource(R.string.schedule_action_allow)
                            } else {
                                stringResource(R.string.schedule_action_block)
                            }
                        )
                        Text(scheduleTargetText(schedule, devices, groups))
                        Text(scheduleDaysText(schedule))
                        Text(schedule.timeRanges.joinToString(", ") { "${it.start}–${it.end}" })
                        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            OutlinedButton(
                                onClick = {
                                    message = null
                                    workspace.schedule = FormDraft(schedule, config.revision)
                                },
                                enabled = canWrite && !isSaving,
                                modifier = Modifier.weight(1f)
                            ) {
                                Text(stringResource(R.string.action_edit))
                            }
                            OutlinedButton(
                                onClick = {
                                    message = null
                                    workspace.schedule = FormDraft(schedule.copy(
                                        section = "",
                                        name = schedule.name + " " + copySuffix
                                    ), config.revision)
                                },
                                enabled = canWrite && !isSaving,
                                modifier = Modifier.weight(1f)
                            ) {
                                Text(stringResource(R.string.action_duplicate))
                            }
                            OutlinedButton(
                                onClick = { pendingDelete = schedule },
                                enabled = canWrite && !isSaving,
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

    editor?.let { form ->
        ScheduleEditorDialog(
            initial = form.original,
            form = form,
            schedules = schedules,
            devices = devices,
            groups = groups,
            isSaving = isSaving,
            backendError = message.takeIf { messageIsError },
            onDismiss = {
                workspace.schedule = null
                message = null
            },
            onSave = { updated ->
                applyMutation(
                    block = { client.saveSchedule(config.copy(revision = form.revision), updated) },
                    successText = savedText,
                    afterSuccess = { workspace.schedule = null }
                )
            }
        )
    }

    pendingDelete?.let { schedule ->
        AlertDialog(
            onDismissRequest = { pendingDelete = null },
            title = { Text(stringResource(R.string.schedule_delete_title)) },
            text = { Text(stringResource(R.string.schedule_delete_message, schedule.name)) },
            confirmButton = {
                TextButton(
                    enabled = !isSaving,
                    onClick = {
                        pendingDelete = null
                        applyMutation(
                            block = { client.deleteSchedule(config, schedule.section) },
                            successText = deletedText
                        )
                    }
                ) { Text(stringResource(R.string.action_delete)) }
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
private fun ScheduleEditorDialog(
    initial: RouterSchedule,
    form: FormDraft<RouterSchedule>,
    schedules: List<RouterSchedule>,
    devices: List<RouterDevice>,
    groups: List<RouterGroup>,
    isSaving: Boolean,
    backendError: String?,
    onDismiss: () -> Unit,
    onSave: (RouterSchedule) -> Unit
) {
    var name by form.field({ it.name }) { value, next -> value.copy(name = next) }
    var description by form.field({ it.description }) { value, next -> value.copy(description = next) }
    var enabled by form.field({ it.enabled }) { value, next -> value.copy(enabled = next) }
    var action by form.field({ it.action }) { value, next -> value.copy(action = next) }
    var targetType by form.field({ it.targetType }) { value, next -> value.copy(targetType = next) }
    var targets by form.field({ it.targets.toSet() }) { value, next -> value.copy(targets = next.toList()) }
    var weekdays by form.field({ it.weekdays.toSet() }) { value, next -> value.copy(weekdays = next.toList()) }
    var timeRanges by form.field({ it.timeRanges }) { value, next -> value.copy(timeRanges = next) }
    val dismiss = rememberDraftDismiss(form.dirty, isSaving, onDismiss)
    var validationError by remember { mutableStateOf<String?>(null) }
    val nameRequiredText = stringResource(R.string.validation_schedule_name_required)
    val targetRequiredText = stringResource(R.string.validation_schedule_target_required)
    val weekdaysRequiredText = stringResource(R.string.validation_schedule_weekdays_required)
    val timeInvalidText = stringResource(R.string.validation_schedule_time_invalid)
    val targetEntries = if (targetType == "device") {
        devices.filterNot { it.isAdministrator }.map { it.id to "#${it.id} ${it.name}" }
    } else {
        groups.map { it.section to it.name }
    }
    val draft = initial.copy(
        name = name.trim(),
        description = description.trim(),
        enabled = enabled,
        action = action,
        targetType = targetType,
        targets = targets.toList(),
        weekdays = weekdayDefinitions.map { it.first }.filter { it in weekdays },
        timeRanges = timeRanges
    )
    val conflictingSchedule = remember(draft, schedules) { findOppositeScheduleConflict(draft, schedules) }

    AlertDialog(
        onDismissRequest = dismiss,
        title = {
            Text(
                if (initial.section.isBlank()) stringResource(R.string.schedule_add)
                else stringResource(R.string.schedule_edit_title)
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
                SchedulePreview(draft)
                conflictingSchedule?.let {
                    Text(
                        stringResource(R.string.schedule_conflict_warning, it),
                        color = MaterialTheme.colorScheme.error
                    )
                }
                OutlinedTextField(
                    value = name,
                    enabled = !isSaving,
                    onValueChange = { name = it.take(80) },
                    label = { Text(stringResource(R.string.schedule_name)) },
                    modifier = Modifier.fillMaxWidth(),
                    singleLine = true
                )
                OutlinedTextField(
                    value = description,
                    enabled = !isSaving,
                    onValueChange = { description = it.take(240) },
                    label = { Text(stringResource(R.string.schedule_description)) },
                    modifier = Modifier.fillMaxWidth(),
                    minLines = 2
                )
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                    Text(stringResource(R.string.schedule_enabled))
                    Switch(checked = enabled, onCheckedChange = { enabled = it }, enabled = !isSaving)
                }
                Text(stringResource(R.string.schedule_action))
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    OutlinedButton(
                        onClick = { action = "block" },
                        modifier = Modifier.weight(1f),
                        enabled = !isSaving && action != "block"
                    ) { Text(stringResource(R.string.schedule_action_block)) }
                    OutlinedButton(
                        onClick = { action = "allow" },
                        modifier = Modifier.weight(1f),
                        enabled = !isSaving && action != "allow"
                    ) { Text(stringResource(R.string.schedule_action_allow)) }
                }
                Text(stringResource(R.string.schedule_target_type))
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    OutlinedButton(
                        onClick = { targetType = "group"; targets = emptySet() },
                        modifier = Modifier.weight(1f),
                        enabled = !isSaving && targetType != "group"
                    ) { Text(stringResource(R.string.schedule_target_groups)) }
                    OutlinedButton(
                        onClick = { targetType = "device"; targets = emptySet() },
                        modifier = Modifier.weight(1f),
                        enabled = !isSaving && targetType != "device"
                    ) { Text(stringResource(R.string.schedule_target_devices)) }
                }
                targetEntries.forEach { (id, label) ->
                    ParentSelectionRow(
                        label = label,
                        enabled = !isSaving,
                        checked = id in targets,
                        onCheckedChange = { checked ->
                            targets = if (checked) targets + id else targets - id
                        }
                    )
                }
                HorizontalDivider()
                Text(stringResource(R.string.schedule_days))
                weekdayDefinitions.chunked(2).forEach { row ->
                    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        row.forEach { (key, labelRes) ->
                            Row(modifier = Modifier.weight(1f)) {
                                Checkbox(
                                    checked = key in weekdays,
                                    enabled = !isSaving,
                                    onCheckedChange = { checked ->
                                        weekdays = if (checked) weekdays + key else weekdays - key
                                    }
                                )
                                Text(stringResource(labelRes), modifier = Modifier.padding(12.dp))
                            }
                        }
                        if (row.size == 1) Spacer(Modifier.weight(1f))
                    }
                }
                HorizontalDivider()
                Text(stringResource(R.string.schedule_time_ranges))
                timeRanges.forEachIndexed { index, range ->
                    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                        OutlinedTextField(
                            value = range.start,
                            enabled = !isSaving,
                            onValueChange = { value ->
                                timeRanges = timeRanges.toMutableList().also {
                                    it[index] = range.copy(start = value.take(5))
                                }
                            },
                            label = { Text(stringResource(R.string.schedule_start)) },
                            modifier = Modifier.weight(1f),
                            singleLine = true
                        )
                        OutlinedTextField(
                            value = range.end,
                            enabled = !isSaving,
                            onValueChange = { value ->
                                timeRanges = timeRanges.toMutableList().also {
                                    it[index] = range.copy(end = value.take(5))
                                }
                            },
                            label = { Text(stringResource(R.string.schedule_end)) },
                            modifier = Modifier.weight(1f),
                            singleLine = true
                        )
                        TextButton(
                            onClick = {
                                timeRanges = timeRanges.filterIndexed { itemIndex, _ -> itemIndex != index }
                            },
                            enabled = !isSaving && timeRanges.size > 1
                        ) {
                            Icon(
                                painter = painterResource(R.drawable.ic_delete),
                                contentDescription = stringResource(R.string.action_delete)
                            )
                        }
                    }
                }
                OutlinedButton(
                    onClick = { timeRanges = timeRanges + RouterTimeRange("15:00", "16:00") },
                    enabled = !isSaving && timeRanges.size < 8,
                    modifier = Modifier.fillMaxWidth()
                ) { Text(stringResource(R.string.schedule_add_range)) }
            }
        },
        confirmButton = {
            TextButton(
                enabled = !isSaving,
                onClick = {
                    val validTime = Regex("(?:[01]\\d|2[0-3]):[0-5]\\d")
                    when {
                        name.isBlank() -> validationError = nameRequiredText
                        targets.isEmpty() -> validationError = targetRequiredText
                        weekdays.isEmpty() -> validationError = weekdaysRequiredText
                        timeRanges.isEmpty() || timeRanges.any {
                            !validTime.matches(it.start) || !validTime.matches(it.end) || it.start == it.end
                        } -> validationError = timeInvalidText
                        else -> onSave(draft)
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
private fun scheduleTargetText(
    schedule: RouterSchedule,
    devices: List<RouterDevice>,
    groups: List<RouterGroup>
): String {
    val labels = if (schedule.targetType == "device") {
        schedule.targets.map { id -> devices.firstOrNull { it.id == id }?.name ?: "#$id" }
    } else {
        schedule.targets.map { id -> groups.firstOrNull { it.section == id || it.name == id }?.name ?: id }
    }
    return stringResource(R.string.schedule_targets_format, labels.joinToString(", "))
}

@Composable
private fun scheduleDaysText(schedule: RouterSchedule): String {
    val labels = weekdayDefinitions.filter { it.first in schedule.weekdays }.map { stringResource(it.second) }
    return stringResource(R.string.schedule_days_format, labels.joinToString(", "))
}
