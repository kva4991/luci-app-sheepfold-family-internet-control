package com.example.sheepfold.ui.theme

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.staticCompositionLocalOf

// ============================================================
// Тема приложения «Овчарня» — поддерживает светлый и тёмный режим
// Используем Material3 ColorScheme чтобы все компоненты автоматически
// подхватывали нужные цвета без хардкода в каждом файле.
// ============================================================

// Светлая тема
private val LightColorScheme = lightColorScheme(
    primary = Green80,
    onPrimary = OnGreen80,
    primaryContainer = GreenContainer80,
    onPrimaryContainer = OnGreenContainer80,
    secondary = Orange80,
    onSecondary = OnOrange80,
    secondaryContainer = OrangeContainer80,
    onSecondaryContainer = OnOrangeContainer80,
    background = Background80,
    surface = Surface80,
    onBackground = OnBackground80,
    onSurface = OnSurface80,
    surfaceVariant = SurfaceVariant80,
    onSurfaceVariant = OnSurfaceVariant80,
    outline = Outline80
)

// Тёмная тема — инвертированная палитра, глаза не устают ночью
private val DarkColorScheme = darkColorScheme(
    primary = Green20,
    onPrimary = OnGreen20,
    primaryContainer = GreenContainer20,
    onPrimaryContainer = OnGreenContainer20,
    secondary = Orange20,
    onSecondary = OnOrange20,
    secondaryContainer = OrangeContainer20,
    onSecondaryContainer = OnOrangeContainer20,
    background = Background20,
    surface = Surface20,
    onBackground = OnBackground20,
    onSurface = OnSurface20,
    surfaceVariant = SurfaceVariant20,
    onSurfaceVariant = OnSurfaceVariant20,
    outline = Outline20
)

// CompositionLocal для передачи пользовательского выбора темы вниз по дереву
// Значение по умолчанию false = следовать системным настройкам
val LocalForceDarkTheme = staticCompositionLocalOf { false }
val LocalForceLightTheme = staticCompositionLocalOf { false }

// ThemeMode — перечисление вариантов: авто/светлая/тёмная
// Хранится в DataStore и передаётся в OvcharnyaTheme
enum class ThemeMode { SYSTEM, LIGHT, DARK }

@Composable
fun OvcharnyaTheme(
    themeMode: ThemeMode = ThemeMode.SYSTEM,
    content: @Composable () -> Unit
) {
    // Определяем активную схему цветов в зависимости от выбора пользователя
    // SYSTEM — следуем ОС; LIGHT/DARK — принудительно
    val isDark = when (themeMode) {
        ThemeMode.SYSTEM -> isSystemInDarkTheme()
        ThemeMode.LIGHT  -> false
        ThemeMode.DARK   -> true
    }

    val colorScheme = if (isDark) DarkColorScheme else LightColorScheme

    MaterialTheme(
        colorScheme = colorScheme,
        typography = Typography,
        content = content
    )
}
