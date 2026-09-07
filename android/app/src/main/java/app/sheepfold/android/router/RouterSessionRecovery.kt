package app.sheepfold.android.router

import android.content.Context
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.asSharedFlow

enum class RouterPairingLoss {
    ACCESS_REVOKED,
    TOKEN_REJECTED,
    TLS_IDENTITY_CHANGED
}

class RouterSessionException(
    val reason: RouterPairingLoss,
    val errorCode: String,
    message: String,
    cause: Throwable? = null
) : IllegalStateException(message, cause)

/** Отличает окончательную потерю доверия от временной недоступности роутера. §authrs1 */
object RouterSessionFailure {
    private val rejectedTokenCodes = setOf(
        "auth_required",
        "invalid_token",
        "token_invalid",
        "token_expired",
        "token_revoked"
    )
    private val revokedDeviceCodes = setOf(
        "device_unbound",
        "administrator_device_unbound",
        "administrator_device_revoked"
    )

    fun fromHttp(
        statusCode: Int,
        errorCode: String
    ): RouterSessionException? {
        val normalizedCode = errorCode.trim().lowercase()
        // Другой MAC сети запрещает запрос, но не делает прежний токен отозванным
        if (normalizedCode == "device_source_mismatch") return null
        val reason = when {
            normalizedCode in revokedDeviceCodes -> RouterPairingLoss.ACCESS_REVOKED
            statusCode == 401 || normalizedCode in rejectedTokenCodes -> RouterPairingLoss.TOKEN_REJECTED
            else -> return null
        }
        val message = when (reason) {
            RouterPairingLoss.ACCESS_REVOKED ->
                "Доступ отозван на роутере. Выполните привязку заново."
            RouterPairingLoss.TOKEN_REJECTED ->
                "Сохранённая привязка к роутеру больше не действует. Выполните привязку заново."
            RouterPairingLoss.TLS_IDENTITY_CHANGED -> error("Недостижимая ветка")
        }
        return RouterSessionException(reason, normalizedCode, message)
    }

    fun fromThrowable(error: Throwable?): RouterSessionException? {
        if (error is RouterSessionException) return error
        val tlsIdentityChanged = generateSequence(error) { it.cause }
            .mapNotNull { it.message }
            .any { message ->
                message.contains("публичный ключ роутера не совпадает", ignoreCase = true) ||
                    message.contains("сертификат роутера не совпадает", ignoreCase = true)
            }
        if (!tlsIdentityChanged) return null
        return RouterSessionException(
            reason = RouterPairingLoss.TLS_IDENTITY_CHANGED,
            errorCode = "tls_identity_changed",
            message = "HTTPS-отпечаток роутера изменился. Соединение остановлено; выполните явную привязку заново.",
            cause = error
        )
    }
}

/** Передаёт потерю привязки любым экраном в единый корневой навигатор приложения. */
object RouterSessionEvents {
    private val mutableEvents = MutableSharedFlow<RouterPairingLoss>(extraBufferCapacity = 1)
    val events = mutableEvents.asSharedFlow()

    @Synchronized
    fun report(context: Context, failure: RouterSessionException, expected: RouterConnectionRequest) {
        // Запоздалый ответ старого запроса не должен стереть новую привязку
        // Проверка и очистка атомарны относительно save; дубль ошибки ничего не меняет
        if (!SheepfoldConnectionStore.clearForPairingIfCurrent(context, expected, failure.reason)) return
        mutableEvents.tryEmit(failure.reason)
    }
}
