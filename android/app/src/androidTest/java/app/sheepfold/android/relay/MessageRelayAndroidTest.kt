package app.sheepfold.android.relay

/*
 * Назначение: исполняет golden HMAC/AES-GCM и единый Keystore/AtomicFile bundle на Android runtime.
 * Почему instrumentation: JVM provider не моделирует AndroidKeyStore; setup/teardown очищают test-app bundle/key.
 * Green без emulator/device не доказывает API 28 OEM, Doze, TLS, сеть, rollback anchor или field provisioning. §testwhy
 */
import android.content.Context
import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertThrows
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import java.util.concurrent.CountDownLatch
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit

@RunWith(AndroidJUnit4::class)
class MessageRelayAndroidTest {
    private lateinit var context: Context

    @Before
    fun setUp() {
        context = ApplicationProvider.getApplicationContext()
        MessageRelayConnectionStore.clear(context)
    }

    @After
    fun tearDown() {
        MessageRelayConnectionStore.clear(context)
    }

    @Test
    fun goldenVectorUsesAndroidAesGcmProvider() {
        val metadata = MessageRelayMetadata(
            MessageRelayDirection.PHONE_TO_ROUTER,
            MessageRelayClass.COMMAND,
            "EREREREREREREREREREREQ",
            "IiIiIiIiIiIiIiIiIiIiIg",
            "MzMzMzMzMzMzMzMzMzMzMw",
            "RERERERERERERERERERERA",
            7,
            1_787_421_000,
            1_787_421_120,
            "VVVVVVVVVVVVVVVVVVVVVQ"
        )
        val key = MessageRelayKeyRecord(
            metadata.keyId,
            metadata.streamId,
            metadata.direction,
            "000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f"
                .chunked(2).map { it.toInt(16).toByte() }.toByteArray()
        )
        assertEquals(
            "3dNGI31fgGnPmDKyCPQgaMOeE0N4leR3aPF_Nq4y3pYM90ZDmXf4ruj1KOmh-kNeT8ZCSWjNY89Dlh-DHmVSRWhhdqLJrYEaQcffJxdwyHmVS_um6UCpQfUfSgi_VI9KUN56dnO3B9olK6JWN0zQ4ND6WDfsWht5s1OT0I_liUYa__U_tfthSdV8Df8-mFxMWogMIBihgy3EZqNpFxSUg7mYyQxGF4UNnB0jS-fmVVxsxHsGG0co7RXRw383t_swX6AoAwAC7BHV9Tcr",
            MessageRelayProtocol.encrypt(
                metadata,
                MessageRelayPayload.globalInternetSet(false),
                key
            ).ciphertext
        )
    }

    @Test
    fun secretsAndStateShareOneEncryptedFailClosedBundle() {
        val secrets = androidSecrets()
        MessageRelaySecureStore.write(context, secrets)
        val directory = context.noBackupFilesDir.resolve("message-relay")
        val bundle = directory.resolve("relay-bundle-v1.bin")
        assertTrue(bundle.isFile)
        assertFalse(directory.resolve("state-v1.bin").exists())
        val bytes = bundle.readBytes()
        assertFalse(bytes.containsSubsequence(secrets.phoneCredential.toByteArray()))
        assertFalse(bytes.containsSubsequence(secrets.phoneToRouterKey))
        assertEquals(secrets, MessageRelaySecureStore.read(context))

        val state = MessageRelayStateStore(
            AndroidMessageRelayStateStorage(context),
            secrets.stateGeneration
        )
        assertEquals(1L, state.reserveOutboundSequence(secrets.outboundKeyRecord()))
        assertEquals(
            2L,
            MessageRelayStateStore(
                AndroidMessageRelayStateStorage(context),
                secrets.stateGeneration
            ).reserveOutboundSequence(secrets.outboundKeyRecord())
        )

        bundle.delete()
        assertNull(MessageRelaySecureStore.read(context))
        assertThrows(IllegalStateException::class.java) { state.verifyInitialized() }
    }

    @Test
    fun secureReadAndStateMutationDoNotInvertLocks() {
        val secrets = androidSecrets()
        MessageRelaySecureStore.write(context, secrets)
        val state = MessageRelayStateStore(
            AndroidMessageRelayStateStorage(context),
            secrets.stateGeneration
        )
        val start = CountDownLatch(1)
        val executor = Executors.newFixedThreadPool(2)
        try {
            val reads = executor.submit {
                start.await()
                repeat(8) { assertEquals(secrets, MessageRelaySecureStore.read(context)) }
            }
            val writes = executor.submit {
                start.await()
                repeat(8) { state.reserveOutboundSequence(secrets.outboundKeyRecord()) }
            }
            start.countDown()
            reads.get(15, TimeUnit.SECONDS)
            writes.get(15, TimeUnit.SECONDS)
        } finally {
            executor.shutdownNow()
        }
    }
}

private fun androidSecrets(): MessageRelaySecrets = MessageRelaySecrets(
    stateGeneration = androidId(90),
    routerId = androidId(17),
    phoneId = androidId(34),
    streamId = androidId(51),
    phoneCredential = MessageRelayProtocol.encodeBase64Url(ByteArray(32) { 0x66 }),
    phoneToRouterKeyId = androidId(68),
    phoneToRouterKey = ByteArray(32) { it.toByte() },
    routerToPhoneKeyId = androidId(85),
    routerToPhoneKey = ByteArray(32) { (it + 32).toByte() }
)

private fun androidId(value: Int): String =
    MessageRelayProtocol.encodeBase64Url(ByteArray(16) { value.toByte() })

private fun ByteArray.containsSubsequence(needle: ByteArray): Boolean {
    if (needle.isEmpty() || needle.size > size) return false
    return indices.any { offset ->
        offset + needle.size <= size && needle.indices.all { index -> this[offset + index] == needle[index] }
    }
}
