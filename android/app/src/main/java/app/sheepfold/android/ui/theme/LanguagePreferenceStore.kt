package app.sheepfold.android.ui.theme

import android.content.Context
import android.content.res.Configuration
import android.os.LocaleList
import java.util.Locale

enum class AppLanguage(val tag: String) {
    SYSTEM(""),
    RUSSIAN("ru"),
    ENGLISH("en")
}

/** Применяет язык приложения до того, как Compose прочитает строковые ресурсы. */
object LanguagePreferenceStore {
    private const val PREFS = "sheepfold-app"
    private const val KEY = "language"

    fun read(context: Context): AppLanguage {
        val raw = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            .getString(KEY, AppLanguage.SYSTEM.name)
        return AppLanguage.entries.firstOrNull { it.name == raw } ?: AppLanguage.SYSTEM
    }

    fun save(context: Context, language: AppLanguage) {
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            .edit()
            .putString(KEY, language.name)
            .apply()
    }

    fun wrap(base: Context): Context {
        val language = read(base)
        if (language == AppLanguage.SYSTEM) return base

        val locale = Locale.forLanguageTag(language.tag)
        val configuration = Configuration(base.resources.configuration)
        configuration.setLocales(LocaleList(locale))
        return base.createConfigurationContext(configuration)
    }
}
