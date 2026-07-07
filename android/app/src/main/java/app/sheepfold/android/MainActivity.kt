package app.sheepfold.android

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.Surface
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import app.sheepfold.android.notifications.SheepfoldNotifications
import app.sheepfold.android.router.SheepfoldConnectionStore
import app.sheepfold.android.ui.main.SheepfoldMainScreen
import app.sheepfold.android.ui.setup.RouterSetupScreen
import app.sheepfold.android.ui.theme.OvcharnyaTheme
import app.sheepfold.android.ui.theme.ThemeMode
import app.sheepfold.android.ui.theme.ThemePreferenceStore

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        SheepfoldNotifications.ensureChannels(this)
        setContent {
            // SheepfoldRoot управляет темой на уровне Activity.
            // themeMode — hoisted state: меняется в SettingsScreen,
            // сразу применяется ко всему дереву без перезапуска Activity.
            SheepfoldRoot()
        }
    }
}

@Composable
private fun SheepfoldRoot() {
    val context = LocalContext.current

    // Читаем сохранённую тему при старте.
    // Используем remember чтобы не перечитывать при каждой рекомпозиции.
    var themeMode by remember { mutableStateOf(ThemePreferenceStore.read(context)) }
    var setupComplete by remember { mutableStateOf(SheepfoldConnectionStore.hasConnection(context)) }
    var connection by remember { mutableStateOf(SheepfoldConnectionStore.read(context)) }

    // OvcharnyaTheme — единственная обёртка темы.
    // Передаём themeMode снаружи, чтобы тема обновлялась реактивно.
    OvcharnyaTheme(themeMode = themeMode) {
        Surface(modifier = Modifier.fillMaxSize()) {
            if (setupComplete) {
                SheepfoldMainScreen(
                    connection = connection,
                    themeMode  = themeMode,
                    onThemeModeChange = { newMode ->
                        // Сохраняем и применяем сразу — перезапуск Activity не нужен
                        themeMode = newMode
                        ThemePreferenceStore.save(context, newMode)
                    }
                )
            } else {
                RouterSetupScreen(onSetupComplete = { request ->
                    if (request != null) {
                        SheepfoldConnectionStore.save(context, request)
                        connection = request
                    }
                    setupComplete = true
                })
            }
        }
    }
}
