package app.sheepfold.android.ui.main

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.Checkbox
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
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
import kotlinx.coroutines.launch

private data class FeedbackCategory(val value: String, val label: Int)

/** Отдельная родительская вкладка обратной связи; в детское APK не включается. §feedback */
@Composable
fun FeedbackTab(client: RouterAdminClient) {
    val categories = listOf(
        FeedbackCategory("idea", R.string.feedback_type_suggestion),
        FeedbackCategory("bug", R.string.feedback_type_problem),
        FeedbackCategory("question", R.string.feedback_type_question),
        FeedbackCategory("other", R.string.feedback_type_other)
    )
    val scope = rememberCoroutineScope()
    var category by remember { mutableStateOf(categories.first()) }
    var categoryOpen by remember { mutableStateOf(false) }
    var subject by remember { mutableStateOf("") }
    var message by remember { mutableStateOf("") }
    var contact by remember { mutableStateOf("") }
    var includeDiagnostics by remember { mutableStateOf(false) }
    var sending by remember { mutableStateOf(false) }
    var result by remember { mutableStateOf<String?>(null) }
    val sentText = stringResource(R.string.feedback_sent)
    val invalidText = stringResource(R.string.feedback_invalid)

    Column(
        modifier = Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(20.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        Text(stringResource(R.string.feedback_title), style = MaterialTheme.typography.headlineSmall)
        Text(stringResource(R.string.feedback_intro))

        Column {
            Text(stringResource(R.string.feedback_type_label))
            OutlinedButton(onClick = { categoryOpen = true }, modifier = Modifier.fillMaxWidth()) {
                Text(stringResource(category.label))
            }
            DropdownMenu(expanded = categoryOpen, onDismissRequest = { categoryOpen = false }) {
                categories.forEach { item ->
                    DropdownMenuItem(
                        text = { Text(stringResource(item.label)) },
                        onClick = {
                            category = item
                            categoryOpen = false
                        }
                    )
                }
            }
        }
        OutlinedTextField(
            value = subject,
            onValueChange = { if (it.length <= 120) subject = it },
            label = { Text(stringResource(R.string.feedback_subject)) },
            singleLine = true,
            modifier = Modifier.fillMaxWidth()
        )
        OutlinedTextField(
            value = message,
            onValueChange = { if (it.length <= 4000) message = it },
            label = { Text(stringResource(R.string.feedback_message)) },
            minLines = 7,
            modifier = Modifier.fillMaxWidth()
        )
        OutlinedTextField(
            value = contact,
            onValueChange = { if (it.length <= 200) contact = it },
            label = { Text(stringResource(R.string.feedback_contact)) },
            supportingText = { Text(stringResource(R.string.feedback_contact_hint)) },
            singleLine = true,
            modifier = Modifier.fillMaxWidth()
        )
        Row(
            modifier = Modifier.fillMaxWidth(),
            verticalAlignment = Alignment.Top
        ) {
            Checkbox(checked = includeDiagnostics, onCheckedChange = { includeDiagnostics = it })
            Text(
                stringResource(R.string.feedback_diagnostics_hint),
                modifier = Modifier.padding(top = 12.dp)
            )
        }
        Button(
            enabled = !sending,
            modifier = Modifier.fillMaxWidth(),
            onClick = {
                val cleanSubject = subject.trim()
                val cleanMessage = message.trim()
                if (cleanSubject.isEmpty() || cleanMessage.length !in 10..4000) {
                    result = invalidText
                    return@Button
                }
                sending = true
                result = null
                scope.launch {
                    runCatching {
                        client.submitFeedback(
                            category.value,
                            cleanSubject,
                            cleanMessage,
                            contact.trim(),
                            includeDiagnostics
                        )
                    }.onSuccess {
                        subject = ""
                        message = ""
                        result = sentText
                    }.onFailure { result = it.message }
                    sending = false
                }
            }
        ) {
            Text(stringResource(if (sending) R.string.feedback_sending else R.string.feedback_send))
        }
        result?.let { Text(it) }
    }
}
