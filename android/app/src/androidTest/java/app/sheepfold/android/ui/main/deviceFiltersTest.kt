package app.sheepfold.android.ui.main

/* Production-фильтры/карточка на вымышленных устройствах без API/роутера.
 * Проверяет умолчание, пересечение со списками, раскрытие деталей и разницу команд. §andlab1 */
import androidx.compose.ui.test.*
import androidx.test.ext.junit.runners.AndroidJUnit4
import app.sheepfold.android.R
import org.junit.Assert.assertEquals
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class DeviceFiltersTest : ParentUiFixture() {
    private val phone = device().copy(id = "1", name = "Fixture phone", deviceType = "phone", status = "blocked")
    private val router = phone.copy(id = "2", name = "Fixture router", deviceType = "router", mac = "02:00:00:00:00:02")
    private val smart = phone.copy(id = "3", name = "Fixture smart", deviceType = "smart_home", mac = "02:00:00:00:00:03")
    private val unknown = phone.copy(id = "4", name = "Fixture unknown", deviceType = "unknown", mac = "02:00:00:00:00:04")
    private val television = phone.copy(id = "6", name = "Fixture television", deviceType = "tv", mac = "02:00:00:00:00:06")
    private val inventory = listOf(phone, router, smart, unknown, television)

    private fun selectFilter(labelId: Int) {
        label(R.string.device_filter_show).performClick()
        compose.onNode(hasText(text(labelId)) and hasAnyAncestor(isPopup())).performClick()
    }

    @Test fun defaultPersonalThenAllAndUnknown() {
        val workspace = ParentWorkspace()
        show { DevicesTab(client, config, inventory, false, {}, {}, workspace) }
        compose.onNodeWithText(phone.name).assertIsDisplayed()
        compose.onNodeWithText(router.name).assertDoesNotExist()
        compose.onNodeWithText(television.name).assertDoesNotExist()
        selectFilter(R.string.device_filter_all)
        assertEquals(DeviceFilter.ALL, workspace.deviceFilter)
        compose.onNode(hasScrollToNodeAction()).performScrollToNode(hasText(smart.name))
        compose.onNodeWithText(smart.name).assertIsDisplayed()
        compose.onNode(hasScrollToNodeAction()).performScrollToNode(hasText(text(R.string.device_filter_show)))
        selectFilter(R.string.device_filter_unknown)
        compose.onNodeWithText(unknown.name).assertIsDisplayed()
        compose.onNodeWithText(phone.name).assertDoesNotExist()
    }

    @Test fun blocklistAndCategoryBothApply() {
        val allowed = router.copy(id = "5", name = "Allowed router", status = "allow", mac = "02:00:00:00:00:05")
        show { DeviceListsTab(client, config, inventory + allowed, false, {}, {}) }
        label(R.string.tab_blocklist).performClick()
        compose.onNodeWithText(phone.name).assertIsDisplayed()
        compose.onNodeWithText(router.name).assertDoesNotExist()
        selectFilter(R.string.device_filter_technical)
        compose.onNodeWithText(router.name).assertIsDisplayed()
        compose.onNodeWithText(phone.name).assertDoesNotExist()
        compose.onNodeWithText(allowed.name).assertDoesNotExist()
        label(R.string.tab_allowlist).performClick()
        compose.onNodeWithText(allowed.name).assertIsDisplayed()
        compose.onNodeWithText(router.name).assertDoesNotExist()
    }

    @Test fun mediaHomeAndWearablesHaveSeparateChoices() {
        val camera = phone.copy(id = "7", name = "Fixture camera", deviceType = "camera", mac = "02:00:00:00:00:07")
        val watch = phone.copy(id = "8", name = "Fixture watch", deviceType = "smart_watch", mac = "02:00:00:00:00:08")
        val devices = listOf(phone, television, camera, watch)
        show { DevicesTab(client, config, devices, false, {}, {}) }
        compose.onNodeWithText(phone.name).assertIsDisplayed()
        val list = compose.onNode(hasScrollToNodeAction())
        list.performScrollToNode(hasText(watch.name))
        compose.onNodeWithText(watch.name).assertIsDisplayed()
        list.performScrollToNode(hasText(text(R.string.device_filter_show)))
        listOf(
            R.string.device_filter_media to television,
            R.string.device_filter_smart_home to camera,
            R.string.device_filter_wearable to watch
        ).forEach { (filter, expected) ->
            selectFilter(filter)
            compose.onNodeWithText(expected.name).assertIsDisplayed()
            devices.filter { it != expected }.forEach { compose.onNodeWithText(it.name).assertDoesNotExist() }
        }
    }

    @Test fun detailsAreHiddenAndActionsStayDistinct() {
        val calls = mutableListOf<String>()
        val ordinary = phone.copy(status = "scheduled")
        show { DeviceCard(ordinary, {}, { calls += it }, true, true) }
        compose.onNodeWithText(text(R.string.device_mac_format, ordinary.mac)).assertDoesNotExist()
        label(R.string.device_more_details).performClick()
        compose.onNodeWithText(text(R.string.device_mac_format, ordinary.mac)).assertIsDisplayed()
        label(R.string.device_allow_30_minutes).performClick()
        assertEquals(listOf("temp"), calls)
        label(R.string.device_access_rules).performClick()
        label(R.string.device_add_blocklist).performClick()
        assertEquals(listOf("temp", "block"), calls)
    }
}
