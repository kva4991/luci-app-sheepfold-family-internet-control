package com.example.sheepfoldchild.ui

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.example.sheepfoldchild.R
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
                is ChildUiState.Loading -> {
                    CircularProgressIndicator()
                }
                is ChildUiState.Success -> {
                    StatusCard(
                        status = state.status,
                        lastUpdated = viewModel.lastUpdated,
                        onRefresh = { viewModel.refresh() }
                    )
                }
                is ChildUiState.Error -> {
                    ErrorCard(
                        message = state.message,
                        onRefresh = { viewModel.refresh() }
                    )
                }
                is ChildUiState.NoRouter -> {
                    Text(
                        text = stringResource(R.string.error_generic),
                        textAlign = TextAlign.Center
                    )
                }
            }
        }
    }
}

@Composable
private fun StatusCard(
    status: com.example.sheepfoldchild.data.ClientStatusData,
    lastUpdated: String?,
    onRefresh: () -> Unit
) {
    val isEnabled = status.internetState == "enabled"
    val cardColor = if (isEnabled)
        MaterialTheme.colorScheme.primaryContainer
    else
        MaterialTheme.colorScheme.errorContainer

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
            // Крупный статус
            Text(
                text = if (isEnabled)
                    stringResource(R.string.status_enabled)
                else
                    stringResource(R.string.status_disabled),
                fontSize = 28.sp,
                fontWeight = FontWeight.Bold,
                textAlign = TextAlign.Center
            )

            // Имя устройства
            status.deviceName?.let { name ->
                Text(
                    text = name,
                    fontSize = 16.sp,
                    color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.7f)
                )
            }

            // Таймер
            status.minutesRemaining?.let { mins ->
                Surface(
                    shape = RoundedCornerShape(12.dp),
                    color = MaterialTheme.colorScheme.surface.copy(alpha = 0.6f)
                ) {
                    Text(
                        text = stringResource(R.string.time_remaining, mins),
                        modifier = Modifier.padding(horizontal = 16.dp, vertical = 8.dp),
                        fontSize = 18.sp,
                        fontWeight = FontWeight.Medium
                    )
                }
            }

            // Сообщение
            status.message?.let { msg ->
                Text(
                    text = msg,
                    fontSize = 14.sp,
                    textAlign = TextAlign.Center,
                    color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.6f)
                )
            }

            // Кнопка Обновить
            Button(
                onClick = onRefresh,
                modifier = Modifier.fillMaxWidth()
            ) {
                Text(stringResource(R.string.btn_refresh))
            }

            // Время последнего обновления
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
private fun ErrorCard(message: String, onRefresh: () -> Unit) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(20.dp),
        colors = CardDefaults.cardColors(
            containerColor = MaterialTheme.colorScheme.surfaceVariant
        )
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(32.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(16.dp)
        ) {
            Text(
                text = message,
                fontSize = 16.sp,
                textAlign = TextAlign.Center
            )
            Button(
                onClick = onRefresh,
                modifier = Modifier.fillMaxWidth()
            ) {
                Text(stringResource(R.string.btn_refresh))
            }
        }
    }
}
