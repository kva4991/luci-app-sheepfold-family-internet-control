package app.sheepfold.android.ui.main

/* Полная таблица категорий и неизвестный будущий тип. Без сети и изменения групп. §andpanel1 */
import app.sheepfold.android.router.RouterDevice
import org.junit.Assert.*
import org.junit.Test

class DeviceFilterRulesTest {
    @Test fun everyKnownTypeHasIntentionalCategory() {
        deviceTypeOptions.forEach {
            if (it.code in listOf("unknown", "smart")) assertEquals(DeviceFilter.UNKNOWN, deviceCategory(it.code))
            else assertNotEquals(it.code, DeviceFilter.UNKNOWN, deviceCategory(it.code))
        }
        assertEquals(DeviceFilter.UNKNOWN, deviceCategory("future-device"))
        val categories = mapOf(
            DeviceFilter.PERSONAL to setOf("phone", "tablet", "computer"),
            DeviceFilter.MEDIA to setOf("tv", "media_player", "console", "speaker"),
            DeviceFilter.TECHNICAL to setOf("printer", "server", "engineering", "network", "router", "network_switch"),
            DeviceFilter.SMART_HOME to setOf("vacuum", "smart_home", "camera"),
            DeviceFilter.WEARABLE to setOf("smart_watch"),
            DeviceFilter.UNKNOWN to setOf("unknown", "smart")
        )
        categories.forEach { (category, types) ->
            assertEquals(category.name, types,
                deviceTypeOptions.filter { deviceCategory(it.code) == category }.map { it.code }.toSet())
        }
    }
    @Test fun filteringDoesNotDependOnGroupOrGrantRights() {
        val device = RouterDevice("1", "Fixture", "192.0.2.1", "02:00:00:00:00:01", "Guests", "phone", false, "blocked", false)
        assertEquals(listOf(device), filterDevices(listOf(device), DeviceFilter.PERSONAL))
        assertTrue(filterDevices(listOf(device), DeviceFilter.SMART_HOME).isEmpty())
        assertEquals(listOf(device), filterDevices(listOf(device), DeviceFilter.ALL))
        assertEquals("blocked", device.status)
        val watch = device.copy(id = "2", deviceType = "smart_watch")
        val devices = listOf(device, watch)
        assertEquals(devices, filterDevices(devices, DeviceFilter.PERSONAL))
        assertEquals(listOf(watch), filterDevices(devices, DeviceFilter.WEARABLE))
        assertTrue(filterDevices(devices, DeviceFilter.TECHNICAL).isEmpty())
    }
}
