package app.sheepfold.android.ui.main

import app.sheepfold.android.router.RouterAdministrator
import app.sheepfold.android.router.RouterDevice

internal data class ParentDeviceGroups(
    val parent: RouterAdministrator?,
    val mine: List<RouterDevice>,
    val others: List<RouterDevice>
)

/** Владельца подтверждает запись текущего парного телефона, а не сохранённое имя из QR. */
internal fun groupParentDevices(
    administrators: List<RouterAdministrator>,
    devices: List<RouterDevice>,
    currentDeviceId: String
): ParentDeviceGroups {
    val parents = devices.filter { it.isAdministrator }
    val current = parents.singleOrNull { currentDeviceId.isNotBlank() && it.id == currentDeviceId }
    val login = current?.administratorLogin.orEmpty()
    val parent = administrators.singleOrNull { login.isNotBlank() && it.login == login }
    val (mine, others) = parents.partition {
        it === current || (parent != null && it.administratorLogin == parent.login)
    }
    val ordering = compareBy<RouterDevice> { it.id != currentDeviceId }.thenBy { it.name.lowercase() }.thenBy { it.id }
    return ParentDeviceGroups(parent, mine.sortedWith(ordering), others.sortedWith(ordering))
}
