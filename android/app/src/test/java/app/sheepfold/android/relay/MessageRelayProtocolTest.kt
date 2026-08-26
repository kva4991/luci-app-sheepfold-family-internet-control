package app.sheepfold.android.relay

/*
 * Назначение: доказывает byte-level совместимость Android SFMR1, KDF/AEAD и strict parser с public golden.
 * Почему JVM/golden: фиксированные bytes ловят межъязыковой drift; тесты не меняют внешнее состояние.
 * Green не доказывает AndroidKeyStore/provider на API 28, сеть, durable rollback protection или live peer. §testwhy
 */

import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertThrows
import org.junit.Test

class MessageRelayProtocolTest {
    private val goldenMetadata = MessageRelayMetadata(
        direction = MessageRelayDirection.PHONE_TO_ROUTER,
        messageClass = MessageRelayClass.COMMAND,
        routerId = "EREREREREREREREREREREQ",
        phoneId = "IiIiIiIiIiIiIiIiIiIiIg",
        streamId = "MzMzMzMzMzMzMzMzMzMzMw",
        messageId = "RERERERERERERERERERERA",
        sequence = 7,
        issuedAt = 1_787_421_000,
        expiresAt = 1_787_421_120,
        keyId = "VVVVVVVVVVVVVVVVVVVVVQ"
    )
    private val goldenKey = MessageRelayKeyRecord(
        keyId = goldenMetadata.keyId,
        streamId = goldenMetadata.streamId,
        direction = goldenMetadata.direction,
        keyBytes = hex("000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f")
    )

    @Test
    fun `golden payload aad iv and ciphertext match public model`() {
        val payload = MessageRelayPayload.globalInternetSet(false)
        assertEquals(
            "{\"action\":\"globalInternetSet\",\"actionHash\":\"eGlMcktE496xEE1LydPz8EG5yg0-JaX7vp-UEFtimVo\",\"body\":{\"internetEnabled\":false},\"messageType\":\"command\",\"requestMessageId\":null,\"schemaVersion\":1}",
            payload.canonicalJson()
        )
        val envelope = MessageRelayProtocol.encrypt(goldenMetadata, payload, goldenKey)
        assertEquals("000000000000000000000007", MessageRelayProtocol.buildIv(7).hex())
        assertEquals(
            "5368656570666f6c6446616d696c794d65737361676552656c61790000000001010111111111111111111111111111111111222222222222222222222222222222223333333333333333333333333333333344444444444444444444444444444444555555555555555555555555555555550000000000000007000000006a89e148000000006a89e1c0",
            MessageRelayProtocol.buildAad(envelope).hex()
        )
        assertEquals(
            "f102d51520fbfcca235fde4f69ceb34ff16c3e9f24fc970f23806a2a47bab99d",
            MessageRelayProtocol.deriveEnvelopeMessageKey(goldenKey.keyBytes, envelope).hex()
        )
        assertEquals(
            "3dNGI31fgGnPmDKyCPQgaMOeE0N4leR3aPF_Nq4y3pYM90ZDmXf4ruj1KOmh-kNeT8ZCSWjNY89Dlh-DHmVSRWhhdqLJrYEaQcffJxdwyHmVS_um6UCpQfUfSgi_VI9KUN56dnO3B9olK6JWN0zQ4ND6WDfsWht5s1OT0I_liUYa__U_tfthSdV8Df8-mFxMWogMIBihgy3EZqNpFxSUg7mYyQxGF4UNnB0jS-fmVVxsxHsGG0co7RXRw383t_swX6AoAwAC7BHV9Tcr",
            envelope.ciphertext
        )
        assertEquals(payload.canonicalJson(), MessageRelayProtocol.decrypt(
            envelope,
            goldenKey,
            goldenMetadata.issuedAt
        ).canonicalJson())
    }

    @Test
    fun `canonical unicode ordering matches public fixture`() {
        val value = RelayJsonValue.ObjectValue(linkedMapOf(
            "1" to RelayJsonValue.StringValue("One"),
            "€" to RelayJsonValue.StringValue("Euro Sign"),
            "\r" to RelayJsonValue.StringValue("Carriage Return"),
            "דּ" to RelayJsonValue.StringValue("Hebrew Letter Dalet With Dagesh"),
            "😀" to RelayJsonValue.StringValue("Emoji: Grinning Face"),
            "\u0080" to RelayJsonValue.StringValue("Control"),
            "ö" to RelayJsonValue.StringValue("Latin Small Letter O With Diaeresis")
        ))
        assertEquals(
            "{\"\\r\":\"Carriage Return\",\"1\":\"One\",\"\u0080\":\"Control\",\"ö\":\"Latin Small Letter O With Diaeresis\",\"€\":\"Euro Sign\",\"😀\":\"Emoji: Grinning Face\",\"דּ\":\"Hebrew Letter Dalet With Dagesh\"}",
            MessageRelayJson.canonical(value)
        )
    }

    @Test
    fun `strict parser rejects duplicates nonce tag-only and invalid unicode`() {
        assertThrows(MessageRelayProtocolException::class.java) {
            MessageRelayJson.parse("{\"a\":1,\"a\":1}".toByteArray(), 100)
        }
        val envelope = MessageRelayProtocol.encrypt(
            goldenMetadata,
            MessageRelayPayload.globalInternetSet(false),
            goldenKey
        )
        val withNonce = envelope.canonicalJson().dropLast(1) + ",\"nonce\":\"AAAAAAAAAAAAAAAA\"}"
        assertThrows(MessageRelayProtocolException::class.java) {
            MessageRelayProtocol.parseEnvelope(withNonce.toByteArray())
        }
        val wrappedVersion = envelope.canonicalJson().replace(
            "\"protocolVersion\":1",
            "\"protocolVersion\":4294967297"
        )
        assertEquals("protocolUnsupported", assertThrows(MessageRelayProtocolException::class.java) {
            MessageRelayProtocol.parseEnvelope(wrappedVersion.toByteArray())
        }.code)
        val tagOnly = envelope.copy(ciphertext = MessageRelayProtocol.encodeBase64Url(ByteArray(16)))
        assertThrows(MessageRelayProtocolException::class.java) {
            MessageRelayProtocol.parseEnvelope(tagOnly.canonicalJson().toByteArray())
        }
        assertThrows(MessageRelayProtocolException::class.java) {
            MessageRelayJson.canonical(RelayJsonValue.StringValue("\uD800"))
        }
        assertFalse(envelope.canonicalJson().contains("nonce"))
    }

    @Test
    fun `key binding and authenticated metadata are mandatory`() {
        val envelope = MessageRelayProtocol.encrypt(
            goldenMetadata,
            MessageRelayPayload.globalInternetSet(false),
            goldenKey
        )
        assertThrows(MessageRelayProtocolException::class.java) {
            MessageRelayProtocol.decrypt(
                envelope,
                goldenKey.copy(direction = MessageRelayDirection.ROUTER_TO_PHONE),
                goldenMetadata.issuedAt
            )
        }
        assertThrows(MessageRelayProtocolException::class.java) {
            MessageRelayProtocol.decrypt(
                envelope.copy(phoneId = "EREREREREREREREREREREQ"),
                goldenKey,
                goldenMetadata.issuedAt
            )
        }
        assertArrayEquals(
            ByteArray(12).also { it[11] = 1 },
            MessageRelayProtocol.buildIv(1)
        )
    }

    @Test
    fun `different message id derives a different key even when sequence is restored`() {
        val first = goldenMetadata.toEnvelopeForTest()
        val second = goldenMetadata.copy(messageId = relayId(73)).toEnvelopeForTest()
        assertFalse(
            MessageRelayProtocol.deriveEnvelopeMessageKey(goldenKey.keyBytes, first).contentEquals(
                MessageRelayProtocol.deriveEnvelopeMessageKey(goldenKey.keyBytes, second)
            )
        )
    }

    @Test
    fun `command result remains valid for bounded background delivery window`() {
        val command = MessageRelayPayload.globalInternetSet(false)
        val resultPayload = commandResultPayload(goldenMetadata.messageId, command)
        val resultMetadata = MessageRelayMetadata(
            MessageRelayDirection.ROUTER_TO_PHONE,
            MessageRelayClass.COMMAND_RESULT,
            goldenMetadata.routerId,
            goldenMetadata.phoneId,
            goldenMetadata.streamId,
            relayId(72),
            1,
            goldenMetadata.issuedAt,
            goldenMetadata.issuedAt + MessageRelayProtocol.commandResultTtlSeconds,
            goldenMetadata.keyId
        )
        val inboundKey = goldenKey.copy(direction = MessageRelayDirection.ROUTER_TO_PHONE)
        val envelope = MessageRelayProtocol.encrypt(resultMetadata, resultPayload, inboundKey)
        assertEquals(
            resultPayload.canonicalJson(),
            MessageRelayProtocol.decrypt(
                envelope,
                inboundKey,
                goldenMetadata.issuedAt + 15 * 60
            ).canonicalJson()
        )
        assertThrows(MessageRelayProtocolException::class.java) {
            MessageRelayProtocol.parseEnvelope(
                envelope.copy(expiresAt = envelope.expiresAt + 1).canonicalJson().toByteArray()
            )
        }
    }
}

private fun hex(value: String): ByteArray = value.chunked(2).map { it.toInt(16).toByte() }.toByteArray()
private fun ByteArray.hex(): String = joinToString("") { "%02x".format(it) }
private fun MessageRelayMetadata.toEnvelopeForTest(): MessageRelayEnvelope = MessageRelayEnvelope(
    protocolVersion = MessageRelayProtocol.protocolVersion,
    cryptoSuite = MessageRelayProtocol.cryptoSuite,
    direction = direction,
    messageClass = messageClass,
    routerId = routerId,
    phoneId = phoneId,
    streamId = streamId,
    messageId = messageId,
    sequence = sequence,
    issuedAt = issuedAt,
    expiresAt = expiresAt,
    keyId = keyId,
    ciphertext = ""
)
