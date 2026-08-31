package app.sheepfold.android.ui.main

/*
 * Проверяет общую логику конфликтов редакторов на границах суток и недели
 * JVM исполняет production-функции без телефона, сети и записи настроек
 * Не подтверждает применение расписаний firewall или правильность часов роутера
 */
import app.sheepfold.android.router.RouterSchedule
import app.sheepfold.android.router.RouterTimeRange
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class ScheduleRulesTest {
    private fun rule(day: String, start: String, end: String, action: String = "block") = RouterSchedule(
        section = action, name = action, action = action, targets = listOf("child"),
        weekdays = listOf(day), timeRanges = listOf(RouterTimeRange(start, end))
    )
    private val night = rule("sun", "22:00", "07:00")
    private val morning = rule("mon", "06:00", "08:00", "allow")

    @Test fun weekRolloverConflictsBothWays() {
        assertEquals("block", findOppositeScheduleConflict(morning, listOf(night)))
        assertEquals("allow", findOppositeScheduleConflict(night, listOf(morning)))
    }
    @Test fun adjacentWindowsDoNotOverlap() {
        assertNull(findOppositeScheduleConflict(morning.copy(timeRanges = listOf(RouterTimeRange("07:00", "08:00"))), listOf(night)))
    }
    @Test fun oneMinuteOverlapCounts() {
        assertEquals("block", findOppositeScheduleConflict(morning.copy(timeRanges = listOf(RouterTimeRange("06:59", "07:00"))), listOf(night)))
    }
    @Test fun differentDayDoesNotConflict() {
        assertNull(findOppositeScheduleConflict(morning.copy(weekdays = listOf("tue")), listOf(night)))
    }
    @Test fun disabledRulesDoNotConflict() {
        assertNull(findOppositeScheduleConflict(morning.copy(enabled = false), listOf(night)))
        assertNull(findOppositeScheduleConflict(morning, listOf(night.copy(enabled = false))))
    }
    @Test fun sameActionAndSelfAreIgnored() {
        assertNull(findOppositeScheduleConflict(morning, listOf(night.copy(action = "allow"))))
        assertNull(findOppositeScheduleConflict(morning, listOf(night.copy(section = morning.section))))
    }
    @Test fun targetScopeIsNotInterchangeable() {
        assertNull(findOppositeScheduleConflict(morning.copy(targets = listOf("other")), listOf(night)))
        assertNull(findOppositeScheduleConflict(morning.copy(targetType = "device"), listOf(night)))
        assertEquals("block", findOppositeScheduleConflict(morning.copy(targets = listOf("other", "child")), listOf(night)))
    }
    @Test fun allRangesAreExamined() {
        val split = night.copy(timeRanges = listOf(RouterTimeRange("10:00", "11:00"), RouterTimeRange("22:00", "07:00")))
        assertEquals("block", findOppositeScheduleConflict(morning, listOf(split)))
    }
    @Test fun malformedWindowsAreNotInvented() {
        for (range in listOf(RouterTimeRange("24:00", "07:00"), RouterTimeRange("xx", "07:00"), RouterTimeRange("06:00", "06:00"))) {
            assertNull(findOppositeScheduleConflict(morning, listOf(night.copy(timeRanges = listOf(range)))))
        }
        assertNull(findOppositeScheduleConflict(morning, listOf(night.copy(weekdays = listOf("invalid")))))
    }
    @Test fun groupSelectionUsesChosenRulesOnly() {
        val rules = listOf(night, morning)
        assertNull(findSelectedGroupScheduleConflict(setOf(night.section, "missing"), rules))
        assertEquals("block" to "allow", findSelectedGroupScheduleConflict(setOf("block", "allow"), rules))
        assertNull(findSelectedGroupScheduleConflict(setOf("block", "allow"), listOf(night, morning.copy(enabled = false))))
    }
    @Test fun groupAssignmentChecksBeforeTargetsAreSaved() {
        assertEquals("block" to "allow", findSelectedGroupScheduleConflict(
            setOf("block", "allow"), listOf(night.copy(targets = emptyList()), morning.copy(targets = listOf("other")))
        ))
    }
}
