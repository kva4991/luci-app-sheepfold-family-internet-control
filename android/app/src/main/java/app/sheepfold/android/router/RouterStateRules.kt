package app.sheepfold.android.router

/** Не подменяет неизвестное состояние безопасным на вид значением false. */
internal fun parseGlobalBlock(value: String?): Boolean? = when (value) {
    "1" -> true
    "0" -> false
    else -> null
}
