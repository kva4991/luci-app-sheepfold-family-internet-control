package app.sheepfold.android.router

/*
 * Исполняет production JSON parser на Android org.json, не на JVM-заглушках SDK
 * Синтетические ответы не читают токены/сеть и не пишут настройки телефона/роутера
 * Не доказывает HTTP, аутентификацию или применение команд в UCI
 */
import androidx.test.ext.junit.runners.AndroidJUnit4
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertThrows
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class AdminConfigJsonTest {
    private fun parse(fields: String = "") = RouterAdminJson.parseConfig(
        JSONObject("""{"schemaVersion":1,"revision":"fixture"$fields}""")
    )
    @Test fun unsupportedSchemaAndMissingRevisionFail() {
        for (body in listOf("{}", """{"schemaVersion":2,"revision":"fixture"}""", """{"schemaVersion":1,"revision":" "}""")) {
            assertThrows(IllegalStateException::class.java) { RouterAdminJson.parseConfig(JSONObject(body)) }
        }
    }
    @Test fun absentWriteCapabilitiesStayDisabled() {
        val caps = parse().capabilities
        assertFalse(caps.scheduleWrite || caps.groupWrite || caps.deviceWrite || caps.wifiControl || caps.wifiAutomationWrite || caps.notificationWrite)
    }
    @Test fun explicitCapabilitiesPreserveCaseAndFalse() {
        val caps = parse(""", "capabilities":{"groupWrite":"1","wifiControl":"true","logRead":false,"logClear":0,"ScheduleWrite":true}""").capabilities
        assertTrue(caps.groupWrite && caps.wifiControl)
        assertFalse(caps.logRead || caps.logClear || caps.scheduleWrite)
    }
    @Test fun invalidNotificationModesDoNotEnableLocation() {
        assertEquals(RouterNotificationSettings(), parse(""", "notificationSettings":{"simChangeMode":"unknown","childWifiMode":"ALL"}""").notificationSettings)
        assertEquals(RouterNotificationSettings("off", "network_only"), parse(""", "notificationSettings":{"simChangeMode":"off","childWifiMode":"network_only"}""").notificationSettings)
    }
    @Test fun pendingRuntimeIsNotReportedAsApplied() {
        val mutation = parse(""", "mutation":{"kind":"save","runtimeApplied":false}""").mutation!!
        assertEquals("save", mutation.kind)
        assertFalse(mutation.runtimeApplied)
    }
    @Test fun scheduleFormatsAndInvalidRanges() {
        val config = parse(""", "schedules":[null,5,{"section":"s1","enabled":0,"targets":["g1"],"weekdays":["sun"],"timeRanges":["22:00-07:00",{"start":"08:00","end":"09:00"},"24:00-07:00","07:00-07:00",false]}]""")
        assertEquals(1, config.schedules.size)
        val rule = config.schedules.single()
        assertEquals("s1", rule.name)
        assertFalse(rule.enabled)
        assertEquals(listOf(RouterTimeRange("22:00", "07:00"), RouterTimeRange("08:00", "09:00")), rule.timeRanges)
    }
    @Test fun protectedGroupAndMembershipSurviveParsing() {
        val group = parse(""", "groups":[{"section":"g1","name":"Fixture","protected":true,"personal":1,"deviceIds":["4","9"],"scheduleIds":["s1"]}]""").groups.single()
        assertTrue(group.protectedGroup && group.personal)
        assertEquals(listOf("4", "9"), group.deviceIds)
        assertEquals(listOf("s1"), group.scheduleIds)
    }
    @Test fun wifiStateAndUnicodeArePreserved() {
        val config = parse(""", "wifiEnabled":true,"wifiRevision":"wifi1","wifiNetworks":[{"section":"w1","ssid":"Тестовая сеть","password":"synthetic-secret","enabled":false,"encryption":"sae"}]""")
        assertTrue(config.wifiEnabled)
        assertEquals("wifi1", config.wifiRevision)
        assertEquals("Тестовая сеть", config.wifiNetworks.single().ssid)
        assertFalse(config.wifiNetworks.single().enabled)
        assertEquals("auto", config.wifiNetworks.single().channel)
    }
    @Test fun administratorFallbackAndRequestPreference() {
        val admin = parse(""", "administrators":[{"section":"a1","id":"3","login":"fixture","allowChildAccessRequests":true}]""").administrators.single()
        assertEquals("fixture", admin.displayName)
        assertEquals("3", admin.id)
        assertTrue(admin.allowChildAccessRequests)
    }
}
