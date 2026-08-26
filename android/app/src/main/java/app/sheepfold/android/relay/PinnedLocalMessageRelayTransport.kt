package app.sheepfold.android.relay

import app.sheepfold.android.router.RouterConnectionRequest
import app.sheepfold.android.router.RouterHttps
import app.sheepfold.android.router.bearerToken
import app.sheepfold.android.router.deviceId
import app.sheepfold.android.router.deviceMac
import app.sheepfold.android.router.tlsPinSha256
import app.sheepfold.android.router.tlsSpkiSha256
import java.io.ByteArrayOutputStream
import java.io.IOException
import java.net.ConnectException
import java.net.NoRouteToHostException
import java.net.SocketTimeoutException
import java.net.URL
import java.net.UnknownHostException
import java.util.concurrent.FutureTask
import java.util.concurrent.ExecutionException
import java.util.concurrent.TimeUnit
import java.util.concurrent.TimeoutException
import java.util.concurrent.atomic.AtomicReference
import javax.net.ssl.HttpsURLConnection

/** Local route keeps the existing IP-literal and pinned RouterHttps trust boundary. */
internal class PinnedLocalMessageRelayTransport(
    private val connection: RouterConnectionRequest,
    private val connectionFactory: LocalPinnedConnectionFactory = LocalPinnedConnectionFactory { url, request ->
        RouterHttps.open(
            url,
            tlsPinSha256 = request.tlsPinSha256,
            allowTrustOnFirstUse = false,
            tlsSpkiSha256 = request.tlsSpkiSha256
        ).first
    },
    private val probeBudgetMillis: Long = localProbeBudgetMillis
) : LocalMessageRelayTransport {
    private val localBearer = requireNotNull(connection.bearerToken?.takeIf(String::isNotBlank)) {
        "Local administrator Bearer is absent"
    }
    private val localDeviceId = requireNotNull(connection.deviceId?.takeIf(String::isNotBlank)) {
        "Local administrator deviceId is absent"
    }
    private val localDeviceMac = requireNotNull(connection.deviceMac?.takeIf(String::isNotBlank)) {
        "Local administrator device MAC is absent"
    }

    init {
        require(probeBudgetMillis in 1..localProbeBudgetMillis) { "Local relay probe budget is invalid" }
        require(!connection.tlsPinSha256.isNullOrBlank() || !connection.tlsSpkiSha256.isNullOrBlank()) {
            "Local router TLS pin is absent"
        }
    }

    override fun submit(envelopeJson: String): LocalRelayDelivery {
        val envelope = MessageRelayProtocol.parseEnvelope(envelopeJson.toByteArray(Charsets.UTF_8))
        require(envelope.direction == MessageRelayDirection.PHONE_TO_ROUTER &&
            envelope.messageClass == MessageRelayClass.COMMAND && envelope.canonicalJson() == envelopeJson) {
            "Local relay submit requires one canonical phoneToRouter command envelope"
        }
        val response = request(
            method = "POST",
            path = "/api/v1/message-relay/messages",
            body = envelopeJson.toByteArray(Charsets.UTF_8)
        )
        return when (response) {
            is LocalHttpResponse.FailedBeforeBody -> LocalRelayDelivery.Unreachable(response.cause)
            is LocalHttpResponse.FailedAfterBody -> LocalRelayDelivery.Indeterminate(response.cause)
            is LocalHttpResponse.Completed -> when (response.status) {
                200 -> try {
                    LocalRelayDelivery.Result(parseResultEnvelope(response.body))
                } catch (error: RuntimeException) {
                    // The POST body may already have executed; response parse failure cannot permit relay fallback.
                    LocalRelayDelivery.Indeterminate(error)
                }
                202 -> if (response.retryAfter == "1" && response.body.isEmpty()) {
                    LocalRelayDelivery.Pending
                } else {
                    LocalRelayDelivery.Indeterminate(
                        MessageRelayProtocolException(
                            "messageMalformed",
                            "local pending response is not exact"
                        )
                    )
                }
                else -> if (response.status in contractedDefinitePostStatuses) {
                    LocalRelayDelivery.DefiniteFailure(response.status)
                } else {
                    LocalRelayDelivery.Indeterminate(
                        IOException("Local relay returned an ambiguous HTTP ${response.status}")
                    )
                }
            }
        }
    }

    override fun lookupResult(requestMessageId: String): LocalRelayLookup {
        MessageRelayProtocol.requireIdentifier(requestMessageId, "requestMessageId")
        val response = request(
            method = "GET",
            path = "/api/v1/message-relay/results/$requestMessageId",
            body = null
        )
        return when (response) {
            is LocalHttpResponse.FailedBeforeBody -> LocalRelayLookup.Unreachable(response.cause)
            is LocalHttpResponse.FailedAfterBody -> LocalRelayLookup.Unreachable(response.cause)
            is LocalHttpResponse.Completed -> when (response.status) {
                200 -> LocalRelayLookup.Result(parseResultEnvelope(response.body))
                202 -> if (response.retryAfter == "1" && response.body.isEmpty()) {
                    LocalRelayLookup.Pending
                } else {
                    LocalRelayLookup.DefiniteFailure(202)
                }
                404 -> if (response.contentType == "application/json" &&
                    response.body.contentEquals(canonicalNotFoundResponse)
                ) {
                    LocalRelayLookup.NoRecord
                } else {
                    LocalRelayLookup.DefiniteFailure(404)
                }
                else -> LocalRelayLookup.DefiniteFailure(response.status)
            }
        }
    }

    private fun request(method: String, path: String, body: ByteArray?): LocalHttpResponse {
        if (body != null && body.size > MessageRelayProtocol.maximumEnvelopeBytes) {
            throw MessageRelayProtocolException("messageTooLarge", "local relay request exceeds the envelope limit")
        }
        val postPhase = AtomicReference(LocalPostPhase.PRE_BODY)
        val activeConnection = AtomicReference<HttpsURLConnection?>()
        val task = FutureTask {
            requestWithinDeadline(method, path, body, postPhase, activeConnection)
        }
        Thread(task, "sheepfold-local-relay-probe").apply {
            isDaemon = true
            start()
        }
        return try {
            task.get(probeBudgetMillis, TimeUnit.MILLISECONDS)
        } catch (_: InterruptedException) {
            val cancelledBeforeBody = postPhase.compareAndSet(
                LocalPostPhase.PRE_BODY,
                LocalPostPhase.CANCELLED
            )
            activeConnection.get()?.disconnect()
            task.cancel(true)
            Thread.currentThread().interrupt()
            val interrupted = IOException("Local relay probe was interrupted")
            if (cancelledBeforeBody) {
                LocalHttpResponse.FailedBeforeBody(interrupted)
            } else {
                LocalHttpResponse.FailedAfterBody(interrupted)
            }
        } catch (error: ExecutionException) {
            val cause = error.cause ?: error
            if (postPhase.get() == LocalPostPhase.MAY_HAVE_REACHED) {
                LocalHttpResponse.FailedAfterBody(cause)
            } else if (cause.isReachabilityFailure()) {
                LocalHttpResponse.FailedBeforeBody(cause)
            } else {
                LocalHttpResponse.Completed(0, ByteArray(0), null, null)
            }
        } catch (_: TimeoutException) {
            val cancelledBeforeBody = postPhase.compareAndSet(
                LocalPostPhase.PRE_BODY,
                LocalPostPhase.CANCELLED
            )
            activeConnection.get()?.disconnect()
            task.cancel(true)
            val timeout = SocketTimeoutException("Local relay probe exceeded its total budget")
            if (cancelledBeforeBody) {
                LocalHttpResponse.FailedBeforeBody(timeout)
            } else {
                LocalHttpResponse.FailedAfterBody(timeout)
            }
        }
    }

    private fun requestWithinDeadline(
        method: String,
        path: String,
        body: ByteArray?,
        postPhase: AtomicReference<LocalPostPhase>,
        activeConnection: AtomicReference<HttpsURLConnection?>
    ): LocalHttpResponse {
        val deadlineNanos = System.nanoTime() + TimeUnit.MILLISECONDS.toNanos(probeBudgetMillis)
        fun remainingMillis(): Int {
            val remaining = TimeUnit.NANOSECONDS.toMillis(deadlineNanos - System.nanoTime())
            if (remaining <= 0) throw SocketTimeoutException("Local relay probe deadline elapsed")
            return remaining.coerceAtMost(Int.MAX_VALUE.toLong()).toInt().coerceAtLeast(1)
        }
        val url = URL("${connection.apiUrl.trimEnd('/')}$path")
        val http = try {
            connectionFactory.open(url, connection)
        } catch (error: IOException) {
            return if (error.isReachabilityFailure()) {
                LocalHttpResponse.FailedBeforeBody(error)
            } else {
                LocalHttpResponse.Completed(0, ByteArray(0), null, null)
            }
        }
        activeConnection.set(http)
        try {
            http.connectTimeout = remainingMillis()
            http.readTimeout = remainingMillis()
            http.requestMethod = method
            http.instanceFollowRedirects = false
            http.setRequestProperty("Accept", "application/json")
            http.setRequestProperty("Authorization", "Bearer $localBearer")
            http.setRequestProperty("X-Sheepfold-Client", "android-admin-v1")
            http.setRequestProperty("X-Sheepfold-Device-Id", localDeviceId)
            http.setRequestProperty("X-Sheepfold-Device-Mac", localDeviceMac)
            if (body != null) {
                http.doOutput = true
                http.setFixedLengthStreamingMode(body.size)
                http.setRequestProperty("Content-Type", "application/json")
            }
            http.connect()
            http.readTimeout = remainingMillis()
            if (body != null) {
                val output = http.outputStream
                // CAS не позволяет timeout объявить pre-body fallback, а затем параллельно начать local write.
                if (!postPhase.compareAndSet(LocalPostPhase.PRE_BODY, LocalPostPhase.MAY_HAVE_REACHED)) {
                    output.close()
                    return LocalHttpResponse.FailedBeforeBody(
                        SocketTimeoutException("Local relay probe was cancelled before its body")
                    )
                }
                output.use { it.write(body) }
            }
            http.readTimeout = remainingMillis()
            val status = http.responseCode
            val responseBody = (if (status in 200..299) http.inputStream else http.errorStream)
                ?.readLocalBounded(PublicMessageRelayHttpsClient.maximumHttpBodyBytes)
                ?: ByteArray(0)
            return LocalHttpResponse.Completed(
                status,
                responseBody,
                http.getHeaderField("Retry-After"),
                http.getHeaderField("Content-Type")
            )
        } catch (error: IOException) {
            if (postPhase.get() == LocalPostPhase.MAY_HAVE_REACHED) {
                return LocalHttpResponse.FailedAfterBody(error)
            }
            if (!error.isReachabilityFailure()) {
                return LocalHttpResponse.Completed(0, ByteArray(0), null, null)
            }
            return LocalHttpResponse.FailedBeforeBody(error)
        } finally {
            activeConnection.compareAndSet(http, null)
            http.disconnect()
        }
    }

    private fun parseResultEnvelope(bytes: ByteArray): String {
        val envelope = MessageRelayProtocol.parseEnvelope(bytes)
        val canonical = envelope.canonicalJson()
        require(canonical.toByteArray(Charsets.UTF_8).contentEquals(bytes)) {
            "Local result response must be the exact canonical SFMR1 envelope"
        }
        return canonical
    }

    companion object {
        internal const val localProbeBudgetMillis = 2_500L
        private val contractedDefinitePostStatuses = setOf(0, 400, 401, 403, 404, 405, 409, 413, 422, 429)
        private val canonicalNotFoundResponse = "{\"error\":\"notFound\"}".toByteArray(Charsets.UTF_8)
    }
}

internal fun interface LocalPinnedConnectionFactory {
    fun open(url: URL, request: RouterConnectionRequest): HttpsURLConnection
}

private sealed interface LocalHttpResponse {
    data class Completed(
        val status: Int,
        val body: ByteArray,
        val retryAfter: String?,
        val contentType: String?
    ) : LocalHttpResponse
    data class FailedBeforeBody(val cause: Throwable) : LocalHttpResponse
    data class FailedAfterBody(val cause: Throwable) : LocalHttpResponse
}

private enum class LocalPostPhase {
    PRE_BODY,
    MAY_HAVE_REACHED,
    CANCELLED
}

private fun Throwable.isReachabilityFailure(): Boolean = generateSequence(this) { it.cause }.any {
    it is ConnectException || it is NoRouteToHostException || it is SocketTimeoutException ||
        it is UnknownHostException
}

private fun java.io.InputStream.readLocalBounded(maximum: Int): ByteArray {
    val output = ByteArrayOutputStream(minOf(maximum, 4096))
    val buffer = ByteArray(4096)
    while (true) {
        val count = read(buffer)
        if (count == -1) return output.toByteArray()
        if (output.size() + count > maximum) {
            throw MessageRelayProtocolException("messageTooLarge", "local relay response exceeds 20 KiB")
        }
        output.write(buffer, 0, count)
    }

}
