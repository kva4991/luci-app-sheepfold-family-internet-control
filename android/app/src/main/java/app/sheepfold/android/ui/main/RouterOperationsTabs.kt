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
import kotlinx.coroutines.launch


@Composable
fun LogsTab(
    client: RouterAdminClient,
    config: RouterAdminConfig,
    entries: List<String>,
    isLoading: Boolean,
    onRefresh: () -> Unit,
    onCleared: () -> Unit
) {
    val scope = rememberCoroutineScope()
    var filter by remember { mutableStateOf("") }
    var isClearing by remember { mutableStateOf(false) }
    val busy = isLoading || isClearing
    var message by remember { mutableStateOf<String?>(null) }
    var messageIsError by remember { mutableStateOf(false) }
    var confirmClear by remember { mutableStateOf(false) }
    val clearFailedText = stringResource(R.string.management_error_clear_logs)
    val clearedText = stringResource(R.string.logs_cleared_success)

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
            OutlinedButton(onClick = { message = null; onRefresh() }, enabled = !busy && config.capabilities.logRead) {
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
            enabled = !busy && entries.isNotEmpty() && config.capabilities.logClear,
            modifier = Modifier.fillMaxWidth()
        ) { Text(stringResource(R.string.logs_clear)) }
        ParentInlineStatus(message, messageIsError)
        if (busy && entries.isEmpty()) CircularProgressIndicator()
        if (!busy && entries.isEmpty()) Text(stringResource(R.string.logs_empty))

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
                    isClearing = true
                    scope.launch {
                        runCatching { client.clearLog() }
                            .onSuccess {
                                onCleared()
                                message = clearedText
                                messageIsError = false
                            }
                            .onFailure {
                                message = it.message ?: clearFailedText
                                messageIsError = true
                            }
                        isClearing = false
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
