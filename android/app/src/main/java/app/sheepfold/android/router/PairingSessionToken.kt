package app.sheepfold.android.router

import java.util.Collections
import java.util.WeakHashMap

/** Секреты и идентичность привязаны к объекту результата настройки до сохранения. */
private data class PairingSessionData(
    var bearerToken: String? = null,
    var deviceId: String? = null
)

private val pairingSessions = Collections.synchronizedMap(
    WeakHashMap<RouterConnectionRequest, PairingSessionData>()
)

private fun session(request: RouterConnectionRequest): PairingSessionData =
    pairingSessions.getOrPut(request) { PairingSessionData() }

var RouterConnectionRequest.bearerToken: String?
    get() = pairingSessions[this]?.bearerToken
    set(value) {
        if (value.isNullOrBlank()) {
            pairingSessions[this]?.bearerToken = null
        } else {
            session(this).bearerToken = value
        }
    }

var RouterConnectionRequest.deviceId: String?
    get() = pairingSessions[this]?.deviceId
    set(value) {
        if (value.isNullOrBlank()) {
            pairingSessions[this]?.deviceId = null
        } else {
            session(this).deviceId = value
        }
    }
