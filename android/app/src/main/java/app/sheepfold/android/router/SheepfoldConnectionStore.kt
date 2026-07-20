package app.sheepfold.android.router

import android.content.Context

object SheepfoldConnectionStore {
    private const val prefsName = "sheepfold-app"
    private const val apiUrlKey = "routerApiUrl"
    private const val routerNameKey = "routerName"
    private const val adminLoginKey = "administratorLogin"
    private const val deviceIdKey = "administratorDeviceId"
    private const val deviceMacKey = "administratorDeviceMac"
    private const val tlsPinKey = "routerTlsPinSha256"
    private const val tlsSpkiKey = "routerTlsSpkiSha256"
    private const val legacyBearerTokenKey = "administratorBearerToken"
    private const val googleAccountKey = "googleAccount"
    private const val pairingLossKey = "routerPairingLoss"

    fun save(context: Context, request: RouterConnectionRequest) {
        context.getSharedPreferences(prefsName, Context.MODE_PRIVATE)
            .edit()
            .putString(apiUrlKey, request.apiUrl)
            .putString(routerNameKey, request.routerName)
            .putString(adminLoginKey, request.administratorLogin.orEmpty())
            .putString(deviceIdKey, request.deviceId.orEmpty())
            .putString(deviceMacKey, request.deviceMac.orEmpty())
            .putString(tlsPinKey, request.tlsPinSha256.orEmpty())
            .putString(tlsSpkiKey, request.tlsSpkiSha256.orEmpty())
            .remove(legacyBearerTokenKey)
            .remove(pairingLossKey)
            .apply()
        request.tlsPinSha256?.let { RouterTlsPin.save(context, it) }
        SecureSecretStore.write(context, request.bearerToken)
    }

    fun read(context: Context): RouterConnectionRequest? {
        val preferences = context.getSharedPreferences(prefsName, Context.MODE_PRIVATE)
        val apiUrl = preferences.getString(apiUrlKey, "").orEmpty()
        if (apiUrl.isBlank()) return null

        val legacyToken = preferences.getString(legacyBearerTokenKey, "").orEmpty()
        if (legacyToken.isNotBlank()) {
            SecureSecretStore.write(context, legacyToken)
            preferences.edit().remove(legacyBearerTokenKey).apply()
        }

        return RouterConnectionRequest(
            apiUrl = apiUrl,
            routerName = preferences.getString(routerNameKey, "").orEmpty().ifBlank { "router" },
            administratorLogin = preferences.getString(adminLoginKey, "").orEmpty().ifBlank { null }
        ).also { request ->
            request.bearerToken = SecureSecretStore.read(context)
            request.deviceId = preferences.getString(deviceIdKey, "").orEmpty().ifBlank { null }
            request.deviceMac = preferences.getString(deviceMacKey, "").orEmpty().ifBlank { null }
            request.tlsPinSha256 = preferences.getString(tlsPinKey, "")
                .orEmpty()
                .ifBlank { RouterTlsPin.read(context) }
            request.tlsSpkiSha256 = preferences.getString(tlsSpkiKey, "").orEmpty().ifBlank { null }
        }
    }

    fun hasConnection(context: Context): Boolean = read(context)?.let { request ->
        !request.bearerToken.isNullOrBlank() &&
            !request.deviceId.isNullOrBlank() &&
            !request.deviceMac.isNullOrBlank()
    } == true

    fun updateApiUrl(context: Context, apiUrl: String) {
        context.getSharedPreferences(prefsName, Context.MODE_PRIVATE)
            .edit()
            .putString(apiUrlKey, apiUrl)
            .apply()
    }

    fun clear(context: Context) {
        clearConnection(context)
        context.getSharedPreferences(prefsName, Context.MODE_PRIVATE)
            .edit()
            .remove(pairingLossKey)
            .apply()
    }

    /** Стирает только роутерную сессию; соглашение и защита приложения живут отдельно. §authrs1 */
    fun clearForPairing(context: Context, reason: RouterPairingLoss) {
        clearConnection(context)
        context.getSharedPreferences(prefsName, Context.MODE_PRIVATE)
            .edit()
            .putString(pairingLossKey, reason.name)
            .apply()
    }

    fun consumePairingLoss(context: Context): RouterPairingLoss? {
        val preferences = context.getSharedPreferences(prefsName, Context.MODE_PRIVATE)
        val reason = preferences.getString(pairingLossKey, null)
            ?.let { stored -> RouterPairingLoss.entries.firstOrNull { it.name == stored } }
        preferences.edit().remove(pairingLossKey).apply()
        return reason
    }

    private fun clearConnection(context: Context) {
        context.getSharedPreferences(prefsName, Context.MODE_PRIVATE)
            .edit()
            .remove(apiUrlKey)
            .remove(routerNameKey)
            .remove(adminLoginKey)
            .remove(deviceIdKey)
            .remove(deviceMacKey)
            .remove(tlsPinKey)
            .remove(tlsSpkiKey)
            .remove(legacyBearerTokenKey)
            .apply()
        RouterTlsPin.clear(context)
        SecureSecretStore.clear(context)
    }

    fun saveGoogleAccount(context: Context, account: String) {
        context.getSharedPreferences(prefsName, Context.MODE_PRIVATE)
            .edit()
            .putString(googleAccountKey, account.trim())
            .apply()
    }

    fun readGoogleAccount(context: Context): String =
        context.getSharedPreferences(prefsName, Context.MODE_PRIVATE)
            .getString(googleAccountKey, "")
            .orEmpty()
}
