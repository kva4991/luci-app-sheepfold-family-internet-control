package app.sheepfold.android.security

import android.content.Context
import android.util.Base64
import java.security.MessageDigest
import java.security.SecureRandom
import javax.crypto.SecretKeyFactory
import javax.crypto.spec.PBEKeySpec

enum class AppProtectionMode {
    PASSWORD,
    PIN,
    FACE,
    FINGERPRINT,
    NONE
}

/** Пароль и PIN сохраняются как медленный PBKDF2-хеш с индивидуальной случайной солью. */
object AppProtectionStore {
    private const val PREFS = "sheepfold-protection"
    private const val MODE = "mode"
    private const val SALT = "salt"
    private const val HASH = "hash"
    private const val HASH_VERSION = "hash_version"
    private const val PBKDF2_VERSION = 2
    private const val PBKDF2_ITERATIONS = 210_000
    private const val PBKDF2_BITS = 256

    fun save(context: Context, mode: AppProtectionMode, secret: String?) {
        val editor = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit()
            .putString(MODE, mode.name)
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
        editor.apply()
    }

    fun mode(context: Context): AppProtectionMode {
        val raw = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            .getString(MODE, AppProtectionMode.NONE.name)
        return AppProtectionMode.entries.firstOrNull { it.name == raw } ?: AppProtectionMode.NONE
    }

    fun requiresAuthentication(context: Context): Boolean = mode(context) != AppProtectionMode.NONE

    fun usesBiometrics(context: Context): Boolean = when (mode(context)) {
        AppProtectionMode.FACE,
        AppProtectionMode.FINGERPRINT -> true
        else -> false
    }

    fun verify(context: Context, secret: String): Boolean {
        val preferences = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        val salt = preferences.getString(SALT, null)?.let { Base64.decode(it, Base64.NO_WRAP) } ?: return false
        val expected = preferences.getString(HASH, null) ?: return false
        val version = preferences.getInt(HASH_VERSION, 1)
        val actual = if (version >= PBKDF2_VERSION) pbkdf2(salt, secret) else legacyHash(salt, secret)
        val matches = MessageDigest.isEqual(
            expected.toByteArray(Charsets.US_ASCII),
            actual.toByteArray(Charsets.US_ASCII)
        )
        if (matches && version < PBKDF2_VERSION) {
            // Старый SHA-256 обновляется только после успешной проверки, поэтому пароль
            // пользователя не требуется хранить или запрашивать отдельно при миграции.
            save(context, mode(context), secret)
        }
        return matches
    }

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
