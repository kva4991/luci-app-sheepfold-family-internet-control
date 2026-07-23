package com.example.sheepfoldchild.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.example.sheepfoldchild.R
import com.example.sheepfoldchild.data.ClientStatusData

/**
 * Экран «Мой доступ» показывает только итоговый доступ и время следующего
 * изменения. Внутренний режим, конфликт и разрешившее правило публичный API
 * больше не передаёт; при ограничении допустимо короткое безопасное объяснение.
 */
@Composable
fun AccessInfoScreen(status: ClientStatusData?) {
    if (status == null) {
        Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
            Text(stringResource(R.string.error_generic))
        }
        return
    }
    val showExplanation = status.internetState != "enabled"

    LazyColumn(
        modifier = Modifier
            .fillMaxSize()
            .padding(20.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp)
    ) {
        item {
            Text(
                text = stringResource(R.string.access_screen_title),
                fontSize = 22.sp,
                fontWeight = FontWeight.Bold
            )
        }

        status.deviceName?.let { name ->
            item {
                InfoCard(
                    label = stringResource(R.string.access_device_label),
                    value = name
                )
            }
        }

        item {
            val label = when (status.internetState) {
                "enabled" -> stringResource(R.string.status_enabled)
                "disabled" -> stringResource(R.string.status_disabled)
                else -> stringResource(R.string.status_unknown)
            }
            InfoCard(
                label = stringResource(R.string.access_internet_label),
                value = label,
                highlight = status.internetState == "enabled"
            )
        }

        status.nextAccessChangeTime?.let { changeTime ->
            item {
                InfoCard(
                    label = stringResource(R.string.access_next_change_label),
                    value = changeTime
                )
            }
        }

        if (showExplanation) {
            status.message?.let { message ->
                item {
                    InfoCard(
                        label = stringResource(R.string.access_message_label),
                        value = message
                    )
                }
            }
        }
    }
}

@Composable
private fun InfoCard(label: String, value: String, highlight: Boolean = false) {
    val background = if (highlight) {
        MaterialTheme.colorScheme.primaryContainer
    } else {
        MaterialTheme.colorScheme.surfaceVariant
    }

    Card(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(12.dp),
        colors = CardDefaults.cardColors(containerColor = background)
    ) {
        Column(modifier = Modifier.padding(16.dp)) {
            Text(
                text = label,
                fontSize = 12.sp,
                color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.6f)
            )
            Spacer(modifier = Modifier.height(4.dp))
            Text(text = value, fontSize = 16.sp, fontWeight = FontWeight.Medium)
        }
    }
}
