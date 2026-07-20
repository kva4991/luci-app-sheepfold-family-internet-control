package app.sheepfold.android.ui.main

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import app.sheepfold.android.R
import app.sheepfold.android.router.AiAssistantClient
import app.sheepfold.android.router.AiAssistantRequest
import app.sheepfold.android.router.RouterConnectionRequest
import kotlinx.coroutines.launch

/** Единый родительский APK показывает ИИ только по capability роутера. §prodvar */
@Composable
fun productFeatureTab(connection: RouterConnectionRequest, aiAvailable: Boolean): ProductTab? {
    if (!aiAvailable) return null
    return ProductTab(
        title = stringResource(R.string.tab_ai),
        content = { AiTab(connection) }
    )
}

@Composable
private fun AiTab(connection: RouterConnectionRequest) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val failureText = stringResource(R.string.ai_answer_failed)
    var question by remember { mutableStateOf("") }
    var answer by remember { mutableStateOf("") }
    var isLoading by remember { mutableStateOf(false) }

    Column(
        modifier = Modifier.padding(20.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        Text(stringResource(R.string.ai_parent_title), style = MaterialTheme.typography.headlineSmall)
        Text(stringResource(R.string.ai_parent_privacy_default))
        OutlinedTextField(
            value = question,
            onValueChange = { question = it },
            modifier = Modifier.fillMaxWidth(),
            label = { Text(stringResource(R.string.ai_question)) },
            minLines = 3
        )
        Button(
            enabled = question.isNotBlank() && !isLoading,
            onClick = {
                isLoading = true
                scope.launch {
                    answer = runCatching {
                        AiAssistantClient.ask(
                            context,
                            AiAssistantRequest(
                                connection = connection,
                                provider = "",
                                model = "",
                                message = question,
                                includeRouterInfo = false,
                                includeProgramLog = false,
                                googleAccount = ""
                            )
                        )
                    }.getOrElse { it.message ?: failureText }
                    isLoading = false
                }
            },
            modifier = Modifier.fillMaxWidth()
        ) { Text(stringResource(R.string.ai_ask)) }
        if (isLoading) CircularProgressIndicator()
        if (answer.isNotBlank()) {
            Card(colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant)) {
                Text(answer, modifier = Modifier.padding(14.dp))
            }
        }
    }
}
