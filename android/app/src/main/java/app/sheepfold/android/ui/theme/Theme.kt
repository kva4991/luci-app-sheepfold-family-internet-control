package app.sheepfold.android.ui.theme

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color

// ============================================================
// Тема приложения Sheepfold.
// Поддерживает три режима: системный, светлый, тёмный.
// Все цвета берутся из токенов MaterialTheme — нигде в UI
// не должно быть Color(0xFF...) хардкода напрямую.
// ============================================================

// --- Светлая палитра ---
private val Green800  = Color(0xFF2E7D32)
private val Green100  = Color(0xFFC8E6C9)
private val Green900  = Color(0xFF1B5E20)
private val Orange800 = Color(0xFFE65100)
private val Orange100 = Color(0xFFFFCCBC)
private val Orange900 = Color(0xFFBF360C)

private val LightColors = lightColorScheme(
    primary            = Green800,
    onPrimary          = Color.White,
    primaryContainer   = Green100,
    onPrimaryContainer = Green900,
    secondary          = Orange800,
    onSecondary        = Color.White,
    secondaryContainer = Orange100,
    onSecondaryContainer = Orange900,
    background         = Color(0xFFF9FBF9),
    onBackground       = Color(0xFF1C1C1C),
    surface            = Color(0xFFFFFFFF),
    onSurface          = Color(0xFF1C1C1C),
    surfaceVariant     = Color(0xFFEEF2EE),
    onSurfaceVariant   = Color(0xFF424942),
    outline            = Color(0xFF72796F),
    error              = Color(0xFFC62828),
    onError            = Color.White,
)

// --- Тёмная палитра ---
// Инвертируем яркость: тёмный фон + светлые акценты.
// primary становится светло-зелёным, чтобы читался на тёмном фоне.
private val DarkColors = darkColorScheme(
    primary            = Color(0xFF66BB6A),
    onPrimary          = Color(0xFF003910),
    primaryContainer   = Color(0xFF1B5E20),
    onPrimaryContainer = Color(0xFFC8E6C9),
    secondary          = Color(0xFFFF8A65),
    onSecondary        = Color(0xFF3E0600),
    secondaryContainer = Color(0xFFBF360C),
    onSecondaryContainer = Color(0xFFFFCCBC),
    background         = Color(0xFF121412),
    onBackground       = Color(0xFFE2E3DE),
    surface            = Color(0xFF1A1C1A),
    onSurface          = Color(0xFFE2E3DE),
    surfaceVariant     = Color(0xFF424942),
    onSurfaceVariant   = Color(0xFFC2C9BF),
    outline            = Color(0xFF8C938A),
    error              = Color(0xFFEF9A9A),
    onError            = Color(0xFF690005),
)

// ThemeMode — enum для сохранения выбора пользователя.
// Хранится в SharedPreferences через ThemePreferenceStore.
enum class ThemeMode { SYSTEM, LIGHT, DARK }

// OvcharnyaTheme — единственная точка входа для темы.
// themeMode приходит из MainActivity, который читает его из DataStore.
// Это позволяет переключать тему без перезапуска Activity.
@Composable
fun OvcharnyaTheme(
    themeMode: ThemeMode = ThemeMode.SYSTEM,
    content: @Composable () -> Unit
) {
    // Определяем isDark один раз здесь, а не в каждом компонуемом.
    // SYSTEM — следуем ОС; LIGHT/DARK — принудительно.
    val isDark = when (themeMode) {
        ThemeMode.SYSTEM -> isSystemInDarkTheme()
        ThemeMode.LIGHT  -> false
        ThemeMode.DARK   -> true
    }
    MaterialTheme(
        colorScheme = if (isDark) DarkColors else LightColors,
        content = content
    )
}
