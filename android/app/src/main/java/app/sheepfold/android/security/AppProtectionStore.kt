package app.sheepfold.android.security

import android.content.Context
import android.util.Base64
import java.security.MessageDigest
import java.security.SecureRandom

enum class AppProtectionMode {
    PASSWORD,
    PIN,
    FACE,
    FINGERPRINT,
    NONE
}

/** Пароль и PIN сохраняются только как SHA-256 с индивидуальной случайной солью. */
object AppProtectionStore {
    private const val PREFS = "sheepfold-protection"
    private const val MODE = "mode"
    private const val SALT = "salt"
    private const val HASH = "hash"

    fun save(context: Context, mode: AppProtectionMode, secret: String?) {
        val editor = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit()
            .putString(MODE, mode.name)
        if (mode == AppProtectionMode.PASSWORD || mode == AppProtectionMode.PIN) {
            require(!secret.isNullOrBlank()) { "Секрет защиты не задан" }
            val salt = ByteArray(24).also(SecureRandom()::nextBytes)
            editor
                .putString(SALT, Base64.encodeToString(salt, Base64.NO_WRAP))
                .putString(HASH, hash(salt, secret))
        } else {
            editor.remove(SALT).remove(HASH)
        }
        editor.apply()
    }

    fun mode(context: Context): AppProtectionMode {
        val raw = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            .getString(MODE, AppProtectionMode.NONE.name)
        return AppProtectionMode.entries.firstOrNull { it.name == raw } ?: AppProtectionMode.NONE
    }

    fun requiresSecret(context: Context): Boolean = when (mode(context)) {
        AppProtectionMode.PASSWORD,
        AppProtectionMode.PIN -> true
        else -> false
    }

    fun verify(context: Context, secret: String): Boolean {
        val preferences = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        val salt = preferences.getString(SALT, null)?.let { Base64.decode(it, Base64.NO_WRAP) } ?: return false
        val expected = preferences.getString(HASH, null) ?: return false
        return MessageDigest.isEqual(
            expected.toByteArray(Charsets.US_ASCII),
            hash(salt, secret).toByteArray(Charsets.US_ASCII)
        )
    }

    private fun hash(salt: ByteArray, secret: String): String {
        val digest = MessageDigest.getInstance("SHA-256")
        digest.update(salt)
        digest.update(secret.toByteArray(Charsets.UTF_8))
        return Base64.encodeToString(digest.digest(), Base64.NO_WRAP)
    }
}
