package app.sheepfold.android.router

/**
 * Данные подключения к Sheepfold API.
 *
 * Одноразовый pairing code используется только до успешного сопряжения.
 * Постоянный Bearer и проверенный deviceId хранятся через extension-свойства
 * PairingSessionToken.kt и затем сохраняются SheepfoldConnectionStore.
 *
 * Это намеренно не data class. Секреты привязаны к экземпляру через WeakHashMap:
 * структурно равные data class считались одним ключом, и сборщик памяти мог удалить
 * TLS-отпечаток и токен у ещё используемого подключения при повторном входе. §authrs1
 */
class RouterConnectionRequest(
    val apiUrl: String,
    val routerName: String,
    val temporaryPassword: String? = null,
    val administratorLogin: String? = null
)
