package app.sheepfold.android.ui.main

/*
 * Проверяет реальные клики управления и редактора устройства, блокировку повторных действий и положение индикатора
 * Только callbacks на синтетических данных; pairing, сеть, правила и настройки не изменяются
 * Не доказывает выполнение интернет-команды или сохранение UCI
 */
import androidx.compose.runtime.mutableStateOf
import androidx.compose.ui.semantics.SemanticsProperties
import androidx.compose.ui.test.SemanticsMatcher
import androidx.compose.ui.test.assertCountEquals
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.assertIsEnabled
import androidx.compose.ui.test.assertIsNotEnabled
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.click
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performScrollTo
import androidx.compose.ui.test.performTextReplacement
import androidx.compose.ui.test.performTouchInput
import androidx.test.ext.junit.runners.AndroidJUnit4
import app.sheepfold.android.R
import app.sheepfold.android.router.RouterDevice
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class ParentControlsTest : ParentUiFixture() {
    @Test fun controlCommandsAndRefreshAreDistinct() {
        val commands = mutableListOf<Boolean>()
        var refreshes = 0
        show { ControlTab("Fixture", false, false, null, { refreshes++ }, { commands += it }) }
        label(R.string.router_now_enabled).assertIsDisplayed()
        icon(R.string.action_refresh).assertIsDisplayed().performClick()
        label(R.string.router_turn_internet_off).performClick()
        label(R.string.router_turn_internet_on).performClick()
        assertEquals(listOf(true, false), commands)
        assertEquals(1, refreshes)
    }
    @Test fun loadingBlocksRepeatedCommandsAndThenRecovers() {
        val loading = mutableStateOf(true)
        var calls = 0
        show { ControlTab("Fixture", true, loading.value, "Fixture timeout", { calls++ }, { calls++ }) }
        label(R.string.router_now_disabled).assertIsDisplayed()
        for (id in listOf(R.string.router_turn_internet_on, R.string.router_turn_internet_off)) {
            label(id).assertIsNotEnabled()
        }
        icon(R.string.action_refresh).assertIsNotEnabled()
        compose.onNodeWithText("Fixture timeout").assertIsDisplayed()
        assertEquals(0, calls)
        compose.runOnIdle { loading.value = false }
        icon(R.string.action_refresh).assertIsEnabled().performClick()
        assertEquals(1, calls)
    }
    @Test fun refreshSpinnerStaysInsideDisabledButtonUntilRequestCompletes() {
        val loading = mutableStateOf(false)
        val error = mutableStateOf<String?>(null)
        var refreshes = 0
        show { ControlTab("Fixture", false, loading.value, error.value, { refreshes++; loading.value = true }, {}) }
        val progress = SemanticsMatcher.keyIsDefined(SemanticsProperties.ProgressBarRangeInfo)
        val refresh = icon(R.string.action_refresh)
        val before = refresh.fetchSemanticsNode().boundsInRoot
        val commandBefore = label(R.string.router_turn_internet_on).fetchSemanticsNode().boundsInRoot
        compose.onAllNodes(progress, useUnmergedTree = true).assertCountEquals(0)
        refresh.performClick()
        refresh.assertIsNotEnabled()
        compose.onAllNodes(progress, useUnmergedTree = true).assertCountEquals(1)
        val spinner = compose.onNode(progress, useUnmergedTree = true).assertIsDisplayed().fetchSemanticsNode().boundsInRoot
        assertTrue(spinner.left >= before.left && spinner.top >= before.top)
        assertTrue(spinner.right <= before.right && spinner.bottom <= before.bottom)
        assertEquals(before, refresh.fetchSemanticsNode().boundsInRoot)
        assertEquals(commandBefore, label(R.string.router_turn_internet_on).fetchSemanticsNode().boundsInRoot)
        repeat(3) { refresh.performTouchInput { click() } }
        compose.runOnIdle { assertEquals(1, refreshes) }
        savePanelScreenshot("control-refresh-loading.png")
        compose.runOnIdle { loading.value = false; error.value = "Fixture timeout" }
        compose.onAllNodes(progress, useUnmergedTree = true).assertCountEquals(0)
        compose.onNodeWithText("Fixture timeout").assertIsDisplayed()
        refresh.assertIsEnabled().performClick()
        compose.runOnIdle { assertEquals(2, refreshes) }
    }
    @Test fun deviceDraftRequiresExplicitSaveAndPreservesIdentity() {
        var saved: RouterDevice? = null
        show { DeviceEditorDialog(device(), emptyList(), false, null, {}, { saved = it }) }
        label(R.string.device_name_label).performTextReplacement("  Renamed fixture  ")
        assertNull(saved)
        label(R.string.action_save).performClick()
        val result = requireNotNull(saved)
        assertEquals("Renamed fixture", result.name)
        assertEquals(device().id, result.id)
        assertEquals(device().mac, result.mac)
        assertTrue(result.manualDeviceType)
    }
    @Test fun blankDeviceNameCannotBeSaved() {
        var saves = 0
        show { DeviceEditorDialog(device(), emptyList(), false, null, {}, { saves++ }) }
        label(R.string.device_name_label).performTextReplacement("   ")
        label(R.string.action_save).assertIsNotEnabled()
        assertEquals(0, saves)
    }
    @Test fun busyDeviceEditorCannotSaveOrDismiss() {
        show { DeviceEditorDialog(device(), emptyList(), true, null, { error("dismissed") }, { error("saved") }) }
        label(R.string.device_name_label).assertIsNotEnabled()
        label(R.string.action_save).assertIsNotEnabled()
        label(R.string.action_cancel).assertIsNotEnabled()
    }
    @Test fun administratorCannotBeAssignedFamilyPolicy() {
        var saved: RouterDevice? = null
        show { DeviceEditorDialog(device(true), emptyList(), false, null, {}, { saved = it }) }
        label(R.string.device_group_label).assertIsNotEnabled()
        label(R.string.action_save).performClick()
        assertEquals("Not configured", saved?.group)
        assertEquals("allow", saved?.status)
    }
    @Test fun cancelDiscardsDeviceDraftAndShowsBackendError() {
        val visible = mutableStateOf(true)
        var saves = 0
        show {
            if (visible.value) DeviceEditorDialog(device(), emptyList(), false, "Fixture save error", { visible.value = false }, { saves++ })
        }
        label(R.string.device_name_label).performTextReplacement("Not saved")
        compose.onNodeWithText("Fixture save error").performScrollTo().assertIsDisplayed()
        label(R.string.action_cancel).performClick()
        label(R.string.draft_discard_title).assertIsDisplayed()
        label(R.string.draft_keep_editing).performClick()
        label(R.string.device_name_label).assertIsDisplayed()
        label(R.string.action_cancel).performClick()
        label(R.string.draft_discard).performClick()
        label(R.string.device_name_label).assertDoesNotExist()
        assertEquals(0, saves)
    }

    @Test fun unknownStateDisablesBothButtonsUntilConfirmed() {
        val state = mutableStateOf<Boolean?>(null)
        val loading = mutableStateOf(true)
        val timestamp = mutableStateOf<Long?>(null)
        show { ControlTab("Fixture", state.value, loading.value, null, {}, {}, timestamp.value) }
        label(R.string.router_turn_internet_on).assertIsNotEnabled()
        label(R.string.router_turn_internet_off).assertIsNotEnabled()
        compose.runOnIdle { loading.value = false; timestamp.value = 1_750_000_000_000L }
        label(R.string.router_turn_internet_on).assertIsNotEnabled()
        label(R.string.router_turn_internet_off).assertIsNotEnabled()
        icon(R.string.action_refresh).assertIsEnabled()
        compose.runOnIdle { state.value = true }
        label(R.string.router_now_disabled).assertIsDisplayed()
        label(R.string.router_turn_internet_on).assertIsEnabled()
        label(R.string.router_turn_internet_off).assertIsEnabled()
    }
}
