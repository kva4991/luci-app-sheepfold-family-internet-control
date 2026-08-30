package app.sheepfold.android.relay

import android.content.Context
import java.io.ByteArrayInputStream
import java.io.ByteArrayOutputStream
import java.io.DataInputStream
import java.io.DataOutputStream
import java.security.MessageDigest
import java.util.Base64

internal fun interface MessageRelayStatePersistence {
    fun write(bytes: ByteArray)
}

internal fun interface MessageRelayStateReader {
    fun read(): ByteArray?
}

internal interface MessageRelayStateStorage : MessageRelayStatePersistence, MessageRelayStateReader

internal enum class RelayOutboxStatus {
    READY,
    RELAY_RETRYABLE,
    LOCAL_PENDING,
    RELAY_ACCEPTED,
    INDETERMINATE,
    DEFINITE_FAILURE,
    /** Persisted before local I/O; after restart only same-messageId result lookup is safe. */
    LOCAL_ATTEMPT
}

internal data class RelayOutboxEntry(
    val messageId: String,
    val envelopeJson: String,
    val sequence: Long,
    val expiresAt: Long,
    val status: RelayOutboxStatus
)

internal data class RelayInboxEntry(
    val messageId: String,
    val envelopeJson: String,
    val sequence: Long,
    val expiresAt: Long,
    val validatedAt: Long,
    val serverAcknowledged: Boolean
)

internal enum class RelayInboundSource {
    LOCAL_ROUTER,
    PUBLIC_RELAY
}

internal enum class RelayInboundRecordResult {
    STORED,
    EXACT_DUPLICATE
}

internal data class RelayInboundRecord(
    val result: RelayInboundRecordResult,
    val envelope: MessageRelayEnvelope,
    val payload: MessageRelayPayload
)

/**
 * Durable state deliberately contains ciphertext envelopes only. Sequence reservation is flushed
 * before encryption so a crash can leave a harmless gap, but can never reuse an AES-GCM IV.
 */
internal class MessageRelayStateStore(
    private val storage: MessageRelayStateStorage,
    private val stateGeneration: String
) {
    init {
        MessageRelayProtocol.requireIdentifier(stateGeneration, "stateGeneration")
    }

    fun verifyInitialized() = synchronized(globalLock) {
        readState()
        Unit
    }

    fun reserveOutboundSequence(keyRecord: MessageRelayKeyRecord): Long = synchronized(globalLock) {
        require(keyRecord.direction == MessageRelayDirection.PHONE_TO_ROUTER) {
            "Only phoneToRouter sequences can be reserved by the parent app"
        }
        val state = readState()
        val binding = keyRecord.binding()
        val previous = state.highWater[binding] ?: 0L
        if (previous >= maximumSafeInteger) {
            throw MessageRelayProtocolException("sequenceExhausted", "relay sequence is exhausted")
        }
        val reserved = previous + 1L
        state.highWater[binding] = reserved
        persist(state)
        reserved
    }

    fun enqueueOutbound(
        envelopeJson: String,
        keyRecord: MessageRelayKeyRecord
    ): RelayOutboxEntry = synchronized(globalLock) {
        val bytes = envelopeJson.toByteArray(Charsets.UTF_8)
        val envelope = MessageRelayProtocol.parseEnvelope(bytes)
        require(envelope.direction == MessageRelayDirection.PHONE_TO_ROUTER &&
            envelope.messageClass == MessageRelayClass.COMMAND) {
            "Outbox accepts phoneToRouter commands only"
        }
        require(keyRecord.binding() == envelope.binding()) { "Outbound key binding does not match the envelope" }
        require(envelope.canonicalJson() == envelopeJson) { "Outbox requires canonical envelope bytes" }
        val state = readState()
        pruneOutbox(state, envelope.issuedAt)
        if ((state.highWater[keyRecord.binding()] ?: 0L) < envelope.sequence) {
            throw IllegalStateException("Outbound sequence was not durably reserved")
        }
        state.outbox[envelope.messageId]?.let { existing ->
            if (existing.envelopeJson == envelopeJson) return existing
            throw MessageRelayProtocolException("messageConflict", "outbox messageId already has other bytes")
        }
        if (state.outbox.size >= maximumMailboxItems ||
            state.outbox.values.sumOf { it.envelopeJson.byteSize() } + bytes.size > maximumMailboxBytes
        ) {
            throw MessageRelayProtocolException("mailboxFull", "durable relay outbox is full")
        }
        val entry = RelayOutboxEntry(
            messageId = envelope.messageId,
            envelopeJson = envelopeJson,
            sequence = envelope.sequence,
            expiresAt = envelope.expiresAt,
            status = RelayOutboxStatus.READY
        )
        state.outbox[entry.messageId] = entry
        persist(state)
        entry
    }

    fun beginLocalAttempt(messageId: String): RelayOutboxEntry = synchronized(globalLock) {
        val state = readState()
        val current = state.outbox[messageId]
            ?: throw IllegalArgumentException("Unknown relay outbox messageId")
        require(current.status == RelayOutboxStatus.READY) {
            "Local attempt can only start from READY status"
        }
        val updated = current.copy(status = RelayOutboxStatus.LOCAL_ATTEMPT)
        state.outbox[messageId] = updated
        persist(state)
        updated
    }

    fun updateOutboundStatus(messageId: String, status: RelayOutboxStatus): RelayOutboxEntry =
        synchronized(globalLock) {
            val state = readState()
            val current = state.outbox[messageId]
                ?: throw IllegalArgumentException("Unknown relay outbox messageId")
            validateStatusTransition(current.status, status)
            val updated = current.copy(status = status)
            state.outbox[messageId] = updated
            persist(state)
            updated
        }

    fun outboxEntry(messageId: String): RelayOutboxEntry? = synchronized(globalLock) {
        readState().outbox[messageId]
    }

    fun pendingOutbox(now: Long): List<RelayOutboxEntry> = synchronized(globalLock) {
        MessageRelayJson.requireSafeInteger(now, "now")
        readState().outbox.values.filter { entry ->
            entry.expiresAt > now && entry.status in setOf(
                RelayOutboxStatus.READY,
                RelayOutboxStatus.RELAY_RETRYABLE
            )
        }
    }

    fun pruneOutbox(now: Long): List<String> = synchronized(globalLock) {
        MessageRelayJson.requireSafeInteger(now, "now")
        val state = readState()
        val removed = pruneOutbox(state, now)
        if (removed.isNotEmpty()) persist(state)
        removed
    }

    fun recordInbound(
        envelopeJson: String,
        secrets: MessageRelaySecrets,
        now: Long,
        source: RelayInboundSource,
        expectedRequestMessageId: String? = null
    ): RelayInboundRecord = synchronized(globalLock) {
        require(secrets.stateGeneration == stateGeneration) {
            "Relay secrets do not match the durable state generation"
        }
        val bytes = envelopeJson.toByteArray(Charsets.UTF_8)
        val envelope = MessageRelayProtocol.parseEnvelope(bytes, now)
        if (envelope.direction != MessageRelayDirection.ROUTER_TO_PHONE ||
            envelope.messageClass == MessageRelayClass.COMMAND ||
            envelope.routerId != secrets.routerId || envelope.phoneId != secrets.phoneId ||
            envelope.streamId != secrets.streamId || envelope.keyId != secrets.routerToPhoneKeyId
        ) {
            throw MessageRelayProtocolException("identityMismatch", "inbound envelope identity is not provisioned")
        }
        require(envelope.canonicalJson() == envelopeJson) { "Inbox requires canonical envelope bytes" }
        // Tag and payload validation happen before reading or mutating replay state.
        val payload = MessageRelayProtocol.decrypt(envelope, secrets.inboundKeyRecord(), now)
        val completedRequestMessageId = if (payload.messageType == MessageRelayClass.COMMAND_RESULT) {
            payload.requestMessageId
        } else {
            null
        }
        if (expectedRequestMessageId != null && completedRequestMessageId != expectedRequestMessageId) {
            throw MessageRelayProtocolException(
                "messageConflict",
                "authenticated result does not match the requested command"
            )
        }
        val keyRecord = secrets.inboundKeyRecord()
        val binding = keyRecord.binding()
        require(binding == envelope.binding()) { "Inbound key binding does not match the envelope" }
        val digest = sha256Base64Url(bytes)
        val state = readState()
        state.dedup[envelope.messageId]?.let { existing ->
            if (existing.sequence == envelope.sequence && existing.digest == digest) {
                return RelayInboundRecord(RelayInboundRecordResult.EXACT_DUPLICATE, envelope, payload)
            }
            throw MessageRelayProtocolException("messageConflict", "inbound messageId already has other bytes")
        }
        if (completedRequestMessageId != null) {
            val outbound = state.outbox[completedRequestMessageId]
                ?: throw MessageRelayProtocolException("messageConflict", "result references an unknown command")
            val commandEnvelope = MessageRelayProtocol.parseEnvelope(
                outbound.envelopeJson.toByteArray(Charsets.UTF_8)
            )
            val command = MessageRelayProtocol.decrypt(
                commandEnvelope,
                secrets.outboundKeyRecord(),
                commandEnvelope.issuedAt
            )
            if (command.action != payload.action || command.actionHash != payload.actionHash) {
                throw MessageRelayProtocolException(
                    "messageConflict",
                    "authenticated result does not match the original command"
                )
            }
        }
        val highWater = state.highWater[binding] ?: 0L
        if (envelope.sequence <= highWater) {
            throw MessageRelayProtocolException("messageConflict", "inbound sequence was already consumed")
        }
        if (state.inbox.size >= maximumMailboxItems ||
            state.inbox.values.sumOf { it.envelopeJson.byteSize() } + bytes.size > maximumMailboxBytes
        ) {
            throw MessageRelayProtocolException("mailboxFull", "durable relay inbox is full")
        }
        state.highWater[binding] = envelope.sequence
        state.dedup[envelope.messageId] = RelayDedupEntry(envelope.sequence, digest)
        while (state.dedup.size > maximumDedupItems) {
            state.dedup.remove(state.dedup.keys.first())
        }
        state.inbox[envelope.messageId] = RelayInboxEntry(
            messageId = envelope.messageId,
            envelopeJson = envelopeJson,
            sequence = envelope.sequence,
            expiresAt = envelope.expiresAt,
            validatedAt = now,
            serverAcknowledged = source == RelayInboundSource.LOCAL_ROUTER
        )
        completedRequestMessageId?.let { state.outbox.remove(it) }
        persist(state)
        RelayInboundRecord(RelayInboundRecordResult.STORED, envelope, payload)
    }

    fun pendingInbox(): List<RelayInboxEntry> = synchronized(globalLock) {
        readState().inbox.values.toList()
    }

    fun pendingServerAcknowledgements(): List<String> = synchronized(globalLock) {
        readState().inbox.values.filterNot { it.serverAcknowledged }.map { it.messageId }
    }

    fun pendingInboundRecords(secrets: MessageRelaySecrets): List<RelayInboundRecord> =
        synchronized(globalLock) {
            require(secrets.stateGeneration == stateGeneration) {
                "Relay secrets do not match the durable state generation"
            }
            readState().inbox.values.map { entry ->
                val envelope = MessageRelayProtocol.parseEnvelope(
                    entry.envelopeJson.toByteArray(Charsets.UTF_8)
                )
                RelayInboundRecord(
                    RelayInboundRecordResult.EXACT_DUPLICATE,
                    envelope,
                    MessageRelayProtocol.decrypt(envelope, secrets.inboundKeyRecord(), entry.validatedAt)
                )
            }
        }

    fun markServerAcknowledged(messageIds: Collection<String>) = synchronized(globalLock) {
        require(messageIds.size in 1..20) { "Relay acknowledgement must contain 1..20 message IDs" }
        messageIds.forEach { MessageRelayProtocol.requireIdentifier(it, "ack messageId") }
        val state = readState()
        messageIds.forEach { messageId ->
            state.inbox[messageId]?.let { state.inbox[messageId] = it.copy(serverAcknowledged = true) }
        }
        persist(state)
    }

    /** Removes durable ciphertext only after an app consumer has handled it; dedup tombstones remain. */
    fun consumeInbox(messageIds: Collection<String>) = synchronized(globalLock) {
        require(messageIds.size in 1..20) { "Relay consume batch must contain 1..20 message IDs" }
        messageIds.forEach { MessageRelayProtocol.requireIdentifier(it, "consumed messageId") }
        val state = readState()
        val unacknowledged = messageIds.filter { state.inbox[it]?.serverAcknowledged != true }
        require(unacknowledged.isEmpty()) {
            "Relay inbox cannot be consumed before its durable server acknowledgement"
        }
        messageIds.forEach(state.inbox::remove)
        persist(state)
    }

    private fun validateStatusTransition(current: RelayOutboxStatus, next: RelayOutboxStatus) {
        // Accepted or ambiguous relay states are evidence we already left the local retry path.
        // They may only move toward acknowledged/terminal outcomes, never back into local submission.
        val allowed = when (current) {
            RelayOutboxStatus.READY -> setOf(
                RelayOutboxStatus.READY,
                RelayOutboxStatus.LOCAL_ATTEMPT,
                RelayOutboxStatus.LOCAL_PENDING,
                RelayOutboxStatus.RELAY_RETRYABLE,
                RelayOutboxStatus.RELAY_ACCEPTED,
                RelayOutboxStatus.INDETERMINATE,
                RelayOutboxStatus.DEFINITE_FAILURE
            )
            RelayOutboxStatus.LOCAL_ATTEMPT -> setOf(
                RelayOutboxStatus.LOCAL_ATTEMPT,
                RelayOutboxStatus.LOCAL_PENDING,
                RelayOutboxStatus.READY,
                RelayOutboxStatus.RELAY_RETRYABLE,
                RelayOutboxStatus.RELAY_ACCEPTED,
                RelayOutboxStatus.INDETERMINATE,
                RelayOutboxStatus.DEFINITE_FAILURE
            )
            RelayOutboxStatus.LOCAL_PENDING -> setOf(
                RelayOutboxStatus.LOCAL_PENDING,
                RelayOutboxStatus.READY,
                RelayOutboxStatus.RELAY_RETRYABLE,
                RelayOutboxStatus.RELAY_ACCEPTED,
                RelayOutboxStatus.INDETERMINATE,
                RelayOutboxStatus.DEFINITE_FAILURE
            )
            RelayOutboxStatus.RELAY_RETRYABLE -> setOf(
                RelayOutboxStatus.RELAY_RETRYABLE,
                RelayOutboxStatus.READY,
                RelayOutboxStatus.RELAY_ACCEPTED,
                RelayOutboxStatus.INDETERMINATE,
                RelayOutboxStatus.DEFINITE_FAILURE
            )
            RelayOutboxStatus.RELAY_ACCEPTED -> setOf(
                RelayOutboxStatus.RELAY_ACCEPTED,
                RelayOutboxStatus.INDETERMINATE,
                RelayOutboxStatus.DEFINITE_FAILURE
            )
            RelayOutboxStatus.INDETERMINATE -> setOf(
                RelayOutboxStatus.INDETERMINATE,
                RelayOutboxStatus.READY,
                RelayOutboxStatus.RELAY_RETRYABLE,
                RelayOutboxStatus.RELAY_ACCEPTED,
                RelayOutboxStatus.DEFINITE_FAILURE
            )
            RelayOutboxStatus.DEFINITE_FAILURE -> setOf(RelayOutboxStatus.DEFINITE_FAILURE)
        }
        require(next in allowed) {
            "Invalid relay status transition from $current to $next"
        }
    }

    private fun readState(): RelayState {
        val encoded = storage.read()
            ?: throw IllegalStateException("Relay state is missing; provisioning must be repeated")
        require(encoded.size <= maximumStateBytes) { "Relay state exceeds its bound" }
        return decodeState(encoded)
    }

    private fun persist(state: RelayState) {
        val encoded = encodeState(state)
        require(encoded.size <= maximumStateBytes) { "Relay state exceeds its bound" }
        storage.write(encoded)
    }

    private fun pruneOutbox(state: RelayState, now: Long): List<String> {
        val removed = mutableListOf<String>()
        val iterator = state.outbox.entries.iterator()
        while (iterator.hasNext()) {
            val entry = iterator.next().value
            val canPrune = when (entry.status) {
                RelayOutboxStatus.READY -> entry.expiresAt <= now
                else -> entry.expiresAt <= now && now - entry.expiresAt >= terminalRetentionSeconds
            }
            if (canPrune) {
                removed += entry.messageId
                iterator.remove()
            }
        }
        return removed
    }

    private data class RelayDedupEntry(val sequence: Long, val digest: String)

    private data class RelayState(
        val generation: String,
        val highWater: LinkedHashMap<String, Long> = linkedMapOf(),
        val outbox: LinkedHashMap<String, RelayOutboxEntry> = linkedMapOf(),
        val inbox: LinkedHashMap<String, RelayInboxEntry> = linkedMapOf(),
        val dedup: LinkedHashMap<String, RelayDedupEntry> = linkedMapOf()
    )

    private fun encodeState(state: RelayState): ByteArray = ByteArrayOutputStream().use { bytes ->
        DataOutputStream(bytes).use { output ->
            output.write(stateMagic)
            output.writeStateString(state.generation)
            output.writeInt(state.highWater.size)
            state.highWater.toSortedMap().forEach { (binding, sequence) ->
                output.writeStateString(binding)
                output.writeLong(sequence)
            }
            output.writeInt(state.outbox.size)
            state.outbox.values.forEach { entry ->
                output.writeStateString(entry.messageId)
                output.writeStateString(entry.envelopeJson)
                output.writeLong(entry.sequence)
                output.writeLong(entry.expiresAt)
                output.writeInt(entry.status.ordinal)
            }
            output.writeInt(state.inbox.size)
            state.inbox.values.forEach { entry ->
                output.writeStateString(entry.messageId)
                output.writeStateString(entry.envelopeJson)
                output.writeLong(entry.sequence)
                output.writeLong(entry.expiresAt)
                output.writeLong(entry.validatedAt)
                output.writeBoolean(entry.serverAcknowledged)
            }
            output.writeInt(state.dedup.size)
            state.dedup.forEach { (messageId, entry) ->
                output.writeStateString(messageId)
                output.writeLong(entry.sequence)
                output.writeStateString(entry.digest)
            }
        }
        bytes.toByteArray()
    }

    private fun decodeState(encoded: ByteArray): RelayState = DataInputStream(
        ByteArrayInputStream(encoded)
    ).use { input ->
        require(input.readStateBytes(stateMagic.size).contentEquals(stateMagic)) {
            "Relay state marker is invalid"
        }
        val generation = input.readIdentifier("state generation")
        require(generation == stateGeneration) {
            "Relay state does not match the provisioned secrets"
        }
        val state = RelayState(generation)
        repeat(input.readCount(maximumHighWaterItems, "high-water")) {
            val binding = input.readStateString(maximumBindingBytes, "high-water binding")
            require(state.highWater.put(binding, input.readSafeSequence()) == null) {
                "Duplicate relay high-water binding"
            }
        }
        repeat(input.readCount(maximumMailboxItems, "outbox")) {
            val messageId = input.readIdentifier("outbox messageId")
            val envelopeJson = input.readStateString(MessageRelayProtocol.maximumEnvelopeBytes, "outbox envelope")
            val sequence = input.readSafeSequence()
            val expiresAt = input.readSafeInteger("outbox expiresAt")
            val status = RelayOutboxStatus.entries.getOrNull(input.readInt())
                ?: throw IllegalArgumentException("Relay outbox status is invalid")
            val envelope = MessageRelayProtocol.parseEnvelope(envelopeJson.toByteArray(Charsets.UTF_8))
            require(envelope.messageId == messageId && envelope.sequence == sequence &&
                envelope.expiresAt == expiresAt && envelope.canonicalJson() == envelopeJson) {
                "Relay outbox metadata does not match its envelope"
            }
            require(state.outbox.put(messageId, RelayOutboxEntry(
                messageId, envelopeJson, sequence, expiresAt, status
            )) == null) { "Duplicate relay outbox messageId" }
        }
        require(state.outbox.values.sumOf { it.envelopeJson.byteSize() } <= maximumMailboxBytes) {
            "Relay outbox bytes exceed their bound"
        }
        repeat(input.readCount(maximumMailboxItems, "inbox")) {
            val messageId = input.readIdentifier("inbox messageId")
            val envelopeJson = input.readStateString(MessageRelayProtocol.maximumEnvelopeBytes, "inbox envelope")
            val sequence = input.readSafeSequence()
            val expiresAt = input.readSafeInteger("inbox expiresAt")
            val validatedAt = input.readSafeInteger("inbox validatedAt")
            val serverAcknowledged = input.readBoolean()
            val envelope = MessageRelayProtocol.parseEnvelope(envelopeJson.toByteArray(Charsets.UTF_8))
            require(envelope.messageId == messageId && envelope.sequence == sequence &&
                envelope.expiresAt == expiresAt && validatedAt >= envelope.issuedAt - MessageRelayProtocol.clockSkewSeconds &&
                validatedAt < envelope.expiresAt && envelope.canonicalJson() == envelopeJson) {
                "Relay inbox metadata does not match its envelope"
            }
            require(state.inbox.put(messageId, RelayInboxEntry(
                messageId, envelopeJson, sequence, expiresAt, validatedAt, serverAcknowledged
            )) == null) { "Duplicate relay inbox messageId" }
        }
        require(state.inbox.values.sumOf { it.envelopeJson.byteSize() } <= maximumMailboxBytes) {
            "Relay inbox bytes exceed their bound"
        }
        repeat(input.readCount(maximumDedupItems, "dedup")) {
            val messageId = input.readIdentifier("dedup messageId")
            val entry = RelayDedupEntry(
                sequence = input.readSafeSequence(),
                digest = input.readStateString(43, "dedup digest")
            )
            require(runCatching { Base64.getUrlDecoder().decode(entry.digest) }.getOrNull()?.size == 32) {
                "Relay dedup digest is invalid"
            }
            require(state.dedup.put(messageId, entry) == null) { "Duplicate relay dedup messageId" }
        }
        require(input.available() == 0) { "Relay state has trailing bytes" }
        state
    }

    private fun MessageRelayKeyRecord.binding(): String {
        MessageRelayProtocol.requireIdentifier(streamId, "keyRecord streamId")
        MessageRelayProtocol.requireIdentifier(keyId, "keyRecord keyId")
        require(keyBytes.size == 32) { "Relay key must contain exactly 32 bytes" }
        return "${direction.wireValue}:$streamId:$keyId"
    }

    private fun MessageRelayEnvelope.binding(): String = "${direction.wireValue}:$streamId:$keyId"

    private fun String.byteSize(): Int = toByteArray(Charsets.UTF_8).size

    private fun sha256Base64Url(bytes: ByteArray): String = Base64.getUrlEncoder().withoutPadding()
        .encodeToString(MessageDigest.getInstance("SHA-256").digest(bytes))

    companion object {
        internal const val maximumMailboxItems = 100
        internal const val maximumMailboxBytes = 262_144
        internal const val maximumDedupItems = 200
        private const val maximumHighWaterItems = 32
        private const val maximumBindingBytes = 160
        internal const val maximumStateBytes = 600_000
        private const val maximumSafeInteger = 9_007_199_254_740_991L
        internal const val terminalRetentionSeconds = 7L * 24L * 60L * 60L
        private val stateMagic = "SFMR1ST1".toByteArray(Charsets.US_ASCII)
        private val globalLock = Any()

        fun initializeForProvisioning(storage: MessageRelayStateStorage, stateGeneration: String) =
            synchronized(globalLock) {
                MessageRelayProtocol.requireIdentifier(stateGeneration, "stateGeneration")
                val existing = storage.read()
                if (existing == null) {
                    MessageRelayStateStore(storage, stateGeneration).persist(
                        RelayState(stateGeneration)
                    )
                } else {
                    // A matching empty or active file allows a safe retry after a partial secret write.
                    MessageRelayStateStore(storage, stateGeneration).verifyInitialized()
                }
            }
    }
}

internal class AndroidMessageRelayStateStorage(context: Context) : MessageRelayStateStorage {
    private val appContext = context.applicationContext

    override fun read(): ByteArray? = MessageRelaySecureStore.readStateBytes(appContext)

    override fun write(bytes: ByteArray) {
        MessageRelaySecureStore.writeStateBytes(appContext, bytes)
    }
}

private fun DataOutputStream.writeStateString(value: String) {
    val bytes = value.toByteArray(Charsets.UTF_8)
    writeInt(bytes.size)
    write(bytes)
}

private fun DataInputStream.readStateString(maximumBytes: Int, label: String): String {
    val bytes = readStateBytes(readBoundedLength(1, maximumBytes, label))
    return bytes.toString(Charsets.UTF_8).also { decoded ->
        require(decoded.toByteArray(Charsets.UTF_8).contentEquals(bytes)) { "$label is not valid UTF-8" }
    }
}

private fun DataInputStream.readIdentifier(label: String): String =
    readStateString(22, label).also { MessageRelayProtocol.requireIdentifier(it, label) }

private fun DataInputStream.readStateBytes(size: Int): ByteArray = ByteArray(size).also(::readFully)

private fun DataInputStream.readBoundedLength(minimum: Int, maximum: Int, label: String): Int {
    val size = readInt()
    require(size in minimum..maximum && size <= available()) { "$label size is invalid" }
    return size
}

private fun DataInputStream.readCount(maximum: Int, label: String): Int {
    val count = readInt()
    require(count in 0..maximum) { "Relay $label item count is invalid" }
    return count
}

private fun DataInputStream.readSafeSequence(): Long = readSafeInteger("sequence", minimum = 1L)

private fun DataInputStream.readSafeInteger(label: String, minimum: Long = 0L): Long = readLong().also {
    MessageRelayJson.requireSafeInteger(it, label, minimum)
}
