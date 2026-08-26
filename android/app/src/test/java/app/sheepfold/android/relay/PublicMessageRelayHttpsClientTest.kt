package app.sheepfold.android.relay

/*
 * Назначение: проверяет exact public HTTP shapes, auth separation, Retry-After и bounded poll body без реальной сети.
 * Почему JVM/fake HTTPS: управляемые status/header/body ловят strict-parser drift; каждый fake сбрасывается после теста.
 * Green не доказывает Android system CA/hostname verification, DNS, socket timing или live relay behavior. §testwhy
 */

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Assert.assertThrows
import org.junit.Test
import java.io.ByteArrayInputStream
import java.io.ByteArrayOutputStream
import java.io.OutputStream
import java.net.URL
import java.security.cert.Certificate
import javax.net.ssl.HttpsURLConnection

class PublicMessageRelayHttpsClientTest {
    @Test
    fun `valid poll batch larger than request cap is accepted`() {
        val secrets = relayTestSecrets()
        val envelopes = (1..20).map { sequence ->
            largeInboundNotification(secrets, sequence.toLong(), relayId(sequence + 100), 20_000)
        }
        val response = MessageRelayJson.canonicalBytes(MessageRelayJson.objectValue(
            "protocolVersion" to RelayJsonValue.IntegerValue(1),
            "messages" to RelayJsonValue.ArrayValue(envelopes.map(MessageRelayEnvelope::toJsonValue))
        ))
        assertTrue(response.size > PublicMessageRelayHttpsClient.maximumHttpBodyBytes)
        val connection = FakeHttpsConnection(200, response)
        val client = PublicMessageRelayHttpsClient(
            "https://relay.invalid.example",
            secrets,
            SystemHttpsConnectionFactory { connection }
        )
        assertEquals(20, client.poll(20, 0).size)
        assertEquals("Bearer ${secrets.phoneCredential}", connection.getRequestProperty("Authorization"))
        assertTrue(connection.output.toString(Charsets.UTF_8.name()).contains("\"waitSeconds\":0"))
    }

    @Test
    fun `poll overflow and wrapped protocol version are rejected`() {
        val secrets = relayTestSecrets()
        val overflow = FakeHttpsConnection(
            200,
            ByteArray(PublicMessageRelayHttpsClient.maximumPollResponseBytes + 1) { ' '.code.toByte() }
        )
        val overflowClient = PublicMessageRelayHttpsClient(
            "https://relay.invalid.example",
            secrets,
            SystemHttpsConnectionFactory { overflow }
        )
        assertEquals("messageTooLarge", assertThrows(MessageRelayProtocolException::class.java) {
            overflowClient.poll(20, 0)
        }.code)

        val wrapped = FakeHttpsConnection(
            200,
            "{\"messages\":[],\"protocolVersion\":4294967297}".toByteArray()
        )
        val wrappedClient = PublicMessageRelayHttpsClient(
            "https://relay.invalid.example",
            secrets,
            SystemHttpsConnectionFactory { wrapped }
        )
        assertEquals("protocolUnsupported", assertThrows(MessageRelayProtocolException::class.java) {
            wrappedClient.poll(1, 0)
        }.code)
    }

    @Test
    fun `retry after accepts only bounded canonical seconds`() {
        val secrets = relayTestSecrets()
        val outbound = outboundEnvelope(secrets, 1, relayId(10), 30_000).canonicalJson()
        for ((header, expected) in listOf(
            "5" to 5,
            "300" to 300,
            "4" to null,
            "301" to null,
            "05" to null,
            "5, 6" to null,
            "date" to null
        )) {
            val connection = FakeHttpsConnection(
                503,
                "{\"error\":\"unavailable\"}".toByteArray(),
                mapOf("Retry-After" to header)
            )
            val client = PublicMessageRelayHttpsClient(
                "https://relay.invalid.example",
                secrets,
                SystemHttpsConnectionFactory { connection }
            )
            val error = assertThrows(MessageRelayHttpException::class.java) {
                client.enqueue(outbound)
            }
            assertEquals(expected, error.retryAfterSeconds)
        }
    }
}

private fun largeInboundNotification(
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
            "notificationId" to RelayJsonValue.StringValue(relayId(sequence.toInt() + 120)),
            "category" to RelayJsonValue.StringValue("synthetic"),
            "title" to RelayJsonValue.StringValue("Synthetic"),
            "message" to RelayJsonValue.StringValue("x".repeat(2_048)),
            "createdAt" to RelayJsonValue.IntegerValue(now)
        )
    ))
    return MessageRelayProtocol.encrypt(
        MessageRelayMetadata(
            MessageRelayDirection.ROUTER_TO_PHONE,
            MessageRelayClass.NOTIFICATION,
            secrets.routerId,
            secrets.phoneId,
            secrets.streamId,
            messageId,
            sequence,
            now,
            now + MessageRelayProtocol.notificationTtlSeconds,
            secrets.routerToPhoneKeyId
        ),
        payload,
        secrets.inboundKeyRecord()
    )
}

internal open class FakeHttpsConnection(
    private val status: Int,
    private val response: ByteArray,
    private val responseHeaders: Map<String, String> = emptyMap(),
    url: URL = URL("https://relay.invalid.example")
) : HttpsURLConnection(url) {
    val output = ByteArrayOutputStream()

    override fun connect() = Unit
    override fun disconnect() = Unit
    override fun usingProxy(): Boolean = false
    override fun getCipherSuite(): String = "TLS_AES_128_GCM_SHA256"
    override fun getLocalCertificates(): Array<Certificate>? = null
    override fun getServerCertificates(): Array<Certificate> = emptyArray()
    override fun getResponseCode(): Int = status
    override fun getInputStream() = ByteArrayInputStream(response)
    override fun getErrorStream() = ByteArrayInputStream(response)
    override fun getOutputStream(): OutputStream = output
    override fun getHeaderField(name: String?): String? = responseHeaders[name]
}
