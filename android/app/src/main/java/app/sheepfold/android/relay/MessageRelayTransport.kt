package app.sheepfold.android.relay

internal sealed interface LocalRelayDelivery {
    data object Pending : LocalRelayDelivery
    data class Result(val resultEnvelopeJson: String) : LocalRelayDelivery
    data class Unreachable(val cause: Throwable? = null) : LocalRelayDelivery
    data class Indeterminate(val cause: Throwable? = null) : LocalRelayDelivery
    data class DefiniteFailure(val httpStatus: Int? = null) : LocalRelayDelivery
}

internal sealed interface LocalRelayLookup {
    data object Pending : LocalRelayLookup
    data object NoRecord : LocalRelayLookup
    data class Result(val resultEnvelopeJson: String) : LocalRelayLookup
    data class Unreachable(val cause: Throwable? = null) : LocalRelayLookup
    data class DefiniteFailure(val httpStatus: Int? = null) : LocalRelayLookup
}

internal interface LocalMessageRelayTransport {
    fun submit(envelopeJson: String): LocalRelayDelivery
    fun lookupResult(requestMessageId: String): LocalRelayLookup
}

internal interface PublicMessageRelayTransport {
    fun enqueue(envelopeJson: String): RelayEnqueueReceipt
    fun poll(limit: Int, waitSeconds: Int): List<String>
    fun acknowledge(messageIds: List<String>)
}

internal data class RelayEnqueueReceipt(
    val messageId: String,
    val duplicate: Boolean
)

internal class MessageRelayHttpException(
    val httpStatus: Int,
    val errorCode: String?,
    val retryAfterSeconds: Int?
) : IllegalStateException("Relay HTTP request failed with status $httpStatus")
