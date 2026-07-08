package app.sheepfold.android.router

import android.content.Context

object SheepfoldConnectionStore {
    private const val prefsName = "sheepfold-app"
    private const val apiUrlKey = "routerApiUrl"
    private const val routerNameKey = "routerName"
    private const val adminLoginKey = "administratorLogin"
    private const val deviceIdKey = "administratorDeviceId"
    private const val legacyBearerTokenKey = "administratorBearerToken"
    private const val googleAccountKey = "googleAccount"

    fun save(context: Context, request: RouterConnectionRequest) {
        context.getSharedPreferences(prefsName, Context.MODE_PRIVATE)
            .edit()
            .putString(apiUrlKey, request.apiUrl)
            .putString(routerNameKey, request.routerName)
            .putString(adminLoginKey, request.administratorLogin.orEmpty())
            .putString(deviceIdKey, request.deviceId.orEmpty())
            .remove(legacyBearerTokenKey)
            .apply()
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
        }
    }

    fun hasConnection(context: Context): Boolean = read(context)?.let { request ->
        !request.bearerToken.isNullOrBlank() && !request.deviceId.isNullOrBlank()
    } == true

    fun clear(context: Context) {
        context.getSharedPreferences(prefsName, Context.MODE_PRIVATE)
            .edit()
            .remove(apiUrlKey)
            .remove(routerNameKey)
            .remove(adminLoginKey)
            .remove(deviceIdKey)
            .remove(legacyBearerTokenKey)
            .apply()
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
