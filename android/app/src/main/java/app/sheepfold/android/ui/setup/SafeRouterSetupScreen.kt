package app.sheepfold.android.ui.setup

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.os.Build
import android.provider.Settings
import androidx.activity.compose.BackHandler
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.biometric.BiometricManager
import androidx.camera.core.CameraSelector
import androidx.camera.core.ImageAnalysis
import androidx.camera.core.ImageProxy
import androidx.camera.core.Preview
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.camera.view.PreviewView
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.wrapContentSize
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Checkbox
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.FilterChip
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalLifecycleOwner
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.core.content.ContextCompat
import app.sheepfold.android.R
import app.sheepfold.android.diagnostics.DiagnosticLog
import app.sheepfold.android.router.ActiveTransport
import app.sheepfold.android.router.LocalNetworkState
import app.sheepfold.android.router.LocalRouterDiscovery
import app.sheepfold.android.router.LocalSheepfoldDiscovery
import app.sheepfold.android.router.RouterConnectionRequest
import app.sheepfold.android.router.SecureRouterConnectionManager
import app.sheepfold.android.security.AppProtectionMode
import app.sheepfold.android.security.AppProtectionStore
import com.google.zxing.BinaryBitmap
import com.google.zxing.MultiFormatReader
import com.google.zxing.PlanarYUVLuminanceSource
import com.google.zxing.RGBLuminanceSource
import com.google.zxing.common.HybridBinarizer
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import java.util.concurrent.Executors
import java.util.concurrent.atomic.AtomicBoolean

private enum class SetupStep { AGREEMENT, NETWORK, MAC, PAIRING, QR, MANUAL, PROTECTION }

@Composable
fun SafeRouterSetupScreen(
    pairingOnly: Boolean = false,
    pairingMessage: String? = null,
    onSetupComplete: (RouterConnectionRequest) -> Unit
) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val snackbar = remember { SnackbarHostState() }
    val manager = remember { SecureRouterConnectionManager() }
    var step by remember(pairingOnly) {
        mutableStateOf(if (pairingOnly) SetupStep.PAIRING else SetupStep.AGREEMENT)
    }
    var networkState by remember { mutableStateOf(LocalRouterDiscovery.networkState(context)) }
    var discovery by remember { mutableStateOf<LocalSheepfoldDiscovery?>(null) }
    var connected by remember { mutableStateOf<RouterConnectionRequest?>(null) }
    var busy by remember { mutableStateOf(false) }

    fun back() {
        step = when (step) {
            SetupStep.AGREEMENT -> SetupStep.AGREEMENT
            SetupStep.NETWORK -> SetupStep.AGREEMENT
            SetupStep.MAC -> SetupStep.NETWORK
            SetupStep.PAIRING -> if (pairingOnly) SetupStep.PAIRING else SetupStep.MAC
            SetupStep.QR, SetupStep.MANUAL -> SetupStep.PAIRING
            SetupStep.PROTECTION -> SetupStep.PAIRING
        }
    }

    fun connect(request: RouterConnectionRequest) {
        if (busy) return
        busy = true
        scope.launch {
            runCatching { manager.connect(request) }
                .onSuccess {
                    connected = it
                    snackbar.showSnackbar(context.getString(R.string.setup_connected_to, it.routerName))
                    if (pairingOnly) onSetupComplete(it) else step = SetupStep.PROTECTION
                }
                .onFailure { snackbar.showSnackbar(it.message ?: context.getString(R.string.setup_connection_failed)) }
            busy = false
        }
    }

    BackHandler(enabled = step != SetupStep.AGREEMENT) { back() }

    LaunchedEffect(pairingMessage) {
        if (!pairingMessage.isNullOrBlank()) snackbar.showSnackbar(pairingMessage)
    }

    Scaffold(snackbarHost = { SnackbarHost(snackbar) }) { padding ->
        Box(Modifier.fillMaxSize().padding(padding)) {
            when (step) {
                SetupStep.AGREEMENT -> AgreementStep { step = SetupStep.NETWORK }
                SetupStep.NETWORK -> NetworkStep(
                    state = networkState,
                    discovery = discovery,
                    busy = busy,
                    onRefresh = {
                        networkState = LocalRouterDiscovery.networkState(context)
                        busy = true
                        scope.launch {
                            discovery = LocalRouterDiscovery.discover(context)
                            busy = false
                        }
                    },
                    onNext = { step = SetupStep.MAC }
                )
                SetupStep.MAC -> MacStep(networkState) { step = SetupStep.PAIRING }
                SetupStep.PAIRING -> PairingStep(
                    onQr = { step = SetupStep.QR },
                    onManual = { step = SetupStep.MANUAL }
                )
                SetupStep.QR -> QrStep(
                    busy = busy,
                    onPayload = { payload ->
                        runCatching { manager.parseQrPayload(payload) }
                            .onSuccess(::connect)
                            .onFailure { scope.launch { snackbar.showSnackbar(it.message.orEmpty()) } }
                    }
                )
                SetupStep.MANUAL -> ManualStep(discovery, busy) { address, port, login, code ->
                    runCatching { manager.manualRequest("$address:$port", login, code) }
                        .onSuccess(::connect)
                        .onFailure { scope.launch { snackbar.showSnackbar(it.message.orEmpty()) } }
                }
                SetupStep.PROTECTION -> ProtectionStep {
                    onSetupComplete(requireNotNull(connected))
                }
            }
        }
    }
}

@Composable
private fun AgreementStep(onNext: () -> Unit) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    var accepted by remember { mutableStateOf(false) }
    var opening by remember { mutableStateOf(false) }
    val permissions = remember {
        buildList {
            add(Manifest.permission.CAMERA)
            if (Build.VERSION.SDK_INT >= 33) {
                add(Manifest.permission.POST_NOTIFICATIONS)
                add(Manifest.permission.NEARBY_WIFI_DEVICES)
            } else {
                add(Manifest.permission.ACCESS_FINE_LOCATION)
            }
            if (Build.VERSION.SDK_INT == Build.VERSION_CODES.P) {
                add(Manifest.permission.WRITE_EXTERNAL_STORAGE)
            }
        }
    }
    var granted by remember {
        mutableStateOf(permissions.all { ContextCompat.checkSelfPermission(context, it) == PackageManager.PERMISSION_GRANTED })
    }
    val launcher = rememberLauncherForActivityResult(ActivityResultContracts.RequestMultiplePermissions()) {
        granted = permissions.all { permission ->
            ContextCompat.checkSelfPermission(context, permission) == PackageManager.PERMISSION_GRANTED
        }
        // Android 9 сможет создать тестовый журнал в «Загрузках» только после
        // осознанного нажатия кнопки разрешений на экране соглашения.
        DiagnosticLog.initialize(context)
    }

    Box(Modifier.fillMaxSize()) {
        Column(
            Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(20.dp, 12.dp, 20.dp, 132.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            Image(painterResource(R.drawable.sheepfold_logo), "Sheepfold", Modifier.size(168.dp))
            Text("Sheepfold", style = MaterialTheme.typography.headlineMedium)
            Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                Checkbox(checked = accepted, onCheckedChange = { accepted = it }, modifier = Modifier.size(52.dp))
                Text(
                    buildAnnotatedString {
                        append(stringResource(R.string.setup_agreement_prefix))
                        withStyle(SpanStyle(color = MaterialTheme.colorScheme.primary, textDecoration = TextDecoration.Underline)) {
                            append(stringResource(R.string.setup_agreement_link))
                        }
                        append(stringResource(R.string.setup_agreement_suffix))
                    },
                    modifier = Modifier.weight(1f).clickable {
                        opening = true
                        context.startActivity(Intent(Intent.ACTION_VIEW, android.net.Uri.parse(
                            "https://github.com/kva4991/luci-app-sheepfold-family-internet-control/blob/main/docs/user-agreement.ru.md"
                        )))
                        scope.launch { delay(1000); opening = false }
                    }
                )
            }
            InfoCard(stringResource(R.string.setup_permissions_title), stringResource(R.string.setup_permissions_explanation))
            OutlinedButton(
                enabled = !granted,
                onClick = { launcher.launch(permissions.toTypedArray()) },
                modifier = Modifier.fillMaxWidth()
            ) { Text(if (granted) stringResource(R.string.setup_permissions_granted) else stringResource(R.string.setup_permissions_request)) }
        }
        RoundNextButton(accepted && granted, onNext, Modifier.align(Alignment.BottomCenter).padding(bottom = 20.dp))
        if (opening) Box(Modifier.fillMaxSize().background(Color(0x99000000)), contentAlignment = Alignment.Center) {
            CircularProgressIndicator()
        }
    }
}

@Composable
private fun NetworkStep(
    state: LocalNetworkState,
    discovery: LocalSheepfoldDiscovery?,
    busy: Boolean,
    onRefresh: () -> Unit,
    onNext: () -> Unit
) {
    val supported = state.transport == ActiveTransport.WIFI || state.transport == ActiveTransport.ETHERNET
    LaunchedEffect(Unit) { onRefresh() }
    StepContainer(stringResource(R.string.setup_network_title)) {
        InfoCard(
            stringResource(R.string.setup_current_connection),
            when (state.transport) {
                ActiveTransport.WIFI -> "✓ Wi-Fi${state.wifiName?.let { ": $it" }.orEmpty()}"
                ActiveTransport.ETHERNET -> "✓ ${stringResource(R.string.setup_ethernet)}"
                ActiveTransport.CELLULAR -> stringResource(R.string.setup_cellular_blocked)
                ActiveTransport.NONE -> stringResource(R.string.setup_no_network)
                ActiveTransport.OTHER -> stringResource(R.string.setup_unsupported_network)
            }
        )
        Card(
            modifier = Modifier.fillMaxWidth().clickable(enabled = !busy, onClick = onRefresh),
            colors = CardDefaults.cardColors(containerColor = if (discovery != null) Color(0xFFDDF3E5) else Color(0xFFFFF3CD))
        ) {
            Row(Modifier.fillMaxWidth().padding(16.dp), horizontalArrangement = Arrangement.SpaceBetween) {
                Column(Modifier.weight(1f)) {
                    Text(stringResource(R.string.setup_server_search), style = MaterialTheme.typography.titleMedium)
                    Text(discovery?.let { "✓ ${it.routerName}" } ?: stringResource(R.string.setup_server_not_found))
                }
                Text("↻", style = MaterialTheme.typography.headlineMedium)
            }
        }
        if (busy) CircularProgressIndicator()
        if (!supported) InfoCard(stringResource(R.string.setup_important), stringResource(R.string.setup_wifi_required))
    }
    RoundNextButton(supported, onNext, Modifier.fillMaxSize().wrapContentSize(Alignment.BottomCenter).padding(bottom = 20.dp))
}

@Composable
private fun MacStep(state: LocalNetworkState, onNext: () -> Unit) {
    val context = LocalContext.current
    StepContainer(stringResource(R.string.setup_mac_title)) {
        if (state.transport == ActiveTransport.ETHERNET) {
            InfoCard(stringResource(R.string.setup_current_connection), stringResource(R.string.setup_ethernet_mac_skipped))
        } else {
            InfoCard(stringResource(R.string.setup_wifi_name), state.wifiName ?: stringResource(R.string.value_empty))
            InfoCard(stringResource(R.string.setup_current_mac), state.reportedDeviceMac ?: stringResource(R.string.setup_mac_hidden))
            Card(colors = CardDefaults.cardColors(containerColor = Color(0xFFFFF3CD))) {
                Text(stringResource(R.string.setup_mac_warning), Modifier.padding(16.dp))
            }
            OutlinedButton(
                onClick = { contextStartWifiSettings(context) },
                modifier = Modifier.fillMaxWidth()
            ) { Text(stringResource(R.string.setup_open_wifi_settings)) }
        }
    }
    RoundNextButton(true, onNext, Modifier.fillMaxSize().wrapContentSize(Alignment.BottomCenter).padding(bottom = 20.dp))
}

@Composable
private fun PairingStep(onQr: () -> Unit, onManual: () -> Unit) {
    Column(
        Modifier.fillMaxSize().padding(24.dp),
        verticalArrangement = Arrangement.Center,
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        Text(stringResource(R.string.setup_pairing_title), style = MaterialTheme.typography.headlineMedium)
        Spacer(Modifier.height(40.dp))
        Button(onClick = onQr, modifier = Modifier.fillMaxWidth().height(58.dp)) {
            Text(stringResource(R.string.setup_qr_code))
        }
        Spacer(Modifier.height(16.dp))
        Button(
            onClick = onManual,
            modifier = Modifier.fillMaxWidth().height(58.dp),
            colors = ButtonDefaults.buttonColors(containerColor = Color(0xFFE0A800), contentColor = Color.Black)
        ) { Text(stringResource(R.string.setup_manual)) }
    }
}

@Composable
private fun QrStep(busy: Boolean, onPayload: (String) -> Unit) {
    val context = LocalContext.current
    var error by remember { mutableStateOf<String?>(null) }
    val gallery = rememberLauncherForActivityResult(ActivityResultContracts.GetContent()) { uri ->
        if (uri != null) runCatching {
            context.contentResolver.openInputStream(uri).use { stream -> decodeQrBitmap(BitmapFactory.decodeStream(stream)) }
        }.onSuccess(onPayload).onFailure { error = context.getString(R.string.setup_qr_not_recognized) }
    }
    StepContainer(stringResource(R.string.setup_qr_scan_title)) {
        OutlinedButton(onClick = { gallery.launch("image/*") }, modifier = Modifier.fillMaxWidth()) {
            Text(stringResource(R.string.setup_qr_from_file))
        }
        BoxWithConstraints(Modifier.fillMaxWidth()) {
            // В вертикально прокручиваемой Column aspectRatio иногда получает
            // неудобные ограничения. Размер от фактической ширины гарантирует квадрат.
            val scannerSize = maxWidth
            Box(
                Modifier
                    .size(scannerSize)
                    .clip(RoundedCornerShape(8.dp))
                    .border(2.dp, MaterialTheme.colorScheme.primary, RoundedCornerShape(8.dp))
            ) {
                LiveQrScanner(enabled = !busy, onPayload = onPayload)
                if (busy) Box(Modifier.fillMaxSize().background(Color(0x66000000)), contentAlignment = Alignment.Center) {
                    CircularProgressIndicator()
                }
            }
        }
        error?.let { Text(it, color = MaterialTheme.colorScheme.error) }
    }
}

@Composable
private fun ManualStep(
    discovery: LocalSheepfoldDiscovery?,
    busy: Boolean,
    onConnect: (String, String, String, String) -> Unit
) {
    var address by remember { mutableStateOf(discovery?.gatewayHost ?: "192.168.1.1") }
    var port by remember { mutableStateOf("5201") }
    var login by remember { mutableStateOf("") }
    var code by remember { mutableStateOf("") }
    StepContainer(stringResource(R.string.setup_manual)) {
        OutlinedTextField(address, { address = it.filter { char -> char.isDigit() || char == '.' || char == ':' } }, Modifier.fillMaxWidth(), label = { Text(stringResource(R.string.setup_router_address)) }, singleLine = true)
        OutlinedTextField(port, { port = it.filter(Char::isDigit).take(5) }, Modifier.fillMaxWidth(), label = { Text(stringResource(R.string.setup_port)) }, keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number), singleLine = true)
        OutlinedTextField(login, { login = it.filter { char -> char.code < 128 && (char.isLetterOrDigit() || char in "._-@+") }.take(64) }, Modifier.fillMaxWidth(), label = { Text(stringResource(R.string.setup_admin_login)) }, singleLine = true)
        OutlinedTextField(code, { code = it.take(64) }, Modifier.fillMaxWidth(), label = { Text(stringResource(R.string.setup_pairing_code)) }, visualTransformation = PasswordVisualTransformation(), singleLine = true)
        Button(
            enabled = !busy && address.isNotBlank() && port.isNotBlank() && login.isNotBlank() && code.isNotBlank(),
            onClick = { onConnect(address, port, login, code) },
            modifier = Modifier.fillMaxWidth()
        ) { if (busy) CircularProgressIndicator(Modifier.size(24.dp)) else Text(stringResource(R.string.setup_connect)) }
    }
}

@Composable
private fun ProtectionStep(onComplete: () -> Unit) {
    val context = LocalContext.current
    var mode by remember { mutableStateOf(AppProtectionMode.PASSWORD) }
    var secret by remember { mutableStateOf("") }
    var repeat by remember { mutableStateOf("") }
    var error by remember { mutableStateOf<String?>(null) }
    StepContainer(stringResource(R.string.protection_title)) {
        Text(stringResource(R.string.protection_description))
        AppProtectionMode.entries.forEach { item ->
            FilterChip(selected = mode == item, onClick = { mode = item; error = null }, label = { Text(modeLabel(item)) })
        }
        if (mode == AppProtectionMode.PASSWORD || mode == AppProtectionMode.PIN) {
            OutlinedTextField(secret, { secret = if (mode == AppProtectionMode.PIN) it.filter(Char::isDigit).take(4) else it }, Modifier.fillMaxWidth(), label = { Text(stringResource(if (mode == AppProtectionMode.PIN) R.string.protection_pin else R.string.protection_password_label)) }, visualTransformation = PasswordVisualTransformation())
            OutlinedTextField(repeat, { repeat = if (mode == AppProtectionMode.PIN) it.filter(Char::isDigit).take(4) else it }, Modifier.fillMaxWidth(), label = { Text(stringResource(R.string.protection_repeat)) }, visualTransformation = PasswordVisualTransformation())
        }
        error?.let { Text(it, color = MaterialTheme.colorScheme.error) }
        val validSecret = when (mode) {
            AppProtectionMode.PASSWORD -> secret.length >= 8 && secret == repeat
            AppProtectionMode.PIN -> secret.length == 4 && secret == repeat
            else -> true
        }
        Button(enabled = validSecret, onClick = {
            if (mode == AppProtectionMode.BIOMETRIC) {
                val available = BiometricManager.from(context).canAuthenticate(BiometricManager.Authenticators.BIOMETRIC_WEAK)
                if (available != BiometricManager.BIOMETRIC_SUCCESS) {
                    error = context.getString(R.string.unlock_biometric_unavailable)
                    return@Button
                }
            }
            AppProtectionStore.save(context, mode, secret.takeIf { mode == AppProtectionMode.PASSWORD || mode == AppProtectionMode.PIN })
            onComplete()
        }, modifier = Modifier.fillMaxWidth()) { Text(stringResource(R.string.protection_finish)) }
    }
}

@Composable
private fun LiveQrScanner(enabled: Boolean, onPayload: (String) -> Unit) {
    val context = LocalContext.current
    val lifecycleOwner = LocalLifecycleOwner.current
    val executor = remember { Executors.newSingleThreadExecutor() }
    val delivered = remember { AtomicBoolean(false) }
    DisposableEffect(Unit) { onDispose { executor.shutdown() } }
    AndroidView(
        modifier = Modifier.fillMaxSize(),
        factory = {
            PreviewView(it).apply {
                // TextureView в COMPATIBLE-режиме подчиняется квадратным границам
                // Compose; SurfaceView на части прошивок визуально выходил за них.
                implementationMode = PreviewView.ImplementationMode.COMPATIBLE
                scaleType = PreviewView.ScaleType.FILL_CENTER
            }
        },
        update = { previewView ->
            if (!enabled || delivered.get()) return@AndroidView
            val providerFuture = ProcessCameraProvider.getInstance(context)
            providerFuture.addListener({
                val provider = providerFuture.get()
                val preview = Preview.Builder().build().also { it.setSurfaceProvider(previewView.surfaceProvider) }
                val analysis = ImageAnalysis.Builder().setBackpressureStrategy(ImageAnalysis.STRATEGY_KEEP_ONLY_LATEST).build()
                analysis.setAnalyzer(executor) { image ->
                    val value = runCatching { decodeQrImage(image) }.getOrNull()
                    image.close()
                    if (!value.isNullOrBlank() && delivered.compareAndSet(false, true)) previewView.post { onPayload(value) }
                }
                runCatching {
                    provider.unbindAll()
                    provider.bindToLifecycle(lifecycleOwner, CameraSelector.DEFAULT_BACK_CAMERA, preview, analysis)
                }
            }, ContextCompat.getMainExecutor(context))
        }
    )
}

private fun decodeQrImage(image: ImageProxy): String {
    val plane = image.planes[0]
    val buffer = plane.buffer
    val bytes = ByteArray(buffer.remaining()).also(buffer::get)
    val source = PlanarYUVLuminanceSource(bytes, plane.rowStride, image.height, 0, 0, image.width, image.height, false)
    return MultiFormatReader().decode(BinaryBitmap(HybridBinarizer(source))).text
}

private fun decodeQrBitmap(bitmap: Bitmap): String {
    val pixels = IntArray(bitmap.width * bitmap.height)
    bitmap.getPixels(pixels, 0, bitmap.width, 0, 0, bitmap.width, bitmap.height)
    return MultiFormatReader().decode(BinaryBitmap(HybridBinarizer(RGBLuminanceSource(bitmap.width, bitmap.height, pixels)))).text
}

@Composable
private fun StepContainer(title: String, content: @Composable ColumnScope.() -> Unit) {
    Column(
        Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(20.dp, 20.dp, 20.dp, 120.dp),
        verticalArrangement = Arrangement.spacedBy(14.dp)
    ) {
        Text(title, style = MaterialTheme.typography.headlineMedium, modifier = Modifier.fillMaxWidth().background(MaterialTheme.colorScheme.surfaceVariant).padding(14.dp))
        content()
    }
}

@Composable
private fun InfoCard(title: String, body: String) {
    Card(Modifier.fillMaxWidth(), colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant)) {
        Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
            Text(title, style = MaterialTheme.typography.titleMedium)
            Text(body)
        }
    }
}

@Composable
private fun RoundNextButton(enabled: Boolean, onClick: () -> Unit, modifier: Modifier = Modifier) {
    Button(
        enabled = enabled,
        onClick = onClick,
        modifier = modifier.size(104.dp),
        shape = CircleShape,
        colors = ButtonDefaults.buttonColors(disabledContainerColor = Color(0xFFB9DCCB))
    ) {
        Column(horizontalAlignment = Alignment.CenterHorizontally) {
            Text("›", style = MaterialTheme.typography.displaySmall)
            Text(stringResource(R.string.setup_next), style = MaterialTheme.typography.titleMedium)
        }
    }
}

private fun contextStartWifiSettings(context: android.content.Context) {
    context.startActivity(Intent(Settings.ACTION_WIFI_SETTINGS).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
}

@Composable
private fun modeLabel(mode: AppProtectionMode): String = stringResource(when (mode) {
    AppProtectionMode.PASSWORD -> R.string.protection_password
    AppProtectionMode.PIN -> R.string.protection_pin
    AppProtectionMode.BIOMETRIC -> R.string.protection_biometric
    AppProtectionMode.NONE -> R.string.protection_none
})
