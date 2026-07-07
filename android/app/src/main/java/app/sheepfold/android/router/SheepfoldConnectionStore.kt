package app.sheepfold.android.router

import android.content.Context

object SheepfoldConnectionStore {
    private const val prefsName = "sheepfold-app"
    private const val apiUrlKey = "routerApiUrl"
    private const val routerNameKey = "routerName"
    private const val adminLoginKey = "administratorLogin"
    private const val bearerTokenKey = "administratorBearerToken"
    private const val googleAccountKey = "googleAccount"

    fun save(context: Context, request: RouterConnectionRequest) {
        // Одноразовый QR-код никогда не сохраняется. После успешного /pair
        // сохраняется только выданный роутером Bearer-токен администратора.
        context.getSharedPreferences(prefsName, Context.MODE_PRIVATE)
            .edit()
            .putString(apiUrlKey, request.apiUrl)
            .putString(routerNameKey, request.routerName)
            .putString(adminLoginKey, request.administratorLogin.orEmpty())
            .putString(bearerTokenKey, request.bearerToken.orEmpty())
            .apply()
    }

    fun read(context: Context): RouterConnectionRequest? {
        val prefs = context.getSharedPreferences(prefsName, Context.MODE_PRIVATE)
        val apiUrl = prefs.getString(apiUrlKey, "").orEmpty()
        if (apiUrl.isBlank()) {
            return null
        }

        return RouterConnectionRequest(
            apiUrl = apiUrl,
            routerName = prefs.getString(routerNameKey, "").orEmpty().ifBlank { "router" },
            administratorLogin = prefs.getString(adminLoginKey, "").orEmpty().ifBlank { null }
        ).also { request ->
            request.bearerToken = prefs.getString(bearerTokenKey, "")
                .orEmpty()
                .ifBlank { null }
        }
    }

    fun hasConnection(context: Context): Boolean = read(context) != null

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
