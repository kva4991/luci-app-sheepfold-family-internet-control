package app.sheepfold.android.relay

/*
 * Назначение: проверяет durable high-water, bounded queues, inbox/outbox и dedup только после AEAD validation.
 * Почему JVM/in-memory storage: позволяет точно моделировать loss/corruption/reload; каждый тест начинает с чистых bytes.
 * Green не доказывает Android AtomicFile/Keystore, fsync на устройстве или защиту от privileged rollback bundle. §testwhy
 */

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertThrows
import org.junit.Test

class MessageRelayStateStoreTest {
    @Test
    fun `missing corrupt and mismatched state fail closed`() {
        val secrets = relayTestSecrets()
        val missing = MemoryRelayStateStorage()
        assertThrows(IllegalStateException::class.java) {
            MessageRelayStateStore(missing, secrets.stateGeneration).verifyInitialized()
        }

        MessageRelayStateStore.initializeForProvisioning(missing, secrets.stateGeneration)
        MessageRelayStateStore(missing, secrets.stateGeneration).verifyInitialized()
        assertThrows(IllegalArgumentException::class.java) {
            MessageRelayStateStore(missing, relayId(99)).verifyInitialized()
        }

        missing.bytes = byteArrayOf(1, 2, 3)
        assertThrows(Exception::class.java) {
            MessageRelayStateStore(missing, secrets.stateGeneration).verifyInitialized()
        }
    }

    @Test
    fun `outbound reservation survives reconstruction and outbox is bounded`() {
        val secrets = relayTestSecrets()
        val storage = initializedStorage(secrets)
        var state = MessageRelayStateStore(storage, secrets.stateGeneration)
        assertEquals(1L, state.reserveOutboundSequence(secrets.outboundKeyRecord()))
        state = MessageRelayStateStore(storage, secrets.stateGeneration)
        assertEquals(2L, state.reserveOutboundSequence(secrets.outboundKeyRecord()))

        for (index in 0 until MessageRelayStateStore.maximumMailboxItems) {
            val sequence = state.reserveOutboundSequence(secrets.outboundKeyRecord())
            val envelope = outboundEnvelope(secrets, sequence, relayId(index + 1), now = 1_000)
            state.enqueueOutbound(envelope.canonicalJson(), secrets.outboundKeyRecord())
        }
        val extraSequence = state.reserveOutboundSequence(secrets.outboundKeyRecord())
        val error = assertThrows(MessageRelayProtocolException::class.java) {
            state.enqueueOutbound(
                outboundEnvelope(secrets, extraSequence, relayId(120), now = 1_000).canonicalJson(),
                secrets.outboundKeyRecord()
            )
        }
        assertEquals("mailboxFull", error.code)
    }

    @Test
    fun `forged high sequence cannot advance replay state`() {
        val secrets = relayTestSecrets()
        val storage = initializedStorage(secrets)
        val state = MessageRelayStateStore(storage, secrets.stateGeneration)
        val forgedSource = inboundNotification(secrets, sequence = 100, messageId = relayId(30), now = 2_000)
        val encrypted = MessageRelayProtocol.decodeBase64Url(forgedSource.ciphertext, "ciphertext")
            .also { it[0] = (it[0].toInt() xor 1).toByte() }
        val forged = forgedSource.copy(ciphertext = MessageRelayProtocol.encodeBase64Url(encrypted))
        val authError = assertThrows(MessageRelayProtocolException::class.java) {
            state.recordInbound(
                forged.canonicalJson(), secrets, now = 2_000, source = RelayInboundSource.PUBLIC_RELAY
            )
        }
        assertEquals("authenticationFailed", authError.code)

        val validLowSequence = inboundNotification(secrets, sequence = 1, messageId = relayId(31), now = 2_000)
        assertEquals(
            RelayInboundRecordResult.STORED,
            state.recordInbound(
                validLowSequence.canonicalJson(), secrets, now = 2_000,
                source = RelayInboundSource.PUBLIC_RELAY
            ).result
        )
    }

    @Test
    fun `exact duplicate is ackable but changed id or reused sequence conflicts`() {
        val secrets = relayTestSecrets()
        val state = MessageRelayStateStore(initializedStorage(secrets), secrets.stateGeneration)
        val first = inboundNotification(secrets, sequence = 1, messageId = relayId(40), now = 3_000)
        assertEquals(
            RelayInboundRecordResult.STORED,
            state.recordInbound(
                first.canonicalJson(), secrets, now = 3_000, source = RelayInboundSource.PUBLIC_RELAY
            ).result
        )
        state.markServerAcknowledged(listOf(first.messageId))
        assertEquals(
            RelayInboundRecordResult.EXACT_DUPLICATE,
            state.recordInbound(
                first.canonicalJson(), secrets, now = 3_000, source = RelayInboundSource.PUBLIC_RELAY
            ).result
        )

        val sameIdChanged = inboundNotification(secrets, sequence = 2, messageId = first.messageId, now = 3_000)
        assertEquals("messageConflict", assertThrows(MessageRelayProtocolException::class.java) {
            state.recordInbound(
                sameIdChanged.canonicalJson(), secrets, now = 3_000,
                source = RelayInboundSource.PUBLIC_RELAY
            )
        }.code)
        val reusedSequence = inboundNotification(secrets, sequence = 1, messageId = relayId(41), now = 3_000)
        assertEquals("messageConflict", assertThrows(MessageRelayProtocolException::class.java) {
            state.recordInbound(
                reusedSequence.canonicalJson(), secrets, now = 3_000,
                source = RelayInboundSource.PUBLIC_RELAY
            )
        }.code)
    }

    @Test
    fun `authenticated matching result atomically completes original outbox entry`() {
        val secrets = relayTestSecrets()
        val state = MessageRelayStateStore(initializedStorage(secrets), secrets.stateGeneration)
        val sequence = state.reserveOutboundSequence(secrets.outboundKeyRecord())
        val command = outboundEnvelope(secrets, sequence, relayId(50), now = 4_000)
        state.enqueueOutbound(command.canonicalJson(), secrets.outboundKeyRecord())
        assertNotNull(state.outboxEntry(command.messageId))

        val commandPayload = MessageRelayProtocol.decrypt(command, secrets.outboundKeyRecord(), 4_000)
        val resultPayload = commandResultPayload(command.messageId, commandPayload)
        val result = MessageRelayProtocol.encrypt(
            MessageRelayMetadata(
                direction = MessageRelayDirection.ROUTER_TO_PHONE,
                messageClass = MessageRelayClass.COMMAND_RESULT,
                routerId = secrets.routerId,
                phoneId = secrets.phoneId,
                streamId = secrets.streamId,
                messageId = relayId(51),
                sequence = 1,
                issuedAt = 4_001,
                expiresAt = 4_121,
                keyId = secrets.routerToPhoneKeyId
            ),
            resultPayload,
            secrets.inboundKeyRecord()
        )
        state.recordInbound(
            result.canonicalJson(),
            secrets,
            now = 4_001,
            source = RelayInboundSource.LOCAL_ROUTER,
            expectedRequestMessageId = command.messageId
        )
        assertNull(state.outboxEntry(command.messageId))
    }

    @Test
    fun `public inbox survives ttl and cannot be consumed before server ack`() {
        val secrets = relayTestSecrets()
        val state = MessageRelayStateStore(initializedStorage(secrets), secrets.stateGeneration)
        val envelope = inboundNotification(secrets, sequence = 1, messageId = relayId(60), now = 5_000)
        state.recordInbound(
            envelope.canonicalJson(), secrets, now = 5_000, source = RelayInboundSource.PUBLIC_RELAY
        )
        assertThrows(IllegalArgumentException::class.java) {
            state.consumeInbox(listOf(envelope.messageId))
        }
        state.markServerAcknowledged(listOf(envelope.messageId))
        assertEquals(
            envelope.messageId,
            state.pendingInboundRecords(secrets).single().envelope.messageId
        )
        state.consumeInbox(listOf(envelope.messageId))
        assertEquals(emptyList<RelayInboxEntry>(), state.pendingInbox())
    }

    @Test
    fun `prune retains ambiguous commands then frees capacity without resetting high water`() {
        val secrets = relayTestSecrets()
        val state = MessageRelayStateStore(initializedStorage(secrets), secrets.stateGeneration)
        val firstSequence = state.reserveOutboundSequence(secrets.outboundKeyRecord())
        val envelope = outboundEnvelope(secrets, firstSequence, relayId(61), now = 6_000)
        state.enqueueOutbound(envelope.canonicalJson(), secrets.outboundKeyRecord())
        state.updateOutboundStatus(envelope.messageId, RelayOutboxStatus.RELAY_RETRYABLE)
        assertEquals(
            emptyList<String>(),
            state.pruneOutbox(envelope.expiresAt + MessageRelayStateStore.terminalRetentionSeconds - 1)
        )
        assertNotNull(state.outboxEntry(envelope.messageId))
        assertEquals(
            listOf(envelope.messageId),
            state.pruneOutbox(envelope.expiresAt + MessageRelayStateStore.terminalRetentionSeconds)
        )
        assertNull(state.outboxEntry(envelope.messageId))
        assertEquals(2L, state.reserveOutboundSequence(secrets.outboundKeyRecord()))
    }
}

internal class MemoryRelayStateStorage(
    var bytes: ByteArray? = null
) : MessageRelayStateStorage {
    override fun read(): ByteArray? = bytes?.copyOf()
    override fun write(bytes: ByteArray) {
        this.bytes = bytes.copyOf()
    }
}

internal fun relayTestSecrets(): MessageRelaySecrets = MessageRelaySecrets(
    stateGeneration = relayId(90),
    routerId = relayId(17),
    phoneId = relayId(34),
    streamId = relayId(51),
    phoneCredential = MessageRelayProtocol.encodeBase64Url(ByteArray(32) { 0x66 }),
    phoneToRouterKeyId = relayId(68),
    phoneToRouterKey = ByteArray(32) { it.toByte() },
    routerToPhoneKeyId = relayId(85),
    routerToPhoneKey = ByteArray(32) { (it + 32).toByte() }
)

internal fun initializedStorage(secrets: MessageRelaySecrets): MemoryRelayStateStorage =
    MemoryRelayStateStorage().also {
        MessageRelayStateStore.initializeForProvisioning(it, secrets.stateGeneration)
    }

internal fun relayId(value: Int): String = MessageRelayProtocol.encodeBase64Url(ByteArray(16) { value.toByte() })

internal fun outboundEnvelope(
    secrets: MessageRelaySecrets,
    sequence: Long,
    messageId: String,
    now: Long
): MessageRelayEnvelope = MessageRelayProtocol.encrypt(
    MessageRelayMetadata(
        direction = MessageRelayDirection.PHONE_TO_ROUTER,
        messageClass = MessageRelayClass.COMMAND,
        routerId = secrets.routerId,
        phoneId = secrets.phoneId,
        streamId = secrets.streamId,
        messageId = messageId,
        sequence = sequence,
        issuedAt = now,
        expiresAt = now + MessageRelayProtocol.commandTtlSeconds,
        keyId = secrets.phoneToRouterKeyId
    ),
    MessageRelayPayload.globalInternetSet(false),
    secrets.outboundKeyRecord()
)

internal fun inboundNotification(
    secrets: MessageRelaySecrets,
    sequence: Long,
    messageId: String,
    now: Long
): MessageRelayEnvelope {
    val payload = MessageRelayPayload(MessageRelayJson.objectValue(
        "schemaVersion" to RelayJsonValue.IntegerValue(1),
        "messageType" to RelayJsonValue.StringValue("notification"),
        "action" to RelayJsonValue.NullValue,
        "actionHash" to RelayJsonValue.NullValue,
        "requestMessageId" to RelayJsonValue.NullValue,
        "body" to MessageRelayJson.objectValue(
            "notificationId" to RelayJsonValue.StringValue(relayId(sequence.toInt() + 100)),
            "category" to RelayJsonValue.StringValue("synthetic"),
            "title" to RelayJsonValue.StringValue("Synthetic"),
            "message" to RelayJsonValue.StringValue("No real family data"),
            "createdAt" to RelayJsonValue.IntegerValue(now)
        )
    ))
    return MessageRelayProtocol.encrypt(
        MessageRelayMetadata(
            direction = MessageRelayDirection.ROUTER_TO_PHONE,
            messageClass = MessageRelayClass.NOTIFICATION,
            routerId = secrets.routerId,
            phoneId = secrets.phoneId,
            streamId = secrets.streamId,
            messageId = messageId,
            sequence = sequence,
            issuedAt = now,
            expiresAt = now + MessageRelayProtocol.notificationTtlSeconds,
            keyId = secrets.routerToPhoneKeyId
        ),
        payload,
        secrets.inboundKeyRecord()
    )
}

internal fun commandResultPayload(
    requestMessageId: String,
    command: MessageRelayPayload
): MessageRelayPayload = MessageRelayPayload(MessageRelayJson.objectValue(
    "schemaVersion" to RelayJsonValue.IntegerValue(1),
    "messageType" to RelayJsonValue.StringValue("commandResult"),
    "action" to RelayJsonValue.StringValue(requireNotNull(command.action)),
    "actionHash" to RelayJsonValue.StringValue(requireNotNull(command.actionHash)),
    "requestMessageId" to RelayJsonValue.StringValue(requestMessageId),
    "body" to MessageRelayJson.objectValue(
        "status" to RelayJsonValue.StringValue("executed"),
        "errorCode" to RelayJsonValue.NullValue,
        "completedAt" to RelayJsonValue.IntegerValue(4_001)
    )
))
