package app.sheepfold.android.ui.main

// Чистые правила принадлежности: одинаковые имена, старый API и обычные устройства без сети.
import app.sheepfold.android.router.RouterAdministrator
import app.sheepfold.android.router.RouterDevice
import org.junit.Assert.*
import org.junit.Test

class ParentDeviceGroupsTest {
    private val parent = RouterAdministrator("a", "1", "Same name", "parent", false)
    private val other = parent.copy(section = "b", id = "2", login = "other")
    private fun device(id: String, login: String) = RouterDevice(id, "Phone $id", "", "", "", "phone", false, "allow", true, login)

    @Test fun currentPhoneAndSameOwnerComeFirst() {
        val result = groupParentDevices(listOf(parent, other),
            listOf(device("3", "other"), device("2", "parent"), device("1", "parent")), "1")
        assertEquals(parent, result.parent)
        assertEquals(listOf("1", "2"), result.mine.map { it.id })
        assertEquals(listOf("3"), result.others.map { it.id })
    }

    @Test fun oldRouterOnlyIdentifiesCurrentDeviceWithoutGuessingOwner() {
        val result = groupParentDevices(listOf(parent), listOf(device("1", ""), device("2", "")), "1")
        assertNull(result.parent)
        assertEquals(listOf("1"), result.mine.map { it.id })
        assertEquals(listOf("2"), result.others.map { it.id })
    }

    @Test fun absentCurrentDeviceDoesNotGuessUsingAccountName() {
        val result = groupParentDevices(listOf(parent), listOf(device("1", "parent")), "")
        assertNull(result.parent)
        assertTrue(result.mine.isEmpty())
        assertEquals(1, result.others.size)
    }

    @Test fun ordinaryDevicesAndAmbiguousLoginsDoNotBecomeMine() {
        val result = groupParentDevices(listOf(parent, parent.copy(section = "duplicate")),
            listOf(device("1", "parent"), device("2", "parent"), device("3", "parent").copy(isAdministrator = false)), "1")
        assertNull(result.parent)
        assertEquals(listOf("1"), result.mine.map { it.id })
        assertEquals(listOf("2"), result.others.map { it.id })
    }

    @Test fun loginComparisonIsExactAndOrphansRemainVisible() {
        val result = groupParentDevices(listOf(parent), listOf(device("1", "parent"), device("2", "Parent"), device("3", "gone")), "1")
        assertEquals(2, result.others.size)
        assertEquals(1, result.mine.size)
    }
}
