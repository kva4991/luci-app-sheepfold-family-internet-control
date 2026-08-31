package app.sheepfold.android.ui.main

import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.Alignment
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import app.sheepfold.android.R
import app.sheepfold.android.updates.ParentAppUpdateModel
import app.sheepfold.android.updates.ParentUpdateState
import app.sheepfold.android.updates.UpdatePhase
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.launch

@Composable
internal fun ParentAppUpdateSection(model: ParentAppUpdateModel) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    var installing by remember { mutableStateOf(false) }
    ParentAppUpdateContent(model.version, model.state, installing, model::check, model::download, model::cancelDownload) {
        if (!installing) scope.launch {
            installing = true
            try { context.startActivity(model.installationIntent())
            } catch (error: CancellationException) { throw error
            } catch (_: Exception) { model.installationFailed()
            } finally { installing = false }
        }
    }
}

@Composable
internal fun ParentAppUpdateContent(
    version: String,
    state: ParentUpdateState,
    installing: Boolean = false,
    onCheck: () -> Unit,
    onDownload: () -> Unit,
    onCancel: () -> Unit,
    onInstall: () -> Unit
) {
    var help by remember { mutableStateOf(false) }
    Column(Modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text(stringResource(R.string.app_update_title), Modifier.weight(1f), style = MaterialTheme.typography.titleLarge)
            IconButton(onClick = { help = true }) {
                Icon(painterResource(R.drawable.ic_navigation_information), stringResource(R.string.app_update_help_title))
            }
        }
        Text(stringResource(R.string.app_update_installed, version))
        when (state.phase) {
            UpdatePhase.CHECKING -> {
                LinearProgressIndicator(Modifier.fillMaxWidth())
                Text(stringResource(R.string.app_update_checking))
            }
            UpdatePhase.DOWNLOADING -> {
                LinearProgressIndicator(progress = { state.percent / 100f }, modifier = Modifier.fillMaxWidth())
                Text(stringResource(R.string.app_update_downloading, state.percent))
                TextButton(onClick = onCancel) { Text(stringResource(R.string.action_cancel)) }
            }
            UpdatePhase.CANCELLING -> {
                LinearProgressIndicator(Modifier.fillMaxWidth())
                Text(stringResource(R.string.app_update_cancelling))
            }
            UpdatePhase.AVAILABLE, UpdatePhase.READY -> {
                state.release?.let {
                    Text(stringResource(R.string.app_update_available, it.version, (it.size + 1_048_575) / 1_048_576))
                }
                Button(onClick = if (state.phase == UpdatePhase.READY) onInstall else onDownload, enabled = !installing) {
                    Text(stringResource(if (state.phase == UpdatePhase.READY) R.string.app_update_install else R.string.app_update_download))
                }
            }
            UpdatePhase.CURRENT -> Text(stringResource(R.string.app_update_current))
            UpdatePhase.UNPUBLISHED -> Text(stringResource(R.string.app_update_unpublished))
            else -> Unit
        }
        state.message?.let { Text(stringResource(it)) }
        if (state.phase !in listOf(UpdatePhase.CHECKING, UpdatePhase.DOWNLOADING, UpdatePhase.CANCELLING)) {
            OutlinedButton(onClick = onCheck, enabled = !installing) {
                Icon(painterResource(R.drawable.ic_refresh), null, Modifier.size(20.dp))
                Spacer(Modifier.width(8.dp))
                Text(stringResource(R.string.app_update_check))
            }
        }
    }
    if (help) AlertDialog(
        onDismissRequest = { help = false },
        title = { Text(stringResource(R.string.app_update_help_title)) },
        text = { Text(stringResource(R.string.app_update_help)) },
        confirmButton = { TextButton(onClick = { help = false }) { Text(stringResource(R.string.action_close)) } }
    )
}
