package app.sheepfold.android.ui.main

/* Проверяет RAM-черновики, исходную revision, неизвестное состояние и окна превью.
 * Без Activity/сети; не доказывает сохранение после уничтожения процесса. §andlab1 */
import app.sheepfold.android.router.*
import org.junit.Assert.*
import org.junit.Test

class ParentWorkspaceRulesTest {
    @Test fun missingOrMalformedStateCannotBecomeAllowed() {
        listOf(null, "", "false", "2", "true", "unknown").forEach { assertNull(parseGlobalBlock(it)) }
        assertEquals(false, parseGlobalBlock("0"))
        assertEquals(true, parseGlobalBlock("1"))
    }
    @Test fun formFieldsPreserveOtherValuesAndOriginalRevision() {
        val form = FormDraft(RouterGroup(name = "Original", description = "Note"), "before")
        var name by form.field({ it.name }) { value, next -> value.copy(name = next) }
        assertFalse(form.dirty)
        name = "Draft"
        assertTrue(form.dirty)
        assertEquals("Original", form.original.name)
        assertEquals("Note", form.value.description)
        assertEquals("before", form.revision)
        name = "Original"
        assertFalse(form.dirty)
    }
    @Test fun previewSplitsSundayNightAndIgnoresDisabledRules() {
        val rule = RouterSchedule(name = "Fixture", weekdays = listOf("sun"), timeRanges = listOf(RouterTimeRange("22:00", "07:00")))
        assertEquals(listOf(1320 to 1440), previewDayWindows(rule, 6))
        assertEquals(listOf(0 to 420), previewDayWindows(rule, 0))
        assertTrue(previewDayWindows(rule, 1).isEmpty())
        assertTrue(previewDayWindows(rule.copy(enabled = false), 0).isEmpty())
        assertTrue(previewDayWindows(rule.copy(timeRanges = listOf(RouterTimeRange("xx", "07:00"))), 0).isEmpty())
    }
    @Test fun wifiUsesOnlyReportedOrExistingChannels() {
        val wifi = RouterWifiNetwork("net", "radio1", "Fixture", "12345678", "psk2", "36", true, "5g",
            channels = listOf("40", "0", "bad", "40", "999"))
        assertEquals(listOf("36", "auto", "40"), wifiChannelOptions(wifi))
        assertEquals(listOf("36", "auto"), wifiChannelOptions(wifi.copy(channels = emptyList())))
        assertTrue(wifiSettingsEqual(wifi, wifi.copy(channels = listOf("44"))))
        assertFalse(wifiSettingsEqual(wifi, wifi.copy(ssid = "Changed")))
    }
    @Test fun wifiValidationCountsBytesAndAcceptsOpenNetworks() {
        val wifi = RouterWifiNetwork("net", "radio0", "Fixture", "12345678", "psk2", "auto", true, "2g")
        assertTrue(wifiInputValid(wifi))
        assertFalse(wifiInputValid(wifi.copy(password = "short")))
        assertFalse(wifiInputValid(wifi.copy(ssid = "я".repeat(17))))
        assertTrue(wifiInputValid(wifi.copy(encryption = "none", password = "")))
        assertTrue(wifiInputValid(wifi.copy(password = "a".repeat(64))))
        assertFalse(wifiInputValid(wifi.copy(password = "z".repeat(64))))
    }
}
