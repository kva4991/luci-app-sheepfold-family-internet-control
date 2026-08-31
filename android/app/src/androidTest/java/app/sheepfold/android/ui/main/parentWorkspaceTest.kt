package app.sheepfold.android.ui.main

/* Реальное пересоздание пустой Activity и повторное открытие формы.
 * Только вымышленные данные; не сбрасывает pairing и не пишет на роутер. §andlab1 */
import androidx.compose.runtime.mutableStateOf
import androidx.compose.ui.test.*
import androidx.lifecycle.ViewModelProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import app.sheepfold.android.R
import app.sheepfold.android.router.*
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class ParentWorkspaceTest : ParentUiFixture() {
    @Test fun activityRecreationKeepsWorkspaceAndDraft() {
        lateinit var previous: ParentWorkspace
        compose.runOnUiThread {
            previous = ViewModelProvider(compose.activity)[ParentWorkspace::class.java]
            previous.bind(RouterConnectionRequest("https://192.0.2.1", "Fixture"))
            previous.group = FormDraft(RouterGroup(name = "Original"), "revision-a").apply {
                value = value.copy(name = "Unsaved")
            }
            previous.deviceFilter = DeviceFilter.TECHNICAL
        }
        compose.activityRule.scenario.recreate()
        compose.runOnUiThread {
            val current = ViewModelProvider(compose.activity)[ParentWorkspace::class.java]
            assertSame(previous, current)
            assertEquals("Unsaved", current.group?.value?.name)
            assertEquals("revision-a", current.group?.revision)
            assertTrue(current.controlUnknown.value)
            assertEquals(DeviceFilter.TECHNICAL, current.deviceFilter)
        }
    }

    @Test fun routerChangeAndLogoutErasePrivateDrafts() {
        compose.runOnUiThread {
            val workspace = ParentWorkspace()
            workspace.bind(RouterConnectionRequest("https://192.0.2.1", "Fixture"))
            workspace.feedback.value = FeedbackDraft(message = "Synthetic private draft")
            workspace.group = FormDraft(RouterGroup(name = "Draft"), "r1")
            workspace.acceptSnapshot(RouterSnapshot("Fixture", emptyMap(), false, false), 42)
            assertFalse(workspace.controlUnknown.value)
            assertEquals(42L, workspace.receivedAt.value)
            workspace.bind(RouterConnectionRequest("https://192.0.2.2", "Other"))
            assertTrue(workspace.controlUnknown.value)
            assertNull(workspace.receivedAt.value)
            assertNull(workspace.group)
            assertEquals("", workspace.feedback.value.message)
            workspace.feedback.value = FeedbackDraft(message = "New synthetic draft")
            workspace.clear()
            assertEquals("", workspace.feedback.value.message)
            assertEquals(DeviceFilter.PERSONAL, workspace.deviceFilter)
        }
    }

    @Test fun leavingAndReopeningDeviceEditorKeepsTypedName() {
        val visible = mutableStateOf(true)
        val workspace = ParentWorkspace()
        workspace.device = FormDraft(device(), "r1")
        show {
            if (visible.value) {
                val form = requireNotNull(workspace.device)
                DeviceEditorDialog(form.original, emptyList(), false, null, {}, {}, form)
            }
        }
        label(R.string.device_name_label).performTextReplacement("Unsaved name")
        compose.runOnIdle { visible.value = false }
        compose.runOnIdle { visible.value = true }
        label(R.string.device_name_label).assertTextContains("Unsaved name")
        assertEquals("r1", workspace.device?.revision)
    }
}
