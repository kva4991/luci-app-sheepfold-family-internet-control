package app.sheepfold.android.ui.main

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.RadioButton
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import app.sheepfold.android.R
import app.sheepfold.android.router.RouterWifiAutomation
import kotlinx.coroutines.delay

/** Повторяет расписание всех радиомодулей из LuCI и сохраняет его только явной командой. */
@Composable
internal fun WifiAutomationCard(
    current: RouterWifiAutomation,
    enabled: Boolean,
    onSave: (RouterWifiAutomation) -> Unit
) {
    var draft by remember(current) { mutableStateOf(current) }
    var riskDialogVisible by remember { mutableStateOf(false) }
    val validTime = remember(draft.enableTime, draft.disableTime) {
        TIME_PATTERN.matches(draft.enableTime) && TIME_PATTERN.matches(draft.disableTime)
    }
    val disableRuleChanged = draft.disableMode == "time" &&
        (draft.disableMode != current.disableMode || draft.disableTime != current.disableTime)

    Card(colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant)) {
        Column(
            modifier = Modifier.fillMaxWidth().padding(14.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp)
        ) {
            Text(stringResource(R.string.wifi_automation_title), style = MaterialTheme.typography.titleLarge)
            Text(stringResource(R.string.wifi_automation_intro))
            WifiAutomationRule(
                title = stringResource(R.string.wifi_automation_enable),
                mode = draft.enableMode,
                time = draft.enableTime,
                enabled = enabled,
                onModeChange = { draft = draft.copy(enableMode = it) },
                onTimeChange = { draft = draft.copy(enableMode = "time", enableTime = it) }
            )
            WifiAutomationRule(
                title = stringResource(R.string.wifi_automation_disable),
                mode = draft.disableMode,
                time = draft.disableTime,
                enabled = enabled,
                onModeChange = { draft = draft.copy(disableMode = it) },
                onTimeChange = { draft = draft.copy(disableMode = "time", disableTime = it) }
            )
            if (!validTime) Text(stringResource(R.string.wifi_automation_invalid_time), color = MaterialTheme.colorScheme.error)
            Button(
                onClick = {
                    if (disableRuleChanged) riskDialogVisible = true else onSave(draft)
                },
                enabled = enabled && validTime && draft != current,
                modifier = Modifier.fillMaxWidth()
            ) {
                Text(stringResource(R.string.settings_save))
            }
        }
    }

    if (riskDialogVisible) {
        WifiDisableRiskDialog(
            disableTime = draft.disableTime,
            onDismiss = { riskDialogVisible = false },
            onConfirm = {
                riskDialogVisible = false
                onSave(draft)
            }
        )
    }
}

@Composable
private fun WifiAutomationRule(
    title: String,
    mode: String,
    time: String,
    enabled: Boolean,
    onModeChange: (String) -> Unit,
    onTimeChange: (String) -> Unit
) {
    Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
        Text(title, style = MaterialTheme.typography.titleMedium)
        WifiAutomationModeRow(
            selected = mode == "never",
            label = stringResource(R.string.wifi_automation_never),
            enabled = enabled,
            onClick = { onModeChange("never") }
        )
        WifiAutomationModeRow(
            selected = mode == "time",
            label = stringResource(R.string.wifi_automation_at_time),
            enabled = enabled,
            onClick = { onModeChange("time") }
        )
        OutlinedTextField(
            value = time,
            onValueChange = { value -> if (value.length <= 5) onTimeChange(value) },
            enabled = enabled && mode == "time",
            label = { Text(stringResource(R.string.wifi_automation_time_hint)) },
            supportingText = { Text("HH:MM") },
            singleLine = true,
            modifier = Modifier.fillMaxWidth()
        )
    }
}

@Composable
private fun WifiAutomationModeRow(
    selected: Boolean,
    label: String,
    enabled: Boolean,
    onClick: () -> Unit
) {
    Row(
        modifier = Modifier.fillMaxWidth().clickable(enabled = enabled, onClick = onClick).padding(vertical = 3.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        RadioButton(selected = selected, onClick = onClick, enabled = enabled)
        Text(label, modifier = Modifier.weight(1f))
    }
}

@Composable
private fun WifiDisableRiskDialog(
    disableTime: String,
    onDismiss: () -> Unit,
    onConfirm: () -> Unit
) {
    var secondsLeft by remember { mutableIntStateOf(10) }

    LaunchedEffect(Unit) {
        while (secondsLeft > 0) {
            delay(1_000)
            secondsLeft -= 1
        }
    }

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(stringResource(R.string.wifi_disable_risk_title)) },
        text = { Text(stringResource(R.string.wifi_disable_risk_message, disableTime)) },
        confirmButton = {
            Button(onClick = onConfirm, enabled = secondsLeft == 0) {
                Text(
                    if (secondsLeft == 0) stringResource(R.string.wifi_disable_risk_confirm)
                    else stringResource(R.string.wifi_disable_risk_countdown, secondsLeft)
                )
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) { Text(stringResource(R.string.action_cancel)) }
        }
    )
}

private val TIME_PATTERN = Regex("(?:[01]\\d|2[0-3]):[0-5]\\d")
