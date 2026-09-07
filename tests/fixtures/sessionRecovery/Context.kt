// Платформенная заглушка для изолированной проверки сессий; не Android/Keystore
package android.content
class Context {
    companion object { const val MODE_PRIVATE = 0 }
    private val stores = mutableMapOf<String, Preferences>()
    fun getSharedPreferences(name: String, mode: Int): Preferences = stores.getOrPut(name) { Preferences() }
}
class Preferences {
    private val values = mutableMapOf<String, String?>()
    fun getString(key: String, fallback: String?): String? = values.getOrDefault(key, fallback)
    fun edit() = Editor(values)
}
class Editor(private val values: MutableMap<String, String?>) {
    fun putString(key: String, value: String?): Editor { values[key] = value; return this }
    fun remove(key: String): Editor { values.remove(key); return this }
    fun apply() {}
}
