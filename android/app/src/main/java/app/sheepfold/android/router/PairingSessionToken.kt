package app.sheepfold.android.router

import java.util.Collections
import java.util.WeakHashMap

/** Секреты и идентичность привязаны к объекту результата настройки до сохранения. */
private data class PairingSessionData(
    var bearerToken: String? = null,
    var deviceId: String? = null,
    var deviceMac: String? = null,
    var tlsPinSha256: String? = null,
    var tlsSpkiSha256: String? = null
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

var RouterConnectionRequest.deviceMac: String?
    get() = pairingSessions[this]?.deviceMac
    set(value) {
        if (value.isNullOrBlank()) {
            pairingSessions[this]?.deviceMac = null
        } else {
            session(this).deviceMac = value
        }
    }

var RouterConnectionRequest.tlsPinSha256: String?
    get() = pairingSessions[this]?.tlsPinSha256
    set(value) {
        if (value.isNullOrBlank()) {
            pairingSessions[this]?.tlsPinSha256 = null
        } else {
            session(this).tlsPinSha256 = value
        }
    }

/** SHA-256 от DER SubjectPublicKeyInfo, полученный из защищённого QR v2. */
var RouterConnectionRequest.tlsSpkiSha256: String?
    get() = pairingSessions[this]?.tlsSpkiSha256
    set(value) {
        if (value.isNullOrBlank()) {
            pairingSessions[this]?.tlsSpkiSha256 = null
        } else {
            session(this).tlsSpkiSha256 = value
        }
    }
