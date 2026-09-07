// Платформенная заглушка для изолированной проверки сессий; не Android/Keystore
package kotlinx.coroutines.flow
class MutableSharedFlow<T>(extraBufferCapacity: Int) { fun tryEmit(value: T) = true }
fun <T> MutableSharedFlow<T>.asSharedFlow() = this
