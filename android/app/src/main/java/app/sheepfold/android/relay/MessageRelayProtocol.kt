package app.sheepfold.android.relay

import java.nio.ByteBuffer
import java.security.GeneralSecurityException
import java.security.MessageDigest
import java.security.SecureRandom
import java.util.Base64
import javax.crypto.Cipher
import javax.crypto.Mac
import javax.crypto.spec.GCMParameterSpec
import javax.crypto.spec.SecretKeySpec

class MessageRelayProtocolException(
    val code: String,
    detail: String
) : IllegalArgumentException(if (detail.isBlank()) code else "$code: $detail")

enum class MessageRelayDirection(val wireValue: String, internal val code: Byte) {
    PHONE_TO_ROUTER("phoneToRouter", 1),
    ROUTER_TO_PHONE("routerToPhone", 2);

    companion object {
        internal fun parse(value: String): MessageRelayDirection = entries.firstOrNull { it.wireValue == value }
            ?: throw MessageRelayProtocolException("messageMalformed", "direction is invalid")
    }
}

enum class MessageRelayClass(val wireValue: String, internal val code: Byte) {
    COMMAND("command", 1),
    COMMAND_RESULT("commandResult", 2),
    NOTIFICATION("notification", 3);

    companion object {
        internal fun parse(value: String): MessageRelayClass = entries.firstOrNull { it.wireValue == value }
            ?: throw MessageRelayProtocolException("messageMalformed", "messageClass is invalid")
    }
}

data class MessageRelayMetadata(
    val direction: MessageRelayDirection,
    val messageClass: MessageRelayClass,
    val routerId: String,
    val phoneId: String,
    val streamId: String,
    val messageId: String,
    val sequence: Long,
    val issuedAt: Long,
    val expiresAt: Long,
    val keyId: String
)

data class MessageRelayKeyRecord(
    val keyId: String,
    val streamId: String,
    val direction: MessageRelayDirection,
    val keyBytes: ByteArray
) {
    override fun equals(other: Any?): Boolean = other is MessageRelayKeyRecord &&
        keyId == other.keyId && streamId == other.streamId && direction == other.direction &&
        keyBytes.contentEquals(other.keyBytes)

    override fun hashCode(): Int = 31 * (31 * (31 * keyId.hashCode() + streamId.hashCode()) +
        direction.hashCode()) + keyBytes.contentHashCode()
}

data class MessageRelayEnvelope(
    val protocolVersion: Int,
    val cryptoSuite: String,
    val direction: MessageRelayDirection,
    val messageClass: MessageRelayClass,
    val routerId: String,
    val phoneId: String,
    val streamId: String,
    val messageId: String,
    val sequence: Long,
    val issuedAt: Long,
    val expiresAt: Long,
    val keyId: String,
    val ciphertext: String
) {
    fun canonicalJson(): String = MessageRelayJson.canonical(toJsonValue())

    internal fun toJsonValue(): RelayJsonValue.ObjectValue = MessageRelayJson.objectValue(
        "protocolVersion" to RelayJsonValue.IntegerValue(protocolVersion.toLong()),
        "cryptoSuite" to RelayJsonValue.StringValue(cryptoSuite),
        "direction" to RelayJsonValue.StringValue(direction.wireValue),
        "messageClass" to RelayJsonValue.StringValue(messageClass.wireValue),
        "routerId" to RelayJsonValue.StringValue(routerId),
        "phoneId" to RelayJsonValue.StringValue(phoneId),
        "streamId" to RelayJsonValue.StringValue(streamId),
        "messageId" to RelayJsonValue.StringValue(messageId),
        "sequence" to RelayJsonValue.IntegerValue(sequence),
        "issuedAt" to RelayJsonValue.IntegerValue(issuedAt),
        "expiresAt" to RelayJsonValue.IntegerValue(expiresAt),
        "keyId" to RelayJsonValue.StringValue(keyId),
        "ciphertext" to RelayJsonValue.StringValue(ciphertext)
    )

    fun metadata(): MessageRelayMetadata = MessageRelayMetadata(
        direction = direction,
        messageClass = messageClass,
        routerId = routerId,
        phoneId = phoneId,
        streamId = streamId,
        messageId = messageId,
        sequence = sequence,
        issuedAt = issuedAt,
        expiresAt = expiresAt,
        keyId = keyId
    )
}

class MessageRelayPayload internal constructor(internal val json: RelayJsonValue.ObjectValue) {
    val messageType: MessageRelayClass
        get() = MessageRelayClass.parse(MessageRelayJson.requireString(json.fields["messageType"], "messageType"))
    val action: String?
        get() = json.nullableString("action")
    val actionHash: String?
        get() = json.nullableString("actionHash")
    val requestMessageId: String?
        get() = json.nullableString("requestMessageId")

    fun bodyBoolean(field: String): Boolean = MessageRelayJson.requireBoolean(body().fields[field], field)
    fun bodyLong(field: String): Long = MessageRelayJson.requireInteger(body().fields[field], field, Long.MIN_VALUE)
    fun bodyString(field: String): String = MessageRelayJson.requireString(body().fields[field], field)
    fun canonicalJson(): String = MessageRelayJson.canonical(json)

    internal fun body(): RelayJsonValue.ObjectValue = MessageRelayJson.requireObject(
        json.fields.getValue("body"),
        "message body"
    )

    companion object {
        fun globalInternetSet(internetEnabled: Boolean): MessageRelayPayload {
            val body = MessageRelayJson.objectValue(
                "internetEnabled" to RelayJsonValue.BooleanValue(internetEnabled)
            )
            return command("globalInternetSet", body)
        }

        fun temporaryAccessGrant(deviceMac: String, grantUntil: Long): MessageRelayPayload {
            val body = MessageRelayJson.objectValue(
                "deviceMac" to RelayJsonValue.StringValue(deviceMac),
                "grantUntil" to RelayJsonValue.IntegerValue(grantUntil)
            )
            return command("temporaryAccessGrant", body)
        }

        private fun command(action: String, body: RelayJsonValue.ObjectValue): MessageRelayPayload {
            val actionHash = MessageRelayProtocol.buildActionHash(action, body)
            return MessageRelayPayload(
                MessageRelayJson.objectValue(
                    "schemaVersion" to RelayJsonValue.IntegerValue(1),
                    "messageType" to RelayJsonValue.StringValue(MessageRelayClass.COMMAND.wireValue),
                    "action" to RelayJsonValue.StringValue(action),
                    "actionHash" to RelayJsonValue.StringValue(actionHash),
                    "requestMessageId" to RelayJsonValue.NullValue,
                    "body" to body
                )
            )
        }
    }
}

object MessageRelayProtocol {
    const val protocolVersion = 1
    const val cryptoSuite = "HMAC-SHA256+AES-256-GCM"
    const val maximumEnvelopeBytes = 16 * 1024
    const val maximumPlaintextBytes = 8 * 1024
    const val commandTtlSeconds = 120L
    const val commandResultTtlSeconds = 24L * 60L * 60L
    const val notificationTtlSeconds = 24L * 60L * 60L
    const val clockSkewSeconds = 60L
    private const val temporaryAccessMaximumSeconds = 24L * 60L * 60L
    private val identifierPattern = Regex("^[A-Za-z0-9_-]{22}$")
    private val base64UrlPattern = Regex("^[A-Za-z0-9_-]+$")
    private val commandActions = setOf("globalInternetSet", "temporaryAccessGrant")
    private val payloadKeys = setOf(
        "schemaVersion", "messageType", "action", "actionHash", "requestMessageId", "body"
    )
    private val envelopeKeys = setOf(
        "protocolVersion", "cryptoSuite", "direction", "messageClass", "routerId", "phoneId",
        "streamId", "messageId", "sequence", "issuedAt", "expiresAt", "keyId", "ciphertext"
    )
    private val actionHashContext = "SFMR1/actionHash\u0000".toByteArray(Charsets.US_ASCII)
    private val aadContext = "SheepfoldFamilyMessageRelay\u0000".toByteArray(Charsets.US_ASCII)
    private val messageKeyContext = "SheepfoldFamilyMessageRelay/subkey\u0000".toByteArray(Charsets.US_ASCII)
    private val random = SecureRandom()

    fun randomIdentifier(): String = encodeBase64Url(ByteArray(16).also(random::nextBytes))

    internal fun buildActionHash(action: String, body: RelayJsonValue.ObjectValue): String {
        val actionBody = MessageRelayJson.objectValue(
            "action" to RelayJsonValue.StringValue(action),
            "body" to body
        )
        val digest = MessageDigest.getInstance("SHA-256")
        digest.update(actionHashContext)
        digest.update(MessageRelayJson.canonicalBytes(actionBody))
        return encodeBase64Url(digest.digest())
    }

    fun encrypt(
        metadata: MessageRelayMetadata,
        payload: MessageRelayPayload,
        keyRecord: MessageRelayKeyRecord
    ): MessageRelayEnvelope {
        val plaintext = MessageRelayJson.canonicalBytes(payload.json)
        if (plaintext.isEmpty() || plaintext.size > maximumPlaintextBytes) {
            throw MessageRelayProtocolException("messageMalformed", "plaintext size is outside the allowed range")
        }
        val unsignedEnvelope = metadata.toEnvelope("")
        validateEnvelope(unsignedEnvelope, now = null, validateCiphertext = false)
        val directionMasterKey = validateKeyRecord(keyRecord, unsignedEnvelope)
        validatePayload(payload.json, unsignedEnvelope, metadata.issuedAt)
        val cipher = Cipher.getInstance("AES/GCM/NoPadding")
        cipher.init(
            Cipher.ENCRYPT_MODE,
            SecretKeySpec(deriveEnvelopeMessageKey(directionMasterKey, unsignedEnvelope), "AES"),
            GCMParameterSpec(128, buildIv(metadata.sequence))
        )
        cipher.updateAAD(buildAad(unsignedEnvelope))
        val envelope = metadata.toEnvelope(encodeBase64Url(cipher.doFinal(plaintext)))
        validateEnvelope(envelope, now = null, validateCiphertext = true)
        return envelope
    }

    fun decrypt(
        envelope: MessageRelayEnvelope,
        keyRecord: MessageRelayKeyRecord,
        now: Long
    ): MessageRelayPayload {
        validateEnvelope(envelope, now = now, validateCiphertext = true)
        val directionMasterKey = validateKeyRecord(keyRecord, envelope)
        val cipher = Cipher.getInstance("AES/GCM/NoPadding")
        cipher.init(
            Cipher.DECRYPT_MODE,
            SecretKeySpec(deriveEnvelopeMessageKey(directionMasterKey, envelope), "AES"),
            GCMParameterSpec(128, buildIv(envelope.sequence))
        )
        cipher.updateAAD(buildAad(envelope))
        val plaintext = try {
            cipher.doFinal(decodeBase64Url(envelope.ciphertext, "ciphertext"))
        } catch (_: GeneralSecurityException) {
            throw MessageRelayProtocolException(
                "authenticationFailed",
                "ciphertext or authenticated metadata was changed"
            )
        }
        return MessageRelayPayload(validatePayload(parsePayload(plaintext), envelope, now))
    }

    fun parseEnvelope(bytes: ByteArray, now: Long? = null): MessageRelayEnvelope {
        if (bytes.isEmpty() || bytes.size > maximumEnvelopeBytes) {
            throw MessageRelayProtocolException("messageTooLarge", "encoded envelope exceeds the limit")
        }
        val value = MessageRelayJson.requireObject(
            MessageRelayJson.parse(bytes, maximumEnvelopeBytes),
            "relay envelope"
        )
        return parseEnvelopeValue(value, now, bytes.size)
    }

    internal fun parseEnvelopeValue(
        value: RelayJsonValue.ObjectValue,
        now: Long? = null,
        encodedBytes: Int = MessageRelayJson.canonicalBytes(value).size
    ): MessageRelayEnvelope {
        MessageRelayJson.requireExactKeys(value, envelopeKeys, "relay envelope")
        val parsedProtocolVersion = MessageRelayJson.requireInteger(
            value.fields["protocolVersion"],
            "protocolVersion"
        )
        if (parsedProtocolVersion != protocolVersion.toLong()) {
            throw MessageRelayProtocolException("protocolUnsupported", "unsupported major version")
        }
        val envelope = MessageRelayEnvelope(
            protocolVersion = parsedProtocolVersion.toInt(),
            cryptoSuite = MessageRelayJson.requireString(value.fields["cryptoSuite"], "cryptoSuite"),
            direction = MessageRelayDirection.parse(MessageRelayJson.requireString(value.fields["direction"], "direction")),
            messageClass = MessageRelayClass.parse(MessageRelayJson.requireString(value.fields["messageClass"], "messageClass")),
            routerId = MessageRelayJson.requireString(value.fields["routerId"], "routerId"),
            phoneId = MessageRelayJson.requireString(value.fields["phoneId"], "phoneId"),
            streamId = MessageRelayJson.requireString(value.fields["streamId"], "streamId"),
            messageId = MessageRelayJson.requireString(value.fields["messageId"], "messageId"),
            sequence = MessageRelayJson.requireInteger(value.fields["sequence"], "sequence", 1),
            issuedAt = MessageRelayJson.requireInteger(value.fields["issuedAt"], "issuedAt"),
            expiresAt = MessageRelayJson.requireInteger(value.fields["expiresAt"], "expiresAt"),
            keyId = MessageRelayJson.requireString(value.fields["keyId"], "keyId"),
            ciphertext = MessageRelayJson.requireString(value.fields["ciphertext"], "ciphertext")
        )
        validateEnvelope(envelope, now, validateCiphertext = true, encodedBytes = encodedBytes)
        return envelope
    }

    internal fun parsePayload(bytes: ByteArray): RelayJsonValue.ObjectValue = MessageRelayJson.requireObject(
        MessageRelayJson.parse(bytes, maximumPlaintextBytes),
        "message payload"
    )

    internal fun canonicalJson(value: RelayJsonValue): String = MessageRelayJson.canonical(value)

    private fun validateEnvelope(
        envelope: MessageRelayEnvelope,
        now: Long?,
        validateCiphertext: Boolean,
        encodedBytes: Int = envelope.canonicalJson().toByteArray(Charsets.UTF_8).size
    ) {
        if (envelope.protocolVersion != protocolVersion) {
            throw MessageRelayProtocolException("protocolUnsupported", "unsupported major version")
        }
        if (envelope.cryptoSuite != cryptoSuite) {
            throw MessageRelayProtocolException("protocolUnsupported", "unsupported crypto suite")
        }
        if (envelope.messageClass == MessageRelayClass.COMMAND &&
            envelope.direction != MessageRelayDirection.PHONE_TO_ROUTER
        ) {
            throw MessageRelayProtocolException("messageMalformed", "commands only travel from phone to router")
        }
        if (envelope.messageClass != MessageRelayClass.COMMAND &&
            envelope.direction != MessageRelayDirection.ROUTER_TO_PHONE
        ) {
            throw MessageRelayProtocolException(
                "messageMalformed",
                "results and notifications only travel from router to phone"
            )
        }
        listOf(
            "routerId" to envelope.routerId,
            "phoneId" to envelope.phoneId,
            "streamId" to envelope.streamId,
            "messageId" to envelope.messageId,
            "keyId" to envelope.keyId
        ).forEach { (label, value) -> requireIdentifier(value, label) }
        MessageRelayJson.requireSafeInteger(envelope.sequence, "sequence", 1)
        MessageRelayJson.requireSafeInteger(envelope.issuedAt, "issuedAt")
        MessageRelayJson.requireSafeInteger(envelope.expiresAt, "expiresAt")
        if (envelope.expiresAt <= envelope.issuedAt) {
            throw MessageRelayProtocolException("messageMalformed", "message lifetime is empty")
        }
        val maximumLifetime = when (envelope.messageClass) {
            MessageRelayClass.COMMAND -> commandTtlSeconds
            MessageRelayClass.COMMAND_RESULT -> commandResultTtlSeconds
            MessageRelayClass.NOTIFICATION -> notificationTtlSeconds
        }
        if (envelope.expiresAt - envelope.issuedAt > maximumLifetime) {
            throw MessageRelayProtocolException("messageMalformed", "message lifetime is too long")
        }
        if (validateCiphertext) {
            val encrypted = decodeBase64Url(envelope.ciphertext, "ciphertext")
            if (encrypted.size !in 17..(maximumPlaintextBytes + 16)) {
                throw MessageRelayProtocolException(
                    "messageMalformed",
                    "ciphertext size is outside the allowed range"
                )
            }
        }
        if (encodedBytes !in 1..maximumEnvelopeBytes) {
            throw MessageRelayProtocolException("messageTooLarge", "encoded envelope exceeds the limit")
        }
        if (now != null) {
            MessageRelayJson.requireSafeInteger(now, "now")
            if (envelope.issuedAt > now + clockSkewSeconds) {
                throw MessageRelayProtocolException("messageNotYetValid", "issuedAt is in the future")
            }
            if (envelope.expiresAt <= now) {
                throw MessageRelayProtocolException("messageExpired", "message lifetime has ended")
            }
        }
    }

    private fun validatePayload(
        value: RelayJsonValue.ObjectValue,
        envelope: MessageRelayEnvelope?,
        now: Long?
    ): RelayJsonValue.ObjectValue {
        MessageRelayJson.requireExactKeys(value, payloadKeys, "message payload")
        if (MessageRelayJson.requireInteger(value.fields["schemaVersion"], "schemaVersion") != 1L) {
            throw MessageRelayProtocolException("protocolUnsupported", "unsupported payload schema")
        }
        val messageType = MessageRelayClass.parse(
            MessageRelayJson.requireString(value.fields["messageType"], "messageType")
        )
        if (envelope != null && messageType != envelope.messageClass) {
            throw MessageRelayProtocolException("messageMalformed", "payload type does not match envelope class")
        }
        val body = MessageRelayJson.requireObject(value.fields.getValue("body"), "message body")
        when (messageType) {
            MessageRelayClass.COMMAND -> validateCommand(value, body, envelope, now)
            MessageRelayClass.COMMAND_RESULT -> validateCommandResult(value, body)
            MessageRelayClass.NOTIFICATION -> validateNotification(value, body)
        }
        return value
    }

    private fun validateCommand(
        value: RelayJsonValue.ObjectValue,
        body: RelayJsonValue.ObjectValue,
        envelope: MessageRelayEnvelope?,
        now: Long?
    ) {
        val action = MessageRelayJson.requireString(value.fields["action"], "action")
        if (action !in commandActions) {
            throw MessageRelayProtocolException("actionUnsupported", "command is not allowlisted")
        }
        if (value.fields["requestMessageId"] != RelayJsonValue.NullValue) {
            throw MessageRelayProtocolException("messageMalformed", "command cannot reference another message")
        }
        val actionHash = MessageRelayJson.requireString(value.fields["actionHash"], "actionHash")
        decodeBase64Url(actionHash, "actionHash", 32)
        when (action) {
            "globalInternetSet" -> {
                MessageRelayJson.requireExactKeys(body, setOf("internetEnabled"), "globalInternetSet body")
                MessageRelayJson.requireBoolean(body.fields["internetEnabled"], "internetEnabled")
            }
            "temporaryAccessGrant" -> {
                MessageRelayJson.requireExactKeys(
                    body,
                    setOf("deviceMac", "grantUntil"),
                    "temporaryAccessGrant body"
                )
                val deviceMac = MessageRelayJson.requireString(body.fields["deviceMac"], "deviceMac")
                if (!Regex("^([0-9A-F]{2}:){5}[0-9A-F]{2}$").matches(deviceMac)) {
                    throw MessageRelayProtocolException(
                        "messageMalformed",
                        "deviceMac must use canonical uppercase notation"
                    )
                }
                val grantUntil = MessageRelayJson.requireInteger(body.fields["grantUntil"], "grantUntil", 1)
                if (envelope != null) {
                    val checkedNow = now ?: throw MessageRelayProtocolException("messageMalformed", "now is required")
                    if (grantUntil <= envelope.issuedAt) {
                        throw MessageRelayProtocolException(
                            "messageMalformed",
                            "temporary access deadline must follow envelope issuance"
                        )
                    }
                    if (grantUntil <= checkedNow) {
                        throw MessageRelayProtocolException("messageExpired", "temporary access deadline has passed")
                    }
                    if (grantUntil - envelope.issuedAt > temporaryAccessMaximumSeconds) {
                        throw MessageRelayProtocolException(
                            "messageMalformed",
                            "temporary access deadline exceeds one day"
                        )
                    }
                }
            }
        }
        if (buildActionHash(action, body) != actionHash) {
            throw MessageRelayProtocolException("actionHashMismatch", "command body differs from actionHash")
        }
    }

    private fun validateCommandResult(
        value: RelayJsonValue.ObjectValue,
        body: RelayJsonValue.ObjectValue
    ) {
        val action = MessageRelayJson.requireString(value.fields["action"], "action")
        if (action !in commandActions) {
            throw MessageRelayProtocolException("actionUnsupported", "result action is not allowlisted")
        }
        requireIdentifier(MessageRelayJson.requireString(value.fields["requestMessageId"], "requestMessageId"), "requestMessageId")
        decodeBase64Url(MessageRelayJson.requireString(value.fields["actionHash"], "actionHash"), "actionHash", 32)
        MessageRelayJson.requireExactKeys(body, setOf("status", "errorCode", "completedAt"), "commandResult body")
        val status = MessageRelayJson.requireString(body.fields["status"], "status")
        val errorCode = body.nullableString("errorCode")
        val allowed = mapOf(
            "executed" to setOf<String?>(null),
            "rejected" to setOf(
                "actionRejected", "administratorDeviceUnbound", "clockInvalid", "deviceBlocked",
                "deviceNotFound", "deviceQuarantined"
            ),
            "expired" to setOf("commandExpired"),
            "indeterminate" to setOf("stateIndeterminate")
        )
        if (allowed[status]?.contains(errorCode) != true) {
            throw MessageRelayProtocolException("messageMalformed", "result status and errorCode do not match")
        }
        MessageRelayJson.requireInteger(body.fields["completedAt"], "completedAt")
    }

    private fun validateNotification(value: RelayJsonValue.ObjectValue, body: RelayJsonValue.ObjectValue) {
        if (value.fields["action"] != RelayJsonValue.NullValue ||
            value.fields["actionHash"] != RelayJsonValue.NullValue ||
            value.fields["requestMessageId"] != RelayJsonValue.NullValue
        ) {
            throw MessageRelayProtocolException(
                "messageMalformed",
                "notification cannot contain command identity"
            )
        }
        MessageRelayJson.requireExactKeys(
            body,
            setOf("notificationId", "category", "title", "message", "createdAt"),
            "notification body"
        )
        requireIdentifier(MessageRelayJson.requireString(body.fields["notificationId"], "notificationId"), "notificationId")
        MessageRelayJson.requireInteger(body.fields["createdAt"], "createdAt")
        for (field in listOf("category", "title", "message")) {
            val text = MessageRelayJson.requireString(body.fields[field], field)
            val maximum = if (field == "message") 2048 else 128
            if (text.isEmpty() || text.length > maximum) {
                throw MessageRelayProtocolException("messageMalformed", "notification $field is invalid")
            }
        }
    }

    private fun validateKeyRecord(record: MessageRelayKeyRecord, envelope: MessageRelayEnvelope): ByteArray {
        requireIdentifier(record.streamId, "keyRecord streamId")
        requireIdentifier(record.keyId, "keyRecord keyId")
        if (record.direction != envelope.direction || record.streamId != envelope.streamId ||
            record.keyId != envelope.keyId
        ) {
            throw MessageRelayProtocolException(
                "keyInvalid",
                "keyRecord does not match authenticated envelope metadata"
            )
        }
        if (record.keyBytes.size != 32) {
            throw MessageRelayProtocolException("keyInvalid", "direction master key must contain 32 bytes")
        }
        return record.keyBytes.copyOf()
    }

    internal fun requireIdentifier(value: String, label: String) {
        if (!identifierPattern.matches(value)) {
            throw MessageRelayProtocolException("messageMalformed", "$label must encode exactly 128 bits")
        }
        decodeBase64Url(value, label, 16)
    }

    internal fun decodeBase64Url(value: String, label: String, expectedBytes: Int? = null): ByteArray {
        if (!base64UrlPattern.matches(value) || '=' in value) {
            throw MessageRelayProtocolException("messageMalformed", "$label is not canonical base64url")
        }
        val decoded = runCatching { Base64.getUrlDecoder().decode(value) }.getOrElse {
            throw MessageRelayProtocolException("messageMalformed", "$label is not canonical base64url")
        }
        if (encodeBase64Url(decoded) != value || expectedBytes != null && decoded.size != expectedBytes) {
            throw MessageRelayProtocolException("messageMalformed", "$label has invalid canonical length")
        }
        return decoded
    }

    internal fun encodeBase64Url(value: ByteArray): String = Base64.getUrlEncoder().withoutPadding().encodeToString(value)

    internal fun buildIv(sequence: Long): ByteArray {
        MessageRelayJson.requireSafeInteger(sequence, "sequence", 1)
        return ByteBuffer.allocate(12).putInt(0).putLong(sequence).array()
    }

    internal fun buildAad(envelope: MessageRelayEnvelope): ByteArray {
        return aadContext + buildFixedEnvelopeMetadata(envelope)
    }

    internal fun deriveEnvelopeMessageKey(
        directionMasterKey: ByteArray,
        envelope: MessageRelayEnvelope
    ): ByteArray {
        if (directionMasterKey.size != 32) {
            throw MessageRelayProtocolException("keyInvalid", "direction master key must contain 32 bytes")
        }
        val mac = Mac.getInstance("HmacSHA256")
        mac.init(SecretKeySpec(directionMasterKey, "HmacSHA256"))
        mac.update(messageKeyContext)
        mac.update(buildFixedEnvelopeMetadata(envelope))
        return mac.doFinal()
    }

    private fun buildFixedEnvelopeMetadata(envelope: MessageRelayEnvelope): ByteArray {
        validateEnvelope(envelope, now = null, validateCiphertext = false)
        val fixed = ByteBuffer.allocate(4 + 1 + 1 + (16 * 5) + (8 * 3))
            .putInt(envelope.protocolVersion)
            .put(envelope.direction.code)
            .put(envelope.messageClass.code)
        listOf(envelope.routerId, envelope.phoneId, envelope.streamId, envelope.messageId, envelope.keyId)
            .forEach { fixed.put(decodeBase64Url(it, "envelope identifier", 16)) }
        fixed.putLong(envelope.sequence).putLong(envelope.issuedAt).putLong(envelope.expiresAt)
        return fixed.array()
    }
}

private fun MessageRelayMetadata.toEnvelope(ciphertext: String): MessageRelayEnvelope = MessageRelayEnvelope(
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
    ciphertext = ciphertext
)

private fun RelayJsonValue.ObjectValue.nullableString(field: String): String? = when (val value = fields[field]) {
    RelayJsonValue.NullValue -> null
    is RelayJsonValue.StringValue -> value.value
    else -> throw MessageRelayProtocolException("messageMalformed", "$field must be a string or null")
}
