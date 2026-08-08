package app.sheepfold.android.ui.main

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.RadioButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import app.sheepfold.android.R
import app.sheepfold.android.router.RouterAdminClient
import app.sheepfold.android.router.RouterAdminConfig
import app.sheepfold.android.router.RouterAdminNotification
import app.sheepfold.android.router.RouterNotificationSettings
import java.text.DateFormat
import java.util.Date
import kotlinx.coroutines.launch

/** Редактор использует тот же UCI-контракт, что и вкладка «Уведомления» в LuCI. */
@Composable
fun NotificationsTab(
    client: RouterAdminClient,
    config: RouterAdminConfig,
    notifications: List<RouterAdminNotification>,
    isLoading: Boolean,
    onConfigChanged: (RouterAdminConfig) -> Unit
) {
    val scope = rememberCoroutineScope()
    var settings by remember(config.revision) { mutableStateOf(config.notificationSettings) }
    var isSaving by remember { mutableStateOf(false) }
    var resultText by remember { mutableStateOf<String?>(null) }
    var resultIsError by remember { mutableStateOf(false) }
    val savedText = stringResource(R.string.notifications_saved)
    val saveFailedText = stringResource(R.string.notifications_save_failed)

    LaunchedEffect(config.revision) { settings = config.notificationSettings }

    LazyColumn(
        modifier = Modifier
            .fillMaxSize()
            .padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        item {
            Text(stringResource(R.string.notifications_settings_title), style = MaterialTheme.typography.headlineSmall)
            Text(stringResource(R.string.notifications_settings_intro))
        }
        item {
            NotificationChoiceGroup(
                title = stringResource(R.string.notifications_sim_title),
                value = settings.simChangeMode,
                choices = listOf(
                    "all" to stringResource(R.string.notifications_sim_all),
                    "new_only" to stringResource(R.string.notifications_sim_new_only),
                    "off" to stringResource(R.string.notifications_off)
                ),
                onSelect = { settings = settings.copy(simChangeMode = it) }
            )
        }
        item {
            NotificationChoiceGroup(
                title = stringResource(R.string.notifications_wifi_title),
                value = settings.childWifiMode,
                choices = listOf(
                    "with_location" to stringResource(R.string.notifications_wifi_location),
                    "network_only" to stringResource(R.string.notifications_wifi_network_only),
                    "off" to stringResource(R.string.notifications_off)
                ),
                onSelect = { settings = settings.copy(childWifiMode = it) }
            )
        }
        item {
            Button(
                enabled = config.capabilities.notificationWrite && !isLoading && !isSaving &&
                    settings != config.notificationSettings,
                onClick = {
                    isSaving = true
                    resultText = null
                    resultIsError = false
                    scope.launch {
                        runCatching { client.saveNotificationSettings(config, settings) }
                            .onSuccess {
                                onConfigChanged(it)
                                resultText = savedText
                                resultIsError = false
                            }
                            .onFailure {
                                resultText = it.message ?: saveFailedText
                                resultIsError = true
                            }
                        isSaving = false
                    }
                },
                modifier = Modifier.fillMaxWidth()
            ) {
                Text(stringResource(R.string.action_save))
            }
            if (!config.capabilities.notificationWrite) {
                Text(stringResource(R.string.notifications_update_router))
            }
            if (isSaving) CircularProgressIndicator()
            resultText?.let {
                Text(it, color = if (resultIsError) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.primary)
            }
        }
        item {
            Text(stringResource(R.string.notifications_recent_title), style = MaterialTheme.typography.titleLarge)
        }
        if (notifications.isEmpty()) {
            item { Text(stringResource(R.string.notifications_empty)) }
        } else {
            items(notifications.sortedByDescending { it.createdAt }, key = { it.id }) { event ->
                NotificationCard(event)
            }
        }
    }
}

@Composable
private fun NotificationChoiceGroup(
    title: String,
    value: String,
    choices: List<Pair<String, String>>,
    onSelect: (String) -> Unit
) {
    Card(colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant)) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(14.dp),
            verticalArrangement = Arrangement.spacedBy(6.dp)
        ) {
            Text(title, style = MaterialTheme.typography.titleMedium)
            choices.forEach { choice ->
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .clickable { onSelect(choice.first) }
                        .padding(vertical = 4.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    RadioButton(selected = value == choice.first, onClick = { onSelect(choice.first) })
                    Text(choice.second, modifier = Modifier.weight(1f))
                }
            }
        }
    }
}

@Composable
private fun NotificationCard(event: RouterAdminNotification) {
    val timestamp = remember(event.createdAt) {
        if (event.createdAt > 0) {
            DateFormat.getDateTimeInstance(DateFormat.SHORT, DateFormat.SHORT)
                .format(Date(event.createdAt * 1_000))
        } else {
            ""
        }
    }
    Card(colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant)) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(14.dp),
            verticalArrangement = Arrangement.spacedBy(4.dp)
        ) {
            Text(event.title, style = MaterialTheme.typography.titleMedium)
            Text(event.message)
            if (timestamp.isNotBlank()) Text(timestamp, style = MaterialTheme.typography.bodySmall)
        }
    }
}
