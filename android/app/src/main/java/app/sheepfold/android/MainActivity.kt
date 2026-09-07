package app.sheepfold.android

import android.Manifest
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import android.os.SystemClock
import androidx.activity.compose.setContent
import androidx.activity.viewModels
import androidx.activity.result.contract.ActivityResultContracts
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
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.core.content.ContextCompat
import androidx.lifecycle.compose.LocalLifecycleOwner
import androidx.lifecycle.compose.LifecycleResumeEffect
import androidx.lifecycle.withResumed
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
import app.sheepfold.android.ui.main.ParentWorkspace
import app.sheepfold.android.ui.security.AppUnlockScreen
import app.sheepfold.android.ui.setup.SafeRouterSetupScreen
import app.sheepfold.android.ui.setup.RouterSetupViewModel
import app.sheepfold.android.ui.setup.AgreementAcceptanceStore
import app.sheepfold.android.ui.setup.AgreementRenewalScreen
import app.sheepfold.android.ui.theme.SheepfoldTheme
import app.sheepfold.android.ui.theme.LanguagePreferenceStore
import app.sheepfold.android.ui.theme.ThemePreferenceStore
import app.sheepfold.android.widget.SheepfoldWidgetRenderer
import app.sheepfold.android.widget.WidgetCommand
import app.sheepfold.android.widget.WidgetCommandIntent
import kotlinx.coroutines.launch

class MainActivity : FragmentActivity() {
    private val appUpdates by viewModels<app.sheepfold.android.updates.ParentAppUpdateModel>()
    private val setupModel by viewModels<RouterSetupViewModel>()
    private val workspace by viewModels<ParentWorkspace>()
    private var forceLockToken by mutableIntStateOf(0)
    private var pendingWidgetCommand by mutableStateOf<WidgetCommand?>(null)
    private var backgroundedAtElapsed = 0L
    // Регистрация вне вкладки нужна и после пересоздания Activity во время системного разрешения.
    private val updatePermission = registerForActivityResult(ActivityResultContracts.StartActivityForResult()) {
        appUpdates.permissionReturned()
    }
    private val updateInstaller = registerForActivityResult(ActivityResultContracts.StartActivityForResult()) {
        appUpdates.installerReturned()
    }

    override fun attachBaseContext(newBase: Context) {
        super.attachBaseContext(LanguagePreferenceStore.wrap(newBase))
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        DiagnosticLog.initialize(this)
        SheepfoldNotifications.ensureChannels(this)
        AccessRequestWorker.schedule(this)
        acceptWidgetIntent(intent)
        setContent {
            SheepfoldRoot(
                setupModel = setupModel,
                workspace = workspace,
                appUpdates = appUpdates,
                forceLockToken = forceLockToken,
                pendingWidgetCommand = pendingWidgetCommand,
                onWidgetCommandConsumed = { pendingWidgetCommand = null },
                onLockNow = { forceLockToken += 1 },
                onUpdateLaunch = {
                    appUpdates.takeLaunch()?.let { launch ->
                        try {
                            when (launch.destination) {
                                app.sheepfold.android.updates.UpdateDestination.PERMISSION -> updatePermission.launch(launch.intent)
                                app.sheepfold.android.updates.UpdateDestination.INSTALLER -> updateInstaller.launch(launch.intent)
                            }
                        } catch (_: Exception) { appUpdates.installationFailed() }
                    }
                },
                onLanguageChanged = { recreate() }
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
    setupModel: RouterSetupViewModel,
    workspace: ParentWorkspace,
    appUpdates: app.sheepfold.android.updates.ParentAppUpdateModel,
    forceLockToken: Int,
    pendingWidgetCommand: WidgetCommand?,
    onWidgetCommandConsumed: () -> Unit,
    onLockNow: () -> Unit,
    onUpdateLaunch: () -> Unit,
    onLanguageChanged: () -> Unit
) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    // Одно чтение сохраняет идентичность объекта вместе с его токеном и TLS-отпечатком. §authrs1
    val storedConnection = remember { SheepfoldConnectionStore.read(context) }
    var themeMode by remember { mutableStateOf(ThemePreferenceStore.read(context)) }
    var setupComplete by remember {
        mutableStateOf(SheepfoldConnectionStore.hasConnection(storedConnection))
    }
    var agreementCurrent by remember { mutableStateOf(AgreementAcceptanceStore.isCurrent(context)) }
    var connection by remember { mutableStateOf(storedConnection) }
    var unlocked by remember { mutableStateOf(!AppProtectionStore.requiresAuthentication(context)) }
    var pairingLoss by rememberSaveable { mutableStateOf(SheepfoldConnectionStore.consumePairingLoss(context)) }
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
            // Событие могло ждать главный поток, пока пользователь уже привязал роутер заново
            if (SheepfoldConnectionStore.hasConnection(context)) return@collect
            SheepfoldConnectionStore.consumePairingLoss(context)
            pairingLoss = reason
            workspace.clear()
            connection = null
            setupComplete = false
        }
    }

    val updateAllowed = unlocked && setupComplete && connection != null && agreementCurrent
    val lifecycle = LocalLifecycleOwner.current.lifecycle
    LifecycleResumeEffect(updateAllowed) {
        if (updateAllowed) appUpdates.foregrounded()
        onPauseOrDispose { }
    }
    LaunchedEffect(updateAllowed, appUpdates.launchRequest) {
        if (updateAllowed && appUpdates.launchRequest != null) lifecycle.withResumed { onUpdateLaunch() }
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
                    setupComplete && connection != null && !agreementCurrent -> {
                        AgreementRenewalScreen { agreementCurrent = true }
                    }
                    setupComplete && connection != null -> {
                        OperationalMainScreen(
                            appUpdates = appUpdates,
                            workspace = workspace,
                            connection = connection!!,
                            themeMode = themeMode,
                            onThemeModeChange = { newMode ->
                                themeMode = newMode
                                ThemePreferenceStore.save(context, newMode)
                            },
                            onLanguageChange = { language ->
                                LanguagePreferenceStore.save(context, language)
                                onLanguageChanged()
                            },
                            onLockNow = {
                                if (AppProtectionStore.requiresAuthentication(context)) {
                                    unlocked = false
                                    onLockNow()
                                }
                            },
                            onDisconnect = {
                                workspace.clear()
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
                            setupModel = setupModel,
                            pairingOnly = pairingLoss != null,
                            pairingMessage = pairingMessage
                        ) { request ->
                            SheepfoldConnectionStore.save(context, request)
                            revokeCameraPermissionAfterPairing(context)
                            connection = request
                            setupComplete = true
                            agreementCurrent = AgreementAcceptanceStore.isCurrent(context)
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
