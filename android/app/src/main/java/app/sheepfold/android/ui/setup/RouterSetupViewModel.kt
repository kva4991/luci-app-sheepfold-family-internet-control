package app.sheepfold.android.ui.setup

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import app.sheepfold.android.router.RouterConnectionRequest
import app.sheepfold.android.router.SecureRouterConnectionManager
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.launch

/** Удерживает единственную попытку сопряжения при пересоздании Activity, без записи секретов в Bundle. */
class RouterSetupViewModel internal constructor(
    private val connectRouter: suspend (RouterConnectionRequest) -> RouterConnectionRequest
) : ViewModel() {
    constructor() : this(SecureRouterConnectionManager()::connect)

    var busy by mutableStateOf(false)
        private set
    var connected by mutableStateOf<RouterConnectionRequest?>(null)
        private set
    var errorMessage by mutableStateOf<String?>(null)
        private set
    var failed by mutableStateOf(false)
        private set

    fun connect(request: RouterConnectionRequest) {
        if (busy || connected != null) return
        busy = true
        dismissError()
        // QR одноразовый: пересоздание экрана не должно отменять POST или запускать его повторно
        viewModelScope.launch {
            try {
                connected = connectRouter(request)
            } catch (cancelled: CancellationException) {
                throw cancelled
            } catch (error: Exception) {
                errorMessage = error.message
                failed = true
            } finally {
                busy = false
            }
        }
    }

    fun dismissError() {
        errorMessage = null
        failed = false
    }

    fun discardResult() {
        check(!busy)
        connected = null
        dismissError()
    }

    override fun onCleared() {
        connected = null
        dismissError()
        super.onCleared()
    }
}
