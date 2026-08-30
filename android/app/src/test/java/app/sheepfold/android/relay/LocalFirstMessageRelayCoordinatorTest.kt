package app.sheepfold.android.relay

/*
 * Назначение: фиксирует local-first порядок, один persisted envelope и запрет fallback после ambiguous/accepted POST.
 * Почему JVM/fake transports: exact event trace детерминирован; in-memory state/fakes создаются заново в каждом тесте.
 * Green не доказывает live router/relay, process crash durability, Android network detection или UI integration. §testwhy
 */

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertThrows
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.IOException

class LocalFirstMessageRelayCoordinatorTest {
    @Test
    fun `definite local reachability failure falls back with the exact same envelope`() {
        val fixture = CoordinatorFixture(localSubmit = LocalRelayDelivery.Unreachable())
        val result = fixture.coordinator().submit(
            MessageRelayPayload.globalInternetSet(false),
            localNetworkAvailable = true,
            now = 10_000
        )
        assertTrue(result is RelayCommandRouteResult.AcceptedByRelay)
        assertEquals(listOf("local", "public"), fixture.events)
        assertEquals(fixture.local.envelopes.single(), fixture.public.envelopes.single())
        assertEquals(
            (result as RelayCommandRouteResult.AcceptedByRelay).messageId,
            MessageRelayProtocol.parseEnvelope(fixture.public.envelopes.single().toByteArray()).messageId
        )
    }

    @Test
    fun `accepted local pending never opens public relay`() {
        val fixture = CoordinatorFixture(localSubmit = LocalRelayDelivery.Pending)
        val result = fixture.coordinator().submit(
            MessageRelayPayload.globalInternetSet(true),
            localNetworkAvailable = true,
            now = 11_000
        )
        assertTrue(result is RelayCommandRouteResult.AwaitingLocal)
        assertEquals(listOf("local"), fixture.events)
        assertEquals(0, fixture.publicFactoryCalls)
    }

    @Test
    fun `ambiguous local post is not retried until lookup proves no record`() {
        val fixture = CoordinatorFixture(
            localSubmit = LocalRelayDelivery.Indeterminate(),
            localLookup = LocalRelayLookup.NoRecord
        )
        val first = fixture.coordinator().submit(
            MessageRelayPayload.globalInternetSet(false),
            localNetworkAvailable = true,
            now = 12_000
        )
        assertTrue(first is RelayCommandRouteResult.Indeterminate)
        assertEquals(listOf("local"), fixture.events)
        assertEquals(0, fixture.publicFactoryCalls)

        val reconciled = fixture.coordinator().reconcileLocal(first.messageId, now = 12_001)
        assertTrue(reconciled is RelayCommandRouteResult.AcceptedByRelay)
        assertEquals(listOf("local", "lookup", "public"), fixture.events)
        assertEquals(fixture.local.envelopes.single(), fixture.public.envelopes.single())
    }

    @Test
    fun `crash during local call leaves durable attempt marker and restart only reconciles`() {
        val secrets = relayTestSecrets()
        val storage = initializedStorage(secrets)
        val state = MessageRelayStateStore(storage, secrets.stateGeneration)
        var attemptedEnvelope = ""
        val crash = object : RuntimeException("synthetic process boundary") {}
        val crashingLocal = object : LocalMessageRelayTransport {
            override fun submit(envelopeJson: String): LocalRelayDelivery {
                attemptedEnvelope = envelopeJson
                throw crash
            }
            override fun lookupResult(requestMessageId: String) = LocalRelayLookup.Pending
        }
        val settings = MessageRelaySettings(true, "https://relay.invalid.example")
        assertEquals(crash, assertThrows(RuntimeException::class.java) {
            LocalFirstMessageRelayCoordinator(
                settings,
                secrets,
                state,
                crashingLocal,
                PublicMessageRelayTransportFactory { error("public relay must not open") }
            ).submit(MessageRelayPayload.globalInternetSet(false), true, 12_500)
        })
        val messageId = MessageRelayProtocol.parseEnvelope(attemptedEnvelope.toByteArray()).messageId
        assertEquals(RelayOutboxStatus.LOCAL_ATTEMPT, state.outboxEntry(messageId)?.status)

        val events = mutableListOf<String>()
        val public = FakePublicTransport(events)
        val afterRestart = LocalFirstMessageRelayCoordinator(
            settings,
            secrets,
            MessageRelayStateStore(storage, secrets.stateGeneration),
            FakeLocalTransport(events, LocalRelayDelivery.Pending, LocalRelayLookup.NoRecord),
            PublicMessageRelayTransportFactory { public }
        )
        assertTrue(afterRestart.retryRelay(messageId, 12_501) is RelayCommandRouteResult.Indeterminate)
        assertTrue(afterRestart.reconcileLocal(messageId, 12_501) is RelayCommandRouteResult.AcceptedByRelay)
        assertEquals(listOf("lookup", "public"), events)
        assertEquals(attemptedEnvelope, public.envelopes.single())
    }

    @Test
    fun `blank or disabled public settings cause zero relay network`() {
        for (settings in listOf(
            MessageRelaySettings(enabled = false, baseUrl = "https://relay.invalid.example"),
            MessageRelaySettings(enabled = true, baseUrl = "")
        )) {
            val fixture = CoordinatorFixture(
                localSubmit = LocalRelayDelivery.Unreachable(),
                settings = settings
            )
            val result = fixture.coordinator().submit(
                MessageRelayPayload.globalInternetSet(false),
                localNetworkAvailable = false,
                now = 13_000
            )
            assertTrue(result is RelayCommandRouteResult.RelayUnavailable)
            assertEquals(0, fixture.publicFactoryCalls)
            assertTrue(fixture.events.isEmpty())
        }
    }

    @Test
    fun `disabled settings never schedule background polling`() {
        val validSettings = MessageRelaySettings(enabled = true, baseUrl = "https://relay.example.com")
        val secret = relayTestSecrets()
        assertTrue(MessageRelayPollWorker.shouldSchedule(validSettings, secret))
        assertFalse(MessageRelayPollWorker.shouldSchedule(validSettings.copy(enabled = false), secret))
        assertFalse(MessageRelayPollWorker.shouldSchedule(validSettings, null))
        assertFalse(MessageRelayPollWorker.shouldSchedule(validSettings.copy(baseUrl = ""), secret))
    }

    @Test
    fun `local attempt transition is explicit and rejects invalid status jumps`() {
        val secrets = relayTestSecrets()
        val state = MessageRelayStateStore(initializedStorage(secrets), secrets.stateGeneration)
        val sequence = state.reserveOutboundSequence(secrets.outboundKeyRecord())
        val command = outboundEnvelope(secrets, sequence, relayId(18), now = 13_100)
        state.enqueueOutbound(command.canonicalJson(), secrets.outboundKeyRecord())

        val started = state.beginLocalAttempt(command.messageId)
        assertEquals(RelayOutboxStatus.LOCAL_ATTEMPT, started.status)
        assertEquals(RelayOutboxStatus.LOCAL_ATTEMPT, state.outboxEntry(command.messageId)?.status)

        val error = assertThrows(IllegalArgumentException::class.java) {
            state.beginLocalAttempt(command.messageId)
        }
        assertEquals("Local attempt can only start from READY status", error.message)

        val terminalFailure = state.updateOutboundStatus(command.messageId, RelayOutboxStatus.DEFINITE_FAILURE)
        assertEquals(RelayOutboxStatus.DEFINITE_FAILURE, terminalFailure.status)

        val jumpError = assertThrows(IllegalArgumentException::class.java) {
            state.updateOutboundStatus(command.messageId, RelayOutboxStatus.READY)
        }
        assertEquals("Invalid relay status transition from DEFINITE_FAILURE to READY", jumpError.message)
    }

    @Test
    fun `two commands reserve different durable sequences and message ids`() {
        val fixture = CoordinatorFixture(localSubmit = LocalRelayDelivery.Unreachable())
        val coordinator = fixture.coordinator()
        coordinator.submit(MessageRelayPayload.globalInternetSet(false), false, 14_000)
        coordinator.submit(MessageRelayPayload.globalInternetSet(true), false, 14_001)
        val envelopes = fixture.public.envelopes.map {
            MessageRelayProtocol.parseEnvelope(it.toByteArray())
        }
        assertEquals(listOf(1L, 2L), envelopes.map { it.sequence })
        assertNotEquals(envelopes[0].messageId, envelopes[1].messageId)
        assertFalse(envelopes[0].ciphertext == envelopes[1].ciphertext)
    }

    @Test
    fun `transient public failure keeps exact envelope and expires as indeterminate`() {
        for (failure in listOf<Throwable>(
            IOException("synthetic lost response"),
            MessageRelayHttpException(429, "rateLimited", 30),
            MessageRelayHttpException(503, "unavailable", 10)
        )) {
            val secrets = relayTestSecrets()
            val state = MessageRelayStateStore(initializedStorage(secrets), secrets.stateGeneration)
            var attemptedEnvelope = ""
            val transport = object : PublicMessageRelayTransport {
                override fun enqueue(envelopeJson: String): RelayEnqueueReceipt {
                    attemptedEnvelope = envelopeJson
                    throw failure
                }
                override fun poll(limit: Int, waitSeconds: Int) = emptyList<String>()
                override fun acknowledge(messageIds: List<String>) = Unit
            }
            val coordinator = LocalFirstMessageRelayCoordinator(
                MessageRelaySettings(true, "https://relay.invalid.example"),
                secrets,
                state,
                localTransport = null,
                PublicMessageRelayTransportFactory { transport }
            )
            val first = coordinator.submit(
                MessageRelayPayload.globalInternetSet(false),
                localNetworkAvailable = false,
                now = 15_000
            )
            assertTrue(first is RelayCommandRouteResult.RetryableRelayFailure)
            assertEquals(attemptedEnvelope, state.outboxEntry(first.messageId)?.envelopeJson)
            val expired = coordinator.retryRelay(
                first.messageId,
                15_000 + MessageRelayProtocol.commandTtlSeconds
            )
            assertTrue(expired is RelayCommandRouteResult.Indeterminate)
        }
    }

    @Test
    fun `authentication failure is definite and never retried automatically`() {
        val secrets = relayTestSecrets()
        val state = MessageRelayStateStore(initializedStorage(secrets), secrets.stateGeneration)
        val transport = object : PublicMessageRelayTransport {
            override fun enqueue(envelopeJson: String): RelayEnqueueReceipt =
                throw MessageRelayHttpException(401, "unauthorized", null)
            override fun poll(limit: Int, waitSeconds: Int) = emptyList<String>()
            override fun acknowledge(messageIds: List<String>) = Unit
        }
        val result = LocalFirstMessageRelayCoordinator(
            MessageRelaySettings(true, "https://relay.invalid.example"),
            secrets,
            state,
            null,
            PublicMessageRelayTransportFactory { transport }
        ).submit(MessageRelayPayload.globalInternetSet(false), false, 16_000)
        assertTrue(result is RelayCommandRouteResult.DefiniteFailure)
    }

    @Test
    fun `retry status never downgrades accepted or ambiguous command to definite failure`() {
        val fixture = CoordinatorFixture(localSubmit = LocalRelayDelivery.Pending)
        val coordinator = fixture.coordinator()
        val pending = coordinator.submit(MessageRelayPayload.globalInternetSet(false), true, 17_000)
        assertTrue(coordinator.retryRelay(pending.messageId, 17_001) is RelayCommandRouteResult.AwaitingLocal)

        fixture.state.updateOutboundStatus(pending.messageId, RelayOutboxStatus.RELAY_ACCEPTED)
        assertTrue(
            coordinator.retryRelay(pending.messageId, 17_002) is RelayCommandRouteResult.AwaitingRelayResult
        )
        fixture.state.updateOutboundStatus(pending.messageId, RelayOutboxStatus.INDETERMINATE)
        assertTrue(coordinator.retryRelay(pending.messageId, 17_003) is RelayCommandRouteResult.Indeterminate)
    }

    @Test
    fun `accepted relay state cannot be downgraded back into retryable transport state`() {
        val secrets = relayTestSecrets()
        val state = MessageRelayStateStore(initializedStorage(secrets), secrets.stateGeneration)
        val sequence = state.reserveOutboundSequence(secrets.outboundKeyRecord())
        val command = outboundEnvelope(secrets, sequence, relayId(19), now = 17_100)
        state.enqueueOutbound(command.canonicalJson(), secrets.outboundKeyRecord())

        state.updateOutboundStatus(command.messageId, RelayOutboxStatus.RELAY_ACCEPTED)
        val error = assertThrows(IllegalArgumentException::class.java) {
            state.updateOutboundStatus(command.messageId, RelayOutboxStatus.RELAY_RETRYABLE)
        }
        assertEquals("Invalid relay status transition from RELAY_ACCEPTED to RELAY_RETRYABLE", error.message)
    }

    @Test
    fun `accepted and ambiguous relay states cannot reopen local attempts`() {
        val secrets = relayTestSecrets()
        val state = MessageRelayStateStore(initializedStorage(secrets), secrets.stateGeneration)
        val sequence = state.reserveOutboundSequence(secrets.outboundKeyRecord())
        val command = outboundEnvelope(secrets, sequence, relayId(20), now = 17_200)
        state.enqueueOutbound(command.canonicalJson(), secrets.outboundKeyRecord())

        state.updateOutboundStatus(command.messageId, RelayOutboxStatus.RELAY_ACCEPTED)
        assertThrows(IllegalArgumentException::class.java) {
            state.beginLocalAttempt(command.messageId)
        }
        assertThrows(IllegalArgumentException::class.java) {
            state.updateOutboundStatus(command.messageId, RelayOutboxStatus.READY)
        }

        state.updateOutboundStatus(command.messageId, RelayOutboxStatus.INDETERMINATE)
        assertThrows(IllegalArgumentException::class.java) {
            state.beginLocalAttempt(command.messageId)
        }
        assertThrows(IllegalArgumentException::class.java) {
            state.updateOutboundStatus(command.messageId, RelayOutboxStatus.LOCAL_ATTEMPT)
        }
    }

    @Test
    fun `retryable public failures cannot reopen a local submission state`() {
        val secrets = relayTestSecrets()
        val state = MessageRelayStateStore(initializedStorage(secrets), secrets.stateGeneration)
        val sequence = state.reserveOutboundSequence(secrets.outboundKeyRecord())
        val command = outboundEnvelope(secrets, sequence, relayId(21), now = 17_300)
        state.enqueueOutbound(command.canonicalJson(), secrets.outboundKeyRecord())

        state.updateOutboundStatus(command.messageId, RelayOutboxStatus.RELAY_RETRYABLE)
        assertThrows(IllegalArgumentException::class.java) {
            state.updateOutboundStatus(command.messageId, RelayOutboxStatus.LOCAL_PENDING)
        }
        assertThrows(IllegalArgumentException::class.java) {
            state.beginLocalAttempt(command.messageId)
        }
    }

    @Test
    fun `stale local reconcile cannot reopen a public retryable command`() {
        val secrets = relayTestSecrets()
        val state = MessageRelayStateStore(initializedStorage(secrets), secrets.stateGeneration)
        val sequence = state.reserveOutboundSequence(secrets.outboundKeyRecord())
        val command = outboundEnvelope(secrets, sequence, relayId(22), now = 17_400)
        state.enqueueOutbound(command.canonicalJson(), secrets.outboundKeyRecord())
        state.updateOutboundStatus(command.messageId, RelayOutboxStatus.RELAY_RETRYABLE)

        val coordinator = LocalFirstMessageRelayCoordinator(
            MessageRelaySettings(true, "https://relay.invalid.example"),
            secrets,
            state,
            object : LocalMessageRelayTransport {
                override fun submit(envelopeJson: String): LocalRelayDelivery = error("stale local reconcile must not reopen")
                override fun lookupResult(requestMessageId: String): LocalRelayLookup = LocalRelayLookup.NoRecord
            },
            PublicMessageRelayTransportFactory { error("public fallback must not reopen from stale local reconcile") }
        )

        val result = coordinator.reconcileLocal(command.messageId, 17_401)
        assertTrue(result is RelayCommandRouteResult.RelayUnavailable)
    }
}

private class CoordinatorFixture(
    localSubmit: LocalRelayDelivery,
    localLookup: LocalRelayLookup = LocalRelayLookup.Pending,
    private val settings: MessageRelaySettings = MessageRelaySettings(
        enabled = true,
        baseUrl = "https://relay.invalid.example"
    )
) {
    val secrets = relayTestSecrets()
    val state = MessageRelayStateStore(initializedStorage(secrets), secrets.stateGeneration)
    val events = mutableListOf<String>()
    val local = FakeLocalTransport(events, localSubmit, localLookup)
    val public = FakePublicTransport(events)
    var publicFactoryCalls = 0

    fun coordinator(): LocalFirstMessageRelayCoordinator = LocalFirstMessageRelayCoordinator(
        settings = settings,
        secrets = secrets,
        stateStore = state,
        localTransport = local,
        publicTransportFactory = PublicMessageRelayTransportFactory {
            publicFactoryCalls += 1
            public
        }
    )
}

private class FakeLocalTransport(
    private val events: MutableList<String>,
    private val submitResult: LocalRelayDelivery,
    private val lookupResult: LocalRelayLookup
) : LocalMessageRelayTransport {
    val envelopes = mutableListOf<String>()

    override fun submit(envelopeJson: String): LocalRelayDelivery {
        events += "local"
        envelopes += envelopeJson
        return submitResult
    }

    override fun lookupResult(requestMessageId: String): LocalRelayLookup {
        events += "lookup"
        return lookupResult
    }
}

private class FakePublicTransport(
    private val events: MutableList<String>
) : PublicMessageRelayTransport {
    val envelopes = mutableListOf<String>()

    override fun enqueue(envelopeJson: String): RelayEnqueueReceipt {
        events += "public"
        envelopes += envelopeJson
        return RelayEnqueueReceipt(
            MessageRelayProtocol.parseEnvelope(envelopeJson.toByteArray()).messageId,
            duplicate = false
        )
    }

    override fun poll(limit: Int, waitSeconds: Int): List<String> = emptyList()
    override fun acknowledge(messageIds: List<String>) = Unit
}
