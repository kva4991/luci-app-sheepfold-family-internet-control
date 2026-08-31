package app.sheepfold.android.relay

/*
 * Назначение: моделирует pre/post-body races локального POST и exact wire без реальной сети.
 * Почему JVM/fake HTTPS: latch детерминированно меняет phase; каждый тест создаёт чистые fake connection/state.
 * Green доказывает классификацию и восстановление тестового состояния, но не реальный TLS pin, API 28 или роутер. §testwhy
 */

import app.sheepfold.android.router.RouterConnectionRequest
import app.sheepfold.android.router.bearerToken
import app.sheepfold.android.router.deviceId
import app.sheepfold.android.router.deviceMac
import app.sheepfold.android.router.tlsSpkiSha256
import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.ByteArrayOutputStream
import java.io.EOFException
import java.io.OutputStream
import java.net.URL
import java.util.concurrent.CountDownLatch
import java.util.concurrent.FutureTask
import java.util.concurrent.TimeUnit

class PinnedLocalMessageRelayTransportTest {
    @Test
    fun `post sends exact raw envelope and exact content type`() {
        val secrets = relayTestSecrets()
        val requestEnvelope = outboundEnvelope(secrets, 1, relayId(10), 40_000).canonicalJson()
        val responseEnvelope = localResultEnvelope(secrets, requestEnvelope, 40_001).canonicalJson()
        val connection = FakeHttpsConnection(200, responseEnvelope.toByteArray())
        var requestedUrl: URL? = null
        val transport = PinnedLocalMessageRelayTransport(
            localConnection(),
            LocalPinnedConnectionFactory { url, _ ->
                requestedUrl = url
                connection
            },
            probeBudgetMillis = 500
        )
        val result = transport.submit(requestEnvelope)
        assertTrue(result is LocalRelayDelivery.Result)
        assertEquals(responseEnvelope, (result as LocalRelayDelivery.Result).resultEnvelopeJson)
        assertArrayEquals(requestEnvelope.toByteArray(), connection.output.toByteArray())
        assertEquals("application/json", connection.getRequestProperty("Content-Type"))
        assertEquals(
            "/cgi-bin/sheepfold-api/api/v1/message-relay/messages",
            requestedUrl?.path
        )
    }

    @Test
    fun `timeout cancellation wins before write and permits fallback`() {
        val secrets = relayTestSecrets()
        val envelope = outboundEnvelope(secrets, 1, relayId(11), 41_000).canonicalJson()
        val connection = BlockingOutputHttpsConnection()
        val transport = PinnedLocalMessageRelayTransport(
            localConnection(),
            LocalPinnedConnectionFactory { _, _ -> connection },
            probeBudgetMillis = 100
        )
        val call = FutureTask { transport.submit(envelope) }
        Thread(call).start()
        assertTrue(connection.outputEntered.await(1, TimeUnit.SECONDS))
        val result = call.get(2, TimeUnit.SECONDS)
        assertTrue(result is LocalRelayDelivery.Unreachable)
        assertEquals(0, connection.bytesWritten.size())
    }

    @Test
    fun `any io failure after body gate is indeterminate`() {
        val secrets = relayTestSecrets()
        val envelope = outboundEnvelope(secrets, 1, relayId(12), 42_000).canonicalJson()
        val connection = object : FakeHttpsConnection(202, ByteArray(0)) {
            override fun getOutputStream(): OutputStream = object : OutputStream() {
                override fun write(value: Int) = throw EOFException("synthetic lost response")
                override fun write(bytes: ByteArray, offset: Int, length: Int) =
                    throw EOFException("synthetic lost response")
            }
        }
        val transport = PinnedLocalMessageRelayTransport(
            localConnection(),
            LocalPinnedConnectionFactory { _, _ -> connection },
            probeBudgetMillis = 500
        )
        assertTrue(transport.submit(envelope) is LocalRelayDelivery.Indeterminate)
    }

    @Test
    fun `accepted pending requires exact retry after and empty body`() {
        val secrets = relayTestSecrets()
        val envelope = outboundEnvelope(secrets, 1, relayId(13), 43_000).canonicalJson()
        val accepted = FakeHttpsConnection(202, ByteArray(0), mapOf("Retry-After" to "1"))
        val acceptedTransport = PinnedLocalMessageRelayTransport(
            localConnection(),
            LocalPinnedConnectionFactory { _, _ -> accepted },
            probeBudgetMillis = 500
        )
        assertEquals(LocalRelayDelivery.Pending, acceptedTransport.submit(envelope))

        val unexpectedBody = FakeHttpsConnection(202, "{}".toByteArray(), mapOf("Retry-After" to "1"))
        val strictTransport = PinnedLocalMessageRelayTransport(
            localConnection(),
            LocalPinnedConnectionFactory { _, _ -> unexpectedBody },
            probeBudgetMillis = 500
        )
        assertTrue(strictTransport.submit(envelope) is LocalRelayDelivery.Indeterminate)
    }

    @Test
    fun `malformed result after post body is indeterminate and cannot permit fallback`() {
        val secrets = relayTestSecrets()
        val envelope = outboundEnvelope(secrets, 1, relayId(14), 44_000).canonicalJson()
        for (response in listOf(
            "{}".toByteArray(),
            ByteArray(PublicMessageRelayHttpsClient.maximumHttpBodyBytes + 1) { 'x'.code.toByte() }
        )) {
            val transport = PinnedLocalMessageRelayTransport(
                localConnection(),
                LocalPinnedConnectionFactory { _, _ -> FakeHttpsConnection(200, response) },
                probeBudgetMillis = 500
            )
            assertTrue(transport.submit(envelope) is LocalRelayDelivery.Indeterminate)
        }
    }

    @Test
    fun `server failure after post body is indeterminate`() {
        val secrets = relayTestSecrets()
        val envelope = outboundEnvelope(secrets, 1, relayId(15), 45_000).canonicalJson()
        val transport = PinnedLocalMessageRelayTransport(
            localConnection(),
            LocalPinnedConnectionFactory { _, _ -> FakeHttpsConnection(500, ByteArray(0)) },
            probeBudgetMillis = 500
        )
        assertTrue(transport.submit(envelope) is LocalRelayDelivery.Indeterminate)
    }

    @Test
    fun `lookup permits fallback only for exact canonical not found response`() {
        val requestMessageId = relayId(16)
        val validBody = "{\"error\":\"notFound\",\"protocolVersion\":1,\"requestMessageId\":\"$requestMessageId\"}"
        val exact = PinnedLocalMessageRelayTransport(
            localConnection(),
            LocalPinnedConnectionFactory { _, _ -> FakeHttpsConnection(
                404,
                validBody.toByteArray(),
                mapOf("Content-Type" to "application/json")
            ) },
            probeBudgetMillis = 500
        )
        assertEquals(LocalRelayLookup.NoRecord, exact.lookupResult(requestMessageId))

        for ((body, contentType) in listOf(
            ByteArray(0) to "application/json",
            validBody.replace(requestMessageId, relayId(17)).toByteArray() to "application/json",
            validBody.replace(":1,", ":2,").toByteArray() to "application/json",
            validBody.replace(":1,", ":1,\"extra\":true,").toByteArray() to "application/json",
            validBody.replace(":1,", ":1,\"protocolVersion\":1,").toByteArray() to "application/json",
            validBody.toByteArray() to "text/html",
            "{\"error\": \"notFound\"}".toByteArray() to "application/json",
            "{\"error\":\"notFound\"}".toByteArray() to "application/json; charset=utf-8"
        )) {
            val generic = PinnedLocalMessageRelayTransport(
                localConnection(),
                LocalPinnedConnectionFactory { _, _ -> FakeHttpsConnection(
                    404,
                    body,
                    mapOf("Content-Type" to contentType)
                ) },
                probeBudgetMillis = 500
            )
            assertTrue(generic.lookupResult(requestMessageId) is LocalRelayLookup.DefiniteFailure)
        }
    }
}

private class BlockingOutputHttpsConnection : FakeHttpsConnection(202, ByteArray(0)) {
    val outputEntered = CountDownLatch(1)
    val bytesWritten = ByteArrayOutputStream()
    private val disconnected = CountDownLatch(1)

    override fun getOutputStream(): OutputStream {
        outputEntered.countDown()
        disconnected.await(2, TimeUnit.SECONDS)
        return bytesWritten
    }

    override fun disconnect() {
        disconnected.countDown()
    }
}

private fun localConnection(): RouterConnectionRequest = RouterConnectionRequest(
    apiUrl = "https://192.0.2.10/cgi-bin/sheepfold-api",
    routerName = "synthetic-router"
).also {
    it.bearerToken = "synthetic-local-admin-bearer"
    it.deviceId = "synthetic-device"
    it.deviceMac = "02:00:00:00:00:01"
    it.tlsSpkiSha256 = "0".repeat(64)
}

private fun localResultEnvelope(
    secrets: MessageRelaySecrets,
    requestEnvelopeJson: String,
    now: Long
): MessageRelayEnvelope {
    val requestEnvelope = MessageRelayProtocol.parseEnvelope(requestEnvelopeJson.toByteArray())
    val command = MessageRelayProtocol.decrypt(
        requestEnvelope,
        secrets.outboundKeyRecord(),
        requestEnvelope.issuedAt
    )
    return MessageRelayProtocol.encrypt(
        MessageRelayMetadata(
            MessageRelayDirection.ROUTER_TO_PHONE,
            MessageRelayClass.COMMAND_RESULT,
            secrets.routerId,
            secrets.phoneId,
            secrets.streamId,
            relayId(70),
            1,
            now,
            now + MessageRelayProtocol.commandResultTtlSeconds,
            secrets.routerToPhoneKeyId
        ),
        commandResultPayload(requestEnvelope.messageId, command),
        secrets.inboundKeyRecord()
    )
}
