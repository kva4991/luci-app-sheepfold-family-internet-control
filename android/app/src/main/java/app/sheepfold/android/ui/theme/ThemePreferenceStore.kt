package app.sheepfold.android.ui.theme

import android.content.Context

// ============================================================
// Хранение выбора темы в SharedPreferences.
// Используем простой String-ключ, потому что DataStore
// требует coroutines и первый запуск был бы сложнее.
// Если понадобится реактивность — легко мигрировать на DataStore.
// ============================================================
object ThemePreferenceStore {
    private const val PREFS = "sheepfold-app"
    private const val KEY   = "themeMode"

    fun read(context: Context): ThemeMode {
        val raw = context
            .getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            .getString(KEY, ThemeMode.SYSTEM.name)
        // firstOrNull защищает от будущих переименований enum-значений
        return ThemeMode.entries.firstOrNull { it.name == raw } ?: ThemeMode.SYSTEM
    }

    fun save(context: Context, mode: ThemeMode) {
        context
            .getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            .edit()
            .putString(KEY, mode.name)
            .apply()
    }
}
