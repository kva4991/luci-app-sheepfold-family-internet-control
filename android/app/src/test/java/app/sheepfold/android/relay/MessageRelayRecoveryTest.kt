package app.sheepfold.android.relay

/*
 * Назначение: сохраняет доказательство отправки при сбое, запрещает повтор через Wi-Fi и неверный JSON
 * JVM с in-memory storage воспроизводит границы транзакций без сети и пользовательских данных
 * Не доказывает fsync, AndroidKeyStore, доступность VPS или исполнение на OpenWrt. §testwhy
 */
import org.junit.Assert.assertEquals
import org.junit.Assert.assertThrows
import org.junit.Assert.assertTrue
import org.junit.Test

class MessageRelayRecoveryTest {
    @Test
    fun fractionalNumbersReturnProtocolErrors() {
        for (number in listOf("1.5", "-2.1", "12e-2")) {
            val error = assertThrows(MessageRelayProtocolException::class.java) {
                MessageRelayJson.parse("{\"n\":$number}".toByteArray(), 100)
            }
            assertEquals("messageMalformed", error.code)
        }
    }

    @Test
    fun publicStatesCannotReopenLocalSubmissionIndirectly() {
        for (status in listOf(RelayOutboxStatus.RELAY_RETRYABLE, RelayOutboxStatus.RELAY_ACCEPTED)) {
            val secrets = relayTestSecrets()
            val storage = initializedStorage(secrets)
            val state = MessageRelayStateStore(storage, secrets.stateGeneration)
            val sequence = state.reserveOutboundSequence(secrets.outboundKeyRecord())
            val envelope = outboundEnvelope(secrets, sequence, relayId(90), now = 20_000)
            state.enqueueOutbound(envelope.canonicalJson(), secrets.outboundKeyRecord())
            state.updateOutboundStatus(envelope.messageId, status)
            assertThrows(IllegalArgumentException::class.java) {
                state.updateOutboundStatus(envelope.messageId, RelayOutboxStatus.READY)
            }
            state.updateOutboundStatus(envelope.messageId, RelayOutboxStatus.INDETERMINATE)
            val reopened = MessageRelayStateStore(storage, secrets.stateGeneration)
            assertThrows(IllegalArgumentException::class.java) {
                reopened.updateOutboundStatus(envelope.messageId, RelayOutboxStatus.READY)
            }
            assertThrows(IllegalArgumentException::class.java) { reopened.beginLocalAttempt(envelope.messageId) }
        }
    }

    @Test
    fun crashAfterPublicReceiptKeepsExactCommandAndUncertainResult() {
        val secrets = relayTestSecrets()
        val storage = initializedStorage(secrets)
        val state = MessageRelayStateStore(storage, secrets.stateGeneration)
        var sentEnvelope = ""
        val settings = MessageRelaySettings(true, "https://relay.invalid.example")
        val transport = object : PublicMessageRelayTransport {
            override fun enqueue(envelopeJson: String): RelayEnqueueReceipt {
                sentEnvelope = envelopeJson
                throw SimulatedProcessDeath()
            }
            override fun poll(limit: Int, waitSeconds: Int): List<String> = emptyList()
            override fun acknowledge(messageIds: List<String>) = Unit
        }
        val coordinator = LocalFirstMessageRelayCoordinator(
            settings, secrets, state, null, PublicMessageRelayTransportFactory { transport }
        )
        assertThrows(SimulatedProcessDeath::class.java) {
            coordinator.submit(MessageRelayPayload.globalInternetSet(false), false, 30_000)
        }
        val sentId = MessageRelayProtocol.parseEnvelope(sentEnvelope.toByteArray()).messageId
        val reopened = MessageRelayStateStore(storage, secrets.stateGeneration)
        assertEquals(RelayOutboxStatus.RELAY_RETRYABLE, reopened.outboxEntry(sentId)?.status)
        assertEquals(sentEnvelope, reopened.pendingOutbox(30_001).single().envelopeJson)
        assertTrue(reopened.pruneOutbox(30_121).isEmpty())
        val restarted = LocalFirstMessageRelayCoordinator(settings, secrets, reopened, null, null)
        assertTrue(restarted.retryRelay(sentId, 30_121) is RelayCommandRouteResult.Indeterminate)
    }

    @Test
    fun rejectingARetryDoesNotDisproveEarlierExecution() {
        for (status in listOf(400, 401, 403, 410)) {
            val secrets = relayTestSecrets()
            val storage = initializedStorage(secrets)
            val state = MessageRelayStateStore(storage, secrets.stateGeneration)
            val settings = MessageRelaySettings(true, "https://relay.invalid.example")
            var attempts = 0
            var sentEnvelope = ""
            val transport = object : PublicMessageRelayTransport {
                override fun enqueue(envelopeJson: String): RelayEnqueueReceipt {
                    attempts += 1
                    if (attempts == 1) {
                        sentEnvelope = envelopeJson
                        throw java.io.IOException("Synthetic lost response after accept")
                    }
                    assertEquals(sentEnvelope, envelopeJson)
                    throw MessageRelayHttpException(status, "syntheticRejection", null)
                }
                override fun poll(limit: Int, waitSeconds: Int): List<String> = emptyList()
                override fun acknowledge(messageIds: List<String>) = Unit
            }
            val factory = PublicMessageRelayTransportFactory { transport }
            val coordinator = LocalFirstMessageRelayCoordinator(settings, secrets, state, null, factory)
            val pending = coordinator.submit(MessageRelayPayload.globalInternetSet(false), false, 30_000)
            assertTrue(pending is RelayCommandRouteResult.RetryableRelayFailure)
            val reopened = MessageRelayStateStore(storage, secrets.stateGeneration)
            val restarted = LocalFirstMessageRelayCoordinator(settings, secrets, reopened, null, factory)
            assertTrue(restarted.retryRelay(pending.messageId, 30_001) is RelayCommandRouteResult.Indeterminate)
            assertEquals(RelayOutboxStatus.INDETERMINATE, reopened.outboxEntry(pending.messageId)?.status)
            assertEquals(sentEnvelope, reopened.outboxEntry(pending.messageId)?.envelopeJson)
        }
    }

    @Test
    fun invalidPathIsNotRepairedDuringSettingsRead() {
        val rawUrl = "https://relay.invalid.example///"
        assertEquals(false, MessageRelaySettings.fromConfigured(true, rawUrl).enabled)
        assertEquals(false, MessageRelaySettings(true, rawUrl).normalized().enabled)
    }
}

private class SimulatedProcessDeath : Error("Synthetic process death after server receipt")
