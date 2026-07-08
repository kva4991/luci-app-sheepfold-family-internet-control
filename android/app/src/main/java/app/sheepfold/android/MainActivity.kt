package app.sheepfold.android

import android.Manifest
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.compose.setContent
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.Surface
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.core.content.ContextCompat
import app.sheepfold.android.notifications.SheepfoldNotifications
import app.sheepfold.android.router.SheepfoldConnectionStore
import app.sheepfold.android.security.AppProtectionStore
import app.sheepfold.android.ui.main.OperationalMainScreen
import app.sheepfold.android.ui.security.AppUnlockScreen
import app.sheepfold.android.ui.setup.SafeRouterSetupScreen
import app.sheepfold.android.ui.theme.SheepfoldTheme
import app.sheepfold.android.ui.theme.ThemePreferenceStore

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        SheepfoldNotifications.ensureChannels(this)
        setContent { SheepfoldRoot() }
    }
}

@Composable
private fun SheepfoldRoot() {
    val context = LocalContext.current
    var themeMode by remember { mutableStateOf(ThemePreferenceStore.read(context)) }
    var setupComplete by remember { mutableStateOf(SheepfoldConnectionStore.hasConnection(context)) }
    var connection by remember { mutableStateOf(SheepfoldConnectionStore.read(context)) }
    var unlocked by remember { mutableStateOf(!AppProtectionStore.requiresSecret(context)) }

    val permissionLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.RequestMultiplePermissions()
    ) {
        // Отказ от уведомлений не мешает управлению роутером.
    }
    LaunchedEffect(Unit) {
        val missing = buildList {
            if (
                Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
                ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED
            ) {
                add(Manifest.permission.POST_NOTIFICATIONS)
            }
        }
        if (missing.isNotEmpty()) permissionLauncher.launch(missing.toTypedArray())
    }

    SheepfoldTheme(themeMode = themeMode) {
        Surface(modifier = Modifier.fillMaxSize()) {
            when {
                setupComplete && connection != null && !unlocked -> {
                    AppUnlockScreen(
                        mode = AppProtectionStore.mode(context),
                        onVerify = { AppProtectionStore.verify(context, it) },
                        onUnlocked = { unlocked = true }
                    )
                }
                setupComplete && connection != null -> {
                    OperationalMainScreen(
                        connection = connection!!,
                        themeMode = themeMode,
                        onThemeModeChange = { newMode ->
                            themeMode = newMode
                            ThemePreferenceStore.save(context, newMode)
                        },
                        onDisconnect = {
                            SheepfoldConnectionStore.clear(context)
                            connection = null
                            setupComplete = false
                            unlocked = true
                        }
                    )
                }
                else -> {
                    SafeRouterSetupScreen { request ->
                        SheepfoldConnectionStore.save(context, request)
                        connection = request
                        setupComplete = true
                        unlocked = !AppProtectionStore.requiresSecret(context)
                    }
                }
            }
        }
    }
}
