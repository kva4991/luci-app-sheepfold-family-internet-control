package app.sheepfold.android

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import androidx.activity.compose.setContent
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
import androidx.fragment.app.FragmentActivity
import app.sheepfold.android.diagnostics.DiagnosticLog
import app.sheepfold.android.notifications.SheepfoldNotifications
import app.sheepfold.android.notifications.AccessRequestWorker
import app.sheepfold.android.router.SheepfoldConnectionStore
import app.sheepfold.android.router.RouterPairingLoss
import app.sheepfold.android.router.RouterSessionEvents
import app.sheepfold.android.security.AppProtectionStore
import app.sheepfold.android.ui.main.OperationalMainScreen
import app.sheepfold.android.ui.security.AppUnlockScreen
import app.sheepfold.android.ui.setup.SafeRouterSetupScreen
import app.sheepfold.android.ui.theme.SheepfoldTheme
import app.sheepfold.android.ui.theme.ThemePreferenceStore

class MainActivity : FragmentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        DiagnosticLog.initialize(this)
        SheepfoldNotifications.ensureChannels(this)
        AccessRequestWorker.schedule(this)
        setContent { SheepfoldRoot() }
    }
}

@Composable
private fun SheepfoldRoot() {
    val context = LocalContext.current
    var themeMode by remember { mutableStateOf(ThemePreferenceStore.read(context)) }
    var setupComplete by remember { mutableStateOf(SheepfoldConnectionStore.hasConnection(context)) }
    var connection by remember { mutableStateOf(SheepfoldConnectionStore.read(context)) }
    var unlocked by remember { mutableStateOf(!AppProtectionStore.requiresAuthentication(context)) }
    var pairingLoss by remember { mutableStateOf(SheepfoldConnectionStore.consumePairingLoss(context)) }
    val pairingMessage = pairingLoss?.let { reason ->
        context.getString(
            when (reason) {
                RouterPairingLoss.ACCESS_REVOKED -> R.string.pairing_access_revoked
                RouterPairingLoss.TOKEN_REJECTED -> R.string.pairing_token_rejected
                RouterPairingLoss.TLS_IDENTITY_CHANGED -> R.string.pairing_tls_identity_changed
            }
        )
    }

    LaunchedEffect(Unit) {
        RouterSessionEvents.events.collect { reason ->
            SheepfoldConnectionStore.consumePairingLoss(context)
            pairingLoss = reason
            connection = null
            setupComplete = false
        }
    }

    SheepfoldTheme(themeMode = themeMode) {
        Surface(modifier = Modifier.fillMaxSize()) {
            when {
                pairingLoss != null && !unlocked -> {
                    AppUnlockScreen(
                        mode = AppProtectionStore.mode(context),
                        onVerify = { AppProtectionStore.verify(context, it) },
                        onUnlocked = { unlocked = true }
                    )
                }
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
                            pairingLoss = null
                            unlocked = true
                        }
                    )
                }
                else -> {
                    SafeRouterSetupScreen(
                        pairingOnly = pairingLoss != null,
                        pairingMessage = pairingMessage
                    ) { request ->
                        SheepfoldConnectionStore.save(context, request)
                        revokeCameraPermissionAfterPairing(context)
                        connection = request
                        setupComplete = true
                        pairingLoss = null
                        // Пользователь только что прошёл настройку или явную повторную
                        // привязку, поэтому сразу открываем приложение без лишнего unlock.
                        unlocked = true
                    }
                }
            }
        }
    }
}

/** На Android 13+ камера больше не нужна после успешного сопряжения. */
private fun revokeCameraPermissionAfterPairing(context: Context) {
    if (
        Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
        ContextCompat.checkSelfPermission(context, Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED
    ) {
        context.revokeSelfPermissionOnKill(Manifest.permission.CAMERA)
    }
}
