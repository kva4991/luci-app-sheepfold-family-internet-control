package app.sheepfold.android.security

import android.content.Context
import android.os.SystemClock
import android.util.Base64
import java.security.MessageDigest
import java.security.SecureRandom
import javax.crypto.SecretKeyFactory
import javax.crypto.spec.PBEKeySpec

enum class AppProtectionMode {
    PASSWORD,
    PIN,
    BIOMETRIC,
    NONE
}

data class AppUnlockAttempt(
    val success: Boolean,
    val retryAfterSeconds: Long = 0
)

/**
 * Stores only local protection metadata. Passwords and PINs are represented by a
 * slow PBKDF2 hash with a per-installation random salt. Failed secret attempts are
 * rate-limited after the fifth failure; the counter is reset by a successful unlock,
 * protection change, or device reboot.
 */
object AppProtectionStore {
    private const val PREFS = "sheepfold-protection"
    private const val MODE = "mode"
    private const val SALT = "salt"
    private const val HASH = "hash"
    private const val HASH_VERSION = "hash_version"
    private const val FAILED_ATTEMPTS = "failed_attempts"
    private const val BACKOFF_STARTED_ELAPSED = "backoff_started_elapsed"
    private const val BACKOFF_UNTIL_ELAPSED = "backoff_until_elapsed"
    private const val RELOCK_DELAY_SECONDS = "relock_delay_seconds"
    private const val ALLOW_INSTANT_WIDGET_DISABLE = "allow_instant_widget_disable"

    private const val PBKDF2_VERSION = 2
    private const val PBKDF2_ITERATIONS = 210_000
    private const val PBKDF2_BITS = 256
    private const val DEFAULT_RELOCK_DELAY_SECONDS = 60
    private const val FIRST_BACKOFF_FAILURE = 5
    private const val FIRST_BACKOFF_SECONDS = 30L
    private const val MAX_BACKOFF_SECONDS = 300L

    val supportedRelockDelaysSeconds: List<Int> = listOf(0, 60, 300, 900)

    fun save(context: Context, mode: AppProtectionMode, secret: String?) {
        val editor = preferences(context).edit().putString(MODE, mode.name)
        if (mode == AppProtectionMode.PASSWORD || mode == AppProtectionMode.PIN) {
            require(!secret.isNullOrBlank()) { "Секрет защиты не задан" }
            val salt = ByteArray(24).also(SecureRandom()::nextBytes)
            editor
                .putString(SALT, Base64.encodeToString(salt, Base64.NO_WRAP))
                .putString(HASH, pbkdf2(salt, secret))
                .putInt(HASH_VERSION, PBKDF2_VERSION)
        } else {
            editor.remove(SALT).remove(HASH).remove(HASH_VERSION)
        }
        clearFailures(editor)
        editor.apply()
    }

    fun mode(context: Context): AppProtectionMode {
        val raw = preferences(context).getString(MODE, AppProtectionMode.NONE.name)
        // Older releases exposed Face and Fingerprint as separate choices although
        // both used the same BIOMETRIC_WEAK system prompt. Preserve those installs
        // while presenting one honest Biometric option from now on. §ownques
        return when (raw) {
            "FACE", "FINGERPRINT" -> AppProtectionMode.BIOMETRIC
            else -> AppProtectionMode.entries.firstOrNull { it.name == raw } ?: AppProtectionMode.NONE
        }
    }

    fun requiresAuthentication(context: Context): Boolean = mode(context) != AppProtectionMode.NONE

    fun usesBiometrics(context: Context): Boolean = mode(context) == AppProtectionMode.BIOMETRIC

    /** Compatibility wrapper for call sites that only need success/failure. */
    fun verify(context: Context, secret: String): Boolean = verifyWithBackoff(context, secret).success

    @Synchronized
    fun verifyWithBackoff(context: Context, secret: String): AppUnlockAttempt {
        val retryAfter = remainingBackoffSeconds(context)
        if (retryAfter > 0) return AppUnlockAttempt(false, retryAfter)

        val preferences = preferences(context)
        val salt = preferences.getString(SALT, null)?.let { Base64.decode(it, Base64.NO_WRAP) }
            ?: return failedAttempt(context)
        val expected = preferences.getString(HASH, null) ?: return failedAttempt(context)
        val version = preferences.getInt(HASH_VERSION, 1)
        val actual = if (version >= PBKDF2_VERSION) pbkdf2(salt, secret) else legacyHash(salt, secret)
        val matches = MessageDigest.isEqual(
            expected.toByteArray(Charsets.US_ASCII),
            actual.toByteArray(Charsets.US_ASCII)
        )

        if (!matches) return failedAttempt(context)

        preferences.edit().also(::clearFailures).apply()
        if (version < PBKDF2_VERSION) {
            // Upgrade a legacy SHA-256 value only after a successful verification.
            save(context, mode(context), secret)
        }
        return AppUnlockAttempt(true)
    }

    fun remainingBackoffSeconds(context: Context): Long {
        val preferences = preferences(context)
        val started = preferences.getLong(BACKOFF_STARTED_ELAPSED, 0L)
        val until = preferences.getLong(BACKOFF_UNTIL_ELAPSED, 0L)
        val now = SystemClock.elapsedRealtime()

        // elapsedRealtime resets after reboot. Treat a lower current value as a new
        // boot and clear the old lockout instead of denying access indefinitely.
        if (started <= 0L || until <= started || now < started || now >= until) {
            if (started != 0L || until != 0L) {
                preferences.edit()
                    .remove(BACKOFF_STARTED_ELAPSED)
                    .remove(BACKOFF_UNTIL_ELAPSED)
                    .apply()
            }
            return 0L
        }
        return ((until - now + 999L) / 1000L).coerceIn(1L, MAX_BACKOFF_SECONDS)
    }

    fun relockDelaySeconds(context: Context): Int {
        val value = preferences(context).getInt(RELOCK_DELAY_SECONDS, DEFAULT_RELOCK_DELAY_SECONDS)
        return value.takeIf { it in supportedRelockDelaysSeconds } ?: DEFAULT_RELOCK_DELAY_SECONDS
    }

    fun setRelockDelaySeconds(context: Context, seconds: Int) {
        require(seconds in supportedRelockDelaysSeconds) { "Unsupported relock delay" }
        preferences(context).edit().putInt(RELOCK_DELAY_SECONDS, seconds).apply()
    }

    fun allowInstantWidgetDisable(context: Context): Boolean =
        preferences(context).getBoolean(ALLOW_INSTANT_WIDGET_DISABLE, false)

    fun setAllowInstantWidgetDisable(context: Context, allowed: Boolean) {
        preferences(context).edit().putBoolean(ALLOW_INSTANT_WIDGET_DISABLE, allowed).apply()
    }

    private fun failedAttempt(context: Context): AppUnlockAttempt {
        val preferences = preferences(context)
        val failures = preferences.getInt(FAILED_ATTEMPTS, 0) + 1
        val editor = preferences.edit().putInt(FAILED_ATTEMPTS, failures)
        if (failures < FIRST_BACKOFF_FAILURE) {
            editor.apply()
            return AppUnlockAttempt(false)
        }

        val exponent = (failures - FIRST_BACKOFF_FAILURE).coerceAtMost(4)
        val seconds = (FIRST_BACKOFF_SECONDS shl exponent).coerceAtMost(MAX_BACKOFF_SECONDS)
        val started = SystemClock.elapsedRealtime()
        editor
            .putLong(BACKOFF_STARTED_ELAPSED, started)
            .putLong(BACKOFF_UNTIL_ELAPSED, started + seconds * 1000L)
            .apply()
        return AppUnlockAttempt(false, seconds)
    }

    private fun clearFailures(editor: android.content.SharedPreferences.Editor) {
        editor
            .remove(FAILED_ATTEMPTS)
            .remove(BACKOFF_STARTED_ELAPSED)
            .remove(BACKOFF_UNTIL_ELAPSED)
    }

    private fun preferences(context: Context) =
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

    private fun pbkdf2(salt: ByteArray, secret: String): String {
        val spec = PBEKeySpec(secret.toCharArray(), salt, PBKDF2_ITERATIONS, PBKDF2_BITS)
        return try {
            val bytes = SecretKeyFactory.getInstance("PBKDF2WithHmacSHA256").generateSecret(spec).encoded
            Base64.encodeToString(bytes, Base64.NO_WRAP)
        } finally {
            spec.clearPassword()
        }
    }

    private fun legacyHash(salt: ByteArray, secret: String): String {
        val digest = MessageDigest.getInstance("SHA-256")
        digest.update(salt)
        digest.update(secret.toByteArray(Charsets.UTF_8))
        return Base64.encodeToString(digest.digest(), Base64.NO_WRAP)
    }
}
