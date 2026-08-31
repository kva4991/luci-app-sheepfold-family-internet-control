package app.sheepfold.android.ui.main

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.width
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import app.sheepfold.android.R
import app.sheepfold.android.router.RouterSchedule
import java.util.Locale

/** Те же недельные окна, что у проверки конфликтов, включая воскресенье -> понедельник. */
internal fun previewDayWindows(schedule: RouterSchedule, day: Int): List<Pair<Int, Int>> {
    if (!schedule.enabled || day !in 0..6) return emptyList()
    val offset = day * 1440
    return scheduleWindows(schedule).flatMap { window ->
        listOf(-10080, 0, 10080).mapNotNull { shift ->
            val start = maxOf(0, window.first + shift - offset)
            val end = minOf(1440, window.second + shift - offset)
            if (start < end) start to end else null
        }
    }.distinct().sortedBy { it.first }
}

@Composable
internal fun SchedulePreview(schedule: RouterSchedule) {
    val days = remember(schedule) { (0..6).map { previewDayWindows(schedule, it) } }
    val ink = if (schedule.action == "block") MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.primary
    val track = MaterialTheme.colorScheme.surfaceVariant
    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
        Text(stringResource(R.string.schedule_preview_title), style = MaterialTheme.typography.titleSmall)
        Text(stringResource(if (schedule.action == "block") R.string.schedule_action_block else R.string.schedule_action_allow))
        if (!schedule.enabled) Text(stringResource(R.string.schedule_preview_disabled))
        else if (days.all { it.isEmpty() }) Text(stringResource(R.string.schedule_preview_empty))
        Row(Modifier.fillMaxWidth()) {
            Text("", Modifier.width(36.dp))
            Row(Modifier.weight(1f), horizontalArrangement = Arrangement.SpaceBetween) {
                listOf("00", "06", "12", "18", "24").forEach { Text(it, style = MaterialTheme.typography.labelSmall) }
            }
        }
        days.forEachIndexed { index, windows ->
            val day = stringResource(weekdayDefinitions[index].second)
            val empty = stringResource(R.string.schedule_preview_none)
            val times = windows.joinToString(", ") { "${previewTime(it.first)}–${previewTime(it.second)}" }.ifEmpty { empty }
            val description = stringResource(R.string.schedule_preview_day, day, times)
            Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                Text(day.take(2), Modifier.width(36.dp), style = MaterialTheme.typography.labelSmall)
                Canvas(Modifier.weight(1f).height(14.dp).semantics { contentDescription = description }) {
                    drawRect(track)
                    windows.forEach { (start, end) ->
                        drawRect(ink, Offset(size.width * start / 1440, 0f), Size(size.width * (end - start) / 1440, size.height))
                    }
                }
            }
        }
        Text(stringResource(R.string.schedule_preview_scope), style = MaterialTheme.typography.bodySmall)
    }
}

private fun previewTime(minutes: Int): String = String.format(Locale.ROOT, "%02d:%02d", minutes / 60, minutes % 60)
