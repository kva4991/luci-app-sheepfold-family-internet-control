package app.sheepfold.android.ui.main

import app.sheepfold.android.router.RouterSchedule

/*
 * Один расчёт используется редакторами расписания и группы. Иначе два экрана
 * начнут по-разному понимать ночные интервалы и конфликт после полуночи. §grpsch1
 */
internal fun findOppositeScheduleConflict(
    draft: RouterSchedule,
    schedules: List<RouterSchedule>
): String? {
    if (!draft.enabled) return null
    val draftTargets = draft.targets.toSet()
    val draftWindows = scheduleWindows(draft)
    return schedules.firstOrNull { existing ->
        existing.enabled &&
            existing.section != draft.section &&
            existing.action != draft.action &&
            existing.targetType == draft.targetType &&
            existing.targets.any { it in draftTargets } &&
            windowsOverlap(draftWindows, scheduleWindows(existing))
    }?.name
}

internal fun findSelectedGroupScheduleConflict(
    selectedIds: Set<String>,
    schedules: List<RouterSchedule>
): Pair<String, String>? {
    val selected = schedules.filter { it.section in selectedIds && it.enabled }
    selected.forEachIndexed { index, first ->
        selected.drop(index + 1).forEach { second ->
            if (first.action != second.action && windowsOverlap(scheduleWindows(first), scheduleWindows(second))) {
                return first.name to second.name
            }
        }
    }
    return null
}

private fun scheduleWindows(schedule: RouterSchedule): List<Pair<Int, Int>> =
    schedule.weekdays.flatMap { day ->
        val dayIndex = weekdayDefinitions.indexOfFirst { it.first == day }
        if (dayIndex < 0) return@flatMap emptyList()
        schedule.timeRanges.mapNotNull { range ->
            val start = timeToMinutes(range.start)
            var end = timeToMinutes(range.end)
            if (start < 0 || end < 0 || start == end) return@mapNotNull null
            if (end < start) end += 24 * 60
            dayIndex * 24 * 60 + start to dayIndex * 24 * 60 + end
        }
    }

private fun windowsOverlap(left: List<Pair<Int, Int>>, right: List<Pair<Int, Int>>): Boolean {
    val week = 7 * 24 * 60
    return left.any { first ->
        right.any { second ->
            listOf(-week, 0, week).any { shift ->
                first.first < second.second + shift && second.first + shift < first.second
            }
        }
    }
}

private fun timeToMinutes(value: String): Int {
    val parts = value.split(':')
    if (parts.size != 2) return -1
    val hours = parts[0].toIntOrNull() ?: return -1
    val minutes = parts[1].toIntOrNull() ?: return -1
    if (hours !in 0..23 || minutes !in 0..59) return -1
    return hours * 60 + minutes
}
