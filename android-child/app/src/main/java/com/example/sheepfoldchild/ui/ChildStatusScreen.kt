package com.example.sheepfoldchild.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.example.sheepfoldchild.R
import com.example.sheepfoldchild.data.ClientStatusData
import com.example.sheepfoldchild.viewmodel.ChildStatusViewModel
import com.example.sheepfoldchild.viewmodel.ChildUiState

@Composable
fun ChildStatusScreen(viewModel: ChildStatusViewModel) {
    Scaffold { paddingValues ->
        Box(
            modifier = Modifier
                .fillMaxSize()
                .padding(paddingValues)
                .padding(24.dp),
            contentAlignment = Alignment.Center
        ) {
            when (val state = viewModel.uiState) {
                is ChildUiState.Loading -> CircularProgressIndicator()
                is ChildUiState.Success -> StatusCard(
                    status = state.status,
                    lastUpdated = viewModel.lastUpdated,
                    accessRequestMessage = viewModel.accessRequestMessage,
                    onRefresh = viewModel::refresh,
                    onRequestThirtyMinutes = viewModel::requestThirtyMinutes
                )
                is ChildUiState.RouterUnavailable -> RouterUnavailableCard(
                    message = state.message,
                    onRefresh = viewModel::refresh
                )
                is ChildUiState.Error -> ErrorCard(
                    message = state.message,
                    onRefresh = viewModel::refresh
                )
                is ChildUiState.NoRouter -> Text(
                    text = stringResource(R.string.error_generic),
                    textAlign = TextAlign.Center
                )
            }
        }
    }
}

@Composable
private fun StatusCard(
    status: ClientStatusData,
    lastUpdated: String?,
    accessRequestMessage: String?,
    onRefresh: () -> Unit,
    onRequestThirtyMinutes: () -> Unit
) {
    val isEnabled = status.internetState == "enabled"
    val isDisabled = status.internetState == "disabled"
    val showExplanation = !isEnabled
    val cardColor = when {
        isEnabled -> MaterialTheme.colorScheme.primaryContainer
        isDisabled -> MaterialTheme.colorScheme.errorContainer
        else -> MaterialTheme.colorScheme.surfaceVariant
    }

    Card(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(20.dp),
        colors = CardDefaults.cardColors(containerColor = cardColor)
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(32.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(16.dp)
        ) {
            Text(
                text = when {
                    isEnabled -> stringResource(R.string.status_enabled)
                    isDisabled -> stringResource(R.string.status_disabled)
                    else -> stringResource(R.string.status_unknown)
                },
                fontSize = 28.sp,
                fontWeight = FontWeight.Bold,
                textAlign = TextAlign.Center
            )

            status.deviceName?.let { name ->
                Text(
                    text = name,
                    fontSize = 16.sp,
                    color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.7f)
                )
            }

            status.nextAccessChangeTime?.let { changeTime ->
                Surface(
                    shape = RoundedCornerShape(12.dp),
                    color = MaterialTheme.colorScheme.surface.copy(alpha = 0.6f)
                ) {
                    Text(
                        text = changeTime,
                        modifier = Modifier.padding(horizontal = 16.dp, vertical = 8.dp),
                        fontSize = 18.sp,
                        fontWeight = FontWeight.Medium
                    )
                }
            }

            if (showExplanation) {
                status.message?.let { message ->
                    Text(
                        text = message,
                        fontSize = 14.sp,
                        textAlign = TextAlign.Center,
                        color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.65f)
                    )
                }
            }

            if (status.canRequestAccessExtension && !status.isAdministrator) {
                OutlinedButton(
                    onClick = onRequestThirtyMinutes,
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Text(stringResource(R.string.access_request_30_minutes))
                }
            }

            accessRequestMessage?.let { message ->
                Text(message, fontSize = 14.sp, textAlign = TextAlign.Center)
            }

            Button(onClick = onRefresh, modifier = Modifier.fillMaxWidth()) {
                Text(stringResource(R.string.btn_refresh), textAlign = TextAlign.Center)
            }

            lastUpdated?.let {
                Text(
                    text = stringResource(R.string.last_updated, it),
                    fontSize = 12.sp,
                    color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.4f)
                )
            }
        }
    }
}

@Composable
private fun RouterUnavailableCard(message: String, onRefresh: () -> Unit) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(20.dp),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.tertiaryContainer)
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(32.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(16.dp)
        ) {
            Text(
                stringResource(R.string.router_unavailable_title),
                style = MaterialTheme.typography.headlineSmall,
                textAlign = TextAlign.Center
            )
            Text(message, textAlign = TextAlign.Center)
            Button(onClick = onRefresh, modifier = Modifier.fillMaxWidth()) {
                Text(stringResource(R.string.btn_refresh), textAlign = TextAlign.Center)
            }
        }
    }
}

@Composable
private fun ErrorCard(message: String, onRefresh: () -> Unit) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(20.dp),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant)
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(32.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(16.dp)
        ) {
            Text(message, fontSize = 16.sp, textAlign = TextAlign.Center)
            Button(onClick = onRefresh, modifier = Modifier.fillMaxWidth()) {
                Text(stringResource(R.string.btn_refresh), textAlign = TextAlign.Center)
            }
        }
    }
}
