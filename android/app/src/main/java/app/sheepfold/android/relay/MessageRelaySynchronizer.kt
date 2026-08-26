package app.sheepfold.android.relay

import java.time.Instant

internal data class RelayPollResult(
    val disabled: Boolean,
    val records: List<RelayInboundRecord>
)

internal class MessageRelaySynchronizer(
    private val settings: MessageRelaySettings,
    private val secrets: MessageRelaySecrets,
    private val stateStore: MessageRelayStateStore,
    private val publicTransportFactory: PublicMessageRelayTransportFactory,
    private val clock: () -> Long = { Instant.now().epochSecond }
) {
    /** Foreground may wait at most 25 seconds; background callers pass zero for one short cycle. */
    fun pollOnce(limit: Int = 20, waitSeconds: Int): RelayPollResult {
        require(limit in 1..20) { "Relay poll limit must be 1..20" }
        require(waitSeconds in 0..25) { "Relay waitSeconds must be 0..25" }
        if (!settings.permitsPublicNetwork()) return RelayPollResult(disabled = true, records = emptyList())
        secrets.validated()
        stateStore.verifyInitialized()
        val transport = publicTransportFactory.create()
        stateStore.pendingServerAcknowledgements().chunked(20).forEach { messageIds ->
            transport.acknowledge(messageIds)
            stateStore.markServerAcknowledged(messageIds)
        }
        val records = transport.poll(limit, waitSeconds).map { envelopeJson ->
            stateStore.recordInbound(
                envelopeJson,
                secrets,
                clock().also { MessageRelayJson.requireSafeInteger(it, "now") },
                source = RelayInboundSource.PUBLIC_RELAY
            )
        }
        if (records.isNotEmpty()) {
            val messageIds = records.map { it.envelope.messageId }.distinct()
            transport.acknowledge(messageIds)
            stateStore.markServerAcknowledged(messageIds)
        }
        return RelayPollResult(disabled = false, records = records)
    }
}
