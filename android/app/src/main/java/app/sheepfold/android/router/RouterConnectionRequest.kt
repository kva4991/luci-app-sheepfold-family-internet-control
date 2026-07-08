package app.sheepfold.android.router

/**
 * Данные подключения к Sheepfold API.
 *
 * Одноразовый pairing code используется только до успешного сопряжения.
 * Постоянный Bearer и проверенный deviceId хранятся через extension-свойства
 * PairingSessionToken.kt и затем сохраняются SheepfoldConnectionStore.
 */
data class RouterConnectionRequest(
    val apiUrl: String,
    val routerName: String,
    val temporaryPassword: String? = null,
    val administratorLogin: String? = null
)
