package app.sheepfold.android.ui.main

/*
 * Проверяет ограничения редакторов групп/расписаний и локальный черновик уведомлений
 * Вымышленные данные, клиент без TLS pin, никаких сохранений в сеть или рабочие preferences
 * Не подтверждает успешную запись, revision-conflict или firewall read-back
 */
import androidx.compose.runtime.mutableStateOf
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.assertIsEnabled
import androidx.compose.ui.test.assertIsNotEnabled
import androidx.compose.ui.test.hasAnyAncestor
import androidx.compose.ui.test.hasScrollToNodeAction
import androidx.compose.ui.test.hasText
import androidx.compose.ui.test.isDialog
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performScrollToNode
import androidx.test.ext.junit.runners.AndroidJUnit4
import app.sheepfold.android.R
import app.sheepfold.android.router.RouterAdminConfig
import app.sheepfold.android.router.RouterGroup
import app.sheepfold.android.router.RouterSchedule
import org.junit.Assert.assertEquals
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class ParentEditorsTest : ParentUiFixture() {
    @Test fun groupRequiresCapabilityAndRevision() {
        show { GroupsTab(client, RouterAdminConfig(), emptyList(), false, {}, {}) }
        label(R.string.groups_add).assertIsNotEnabled()
        label(R.string.groups_empty).assertIsDisplayed()
    }
    @Test fun newGroupRejectsEmptyNameAndCanBeCancelled() {
        var changes = 0
        show { GroupsTab(client, config, emptyList(), false, { changes++ }, {}) }
        label(R.string.groups_add).performClick()
        label(R.string.settings_save).performClick()
        label(R.string.validation_group_name_required).assertIsDisplayed()
        assertEquals(0, changes)
        label(R.string.action_cancel).performClick()
        label(R.string.groups_name).assertDoesNotExist()
    }
    @Test fun protectedGroupCannotBeDeletedOrRenamed() {
        val group = RouterGroup(section = "g1", name = "Fixture protected", protectedGroup = true)
        show { GroupsTab(client, config.copy(groups = listOf(group)), emptyList(), false, {}, {}) }
        icon(R.string.action_delete).assertIsNotEnabled()
        icon(R.string.action_edit).performClick()
        label(R.string.groups_name).assertIsNotEnabled()
        label(R.string.action_cancel).performClick()
    }
    @Test fun occupiedGroupDeletionHasNoConfirmAction() {
        val group = RouterGroup(section = "g1", name = "Fixture occupied", deviceIds = listOf("17"))
        show { GroupsTab(client, config.copy(groups = listOf(group)), listOf(device()), false, {}, {}) }
        icon(R.string.action_delete).performClick()
        label(R.string.groups_delete_blocked).assertIsDisplayed()
        label(R.string.action_delete).assertDoesNotExist()
        label(R.string.action_cancel).performClick()
    }
    @Test fun schedulesCannotTargetOnlyAdministrator() {
        show { SchedulesTab(client, config, listOf(device(true)), false, {}, {}) }
        label(R.string.schedule_add).assertIsNotEnabled()
        label(R.string.schedule_empty).assertIsDisplayed()
    }
    @Test fun scheduleRejectsMissingNameWithoutCallingServer() {
        var saves = 0
        show { SchedulesTab(client, config.copy(groups = listOf(RouterGroup("g1", "Fixture family"))), emptyList(), false, { saves++ }, {}) }
        label(R.string.schedule_add).performClick()
        label(R.string.settings_save).performClick()
        label(R.string.validation_schedule_name_required).assertIsDisplayed()
        assertEquals(0, saves)
        label(R.string.action_cancel).performClick()
    }
    @Test fun duplicateScheduleIsUnsavedDraft() {
        val rule = RouterSchedule(section = "s1", name = "Fixture bedtime", targets = listOf("g1"))
        show { SchedulesTab(client, config.copy(schedules = listOf(rule)), emptyList(), false, {}, {}) }
        label(R.string.action_duplicate).performClick()
        compose.onNode(hasText(text(R.string.schedule_add)) and hasAnyAncestor(isDialog())).assertIsDisplayed()
        label(R.string.schedule_name).assertIsDisplayed()
        label(R.string.action_cancel).performClick()
        compose.onNodeWithText(rule.name).assertIsDisplayed()
    }
    @Test fun notificationDraftSurvivesRevisionUntilExplicitDiscard() {
        val current = mutableStateOf(config)
        var changes = 0
        show { NotificationsTab(client, current.value, emptyList(), false, { changes++ }, {}) }
        val list = compose.onNode(hasScrollToNodeAction())
        list.performScrollToNode(hasText(text(R.string.action_save)))
        label(R.string.action_save).assertIsNotEnabled()
        list.performScrollToNode(hasText(text(R.string.notifications_sim_all)))
        label(R.string.notifications_sim_all).performClick()
        list.performScrollToNode(hasText(text(R.string.action_save)))
        label(R.string.action_save).assertIsEnabled()
        assertEquals(0, changes)
        compose.runOnIdle { current.value = config.copy(revision = "next-fixture") }
        label(R.string.action_save).assertIsEnabled()
        list.performScrollToNode(hasText(text(R.string.draft_discard)))
        label(R.string.draft_discard).performClick()
        compose.onNode(hasText(text(R.string.draft_discard)) and hasAnyAncestor(isDialog())).performClick()
        label(R.string.action_save).assertIsNotEnabled()
    }
}
