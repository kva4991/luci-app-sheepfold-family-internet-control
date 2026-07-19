package com.example.sheepfoldchild.ui

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
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
 * Экран «Мой доступ» — показывает ребёнку понятную информацию
 * о текущем режиме, времени и расписании.
 * Отображает только то, что безопасно показывать: без MAC и без токенов.
 */
@Composable
fun AccessInfoScreen(status: ClientStatusData?) {
    if (status == null) {
        Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
            Text(stringResource(R.string.error_generic))
        }
        return
    }

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

        // Имя устройства
        status.deviceName?.let { name ->
            item {
                InfoCard(
                    label = stringResource(R.string.access_device_label),
                    value = name
                )
            }
        }

        // Статус интернета
        item {
            val label = when (status.internetState) {
                "enabled"  -> stringResource(R.string.status_enabled)
                "disabled" -> stringResource(R.string.status_disabled)
                else       -> stringResource(R.string.status_unknown)
            }
            InfoCard(
                label = stringResource(R.string.access_internet_label),
                value = label,
                highlight = status.internetState == "enabled"
            )
        }

        // Режим доступа — в понятных словах
        status.accessMode?.let { mode ->
            item {
                val modeStr = when (mode) {
                    "allowlist"  -> stringResource(R.string.access_mode_allowlist)
                    "blocked"    -> stringResource(R.string.access_mode_blocked)
                    "scheduled"  -> stringResource(R.string.access_mode_scheduled)
                    "temporary"  -> stringResource(R.string.access_mode_temporary)
                    "restricted" -> stringResource(R.string.access_mode_restricted)
                    "default"    -> stringResource(R.string.access_mode_default)
                    else         -> stringResource(R.string.access_mode_unknown)
                }
                InfoCard(
                    label = stringResource(R.string.access_mode_label),
                    value = modeStr
                )
            }
        }

        // Показываем только время по часам роутера: ребёнку не нужен технический
        // тип границы расписания или лишнее обещание, включится ли интернет.
        if (status.nextAccessChangeTime != null) {
            item {
                InfoCard(
                    label = stringResource(R.string.access_next_change_label),
                    value = status.nextAccessChangeTime
                )
            }
        }

        // Сообщение от роутера
        status.message?.let { msg ->
            item {
                InfoCard(
                    label = stringResource(R.string.access_message_label),
                    value = msg
                )
            }
        }
    }
}

@Composable
private fun InfoCard(label: String, value: String, highlight: Boolean = false) {
    val bgColor = if (highlight)
        MaterialTheme.colorScheme.primaryContainer
    else
        MaterialTheme.colorScheme.surfaceVariant

    Card(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(12.dp),
        colors = CardDefaults.cardColors(containerColor = bgColor)
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
