package app.sheepfold.android.ui.main

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.selection.SelectionContainer
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.Checkbox
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
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
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.unit.dp
import app.sheepfold.android.R
import app.sheepfold.android.router.RouterAdminClient
import app.sheepfold.android.router.SupportReportConfig
import app.sheepfold.android.support.PreparedSupportReport
import app.sheepfold.android.support.SupportReportCrypto
import app.sheepfold.android.support.SupportReportDraft
import app.sheepfold.android.support.SupportReportPayload
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

private data class FeedbackCategory(val value: String, val label: Int)

private data class PendingSupportReport(
    val report: PreparedSupportReport,
    val config: SupportReportConfig
)

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
    var expectedBehavior by remember { mutableStateOf("") }
    var reproductionSteps by remember { mutableStateOf("") }
    var contact by remember { mutableStateOf("") }
    var includeDiagnostics by remember { mutableStateOf(false) }
    var sending by remember { mutableStateOf(false) }
    var pending by remember { mutableStateOf<PendingSupportReport?>(null) }
    var dialogError by remember { mutableStateOf<String?>(null) }
    var result by remember { mutableStateOf<String?>(null) }
    val sentText = stringResource(R.string.feedback_sent)
    val invalidText = stringResource(R.string.feedback_invalid)
    val unknownErrorText = stringResource(R.string.feedback_unknown_error)

    pending?.let { pendingReport ->
        AlertDialog(
            onDismissRequest = { if (!sending) pending = null },
            title = { Text(stringResource(R.string.feedback_preview_title)) },
            text = {
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text(stringResource(R.string.feedback_preview_intro))
                    SelectionContainer {
                        Text(
                            text = pendingReport.report.payloadJson,
                            modifier = Modifier
                                .fillMaxWidth()
                                .heightIn(max = 420.dp)
                                .verticalScroll(rememberScrollState()),
                            fontFamily = FontFamily.Monospace,
                            style = MaterialTheme.typography.bodySmall
                        )
                    }
                    dialogError?.let {
                        Text(it, color = MaterialTheme.colorScheme.error)
                    }
                }
            },
            confirmButton = {
                Button(
                    enabled = !sending,
                    onClick = {
                        sending = true
                        result = null
                        dialogError = null
                        scope.launch {
                            runCatching {
                                val encrypted = withContext(Dispatchers.Default) {
                                    SupportReportCrypto.encrypt(pendingReport.report, pendingReport.config)
                                }
                                client.submitSupportReport(
                                    encrypted.reportId,
                                    encrypted.recipientKeyId,
                                    encrypted.ciphertext
                                )
                            }.onSuccess {
                                subject = ""
                                message = ""
                                expectedBehavior = ""
                                reproductionSteps = ""
                                contact = ""
                                pending = null
                                result = sentText
                            }.onFailure { dialogError = it.message ?: unknownErrorText }
                            sending = false
                        }
                    }
                ) {
                    Text(stringResource(if (sending) R.string.feedback_sending else R.string.feedback_confirm_send))
                }
            },
            dismissButton = {
                TextButton(enabled = !sending, onClick = {
                    dialogError = null
                    pending = null
                }) {
                    Text(stringResource(R.string.feedback_back))
                }
            }
        )
    }

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
            onValueChange = { if (it.length <= 160) subject = it },
            label = { Text(stringResource(R.string.feedback_subject)) },
            singleLine = true,
            modifier = Modifier.fillMaxWidth()
        )
        OutlinedTextField(
            value = message,
            onValueChange = { if (it.length <= 8000) message = it },
            label = { Text(stringResource(R.string.feedback_message)) },
            minLines = 7,
            modifier = Modifier.fillMaxWidth()
        )
        if (category.value == "bug") {
            OutlinedTextField(
                value = expectedBehavior,
                onValueChange = { if (it.length <= 4000) expectedBehavior = it },
                label = { Text(stringResource(R.string.feedback_expected_behavior)) },
                minLines = 3,
                modifier = Modifier.fillMaxWidth()
            )
            OutlinedTextField(
                value = reproductionSteps,
                onValueChange = { if (it.length <= 8000) reproductionSteps = it },
                label = { Text(stringResource(R.string.feedback_reproduction_steps)) },
                minLines = 4,
                modifier = Modifier.fillMaxWidth()
            )
        }
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
                if (cleanSubject.isEmpty() || cleanMessage.length !in 10..8000) {
                    result = invalidText
                    return@Button
                }
                sending = true
                result = null
                scope.launch {
                    runCatching {
                        val config = client.loadSupportReportConfig()
                        val snapshot = client.loadRouterInfo()
                        val report = SupportReportPayload.prepare(
                            SupportReportDraft(
                                category = category.value,
                                title = cleanSubject,
                                actualBehavior = cleanMessage,
                                expectedBehavior = expectedBehavior.takeIf { category.value == "bug" }.orEmpty(),
                                reproductionSteps = reproductionSteps.takeIf { category.value == "bug" }.orEmpty(),
                                replyContact = contact,
                                diagnosticsApproved = includeDiagnostics
                            ),
                            snapshot
                        )
                        PendingSupportReport(report, config)
                    }.onSuccess { pending = it }
                        .onFailure { result = it.message ?: unknownErrorText }
                    sending = false
                }
            }
        ) {
            Text(stringResource(if (sending) R.string.feedback_preparing else R.string.feedback_preview_button))
        }
        result?.let { Text(it) }
    }
}
