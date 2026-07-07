package app.sheepfold.android.router

import java.util.Collections
import java.util.WeakHashMap

/**
 * Bearer-токен привязан к объекту результата настройки и живёт только до его
 * сохранения в SheepfoldConnectionStore. Одноразовый pairing-код остаётся
 * отдельным полем и никогда не записывается как сессионный секрет.
 */
private val pairingTokens = Collections.synchronizedMap(
    WeakHashMap<RouterConnectionRequest, String>()
)

var RouterConnectionRequest.bearerToken: String?
    get() = pairingTokens[this]
    set(value) {
        if (value.isNullOrBlank()) pairingTokens.remove(this)
        else pairingTokens[this] = value
    }
