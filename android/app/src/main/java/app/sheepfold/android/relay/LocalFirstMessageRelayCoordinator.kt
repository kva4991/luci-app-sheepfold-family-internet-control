package app.sheepfold.android.relay

import java.io.IOException

internal fun interface PublicMessageRelayTransportFactory {
    fun create(): PublicMessageRelayTransport
}

internal sealed interface RelayCommandRouteResult {
    val messageId: String

    data class Completed(
        override val messageId: String,
        val result: RelayInboundRecord
    ) : RelayCommandRouteResult

    data class AwaitingLocal(override val messageId: String) : RelayCommandRouteResult
    data class AcceptedByRelay(override val messageId: String, val duplicate: Boolean) : RelayCommandRouteResult
    data class AwaitingRelayResult(override val messageId: String) : RelayCommandRouteResult
    data class RelayUnavailable(override val messageId: String) : RelayCommandRouteResult
    data class RetryableRelayFailure(
        override val messageId: String,
        val retryAfterSeconds: Int? = null
    ) : RelayCommandRouteResult
    data class Indeterminate(override val messageId: String) : RelayCommandRouteResult
    data class DefiniteFailure(override val messageId: String, val httpStatus: Int? = null) : RelayCommandRouteResult
}

/**
 * Creates one durable command envelope, tries the pinned local route first, and only then uses
 * public relay for a proven pre-body reachability failure. An ambiguous local POST is reconciled by
 * GET with the same messageId; it is never repeated through either route blindly.
 */
internal class LocalFirstMessageRelayCoordinator(
    private val settings: MessageRelaySettings,
    private val secrets: MessageRelaySecrets,
    private val stateStore: MessageRelayStateStore,
    private val localTransport: LocalMessageRelayTransport?,
    private val publicTransportFactory: PublicMessageRelayTransportFactory?
) {
    init {
        secrets.validated()
        stateStore.verifyInitialized()
    }

    fun submit(
        payload: MessageRelayPayload,
        localNetworkAvailable: Boolean,
        now: Long
    ): RelayCommandRouteResult = synchronized(submissionLock) {
        MessageRelayJson.requireSafeInteger(now, "now")
        require(payload.messageType == MessageRelayClass.COMMAND) { "Only command payloads can be submitted" }
        val outboundKey = secrets.outboundKeyRecord()
        val sequence = stateStore.reserveOutboundSequence(outboundKey)
        val metadata = MessageRelayMetadata(
            direction = MessageRelayDirection.PHONE_TO_ROUTER,
            messageClass = MessageRelayClass.COMMAND,
            routerId = secrets.routerId,
            phoneId = secrets.phoneId,
            streamId = secrets.streamId,
            messageId = MessageRelayProtocol.randomIdentifier(),
            sequence = sequence,
            issuedAt = now,
            expiresAt = now + MessageRelayProtocol.commandTtlSeconds,
            keyId = secrets.phoneToRouterKeyId
        )
        val envelopeJson = MessageRelayProtocol.encrypt(metadata, payload, outboundKey).canonicalJson()
        val entry = stateStore.enqueueOutbound(envelopeJson, outboundKey)
        routeNewEntry(entry, localNetworkAvailable, now)
    }

    fun retryRelay(messageId: String, now: Long): RelayCommandRouteResult = synchronized(submissionLock) {
        MessageRelayProtocol.requireIdentifier(messageId, "messageId")
        MessageRelayJson.requireSafeInteger(now, "now")
        val entry = stateStore.outboxEntry(messageId)
            ?: throw IllegalArgumentException("Unknown relay outbox messageId")
        when (entry.status) {
            RelayOutboxStatus.LOCAL_ATTEMPT,
            RelayOutboxStatus.INDETERMINATE -> return RelayCommandRouteResult.Indeterminate(messageId)
            RelayOutboxStatus.LOCAL_PENDING -> return RelayCommandRouteResult.AwaitingLocal(messageId)
            RelayOutboxStatus.RELAY_ACCEPTED -> return RelayCommandRouteResult.AwaitingRelayResult(messageId)
            RelayOutboxStatus.DEFINITE_FAILURE -> return RelayCommandRouteResult.DefiniteFailure(messageId)
            RelayOutboxStatus.READY,
            RelayOutboxStatus.RELAY_RETRYABLE -> Unit
        }
        if (entry.expiresAt <= now) {
            return if (entry.status == RelayOutboxStatus.RELAY_RETRYABLE) {
                stateStore.updateOutboundStatus(messageId, RelayOutboxStatus.INDETERMINATE)
                RelayCommandRouteResult.Indeterminate(messageId)
            } else {
                stateStore.updateOutboundStatus(messageId, RelayOutboxStatus.DEFINITE_FAILURE)
                RelayCommandRouteResult.DefiniteFailure(messageId)
            }
        }
        routeThroughPublic(entry)
    }

    fun reconcileLocal(messageId: String, now: Long): RelayCommandRouteResult =
        synchronized(submissionLock) {
            MessageRelayProtocol.requireIdentifier(messageId, "messageId")
            MessageRelayJson.requireSafeInteger(now, "now")
            val entry = stateStore.outboxEntry(messageId)
                ?: throw IllegalArgumentException("Unknown relay outbox messageId")
            if (entry.status !in setOf(
                RelayOutboxStatus.LOCAL_ATTEMPT,
                RelayOutboxStatus.LOCAL_PENDING
            )) {
                return RelayCommandRouteResult.RelayUnavailable(messageId)
            }
            val local = localTransport ?: return RelayCommandRouteResult.RelayUnavailable(messageId)
            when (val lookup = local.lookupResult(messageId)) {
                is LocalRelayLookup.Result -> completeFromResult(entry, lookup.resultEnvelopeJson, now)
                LocalRelayLookup.Pending -> RelayCommandRouteResult.AwaitingLocal(messageId)
                LocalRelayLookup.NoRecord -> if (entry.expiresAt > now) {
                    stateStore.updateOutboundStatus(messageId, RelayOutboxStatus.READY)
                    routeThroughPublic(entry.copy(status = RelayOutboxStatus.READY))
                } else {
                    stateStore.updateOutboundStatus(messageId, RelayOutboxStatus.INDETERMINATE)
                    RelayCommandRouteResult.Indeterminate(messageId)
                }
                is LocalRelayLookup.Unreachable -> RelayCommandRouteResult.RelayUnavailable(messageId)
                is LocalRelayLookup.DefiniteFailure -> {
                    stateStore.updateOutboundStatus(messageId, RelayOutboxStatus.DEFINITE_FAILURE)
                    RelayCommandRouteResult.DefiniteFailure(messageId, lookup.httpStatus)
                }
            }
        }

    private fun routeNewEntry(
        entry: RelayOutboxEntry,
        localNetworkAvailable: Boolean,
        now: Long
    ): RelayCommandRouteResult {
        if (localNetworkAvailable && localTransport != null) {
            val attempting = stateStore.beginLocalAttempt(entry.messageId)
            return when (val local = localTransport.submit(attempting.envelopeJson)) {
                is LocalRelayDelivery.Result -> completeFromResult(attempting, local.resultEnvelopeJson, now)
                LocalRelayDelivery.Pending -> {
                    stateStore.updateOutboundStatus(attempting.messageId, RelayOutboxStatus.LOCAL_PENDING)
                    RelayCommandRouteResult.AwaitingLocal(attempting.messageId)
                }
                is LocalRelayDelivery.Unreachable -> {
                    val ready = stateStore.updateOutboundStatus(attempting.messageId, RelayOutboxStatus.READY)
                    routeThroughPublic(ready)
                }
                is LocalRelayDelivery.Indeterminate -> {
                    // LOCAL_ATTEMPT remains the durable proof that only same-messageId GET is safe.
                    RelayCommandRouteResult.Indeterminate(attempting.messageId)
                }
                is LocalRelayDelivery.DefiniteFailure -> {
                    stateStore.updateOutboundStatus(attempting.messageId, RelayOutboxStatus.DEFINITE_FAILURE)
                    RelayCommandRouteResult.DefiniteFailure(attempting.messageId, local.httpStatus)
                }
            }
        }
        return routeThroughPublic(entry)
    }

    private fun routeThroughPublic(entry: RelayOutboxEntry): RelayCommandRouteResult {
        if (!settings.permitsPublicNetwork() || publicTransportFactory == null) {
            return RelayCommandRouteResult.RelayUnavailable(entry.messageId)
        }
        return try {
            val receipt = publicTransportFactory.create().enqueue(entry.envelopeJson)
            stateStore.updateOutboundStatus(entry.messageId, RelayOutboxStatus.RELAY_ACCEPTED)
            RelayCommandRouteResult.AcceptedByRelay(receipt.messageId, receipt.duplicate)
        } catch (error: MessageRelayHttpException) {
            if (error.httpStatus == 409 && error.errorCode == "messageConflict") {
                // A prior ambiguous enqueue may already have been consumed and removed from the server mailbox.
                stateStore.updateOutboundStatus(entry.messageId, RelayOutboxStatus.INDETERMINATE)
                RelayCommandRouteResult.Indeterminate(entry.messageId)
            } else if (error.httpStatus == 408 || error.httpStatus == 429 || error.httpStatus >= 500) {
                stateStore.updateOutboundStatus(entry.messageId, RelayOutboxStatus.RELAY_RETRYABLE)
                RelayCommandRouteResult.RetryableRelayFailure(entry.messageId, error.retryAfterSeconds)
            } else {
                stateStore.updateOutboundStatus(entry.messageId, RelayOutboxStatus.DEFINITE_FAILURE)
                RelayCommandRouteResult.DefiniteFailure(entry.messageId, error.httpStatus)
            }
        } catch (_: IOException) {
            // Relay enqueue is idempotent only with these exact persisted bytes, so this entry stays retryable.
            stateStore.updateOutboundStatus(entry.messageId, RelayOutboxStatus.RELAY_RETRYABLE)
            RelayCommandRouteResult.RetryableRelayFailure(entry.messageId)
        } catch (_: MessageRelayProtocolException) {
            stateStore.updateOutboundStatus(entry.messageId, RelayOutboxStatus.RELAY_RETRYABLE)
            RelayCommandRouteResult.RetryableRelayFailure(entry.messageId)
        }
    }

    private fun completeFromResult(
        entry: RelayOutboxEntry,
        resultEnvelopeJson: String,
        now: Long
    ): RelayCommandRouteResult.Completed {
        val record = stateStore.recordInbound(
            envelopeJson = resultEnvelopeJson,
            secrets = secrets,
            now = now,
            source = RelayInboundSource.LOCAL_ROUTER,
            expectedRequestMessageId = entry.messageId
        )
        return RelayCommandRouteResult.Completed(entry.messageId, record)
    }

    companion object {
        private val submissionLock = Any()
    }
}
