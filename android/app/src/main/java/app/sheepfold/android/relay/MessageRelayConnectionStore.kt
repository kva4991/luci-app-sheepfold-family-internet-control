package app.sheepfold.android.relay

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.AtomicFile
import java.io.ByteArrayInputStream
import java.io.ByteArrayOutputStream
import java.io.DataInputStream
import java.io.DataOutputStream
import java.io.InputStream
import java.net.URI
import java.nio.file.Files
import java.security.KeyStore
import java.util.Locale
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

internal data class MessageRelaySettings(
    val enabled: Boolean = false,
    val baseUrl: String = ""
) {
    fun permitsPublicNetwork(): Boolean = enabled && baseUrl.isNotBlank() &&
        runCatching { MessageRelayEndpoint.requirePublicHttpsBaseUrl(baseUrl) }.isSuccess
}

internal data class MessageRelaySecrets(
    val stateGeneration: String,
    val routerId: String,
    val phoneId: String,
    val streamId: String,
    val phoneCredential: String,
    val phoneToRouterKeyId: String,
    val phoneToRouterKey: ByteArray,
    val routerToPhoneKeyId: String,
    val routerToPhoneKey: ByteArray
) {
    fun outboundKeyRecord(): MessageRelayKeyRecord = MessageRelayKeyRecord(
        phoneToRouterKeyId,
        streamId,
        MessageRelayDirection.PHONE_TO_ROUTER,
        phoneToRouterKey.copyOf()
    )

    fun inboundKeyRecord(): MessageRelayKeyRecord = MessageRelayKeyRecord(
        routerToPhoneKeyId,
        streamId,
        MessageRelayDirection.ROUTER_TO_PHONE,
        routerToPhoneKey.copyOf()
    )

    fun validated(): MessageRelaySecrets = apply {
        MessageRelayProtocol.requireIdentifier(stateGeneration, "stateGeneration")
        MessageRelayProtocol.requireIdentifier(routerId, "routerId")
        MessageRelayProtocol.requireIdentifier(phoneId, "phoneId")
        MessageRelayProtocol.requireIdentifier(streamId, "streamId")
        MessageRelayProtocol.requireIdentifier(phoneToRouterKeyId, "phoneToRouter keyId")
        MessageRelayProtocol.requireIdentifier(routerToPhoneKeyId, "routerToPhone keyId")
        MessageRelayProtocol.decodeBase64Url(phoneCredential, "phone credential", 32)
        require(phoneToRouterKey.size == 32 && routerToPhoneKey.size == 32) {
            "Relay content keys must contain exactly 32 bytes"
        }
        require(phoneToRouterKeyId != routerToPhoneKeyId) {
            "Relay directions must use distinct key IDs"
        }
        require(!phoneToRouterKey.contentEquals(routerToPhoneKey)) {
            "Relay directions must use independent content keys"
        }
    }

    override fun equals(other: Any?): Boolean = other is MessageRelaySecrets &&
        stateGeneration == other.stateGeneration && routerId == other.routerId &&
        phoneId == other.phoneId && streamId == other.streamId &&
        phoneCredential == other.phoneCredential && phoneToRouterKeyId == other.phoneToRouterKeyId &&
        phoneToRouterKey.contentEquals(other.phoneToRouterKey) &&
        routerToPhoneKeyId == other.routerToPhoneKeyId &&
        routerToPhoneKey.contentEquals(other.routerToPhoneKey)

    override fun hashCode(): Int = listOf(
        stateGeneration.hashCode(), routerId.hashCode(), phoneId.hashCode(), streamId.hashCode(),
        phoneCredential.hashCode(), phoneToRouterKeyId.hashCode(), phoneToRouterKey.contentHashCode(),
        routerToPhoneKeyId.hashCode(), routerToPhoneKey.contentHashCode()
    ).fold(1) { result, value -> 31 * result + value }

    override fun toString(): String = "MessageRelaySecrets([redacted])"
}

internal object MessageRelayEndpoint {
    private val dnsNamePattern = Regex(
        "^(?=.{1,253}$)(?:[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?\\.)+" +
            "[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?$"
    )

    fun requirePublicHttpsBaseUrl(value: String): URI {
        val uri = runCatching { URI(value) }.getOrElse {
            throw IllegalArgumentException("Relay base URL is invalid")
        }
        require(uri.scheme.equals("https", ignoreCase = true)) { "Relay requires public HTTPS" }
        require(uri.rawUserInfo == null && uri.rawQuery == null && uri.rawFragment == null) {
            "Relay URL cannot contain credentials, query or fragment"
        }
        require(uri.port == -1 || uri.port == 443) { "Relay URL must use HTTPS port 443" }
        require(uri.rawPath.isNullOrEmpty() || uri.rawPath == "/") { "Relay URL cannot contain a path" }
        val host = uri.host ?: ""
        val numericAddress = host.contains(':') || host.split('.').let { labels ->
            labels.size >= 2 && labels.all { label -> label.isNotEmpty() && label.all(Char::isDigit) }
        }
        require(!numericAddress && dnsNamePattern.matches(host)) {
            "Relay URL requires a DNS hostname, not an IP literal"
        }
        return URI("https", null, host.lowercase(Locale.ROOT), -1, null, null, null)
    }
}

internal object MessageRelayConnectionStore {
    private const val preferencesName = "sheepfold-message-relay-settings-v1"
    private const val enabledKey = "enabled"
    private const val baseUrlKey = "base_url"

    fun read(context: Context): MessageRelaySettings {
        val preferences = context.getSharedPreferences(preferencesName, Context.MODE_PRIVATE)
        return MessageRelaySettings(
            enabled = preferences.getBoolean(enabledKey, false),
            baseUrl = preferences.getString(baseUrlKey, "") ?: ""
        )
    }

    internal fun write(context: Context, settings: MessageRelaySettings) {
        if (settings.enabled) MessageRelayEndpoint.requirePublicHttpsBaseUrl(settings.baseUrl)
        context.getSharedPreferences(preferencesName, Context.MODE_PRIVATE).edit()
            .putBoolean(enabledKey, settings.enabled)
            .putString(baseUrlKey, settings.baseUrl.trim())
            .commit()
    }

    fun clear(context: Context) {
        context.getSharedPreferences(preferencesName, Context.MODE_PRIVATE).edit().clear().commit()
        MessageRelaySecureStore.clear(context)
    }
}

internal object MessageRelaySecureStore {
    private const val keyAlias = "sheepfold-message-relay-secrets-v1"
    private const val directoryName = "message-relay"
    private const val fileName = "relay-bundle-v1.bin"
    private val encryptedMagic = "SFMR1E3".toByteArray(Charsets.US_ASCII)
    private val plaintextMagic = "SFMR1S3".toByteArray(Charsets.US_ASCII)
    private const val maximumBundleBytes = 620_000
    private val lock = Any()

    fun write(context: Context, secrets: MessageRelaySecrets) {
        val validated = secrets.validated()
        val existing = synchronized(lock) { readBundle(context) }
        if (existing != null) {
            require(existing.secrets == validated) {
                "Relay secrets cannot be replaced in place; clear and provision fresh keys"
            }
            MessageRelayStateStore(
                ByteArrayRelayStateStorage(existing.stateBytes),
                validated.stateGeneration
            ).verifyInitialized()
            return
        }
        val stateStorage = ByteArrayRelayStateStorage()
        MessageRelayStateStore.initializeForProvisioning(stateStorage, validated.stateGeneration)
        synchronized(lock) {
            val raced = readBundle(context)
            if (raced == null) {
                writeBundle(context, RelaySecureBundle(validated, requireNotNull(stateStorage.bytes)))
            } else {
                require(raced.secrets == validated) {
                    "Relay secrets cannot be replaced in place; clear and provision fresh keys"
                }
            }
        }
    }

    fun read(context: Context): MessageRelaySecrets? {
        val bundle = synchronized(lock) { readBundle(context) } ?: return null
        MessageRelayStateStore(
            ByteArrayRelayStateStorage(bundle.stateBytes),
            bundle.secrets.stateGeneration
        ).verifyInitialized()
        return bundle.secrets
    }

    internal fun readStateBytes(context: Context): ByteArray? = synchronized(lock) {
        readBundle(context)?.stateBytes?.copyOf()
    }

    internal fun writeStateBytes(context: Context, stateBytes: ByteArray) {
        require(stateBytes.size <= MessageRelayStateStore.maximumStateBytes) {
            "Relay state exceeds its bound"
        }
        val bundle = synchronized(lock) { readBundle(context) }
            ?: throw IllegalStateException("Relay bundle is missing; provisioning must be repeated")
        MessageRelayStateStore(
            ByteArrayRelayStateStorage(stateBytes),
            bundle.secrets.stateGeneration
        ).verifyInitialized()
        synchronized(lock) {
            val current = readBundle(context)
                ?: throw IllegalStateException("Relay bundle disappeared during a state update")
            require(current.secrets == bundle.secrets && current.stateBytes.contentEquals(bundle.stateBytes)) {
                "Relay bundle changed concurrently"
            }
            writeBundle(context, current.copy(stateBytes = stateBytes.copyOf()))
        }
    }

    private fun writeBundle(context: Context, bundle: RelaySecureBundle) {
        val cipher = Cipher.getInstance("AES/GCM/NoPadding")
        cipher.init(Cipher.ENCRYPT_MODE, getOrCreateKey())
        val ciphertext = cipher.doFinal(encodeBundle(bundle))
        val container = ByteArrayOutputStream().use { bytes ->
            DataOutputStream(bytes).use { output ->
                output.write(encryptedMagic)
                output.writeInt(cipher.iv.size)
                output.write(cipher.iv)
                output.writeInt(ciphertext.size)
                output.write(ciphertext)
            }
            bytes.toByteArray()
        }
        require(container.size <= maximumBundleBytes) { "Relay encrypted bundle is unexpectedly large" }
        val file = atomicFile(context)
        val output = file.startWrite()
        try {
            output.write(container)
            file.finishWrite(output)
        } catch (error: Throwable) {
            file.failWrite(output)
            throw error
        }
    }

    private fun readBundle(context: Context): RelaySecureBundle? {
        val file = atomicFile(context)
        if (!file.baseFile.isFile) return null
        val container = file.openRead().use { it.readAtMost(maximumBundleBytes) }
        val plaintext = DataInputStream(ByteArrayInputStream(container)).use { input ->
            require(input.readExactly(encryptedMagic.size).contentEquals(encryptedMagic)) {
                "Relay secret blob marker is invalid"
            }
            val iv = input.readBoundedBytes(12, 12, "relay secret IV")
            val ciphertext = input.readBoundedBytes(17, maximumBundleBytes, "relay bundle ciphertext")
            require(input.available() == 0) { "Relay encrypted bundle has trailing data" }
            val cipher = Cipher.getInstance("AES/GCM/NoPadding")
            cipher.init(Cipher.DECRYPT_MODE, getOrCreateKey(), GCMParameterSpec(128, iv))
            cipher.doFinal(ciphertext)
        }
        return decodeBundle(plaintext)
    }

    fun clear(context: Context) {
        synchronized(lock) {
            atomicFile(context).delete()
            val keyStore = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
            if (keyStore.containsAlias(keyAlias)) keyStore.deleteEntry(keyAlias)
        }
    }

    private fun atomicFile(context: Context): AtomicFile {
        val root = context.noBackupFilesDir
        val directory = root.resolve(directoryName)
        if (directory.exists()) {
            require(!Files.isSymbolicLink(directory.toPath())) { "Relay secret directory cannot be a symlink" }
        } else {
            require(directory.mkdir()) { "Cannot create relay secret directory" }
        }
        require(directory.canonicalFile.parentFile == root.canonicalFile) {
            "Relay secret directory escaped app storage"
        }
        return AtomicFile(directory.resolve(fileName))
    }

    private fun getOrCreateKey(): SecretKey {
        val keyStore = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
        (keyStore.getKey(keyAlias, null) as? SecretKey)?.let { return it }
        val generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore")
        generator.init(
            KeyGenParameterSpec.Builder(
                keyAlias,
                KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT
            )
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .setRandomizedEncryptionRequired(true)
                .build()
        )
        return generator.generateKey()
    }

    private fun encodeBundle(bundle: RelaySecureBundle): ByteArray = ByteArrayOutputStream().use { bytes ->
        DataOutputStream(bytes).use { output ->
            output.write(plaintextMagic)
            output.writeBoundedString(bundle.secrets.stateGeneration)
            output.writeBoundedString(bundle.secrets.routerId)
            output.writeBoundedString(bundle.secrets.phoneId)
            output.writeBoundedString(bundle.secrets.streamId)
            output.writeBoundedString(bundle.secrets.phoneCredential)
            output.writeBoundedString(bundle.secrets.phoneToRouterKeyId)
            output.writeBoundedBytes(bundle.secrets.phoneToRouterKey)
            output.writeBoundedString(bundle.secrets.routerToPhoneKeyId)
            output.writeBoundedBytes(bundle.secrets.routerToPhoneKey)
            output.writeBoundedBytes(bundle.stateBytes)
        }
        bytes.toByteArray()
    }

    private fun decodeBundle(bytes: ByteArray): RelaySecureBundle =
        DataInputStream(ByteArrayInputStream(bytes)).use { input ->
            require(input.readExactly(plaintextMagic.size).contentEquals(plaintextMagic)) {
                "Relay secret plaintext marker is invalid"
            }
            val secrets = MessageRelaySecrets(
                stateGeneration = input.readBoundedString(64, "stateGeneration"),
                routerId = input.readBoundedString(64, "routerId"),
                phoneId = input.readBoundedString(64, "phoneId"),
                streamId = input.readBoundedString(64, "streamId"),
                phoneCredential = input.readBoundedString(128, "phone credential"),
                phoneToRouterKeyId = input.readBoundedString(64, "phoneToRouter keyId"),
                phoneToRouterKey = input.readBoundedBytes(32, 32, "phoneToRouter key"),
                routerToPhoneKeyId = input.readBoundedString(64, "routerToPhone keyId"),
                routerToPhoneKey = input.readBoundedBytes(32, 32, "routerToPhone key")
            )
            val stateBytes = input.readBoundedBytes(
                1,
                MessageRelayStateStore.maximumStateBytes,
                "relay durable state"
            )
            require(input.available() == 0) { "Relay bundle plaintext has trailing data" }
            RelaySecureBundle(secrets.validated(), stateBytes)
        }

    private data class RelaySecureBundle(
        val secrets: MessageRelaySecrets,
        val stateBytes: ByteArray
    )
}

private class ByteArrayRelayStateStorage(
    var bytes: ByteArray? = null
) : MessageRelayStateStorage {
    override fun read(): ByteArray? = bytes?.copyOf()

    override fun write(bytes: ByteArray) {
        this.bytes = bytes.copyOf()
    }
}

private fun DataOutputStream.writeBoundedString(value: String) {
    writeBoundedBytes(value.toByteArray(Charsets.UTF_8))
}

private fun DataOutputStream.writeBoundedBytes(value: ByteArray) {
    writeInt(value.size)
    write(value)
}

private fun DataInputStream.readBoundedString(maximum: Int, label: String): String =
    String(readBoundedBytes(1, maximum, label), Charsets.UTF_8)

private fun DataInputStream.readBoundedBytes(minimum: Int, maximum: Int, label: String): ByteArray {
    val size = readInt()
    require(size in minimum..maximum && size <= available()) { "$label size is invalid" }
    return readExactly(size)
}

private fun DataInputStream.readExactly(size: Int): ByteArray = ByteArray(size).also(::readFully)

private fun InputStream.readAtMost(maximum: Int): ByteArray {
    val output = ByteArrayOutputStream(minOf(maximum, 4096))
    val buffer = ByteArray(1024)
    var total = 0
    while (true) {
        val count = read(buffer)
        if (count == -1) return output.toByteArray()
        total += count
        require(total <= maximum) { "Relay encrypted bundle exceeds its bound" }
        output.write(buffer, 0, count)
    }
}
