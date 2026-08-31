package app.sheepfold.android.ui.main

import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.*
import androidx.compose.ui.res.stringResource
import app.sheepfold.android.R
import kotlin.properties.ReadWriteProperty
import kotlin.reflect.KProperty

/** Ревизия относится к исходной форме, а не к последнему фоновому чтению роутера. */
class FormDraft<T>(val original: T, val revision: String, val wifiRevision: String = "") {
    var value by mutableStateOf(original)
    val dirty get() = value != original

    fun <V> field(read: (T) -> V, write: (T, V) -> T): ReadWriteProperty<Any?, V> =
        object : ReadWriteProperty<Any?, V> {
            override fun getValue(thisRef: Any?, property: KProperty<*>) = read(value)
            override fun setValue(thisRef: Any?, property: KProperty<*>, next: V) { value = write(value, next) }
        }
}

/** Закрытие изменённого редактора не должно молча уничтожать введённое. */
@Composable
internal fun rememberDraftDismiss(dirty: Boolean, busy: Boolean, onDiscard: () -> Unit): () -> Unit {
    var confirm by remember { mutableStateOf(false) }
    if (confirm) {
        AlertDialog(
            onDismissRequest = { confirm = false },
            title = { Text(stringResource(R.string.draft_discard_title)) },
            text = { Text(stringResource(R.string.draft_discard_message)) },
            confirmButton = {
                TextButton(enabled = !busy, onClick = { confirm = false; onDiscard() }) {
                    Text(stringResource(R.string.draft_discard))
                }
            },
            dismissButton = {
                TextButton(onClick = { confirm = false }) { Text(stringResource(R.string.draft_keep_editing)) }
            }
        )
    }
    return { if (!busy) { if (dirty) confirm = true else onDiscard() } }
}
