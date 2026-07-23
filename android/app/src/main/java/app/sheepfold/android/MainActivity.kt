package app.sheepfold.android

import android.Manifest
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import android.os.SystemClock
import androidx.activity.compose.setContent
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.core.content.ContextCompat
import androidx.fragment.app.FragmentActivity
import app.sheepfold.android.diagnostics.DiagnosticLog
import app.sheepfold.android.notifications.AccessRequestWorker
import app.sheepfold.android.notifications.SheepfoldNotifications
import app.sheepfold.android.router.RouterAdminClient
import app.sheepfold.android.router.RouterPairingLoss
import app.sheepfold.android.router.RouterSessionEvents
import app.sheepfold.android.router.SheepfoldConnectionStore
import app.sheepfold.android.security.AppProtectionStore
import app.sheepfold.android.ui.main.OperationalMainScreen
import app.sheepfold.android.ui.security.AppUnlockScreen
import app.sheepfold.android.ui.setup.SafeRouterSetupScreen
import app.sheepfold.android.ui.theme.SheepfoldTheme
import app.sheepfold.android.ui.theme.ThemePreferenceStore
import app.sheepfold.android.widget.SheepfoldWidgetRenderer
import app.sheepfold.android.widget.WidgetCommand
import app.sheepfold.android.widget.WidgetCommandIntent
import kotlinx.coroutines.launch

class MainActivity : FragmentActivity() {
    private var forceLockToken by mutableIntStateOf(0)
    private var pendingWidgetCommand by mutableStateOf<WidgetCommand?>(null)
    private var backgroundedAtElapsed = 0L

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        DiagnosticLog.initialize(this)
        SheepfoldNotifications.ensureChannels(this)
        AccessRequestWorker.schedule(this)
        acceptWidgetIntent(intent)
        setContent {
            SheepfoldRoot(
                forceLockToken = forceLockToken,
                pendingWidgetCommand = pendingWidgetCommand,
                onWidgetCommandConsumed = { pendingWidgetCommand = null },
                onLockNow = { forceLockToken += 1 }
            )
        }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        acceptWidgetIntent(intent)
    }

    override fun onStop() {
        if (!isChangingConfigurations && AppProtectionStore.requiresAuthentication(this)) {
            val delaySeconds = AppProtectionStore.relockDelaySeconds(this)
            if (delaySeconds == 0) {
                backgroundedAtElapsed = 0L
                forceLockToken += 1
            } else {
                backgroundedAtElapsed = SystemClock.elapsedRealtime()
            }
        }
        super.onStop()
    }

    override fun onStart() {
        super.onStart()
        val backgroundedAt = backgroundedAtElapsed
        if (backgroundedAt <= 0L || !AppProtectionStore.requiresAuthentication(this)) return
        backgroundedAtElapsed = 0L
        val elapsed = SystemClock.elapsedRealtime() - backgroundedAt
        val delayMillis = AppProtectionStore.relockDelaySeconds(this) * 1_000L
        if (elapsed >= delayMillis) forceLockToken += 1
    }

    private fun acceptWidgetIntent(intent: Intent?) {
        val command = WidgetCommandIntent.take(intent) ?: return
        pendingWidgetCommand = command
        // A disabling widget command is a new administrative action. Even if an
        // existing activity instance was unlocked, require the configured local
        // protection again before showing the confirmation dialog. §ownques
        if (AppProtectionStore.requiresAuthentication(this)) forceLockToken += 1
    }
}

@Composable
private fun SheepfoldRoot(
    forceLockToken: Int,
    pendingWidgetCommand: WidgetCommand?,
    onWidgetCommandConsumed: () -> Unit,
    onLockNow: () -> Unit
) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    var themeMode by remember { mutableStateOf(ThemePreferenceStore.read(context)) }
    var setupComplete by remember { mutableStateOf(SheepfoldConnectionStore.hasConnection(context)) }
    var connection by remember { mutableStateOf(SheepfoldConnectionStore.read(context)) }
    var unlocked by remember { mutableStateOf(!AppProtectionStore.requiresAuthentication(context)) }
    var pairingLoss by remember { mutableStateOf(SheepfoldConnectionStore.consumePairingLoss(context)) }
    var widgetCommandBusy by remember(pendingWidgetCommand) { mutableStateOf(false) }
    var widgetCommandError by remember(pendingWidgetCommand) { mutableStateOf<String?>(null) }
    val pairingMessage = pairingLoss?.let { reason ->
        context.getString(
            when (reason) {
                RouterPairingLoss.ACCESS_REVOKED -> R.string.pairing_access_revoked
                RouterPairingLoss.TOKEN_REJECTED -> R.string.pairing_token_rejected
                RouterPairingLoss.TLS_IDENTITY_CHANGED -> R.string.pairing_tls_identity_changed
            }
        )
    }

    LaunchedEffect(forceLockToken) {
        if (forceLockToken > 0 && AppProtectionStore.requiresAuthentication(context)) unlocked = false
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
            Box(modifier = Modifier.fillMaxSize()) {
                when {
                    pairingLoss != null && !unlocked -> {
                        AppUnlockScreen(
                            mode = AppProtectionStore.mode(context),
                            onVerify = { AppProtectionStore.verifyWithBackoff(context, it) },
                            onUnlocked = { unlocked = true }
                        )
                    }
                    setupComplete && connection != null && !unlocked -> {
                        AppUnlockScreen(
                            mode = AppProtectionStore.mode(context),
                            onVerify = { AppProtectionStore.verifyWithBackoff(context, it) },
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
                            onLockNow = {
                                if (AppProtectionStore.requiresAuthentication(context)) {
                                    unlocked = false
                                    onLockNow()
                                }
                            },
                            onDisconnect = {
                                SheepfoldConnectionStore.clear(context)
                                connection = null
                                setupComplete = false
                                pairingLoss = null
                                unlocked = true
                                onWidgetCommandConsumed()
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
                            // The user has just completed setup or an explicit repair.
                            unlocked = true
                        }
                    }
                }

                if (
                    pendingWidgetCommand == WidgetCommand.DISABLE_INTERNET &&
                    unlocked && setupComplete && connection != null
                ) {
                    AlertDialog(
                        onDismissRequest = {
                            if (!widgetCommandBusy) onWidgetCommandConsumed()
                        },
                        title = { Text(stringResource(R.string.widget_disable_confirmation_title)) },
                        text = {
                            if (widgetCommandBusy) {
                                CircularProgressIndicator()
                            } else {
                                Text(
                                    widgetCommandError
                                        ?: stringResource(R.string.widget_disable_confirmation_body)
                                )
                            }
                        },
                        confirmButton = {
                            Button(
                                enabled = !widgetCommandBusy,
                                onClick = {
                                    widgetCommandBusy = true
                                    widgetCommandError = null
                                    val activeConnection = connection ?: return@Button
                                    scope.launch {
                                        runCatching {
                                            RouterAdminClient(activeConnection, context).setGlobalBlock(true)
                                        }.onSuccess {
                                            SheepfoldWidgetRenderer.storeState(context, true)
                                            SheepfoldWidgetRenderer.updateAllWidgets(context)
                                            onWidgetCommandConsumed()
                                        }.onFailure {
                                            widgetCommandError = it.message
                                                ?: context.getString(R.string.widget_disable_failed)
                                        }
                                        widgetCommandBusy = false
                                    }
                                }
                            ) {
                                Text(stringResource(R.string.widget_disable_confirm_action))
                            }
                        },
                        dismissButton = {
                            TextButton(
                                enabled = !widgetCommandBusy,
                                onClick = onWidgetCommandConsumed
                            ) {
                                Text(stringResource(R.string.action_cancel))
                            }
                        }
                    )
                }
            }
        }
    }
}

/** On Android 13+ the camera is no longer needed after successful pairing. */
private fun revokeCameraPermissionAfterPairing(context: Context) {
    if (
        Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
        ContextCompat.checkSelfPermission(context, Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED
    ) {
        context.revokeSelfPermissionOnKill(Manifest.permission.CAMERA)
    }
}
