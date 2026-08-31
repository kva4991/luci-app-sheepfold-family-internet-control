package app.sheepfold.android.ui.main

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateMapOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import app.sheepfold.android.router.*
import kotlinx.coroutines.cancelChildren

/** Только RAM рабочего сеанса: без SavedStateHandle, файлов, QR и повторов команд. */
class ParentWorkspace : ViewModel() {
    val scope get() = viewModelScope
    private var session: Pair<String, String?>? = null
    val devices = mutableStateOf<List<RouterDevice>>(emptyList())
    val config = mutableStateOf(RouterAdminConfig())
    val notifications = mutableStateOf<List<RouterAdminNotification>>(emptyList())
    val snapshot = mutableStateOf<RouterSnapshot?>(null)
    val logs = mutableStateOf<List<String>>(emptyList())
    val refreshes = mutableStateMapOf<String, Int>()
    internal var deviceFilter by mutableStateOf(DeviceFilter.PERSONAL)
    internal var listFilter by mutableStateOf(DeviceFilter.PERSONAL)
    val controlBusy = mutableStateOf(false)
    val controlMessage = mutableStateOf<String?>(null)
    val controlUnknown = mutableStateOf(true)
    val receivedAt = mutableStateOf<Long?>(null)
    val groupTask = PanelTask()
    val scheduleTask = PanelTask()
    val deviceTask = PanelTask()
    val wifiTask = PanelTask()
    val noticeTask = PanelTask()
    var group by mutableStateOf<FormDraft<RouterGroup>?>(null)
    var schedule by mutableStateOf<FormDraft<RouterSchedule>?>(null)
    var device by mutableStateOf<FormDraft<RouterDevice>?>(null)
    val wifi = mutableStateMapOf<String, FormDraft<RouterWifiNetwork>>()
    var automation by mutableStateOf<FormDraft<RouterWifiAutomation>?>(null)
    var notices by mutableStateOf<FormDraft<RouterNotificationSettings>?>(null)
    var feedback by mutableStateOf(FormDraft(FeedbackDraft(), ""))

    fun bind(connection: RouterConnectionRequest) {
        val next = connection.apiUrl to connection.bearerToken
        if (session != next) {
            clear()
            session = next
        }
    }

    fun refresh(panel: String) { refreshes[panel] = (refreshes[panel] ?: 0) + 1 }

    fun acceptSnapshot(value: RouterSnapshot, now: Long = System.currentTimeMillis()) {
        snapshot.value = value
        receivedAt.value = now
        controlUnknown.value = false
    }

    fun clear() {
        scope.coroutineContext.cancelChildren()
        session = null
        devices.value = emptyList()
        config.value = RouterAdminConfig()
        notifications.value = emptyList()
        snapshot.value = null
        logs.value = emptyList()
        refreshes.clear()
        deviceFilter = DeviceFilter.PERSONAL
        listFilter = DeviceFilter.PERSONAL
        controlBusy.value = false
        controlMessage.value = null
        controlUnknown.value = true
        receivedAt.value = null
        listOf(groupTask, scheduleTask, deviceTask, wifiTask, noticeTask).forEach { it.clear() }
        group = null
        schedule = null
        device = null
        wifi.clear()
        automation = null
        notices = null
        feedback = FormDraft(FeedbackDraft(), "")
    }
}

class PanelTask {
    val busy = mutableStateOf(false)
    val message = mutableStateOf<String?>(null)
    val isError = mutableStateOf(false)
    fun clear() { busy.value = false; message.value = null; isError.value = false }
}

data class FeedbackDraft(
    val category: String = "idea",
    val subject: String = "",
    val message: String = "",
    val expected: String = "",
    val steps: String = "",
    val contact: String = "",
    val diagnostics: Boolean = false
)
