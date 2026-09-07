// Платформенная заглушка для изолированной проверки сессий; не Android/Keystore
package app.sheepfold.android.router
import android.content.Context
object SecureSecretStore {
    private var value: String? = null
    fun write(context: Context, secret: String?) { value = secret }
    fun read(context: Context): String? = value
    fun clear(context: Context) { value = null }
}
object RouterTlsPin {
    private var value: String? = null
    fun save(context: Context, pin: String) { value = pin }
    fun read(context: Context): String? = value
    fun clear(context: Context) { value = null }
}
object HomeRouterEndpoints { fun parse(header: String?): List<String>? = header?.split(",") }
