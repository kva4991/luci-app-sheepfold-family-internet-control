package app.sheepfold.android.relay

import java.io.ByteArrayOutputStream
import java.net.URL
import javax.net.ssl.HttpsURLConnection

internal fun interface SystemHttpsConnectionFactory {
    fun open(url: URL): HttpsURLConnection
}

/** Public relay uses Android's system trust store; local TOFU/SPKI and local admin Bearer never enter here. */
internal class PublicMessageRelayHttpsClient(
    baseUrl: String,
    private val secrets: MessageRelaySecrets,
    private val connectionFactory: SystemHttpsConnectionFactory = SystemHttpsConnectionFactory { url ->
        url.openConnection() as HttpsURLConnection
    }
) : PublicMessageRelayTransport {
    private val endpoint = MessageRelayEndpoint.requirePublicHttpsBaseUrl(baseUrl).toString().trimEnd('/')

    init {
        secrets.validated()
    }

    override fun enqueue(envelopeJson: String): RelayEnqueueReceipt {
        val envelope = requireOutboundEnvelope(envelopeJson)
        val response = post(
            "/v1/phone/messages",
            MessageRelayJson.objectValue(
                "protocolVersion" to RelayJsonValue.IntegerValue(1),
                "routerId" to RelayJsonValue.StringValue(secrets.routerId),
                "phoneId" to RelayJsonValue.StringValue(secrets.phoneId),
                "streamId" to RelayJsonValue.StringValue(secrets.streamId),
                "envelope" to envelope.toJsonValue()
            )
        )
        if (response.status !in setOf(200, 202)) throw response.asException()
        val body = response.requireObject()
        MessageRelayJson.requireExactKeys(body, setOf("accepted", "duplicate", "messageId"), "enqueue response")
        require(MessageRelayJson.requireBoolean(body.fields["accepted"], "accepted")) {
            "Relay enqueue response did not accept the envelope"
        }
        val messageId = MessageRelayJson.requireString(body.fields["messageId"], "messageId")
        if (messageId != envelope.messageId) {
            throw MessageRelayProtocolException("messageConflict", "relay returned another messageId")
        }
        return RelayEnqueueReceipt(
            messageId = messageId,
            duplicate = MessageRelayJson.requireBoolean(body.fields["duplicate"], "duplicate")
        )
    }

    override fun poll(limit: Int, waitSeconds: Int): List<String> {
        require(limit in 1..20) { "Relay poll limit must be 1..20" }
        require(waitSeconds in 0..25) { "Relay waitSeconds must be 0..25" }
        val response = post(
            "/v1/phone/poll",
            MessageRelayJson.objectValue(
                "protocolVersion" to RelayJsonValue.IntegerValue(1),
                "routerId" to RelayJsonValue.StringValue(secrets.routerId),
                "phoneId" to RelayJsonValue.StringValue(secrets.phoneId),
                "streamId" to RelayJsonValue.StringValue(secrets.streamId),
                "limit" to RelayJsonValue.IntegerValue(limit.toLong()),
                "waitSeconds" to RelayJsonValue.IntegerValue(waitSeconds.toLong())
            ),
            readTimeoutMillis = (waitSeconds + 5) * 1_000,
            successResponseLimit = maximumPollResponseBytes
        )
        if (response.status != 200) throw response.asException()
        val body = response.requireObject()
        MessageRelayJson.requireExactKeys(body, setOf("protocolVersion", "messages"), "poll response")
        if (MessageRelayJson.requireInteger(body.fields["protocolVersion"], "protocolVersion") != 1L) {
            throw MessageRelayProtocolException("protocolUnsupported", "unsupported poll response")
        }
        val messages = (body.fields["messages"] as? RelayJsonValue.ArrayValue)?.items
            ?: throw MessageRelayProtocolException("messageMalformed", "poll messages must be an array")
        if (messages.size > limit) {
            throw MessageRelayProtocolException("messageMalformed", "poll response exceeds requested limit")
        }
        return messages.map { value ->
            val envelope = MessageRelayProtocol.parseEnvelopeValue(
                MessageRelayJson.requireObject(value, "polled envelope")
            )
            requireInboundIdentity(envelope)
            envelope.canonicalJson()
        }
    }

    override fun acknowledge(messageIds: List<String>) {
        require(messageIds.size in 1..20) { "Relay acknowledgement must contain 1..20 message IDs" }
        messageIds.forEach { MessageRelayProtocol.requireIdentifier(it, "ack messageId") }
        require(messageIds.distinct().size == messageIds.size) { "Relay acknowledgement IDs must be unique" }
        val response = post(
            "/v1/phone/ack",
            MessageRelayJson.objectValue(
                "protocolVersion" to RelayJsonValue.IntegerValue(1),
                "routerId" to RelayJsonValue.StringValue(secrets.routerId),
                "phoneId" to RelayJsonValue.StringValue(secrets.phoneId),
                "streamId" to RelayJsonValue.StringValue(secrets.streamId),
                "messageIds" to RelayJsonValue.ArrayValue(
                    messageIds.map { RelayJsonValue.StringValue(it) }
                )
            )
        )
        if (response.status != 200) throw response.asException()
        val body = response.requireObject()
        MessageRelayJson.requireExactKeys(
            body,
            setOf("protocolVersion", "acknowledgedMessageIds"),
            "ack response"
        )
        if (MessageRelayJson.requireInteger(body.fields["protocolVersion"], "protocolVersion") != 1L) {
            throw MessageRelayProtocolException("protocolUnsupported", "unsupported ack response")
        }
        val acknowledged = (body.fields["acknowledgedMessageIds"] as? RelayJsonValue.ArrayValue)?.items
            ?.map { MessageRelayJson.requireString(it, "acknowledgedMessageId") }
            ?: throw MessageRelayProtocolException(
                "messageMalformed",
                "acknowledgedMessageIds must be an array"
            )
        if (acknowledged != messageIds.distinct().sorted()) {
            throw MessageRelayProtocolException("messageMalformed", "ack response does not match the request")
        }
    }

    private fun requireOutboundEnvelope(envelopeJson: String): MessageRelayEnvelope {
        val envelope = MessageRelayProtocol.parseEnvelope(envelopeJson.toByteArray(Charsets.UTF_8))
        require(envelope.canonicalJson() == envelopeJson) { "Public retry requires exact canonical envelope bytes" }
        if (envelope.direction != MessageRelayDirection.PHONE_TO_ROUTER ||
            envelope.messageClass != MessageRelayClass.COMMAND ||
            envelope.routerId != secrets.routerId || envelope.phoneId != secrets.phoneId ||
            envelope.streamId != secrets.streamId || envelope.keyId != secrets.phoneToRouterKeyId
        ) {
            throw MessageRelayProtocolException("identityMismatch", "outbound envelope identity is not provisioned")
        }
        return envelope
    }

    private fun requireInboundIdentity(envelope: MessageRelayEnvelope) {
        if (envelope.direction != MessageRelayDirection.ROUTER_TO_PHONE ||
            envelope.messageClass == MessageRelayClass.COMMAND ||
            envelope.routerId != secrets.routerId || envelope.phoneId != secrets.phoneId ||
            envelope.streamId != secrets.streamId || envelope.keyId != secrets.routerToPhoneKeyId
        ) {
            throw MessageRelayProtocolException("identityMismatch", "inbound envelope identity is not provisioned")
        }
    }

    private fun post(
        path: String,
        body: RelayJsonValue.ObjectValue,
        readTimeoutMillis: Int = 10_000,
        successResponseLimit: Int = maximumHttpBodyBytes
    ): HttpResponse {
        val bytes = MessageRelayJson.canonicalBytes(body)
        require(bytes.size <= maximumHttpBodyBytes) { "Relay request body exceeds 20 KiB" }
        val connection = connectionFactory.open(URL("$endpoint$path"))
        try {
            connection.connectTimeout = 5_000
            connection.readTimeout = readTimeoutMillis
            connection.requestMethod = "POST"
            connection.instanceFollowRedirects = false
            connection.doOutput = true
            connection.setFixedLengthStreamingMode(bytes.size)
            connection.setRequestProperty("Accept", "application/json")
            connection.setRequestProperty("Content-Type", "application/json; charset=utf-8")
            connection.setRequestProperty("Authorization", "Bearer ${secrets.phoneCredential}")
            connection.outputStream.use { output -> output.write(bytes) }
            val status = connection.responseCode
            val responseLimit = if (status in 200..299) successResponseLimit else maximumHttpBodyBytes
            val responseBytes = (if (status in 200..299) connection.inputStream else connection.errorStream)
                ?.readBounded(responseLimit)
                ?: ByteArray(0)
            return HttpResponse(
                status,
                responseBytes,
                responseLimit,
                parseRetryAfter(connection.getHeaderField("Retry-After"))
            )
        } finally {
            connection.disconnect()
        }
    }

    private data class HttpResponse(
        val status: Int,
        val bytes: ByteArray,
        val maximumBytes: Int,
        val retryAfterSeconds: Int?
    ) {
        fun requireObject(): RelayJsonValue.ObjectValue = MessageRelayJson.requireObject(
            MessageRelayJson.parse(bytes, maximumBytes),
            "relay HTTP response"
        )

        fun asException(): MessageRelayHttpException {
            val code = runCatching {
                val value = requireObject()
                MessageRelayJson.requireExactKeys(value, setOf("error"), "relay error response")
                MessageRelayJson.requireString(value.fields["error"], "error")
            }.getOrNull()
            return MessageRelayHttpException(status, code, retryAfterSeconds)
        }
    }

    private fun parseRetryAfter(value: String?): Int? {
        if (value == null || !Regex("^(?:0|[1-9][0-9]{0,2})$").matches(value)) return null
        return value.toIntOrNull()?.takeIf { it in 5..300 }
    }

    companion object {
        internal const val maximumHttpBodyBytes = 20 * 1024
        internal const val maximumPollResponseBytes = 20 * MessageRelayProtocol.maximumEnvelopeBytes + 1_024
    }
}

private fun java.io.InputStream.readBounded(maximum: Int): ByteArray {
    val output = ByteArrayOutputStream(minOf(maximum, 4096))
    val buffer = ByteArray(4096)
    while (true) {
        val count = read(buffer)
        if (count == -1) return output.toByteArray()
        if (output.size() + count > maximum) {
            throw MessageRelayProtocolException("messageTooLarge", "relay HTTP response exceeds its bound")
        }
        output.write(buffer, 0, count)
    }
}
