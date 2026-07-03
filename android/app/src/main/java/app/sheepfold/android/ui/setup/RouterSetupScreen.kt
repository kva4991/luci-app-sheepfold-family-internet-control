package app.sheepfold.android.ui.setup

import android.Manifest
import android.annotation.SuppressLint
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.provider.Settings
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.camera.core.CameraSelector
import androidx.camera.core.ImageAnalysis
import androidx.camera.core.Preview
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.camera.view.PreviewView
import androidx.compose.foundation.Image
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
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
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.compose.foundation.text.KeyboardOptions
import androidx.core.content.ContextCompat
import androidx.lifecycle.compose.LocalLifecycleOwner
import app.sheepfold.android.R
import app.sheepfold.android.router.RouterConnectionManager
import app.sheepfold.android.router.RouterConnectionRequest
import com.google.mlkit.vision.barcode.BarcodeScannerOptions
import com.google.mlkit.vision.barcode.BarcodeScanning
import com.google.mlkit.vision.barcode.common.Barcode
import com.google.mlkit.vision.common.InputImage
import kotlinx.coroutines.launch
import java.util.concurrent.Executors
import java.util.concurrent.atomic.AtomicBoolean

private enum class SetupStep {
    Agreement,
    WifiConnect,
    MacCheck,
    PairingChoice,
    QrScanner,
    ManualSetup,
    AppPassword
}

@Composable
fun RouterSetupScreen() {
    val snackbarHostState = remember { SnackbarHostState() }
    val coroutineScope = rememberCoroutineScope()
    val routerConnectionManager = remember { RouterConnectionManager() }
    var setupStep by remember { mutableStateOf(SetupStep.Agreement) }
    var isTestingConnection by remember { mutableStateOf(false) }

    Scaffold(
        snackbarHost = { SnackbarHost(hostState = snackbarHostState) }
    ) { padding ->
        Box(modifier = Modifier.padding(padding)) {
            when (setupStep) {
                SetupStep.Agreement -> AgreementScreen(
                    onAccept = { setupStep = SetupStep.WifiConnect }
                )

                SetupStep.WifiConnect -> WifiConnectScreen(
                    onContinue = { setupStep = SetupStep.MacCheck }
                )

                SetupStep.MacCheck -> MacCheckScreen(
                    onContinue = { setupStep = SetupStep.PairingChoice }
                )

                SetupStep.PairingChoice -> PairingChoiceScreen(
                    onQrClick = { setupStep = SetupStep.QrScanner },
                    onManualClick = { setupStep = SetupStep.ManualSetup }
                )

                SetupStep.QrScanner -> QrScannerScreen(
                    isTestingConnection = isTestingConnection,
                    onBack = { setupStep = SetupStep.PairingChoice },
                    onShowMessage = { message ->
                        coroutineScope.launch {
                            snackbarHostState.showSnackbar(message)
                        }
                    },
                    onQrDetected = { payload ->
                        if (isTestingConnection) {
                            return@QrScannerScreen
                        }
                        isTestingConnection = true
                        coroutineScope.launch {
                            try {
                                val request = routerConnectionManager.parseQrPayload(payload)
                                val connected = routerConnectionManager.testConnection(request)
                                if (connected) {
                                    snackbarHostState.showSnackbar(
                                        "Подключено к серверу (${request.routerName})"
                                    )
                                    setupStep = SetupStep.AppPassword
                                } else {
                                    snackbarHostState.showSnackbar("Не удалось подключиться к серверу")
                                }
                            } catch (error: Exception) {
                                snackbarHostState.showSnackbar(
                                    error.message ?: "QR код не удалось обработать"
                                )
                            } finally {
                                isTestingConnection = false
                            }
                        }
                    }
                )

                SetupStep.ManualSetup -> ManualSetupScreen(
                    isTestingConnection = isTestingConnection,
                    onBack = { setupStep = SetupStep.PairingChoice },
                    onConnect = { request ->
                        if (isTestingConnection) {
                            return@ManualSetupScreen
                        }
                        isTestingConnection = true
                        coroutineScope.launch {
                            try {
                                val connected = routerConnectionManager.testConnection(request)
                                if (connected) {
                                    snackbarHostState.showSnackbar(
                                        "Подключено к серверу (${request.routerName})"
                                    )
                                    setupStep = SetupStep.AppPassword
                                } else {
                                    snackbarHostState.showSnackbar("Не удалось подключиться к серверу")
                                }
                            } catch (error: Exception) {
                                snackbarHostState.showSnackbar(
                                    error.message ?: "Не удалось проверить подключение"
                                )
                            } finally {
                                isTestingConnection = false
                            }
                        }
                    }
                )

                SetupStep.AppPassword -> AppPasswordScreen(
                    onPasswordReady = {
                        coroutineScope.launch {
                            snackbarHostState.showSnackbar("Пароль приложения установлен")
                        }
                    }
                )
            }
        }
    }
}

@Composable
private fun AgreementScreen(onAccept: () -> Unit) {
    val uriHandler = LocalUriHandler.current

    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(20.dp),
        verticalArrangement = Arrangement.spacedBy(18.dp),
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        Image(
            painter = painterResource(id = R.drawable.sheepfold_logo),
            contentDescription = "Sheepfold",
            modifier = Modifier.size(128.dp)
        )
        Text(
            text = "Sheepfold",
            style = MaterialTheme.typography.headlineLarge
        )
        Text(
            text = "Перед настройкой примите пользовательское соглашение и условия обработки технических данных, необходимых для работы приложения.",
            style = MaterialTheme.typography.bodyLarge
        )
        TextButton(
            onClick = {
                uriHandler.openUri(
                    "https://github.com/kva4991/luci-app-sheepfold-family-internet-control/blob/main/docs/user-agreement.ru.md"
                )
            }
        ) {
            Text(text = "Открыть пользовательское соглашение")
        }
        Button(
            onClick = onAccept,
            modifier = Modifier.fillMaxWidth()
        ) {
            Text(text = "Принимаю")
        }
    }
}

@Composable
private fun WifiConnectScreen(onContinue: () -> Unit) {
    val context = LocalContext.current

    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(20.dp),
        verticalArrangement = Arrangement.spacedBy(18.dp),
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        Text(
            text = "Подключение к Wi-Fi",
            style = MaterialTheme.typography.headlineMedium
        )
        Text(
            text = "Подключите телефон к домашней Wi-Fi сети роутера, на котором установлен Sheepfold.",
            style = MaterialTheme.typography.bodyLarge
        )
        SetupCard(
            title = "Важно",
            body = "Полная настройка работает локально. Телефон должен быть подключён к той же домашней сети, где открыт LuCI."
        )
        Button(
            onClick = {
                context.startActivity(Intent(Settings.ACTION_WIFI_SETTINGS))
            },
            modifier = Modifier.fillMaxWidth()
        ) {
            Text(text = "Открыть настройки Wi-Fi")
        }
        Button(
            onClick = onContinue,
            modifier = Modifier.fillMaxWidth()
        ) {
            Text(text = "Я подключён к домашнему Wi-Fi")
        }
    }
}

@Composable
private fun MacCheckScreen(onContinue: () -> Unit) {
    val context = LocalContext.current

    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(20.dp),
        verticalArrangement = Arrangement.spacedBy(18.dp),
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        Text(
            text = "Проверка MAC-адреса",
            style = MaterialTheme.typography.headlineMedium
        )
        Text(
            text = "Для этой домашней Wi-Fi сети должен быть включён настоящий MAC-адрес телефона, а не случайный/private MAC.",
            style = MaterialTheme.typography.bodyLarge
        )
        SetupCard(
            title = "Если включён случайный MAC",
            body = "Откройте настройки текущей Wi-Fi сети и переключите MAC-адрес на настоящий. Иначе роутер может видеть телефон как новое устройство после переподключения."
        )
        Button(
            onClick = {
                context.startActivity(Intent(Settings.ACTION_WIFI_SETTINGS))
            },
            modifier = Modifier.fillMaxWidth()
        ) {
            Text(text = "Открыть настройки Wi-Fi")
        }
        Button(
            onClick = onContinue,
            modifier = Modifier.fillMaxWidth()
        ) {
            Text(text = "Настоящий MAC включён")
        }
    }
}

@Composable
private fun PairingChoiceScreen(
    onQrClick: () -> Unit,
    onManualClick: () -> Unit
) {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(20.dp),
        verticalArrangement = Arrangement.spacedBy(18.dp),
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        Text(
            text = "Настройка подключения",
            style = MaterialTheme.typography.headlineMedium
        )
        Text(
            text = "Выберите способ подключения к Sheepfold на OpenWRT-роутере.",
            style = MaterialTheme.typography.bodyLarge
        )
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .weight(1f)
        ) {
            Button(
                onClick = onQrClick,
                modifier = Modifier
                    .align(Alignment.TopCenter)
                    .widthIn(min = 148.dp)
            ) {
                Text(text = "QR")
            }
            Button(
                onClick = onManualClick,
                modifier = Modifier
                    .align(Alignment.BottomCenter)
                    .widthIn(min = 148.dp)
            ) {
                Text(text = "Ручная настройка")
            }
        }
        SetupCard(
            title = "Следующий шаг",
            body = "После выбора способа приложение проверит подключение к домашнему Wi-Fi и настоящий MAC-адрес телефона."
        )
    }
}

@Composable
private fun ManualSetupScreen(
    isTestingConnection: Boolean,
    onBack: () -> Unit,
    onConnect: (RouterConnectionRequest) -> Unit
) {
    var temporaryPassword by remember { mutableStateOf("") }
    var routerName by remember { mutableStateOf("") }
    var serverAddress by remember { mutableStateOf("") }
    var port by remember { mutableStateOf("80") }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(20.dp),
        verticalArrangement = Arrangement.spacedBy(14.dp)
    ) {
        Text(
            text = "Ручная настройка",
            style = MaterialTheme.typography.headlineMedium
        )
        Text(
            text = "Введите данные сопряжения, показанные в LuCI рядом с QR-кодом.",
            style = MaterialTheme.typography.bodyLarge
        )
        OutlinedTextField(
            value = temporaryPassword,
            onValueChange = { temporaryPassword = it },
            modifier = Modifier.fillMaxWidth(),
            label = { Text("Временный пароль") },
            singleLine = true
        )
        OutlinedTextField(
            value = routerName,
            onValueChange = { routerName = it },
            modifier = Modifier.fillMaxWidth(),
            label = { Text("Имя") },
            singleLine = true
        )
        OutlinedTextField(
            value = serverAddress,
            onValueChange = { serverAddress = it },
            modifier = Modifier.fillMaxWidth(),
            label = { Text("Адрес сервера") },
            singleLine = true,
            placeholder = { Text("192.168.1.1") }
        )
        OutlinedTextField(
            value = port,
            onValueChange = { port = it.filter(Char::isDigit) },
            modifier = Modifier.fillMaxWidth(),
            label = { Text("Порт") },
            singleLine = true,
            supportingText = { Text("По умолчанию 80 для LuCI/API. 22 обычно используется для SSH.") }
        )
        Button(
            enabled = !isTestingConnection && serverAddress.isNotBlank() && port.isNotBlank(),
            onClick = {
                val host = serverAddress.trim()
                    .removePrefix("http://")
                    .removePrefix("https://")
                    .trimEnd('/')
                val url = "http://$host:${port.trim()}"
                onConnect(
                    RouterConnectionRequest(
                        apiUrl = url,
                        routerName = routerName.ifBlank { host },
                        temporaryPassword = temporaryPassword.ifBlank { null }
                    )
                )
            },
            modifier = Modifier.fillMaxWidth()
        ) {
            if (isTestingConnection) {
                CircularProgressIndicator(modifier = Modifier.size(18.dp))
            } else {
                Text(text = "Подключиться")
            }
        }
        TextButton(onClick = onBack) {
            Text(text = "Назад")
        }
    }
}

@Composable
private fun QrScannerScreen(
    isTestingConnection: Boolean,
    onBack: () -> Unit,
    onShowMessage: (String) -> Unit,
    onQrDetected: (String) -> Unit
) {
    val context = LocalContext.current
    val imageScanner = remember { QrImageScanner() }
    var hasCameraPermission by remember {
        mutableStateOf(
            ContextCompat.checkSelfPermission(context, Manifest.permission.CAMERA) ==
                PackageManager.PERMISSION_GRANTED
        )
    }
    val permissionLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.RequestPermission()
    ) { granted ->
        hasCameraPermission = granted
    }
    val imagePickerLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.GetContent()
    ) { uri: Uri? ->
        if (uri == null) {
            return@rememberLauncherForActivityResult
        }
        imageScanner.scan(
            context = context,
            uri = uri,
            onResult = onQrDetected,
            onError = { onShowMessage("QR код на изображении не найден") }
        )
    }

    LaunchedEffect(Unit) {
        if (!hasCameraPermission) {
            permissionLauncher.launch(Manifest.permission.CAMERA)
        }
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(20.dp),
        verticalArrangement = Arrangement.spacedBy(14.dp)
    ) {
        Text(
            text = "Сканирование QR",
            style = MaterialTheme.typography.headlineMedium
        )
        Text(
            text = "Наведите камеру на QR-код сопряжения, открытый в LuCI.",
            style = MaterialTheme.typography.bodyLarge
        )
        TextButton(
            enabled = !isTestingConnection,
            onClick = { imagePickerLauncher.launch("image/*") }
        ) {
            Text(text = "Загрузить QR из файла")
        }

        Box(
            modifier = Modifier
                .fillMaxWidth()
                .weight(1f),
            contentAlignment = Alignment.Center
        ) {
            if (hasCameraPermission) {
                CameraQrScanner(
                    enabled = !isTestingConnection,
                    onQrDetected = onQrDetected
                )
                if (isTestingConnection) {
                    CircularProgressIndicator()
                }
            } else {
                Column(
                    verticalArrangement = Arrangement.spacedBy(12.dp),
                    horizontalAlignment = Alignment.CenterHorizontally
                ) {
                    Text(text = "Для сканирования QR-кода нужен доступ к камере.")
                    Button(
                        onClick = { permissionLauncher.launch(Manifest.permission.CAMERA) }
                    ) {
                        Text(text = "Разрешить камеру")
                    }
                }
            }
        }

        TextButton(onClick = onBack) {
            Text(text = "Назад")
        }
    }
}

@SuppressLint("UnsafeOptInUsageError")
@Composable
private fun CameraQrScanner(
    enabled: Boolean,
    onQrDetected: (String) -> Unit
) {
    val context = LocalContext.current
    val lifecycleOwner = LocalLifecycleOwner.current
    val analysisExecutor = remember { Executors.newSingleThreadExecutor() }
    val isProcessing = remember { AtomicBoolean(false) }

    DisposableEffect(Unit) {
        onDispose {
            analysisExecutor.shutdown()
        }
    }

    AndroidView(
        modifier = Modifier.fillMaxSize(),
        factory = { viewContext ->
            PreviewView(viewContext).also { previewView ->
                val cameraProviderFuture = ProcessCameraProvider.getInstance(viewContext)
                cameraProviderFuture.addListener(
                    {
                        val cameraProvider = cameraProviderFuture.get()
                        val preview = Preview.Builder().build().also { cameraPreview ->
                            cameraPreview.setSurfaceProvider(previewView.surfaceProvider)
                        }
                        val options = BarcodeScannerOptions.Builder()
                            .setBarcodeFormats(Barcode.FORMAT_QR_CODE)
                            .build()
                        val scanner = BarcodeScanning.getClient(options)
                        val imageAnalysis = ImageAnalysis.Builder()
                            .setBackpressureStrategy(ImageAnalysis.STRATEGY_KEEP_ONLY_LATEST)
                            .build()
                            .also { analysis ->
                                analysis.setAnalyzer(analysisExecutor) { imageProxy ->
                                    val mediaImage = imageProxy.image
                                    if (!enabled || mediaImage == null || !isProcessing.compareAndSet(false, true)) {
                                        imageProxy.close()
                                        return@setAnalyzer
                                    }

                                    val image = InputImage.fromMediaImage(
                                        mediaImage,
                                        imageProxy.imageInfo.rotationDegrees
                                    )
                                    scanner.process(image)
                                        .addOnSuccessListener { barcodes ->
                                            val rawValue = barcodes.firstOrNull()?.rawValue
                                            if (!rawValue.isNullOrBlank()) {
                                                onQrDetected(rawValue)
                                            }
                                        }
                                        .addOnCompleteListener {
                                            isProcessing.set(false)
                                            imageProxy.close()
                                        }
                                }
                            }

                        cameraProvider.unbindAll()
                        cameraProvider.bindToLifecycle(
                            lifecycleOwner,
                            CameraSelector.DEFAULT_BACK_CAMERA,
                            preview,
                            imageAnalysis
                        )
                    },
                    ContextCompat.getMainExecutor(context)
                )
            }
        }
    )
}

private class QrImageScanner {
    private val options = BarcodeScannerOptions.Builder()
        .setBarcodeFormats(Barcode.FORMAT_QR_CODE)
        .build()

    fun scan(
        context: android.content.Context,
        uri: Uri,
        onResult: (String) -> Unit,
        onError: () -> Unit
    ) {
        val image = InputImage.fromFilePath(context, uri)
        BarcodeScanning.getClient(options)
            .process(image)
            .addOnSuccessListener { barcodes ->
                val rawValue = barcodes.firstOrNull()?.rawValue
                if (rawValue.isNullOrBlank()) {
                    onError()
                } else {
                    onResult(rawValue)
                }
            }
            .addOnFailureListener {
                onError()
            }
    }
}

@Composable
private fun AppPasswordScreen(onPasswordReady: () -> Unit) {
    var password by remember { mutableStateOf("") }
    var repeatPassword by remember { mutableStateOf("") }
    val passwordIsValid = password.length >= 4 && password == repeatPassword

    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(20.dp),
        verticalArrangement = Arrangement.spacedBy(14.dp),
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        Text(
            text = "Пароль приложения",
            style = MaterialTheme.typography.headlineMedium
        )
        Text(
            text = "Задайте пароль или PIN для входа в приложение Sheepfold на этом телефоне.",
            style = MaterialTheme.typography.bodyLarge
        )
        SetupCard(
            title = "Рекомендация",
            body = "Пароль или PIN безопаснее как основной способ защиты. Отпечаток пальца и разблокировка лицом могут быть менее надёжны, если ребёнок попробует разблокировать приложение, пока родитель спит."
        )
        OutlinedTextField(
            value = password,
            onValueChange = { password = it },
            modifier = Modifier.fillMaxWidth(),
            label = { Text("Пароль или PIN") },
            singleLine = true,
            visualTransformation = PasswordVisualTransformation(),
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password)
        )
        OutlinedTextField(
            value = repeatPassword,
            onValueChange = { repeatPassword = it },
            modifier = Modifier.fillMaxWidth(),
            label = { Text("Повторите пароль или PIN") },
            singleLine = true,
            visualTransformation = PasswordVisualTransformation(),
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password)
        )
        Button(
            enabled = passwordIsValid,
            onClick = onPasswordReady,
            modifier = Modifier.fillMaxWidth()
        ) {
            Text(text = "Сохранить пароль")
        }
    }
}

@Composable
private fun SetupCard(title: String, body: String) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface)
    ) {
        Column(
            modifier = Modifier.padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(6.dp)
        ) {
            Text(text = title, style = MaterialTheme.typography.titleMedium)
            Text(text = body, style = MaterialTheme.typography.bodyMedium)
        }
    }
}
