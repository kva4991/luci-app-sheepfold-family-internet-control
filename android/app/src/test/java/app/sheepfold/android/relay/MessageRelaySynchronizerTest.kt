package app.sheepfold.android.relay

/*
 * Назначение: проверяет durable inbox, lost-ACK retry и fresh receipt clock в коротком background poll cycle.
 * Почему JVM/fake transport: детерминированно моделирует crash/empty repoll; in-memory storage пересоздаётся из bytes.
 * Green не доказывает WorkManager scheduling, process kill, Android storage или timing/idempotence live server. §testwhy
 */

import org.junit.Assert.assertEquals
import org.junit.Assert.assertThrows
import org.junit.Test
import java.io.IOException

class MessageRelaySynchronizerTest {
    @Test
    fun `lost ack response is retried before an empty next poll and inbox remains durable`() {
        val secrets = relayTestSecrets()
        val state = MessageRelayStateStore(initializedStorage(secrets), secrets.stateGeneration)
        val envelope = inboundNotification(secrets, 1, relayId(80), 50_000).canonicalJson()
        val transport = LostAckTransport(envelope)
        val synchronizer = MessageRelaySynchronizer(
            MessageRelaySettings(true, "https://relay.invalid.example"),
            secrets,
            state,
            PublicMessageRelayTransportFactory { transport },
            clock = { 50_000 }
        )

        assertThrows(IOException::class.java) { synchronizer.pollOnce(waitSeconds = 0) }
        assertEquals(listOf(relayId(80)), state.pendingServerAcknowledgements())
        assertEquals(1, state.pendingInbox().size)

        assertEquals(emptyList<RelayInboundRecord>(), synchronizer.pollOnce(waitSeconds = 0).records)
        assertEquals(2, transport.acknowledgements.size)
        assertEquals(transport.acknowledgements[0], transport.acknowledgements[1])
        assertEquals(emptyList<String>(), state.pendingServerAcknowledgements())
        assertEquals(1, state.pendingInbox().size)
        state.consumeInbox(listOf(relayId(80)))
        assertEquals(0, state.pendingInbox().size)
    }

    @Test
    fun `fresh clock after poll rejects envelope expired during wait`() {
        val secrets = relayTestSecrets()
        val state = MessageRelayStateStore(initializedStorage(secrets), secrets.stateGeneration)
        val envelope = inboundNotification(secrets, 1, relayId(81), 60_000).copy(
            expiresAt = 60_010
        )
        val transport = object : PublicMessageRelayTransport {
            override fun enqueue(envelopeJson: String) = error("not used")
            override fun poll(limit: Int, waitSeconds: Int) = listOf(envelope.canonicalJson())
            override fun acknowledge(messageIds: List<String>) = Unit
        }
        val synchronizer = MessageRelaySynchronizer(
            MessageRelaySettings(true, "https://relay.invalid.example"),
            secrets,
            state,
            PublicMessageRelayTransportFactory { transport },
            clock = { 60_011 }
        )
        assertEquals("messageExpired", assertThrows(MessageRelayProtocolException::class.java) {
            synchronizer.pollOnce(waitSeconds = 25)
        }.code)
        assertEquals(0, state.pendingInbox().size)
    }
}

private class LostAckTransport(private val envelope: String) : PublicMessageRelayTransport {
    var polls = 0
    val acknowledgements = mutableListOf<List<String>>()

    override fun enqueue(envelopeJson: String) = error("not used")

    override fun poll(limit: Int, waitSeconds: Int): List<String> =
        if (polls++ == 0) listOf(envelope) else emptyList()

    override fun acknowledge(messageIds: List<String>) {
        acknowledgements += messageIds.toList()
        if (acknowledgements.size == 1) throw IOException("synthetic lost ACK response")
    }
}
