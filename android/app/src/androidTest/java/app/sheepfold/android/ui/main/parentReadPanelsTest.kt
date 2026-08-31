package app.sheepfold.android.ui.main

/*
 * Проверяет фильтр/подтверждение очистки журнала и отображение администраторских устройств
 * Пустая Activity, вымышленные записи, ни одной команды сети или удаления журнала
 * Нажатие подтверждения очистки и backend-права требуют отдельного сетевого стенда
 */
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.assertIsNotEnabled
import androidx.compose.ui.test.hasText
import androidx.compose.ui.test.hasScrollToNodeAction
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performScrollToNode
import androidx.compose.ui.test.performTextReplacement
import androidx.test.ext.junit.runners.AndroidJUnit4
import app.sheepfold.android.R
import app.sheepfold.android.router.RouterAdministrator
import org.junit.Assert.assertEquals
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class ParentReadPanelsTest : ParentUiFixture() {
    private val entries = listOf("Fixture WiFi updated", "Fixture SIM changed", "Fixture router restarted")
    @Test fun logFilterIsCaseInsensitiveAndReversible() {
        show { LogsTab(client, config, entries, false, {}, {}) }
        label(R.string.logs_filter).performTextReplacement("wIfI")
        compose.onNodeWithText(entries[0]).assertIsDisplayed()
        compose.onNodeWithText(entries[1]).assertDoesNotExist()
        label(R.string.logs_filter).performTextReplacement("not-found")
        compose.onNodeWithText(entries[0]).assertDoesNotExist()
        label(R.string.logs_filter).performTextReplacement("")
        compose.onNodeWithText(entries[1]).assertIsDisplayed()
    }
    @Test fun logClearNeedsConfirmationAndCanBeCancelled() {
        var clears = 0
        var refreshes = 0
        show { LogsTab(client, config, entries, false, { refreshes++ }, { clears++ }) }
        label(R.string.logs_clear).performClick()
        label(R.string.logs_clear_message).assertIsDisplayed()
        assertEquals(0, clears)
        label(R.string.action_cancel).performClick()
        label(R.string.logs_clear_message).assertDoesNotExist()
        label(R.string.action_refresh).performClick()
        assertEquals(1, refreshes)
        assertEquals(0, clears)
        compose.onNodeWithText(entries[0]).assertIsDisplayed()
    }
    @Test fun logCapabilitiesAndEmptyStateAreRespected() {
        show { LogsTab(client, config.copy(capabilities = config.capabilities.copy(logRead = false, logClear = false)), emptyList(), false, {}, {}) }
        label(R.string.action_refresh).assertIsNotEnabled()
        label(R.string.logs_clear).assertIsNotEnabled()
        label(R.string.logs_empty).assertIsDisplayed()
    }
    @Test fun administratorPanelSeparatesPairedDevices() {
        val admin = RouterAdministrator("a1", "1", "Fixture parent", "fixture", true)
        show { ParentDevicesTab(listOf(admin), listOf(device(true).copy(administratorLogin = "fixture"),
            device(true).copy(id = "19", name = "Other phone", administratorLogin = "other"),
            device().copy(id = "18", name = "Ordinary fixture")), "17", false, {}) }
        compose.onNodeWithText(admin.displayName).assertIsDisplayed()
        savePanelScreenshot("parent-devices.png")
        label(R.string.parent_devices_mine).assertIsDisplayed()
        val pairedName = "Fixture phone"
        compose.onNode(hasScrollToNodeAction()).performScrollToNode(hasText(pairedName))
        compose.onNodeWithText(pairedName).assertIsDisplayed()
        compose.onNodeWithText("Ordinary fixture").assertDoesNotExist()
        compose.onNode(hasScrollToNodeAction()).performScrollToNode(hasText("Other phone"))
        compose.onNodeWithText("Other phone").assertIsDisplayed()
    }
    @Test fun administratorLoadingDoesNotPretendListIsEmpty() {
        show { ParentDevicesTab(emptyList(), emptyList(), "", true, {}) }
        icon(R.string.action_refresh).assertIsNotEnabled()
        label(R.string.parent_devices_empty).assertDoesNotExist()
    }
}
