package app.sheepfold.android.ui.setup

import android.Manifest
import android.annotation.SuppressLint
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import android.net.wifi.WifiInfo
import android.net.wifi.WifiManager
import android.net.Uri
import android.os.Build
import android.provider.Settings
import androidx.activity.compose.BackHandler
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.camera.core.CameraSelector
import androidx.camera.core.ImageAnalysis
import androidx.camera.core.Preview
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.camera.view.PreviewView
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.size
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Checkbox
import androidx.compose.material3.CheckboxDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.compose.foundation.text.KeyboardOptions
import androidx.core.content.ContextCompat
import androidx.lifecycle.compose.LocalLifecycleOwner
import app.sheepfold.android.R
import app.sheepfold.android.router.LocalSheepfoldDiscovery
import app.sheepfold.android.router.RouterConnectionManager
import app.sheepfold.android.router.RouterConnectionRequest
import com.google.mlkit.vision.barcode.BarcodeScannerOptions
import com.google.mlkit.vision.barcode.BarcodeScanning
import com.google.mlkit.vision.barcode.common.Barcode
import com.google.mlkit.vision.common.InputImage
import kotlinx.coroutines.launch
import java.util.Locale
import java.util.concurrent.Executors
import java.util.concurrent.atomic.AtomicBoolean

private enum class SetupStep {
    Agreement,
    WifiConnect,
    MacCheck,
    PairingChoice,
    QrScanner,
    ManualSetup,
    AppProtection
}

private enum class AppProtectionMode(
    val title: String,
    val description: String
) {
    Password(
        title = "Пароль",
        description = "Рекомендуемый вариант по умолчанию."
    ),
    Pin(
        title = "PIN-код из 4 цифр",
        description = "Удобно, но слабее длинного пароля."
    ),
    Face(
        title = "Распознавание по лицу",
        description = "Не рекомендуется как основной способ защиты."
    ),
    Fingerprint(
        title = "Отпечаток пальца",
        description = "Не рекомендуется как основной способ защиты."
    ),
    None(
        title = "Нет",
        description = "Приложение будет открываться без дополнительной защиты."
    )
}

private enum class NetworkTransport(
    val displayName: String
) {
    Wifi("Wi-Fi"),
    Ethernet("проводное подключение"),
    Cellular("мобильная сеть"),
    Other("другая сеть"),
    None("нет подключения")
}

private enum class DiscoveryStatus {
    Checking,
    Found,
    Attention
}

@Composable
fun RouterSetupScreen(onSetupComplete: () -> Unit) {
    val snackbarHostState = remember { SnackbarHostState() }
    val coroutineScope = rememberCoroutineScope()
    val routerConnectionManager = remember { RouterConnectionManager() }
    var setupStep by remember { mutableStateOf(SetupStep.Agreement) }
    var isTestingConnection by remember { mutableStateOf(false) }

    fun goBack() {
        setupStep = when (setupStep) {
            SetupStep.Agreement -> SetupStep.Agreement
            SetupStep.WifiConnect -> SetupStep.Agreement
            SetupStep.MacCheck -> SetupStep.WifiConnect
            SetupStep.PairingChoice -> SetupStep.MacCheck
            SetupStep.QrScanner -> SetupStep.PairingChoice
            SetupStep.ManualSetup -> SetupStep.PairingChoice
            SetupStep.AppProtection -> SetupStep.PairingChoice
        }
    }

    BackHandler(enabled = setupStep != SetupStep.Agreement) {
        goBack()
    }

    Scaffold(
        snackbarHost = { SnackbarHost(hostState = snackbarHostState) }
    ) { padding ->
        Box(modifier = Modifier.padding(padding)) {
            when (setupStep) {
                SetupStep.Agreement -> AgreementScreen(
                    onAccept = { setupStep = SetupStep.WifiConnect }
                )

                SetupStep.WifiConnect -> WifiConnectScreen(
                    routerConnectionManager = routerConnectionManager,
                    onDetected = { setupStep = SetupStep.MacCheck },
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
                    onBack = { goBack() },
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
                                    setupStep = SetupStep.AppProtection
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
                    onBack = { goBack() },
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
                                    setupStep = SetupStep.AppProtection
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

                SetupStep.AppProtection -> AppProtectionScreen(
                    onProtectionReady = {
                        coroutineScope.launch {
                            snackbarHostState.showSnackbar("Защита приложения настроена")
                        }
                        onSetupComplete()
                    }
                )
            }
        }
    }
}

@Composable
private fun AgreementScreen(onAccept: () -> Unit) {
    val context = LocalContext.current
    val uriHandler = LocalUriHandler.current
    val runtimePermissions = remember { requiredRuntimePermissions() }
    var agreementAccepted by remember { mutableStateOf(false) }
    var permissionStates by remember {
        mutableStateOf(runtimePermissions.associateWith { permission ->
            ContextCompat.checkSelfPermission(context, permission) == PackageManager.PERMISSION_GRANTED
        })
    }
    val allPermissionsGranted = permissionStates.values.all { it }
    val permissionsLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.RequestMultiplePermissions()
    ) { result ->
        permissionStates = runtimePermissions.associateWith { permission ->
            result[permission] ?: (
                ContextCompat.checkSelfPermission(context, permission) == PackageManager.PERMISSION_GRANTED
            )
        }
    }
    val canContinue = agreementAccepted && allPermissionsGranted

    Box(modifier = Modifier.fillMaxSize()) {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .verticalScroll(rememberScrollState())
                .padding(start = 20.dp, top = 20.dp, end = 20.dp, bottom = 144.dp),
            verticalArrangement = Arrangement.spacedBy(18.dp),
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            Image(
                painter = painterResource(id = R.drawable.sheepfold_logo),
                contentDescription = "Sheepfold",
                modifier = Modifier.size(84.dp)
            )
            ScreenHeader(text = "Sheepfold", large = true)
            Text(
                text = "Перед настройкой примите пользовательское соглашение и условия обработки технических данных, необходимых для работы приложения.",
                style = MaterialTheme.typography.bodyLarge
            )
            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(12.dp)
            ) {
                Checkbox(
                    checked = agreementAccepted,
                    onCheckedChange = { agreementAccepted = it },
                    modifier = Modifier.size(56.dp),
                    colors = CheckboxDefaults.colors(
                        checkedColor = Color(0xFF2E7D32),
                        uncheckedColor = MaterialTheme.colorScheme.onSurface
                    )
                )
                AgreementLinkText(
                    onClick = {
                        uriHandler.openUri(
                            "https://github.com/kva4991/luci-app-sheepfold-family-internet-control/blob/main/docs/user-agreement.ru.md"
                        )
                    },
                    modifier = Modifier.weight(1f)
                )
            }
            SetupCard(
                title = "Разрешения Android",
                body = if (allPermissionsGranted) {
                    "Разрешения выданы. Они нужны для QR-кода, чтения имени Wi-Fi сети, проверки MAC-адреса и важных уведомлений."
                } else {
                    "Выдайте разрешения на первом шаге. Камера нужна для QR-кода, Wi-Fi/геоданные - для имени сети и MAC-адреса, уведомления - для важных событий."
                }
            )
            FramedButton(
                enabled = !allPermissionsGranted,
                onClick = { permissionsLauncher.launch(runtimePermissions.toTypedArray()) },
                modifier = Modifier.fillMaxWidth()
            ) {
                Text(
                    text = if (allPermissionsGranted) {
                        "✓ Разрешения выданы"
                    } else {
                        "Выдать разрешения Android"
                    },
                    color = if (allPermissionsGranted) {
                        Color(0xFF2E7D32)
                    } else {
                        MaterialTheme.colorScheme.onSurface
                    }
                )
            }
        }

        RoundNextButton(
            enabled = canContinue,
            onClick = onAccept,
            modifier = Modifier
                .align(Alignment.BottomCenter)
                .padding(bottom = 20.dp)
        )
    }
}

@Composable
private fun WifiConnectScreen(
    routerConnectionManager: RouterConnectionManager,
    onDetected: (LocalSheepfoldDiscovery) -> Unit,
    onContinue: () -> Unit
) {
    val context = LocalContext.current
    var networkTransport by remember { mutableStateOf(readNetworkTransport(context)) }
    var isDetecting by remember { mutableStateOf(true) }
    var refreshNonce by remember { mutableIntStateOf(0) }
    var detectionMessage by remember { mutableStateOf("Ищу Sheepfold в текущей локальной сети...") }
    var discoveryStatus by remember { mutableStateOf(DiscoveryStatus.Checking) }
    val localNetworkAllowed = networkTransport == NetworkTransport.Wifi ||
        networkTransport == NetworkTransport.Ethernet

    LaunchedEffect(networkTransport, refreshNonce) {
        isDetecting = true
        discoveryStatus = DiscoveryStatus.Checking
        if (localNetworkAllowed) {
            val discovery = routerConnectionManager.discoverLocalSheepfold(context)
            if (discovery != null) {
                detectionMessage = "Sheepfold найден на роутере ${discovery.routerName}"
                discoveryStatus = DiscoveryStatus.Found
                onDetected(discovery)
            } else {
                detectionMessage = "Sheepfold автоматически не найден. Проверьте, что телефон подключён к домашней локальной сети."
                discoveryStatus = DiscoveryStatus.Attention
            }
        } else {
            detectionMessage = "Для первичной настройки нужна домашняя Wi-Fi сеть или проводное подключение к роутеру. Через мобильную сеть продолжить не получится."
            discoveryStatus = DiscoveryStatus.Attention
        }
        isDetecting = false
    }

    Box(modifier = Modifier.fillMaxSize()) {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .verticalScroll(rememberScrollState())
                .padding(start = 20.dp, top = 20.dp, end = 20.dp, bottom = 144.dp),
            verticalArrangement = Arrangement.spacedBy(18.dp),
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            ScreenHeader(text = "Подключение к локальной сети")
            Text(
                text = "Подключите телефон к домашней Wi-Fi сети или проводной сети роутера, на котором установлен Sheepfold.",
                style = MaterialTheme.typography.bodyLarge
            )
            if (!localNetworkAllowed) {
                SetupCard(
                    title = "Важно",
                    body = "Полная настройка работает локально. Через мобильную сеть продолжить не получится."
                )
            }
            SetupCard(
                title = "Текущее подключение",
                body = if (localNetworkAllowed) {
                    "✓ ${networkTransport.displayName}"
                } else {
                    networkTransport.displayName
                },
                bodyColor = if (localNetworkAllowed) Color(0xFF2E7D32) else null
            )
            StatusActionCard(
                title = "Автопоиск сервера Sheepfold",
                body = detectionMessage,
                status = discoveryStatus,
                onClick = {
                    networkTransport = readNetworkTransport(context)
                    refreshNonce += 1
                }
            )
            FramedButton(
                onClick = {
                    context.startActivity(Intent(Settings.ACTION_WIFI_SETTINGS))
                },
                modifier = Modifier.fillMaxWidth()
            ) {
                Text(text = "Открыть настройки Wi-Fi")
            }
        }

        RoundNextButton(
            enabled = !isDetecting && localNetworkAllowed,
            onClick = onContinue,
            modifier = Modifier
                .align(Alignment.BottomCenter)
                .padding(bottom = 20.dp)
        )
    }
}

@Composable
private fun RoundNextButton(
    enabled: Boolean,
    onClick: () -> Unit,
    modifier: Modifier = Modifier
) {
    Button(
        enabled = enabled,
        onClick = onClick,
        modifier = modifier.size(112.dp),
        shape = CircleShape,
        colors = ButtonDefaults.buttonColors(
            containerColor = MaterialTheme.colorScheme.surface,
            contentColor = MaterialTheme.colorScheme.onSurface,
            disabledContainerColor = Color(0xFFDDEBE4),
            disabledContentColor = Color(0xFF5F746C)
        )
    ) {
        Column(horizontalAlignment = Alignment.CenterHorizontally) {
            Text(text = "▸", style = MaterialTheme.typography.headlineSmall)
            Text(text = "далее")
        }
    }
}

@Composable
private fun AgreementLinkText(
    onClick: () -> Unit,
    modifier: Modifier = Modifier
) {
    val text = buildAnnotatedString {
        append("Я согласен с ")
        withStyle(
            SpanStyle(
                color = MaterialTheme.colorScheme.primary,
                textDecoration = TextDecoration.Underline,
                fontWeight = androidx.compose.ui.text.font.FontWeight.Bold
            )
        ) {
            append("пользовательским соглашением")
        }
        append(" и обработкой персональных данных")
    }

    Box(modifier = modifier) {
        Text(
            text = text,
            style = MaterialTheme.typography.bodyLarge,
            color = MaterialTheme.colorScheme.onSurface
        )
        Box(
            modifier = Modifier
                .fillMaxSize()
                .clickable(onClick = onClick)
        )
    }
}

@Composable
private fun PairingChoiceButton(
    text: String,
    containerColor: Color,
    contentColor: Color,
    onClick: () -> Unit,
    modifier: Modifier = Modifier
) {
    Button(
        onClick = onClick,
        modifier = modifier,
        colors = ButtonDefaults.buttonColors(
            containerColor = containerColor,
            contentColor = contentColor
        )
    ) {
        Text(
            text = text,
            modifier = Modifier.padding(vertical = 14.dp),
            style = MaterialTheme.typography.titleLarge
        )
    }
}

@Composable
private fun StatusActionCard(
    title: String,
    body: String,
    status: DiscoveryStatus,
    onClick: () -> Unit
) {
    val statusColor = when (status) {
        DiscoveryStatus.Found -> Color(0xFF2E7D32)
        DiscoveryStatus.Checking,
        DiscoveryStatus.Attention -> Color(0xFFF9A825)
    }

    Card(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onClick),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        border = BorderStroke(2.dp, statusColor)
    ) {
        Column(
            modifier = Modifier.padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.Top
            ) {
                Text(text = title, style = MaterialTheme.typography.titleMedium)
                Text(
                    text = "⟳",
                    style = MaterialTheme.typography.titleLarge,
                    color = statusColor
                )
            }
            Text(
                text = when (status) {
                    DiscoveryStatus.Found -> "Статус: найдено"
                    DiscoveryStatus.Checking -> "Статус: проверка"
                    DiscoveryStatus.Attention -> "Статус: требуется внимание"
                },
                style = MaterialTheme.typography.bodyMedium,
                color = statusColor
            )
            Text(text = body, style = MaterialTheme.typography.bodyMedium)
        }
    }
}

@Composable
private fun MacCheckScreen(onContinue: () -> Unit) {
    val context = LocalContext.current
    var networkTransport by remember { mutableStateOf(readNetworkTransport(context)) }
    var currentWifi by remember { mutableStateOf(readCurrentWifiDetails(context)) }
    val macLooksRandomized = currentWifi.macAddress?.let(::isLocallyAdministeredMac) == true
    val wifiName = currentWifi.ssid ?: "не удалось определить"
    val macAddress = currentWifi.macAddress ?: "не удалось определить"
    val isWifi = networkTransport == NetworkTransport.Wifi
    val isEthernet = networkTransport == NetworkTransport.Ethernet

    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(20.dp),
        verticalArrangement = Arrangement.spacedBy(18.dp),
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        ScreenHeader(text = "Проверка MAC-адреса")
        Text(
            text = if (isWifi) {
                "Для этой домашней Wi-Fi сети должен быть включён настоящий MAC-адрес телефона, а не случайный/private MAC."
            } else {
                "Для проводного подключения роутер видит MAC сетевого адаптера. Подтвердите, что именно это подключение нужно привязать как админское."
            },
            style = MaterialTheme.typography.bodyLarge
        )
        SetupCard(
            title = "Текущее подключение",
            body = if (isWifi) {
                "Тип: ${networkTransport.displayName}\nWi-Fi: $wifiName\nMAC: $macAddress"
            } else {
                "Тип: ${networkTransport.displayName}\nMAC: $macAddress"
            }
        )
        if (!isWifi && !isEthernet) {
            SetupCard(
                title = "Нужна локальная сеть",
                body = "Вернитесь назад и подключите телефон к Wi-Fi или проводной сети роутера."
            )
        } else if (currentWifi.macAddress == null) {
            SetupCard(
                title = "Нужна ручная проверка",
                body = if (isWifi) {
                    "Android не отдал MAC-адрес приложению. Откройте настройки текущей Wi-Fi сети и проверьте, что выбран настоящий MAC-адрес устройства."
                } else {
                    "Android не отдал MAC-адрес адаптера приложению. Проверьте устройство в списке клиентов роутера."
                }
            )
        } else if (macLooksRandomized) {
            SetupCard(
                title = "MAC выглядит как локально назначенный",
                body = if (isWifi) {
                    "Это часто означает randomized/private MAC. Переключите эту Wi-Fi сеть на настоящий MAC устройства."
                } else {
                    "У проводного адаптера такой MAC тоже возможен. Проверьте, что именно этот адаптер нужно привязать как админское устройство."
                }
            )
        } else {
            SetupCard(
                title = "Похоже, всё в порядке",
                body = "MAC выглядит как постоянный адрес для текущего подключения. Подробные инструкции не нужны."
            )
        }
        FramedButton(
            onClick = {
                networkTransport = readNetworkTransport(context)
                currentWifi = readCurrentWifiDetails(context)
            },
            modifier = Modifier.fillMaxWidth()
        ) {
            Text(text = "Обновить данные подключения")
        }
        if (isWifi) {
            FramedButton(
                onClick = {
                    context.startActivity(Intent(Settings.ACTION_WIFI_SETTINGS))
                },
                modifier = Modifier.fillMaxWidth()
            ) {
                Text(text = "Открыть настройки Wi-Fi")
            }
        }
        FramedButton(
            enabled = isWifi || isEthernet,
            onClick = onContinue,
            modifier = Modifier.fillMaxWidth()
        ) {
            Text(text = if (isWifi) "Настоящий MAC включён" else "Подтверждаю подключение")
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
        ScreenHeader(text = "Настройка подключения")
        Text(
            text = "Выберите способ подключения к Sheepfold на OpenWRT-роутере.",
            style = MaterialTheme.typography.bodyLarge
        )
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .weight(1f)
        ) {
            PairingChoiceButton(
                text = "QR код",
                containerColor = Color(0xFF2E7D32),
                contentColor = Color.White,
                onClick = onQrClick,
                modifier = Modifier
                    .align(Alignment.TopCenter)
                    .padding(top = 36.dp)
                    .fillMaxWidth(0.84f)
            )
            PairingChoiceButton(
                text = "Ручная настройка",
                containerColor = Color(0xFFF2C94C),
                contentColor = Color(0xFF3A2A00),
                onClick = onManualClick,
                modifier = Modifier
                    .align(Alignment.BottomCenter)
                    .padding(bottom = 36.dp)
                    .fillMaxWidth(0.84f)
            )
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
    var administratorLogin by remember { mutableStateOf("") }
    var serverAddress by remember { mutableStateOf("") }
    var port by remember { mutableStateOf("80") }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(20.dp),
        verticalArrangement = Arrangement.spacedBy(14.dp)
    ) {
        ScreenHeader(text = "Ручная настройка")
        Text(
            text = "Введите данные сопряжения, показанные в LuCI рядом с QR-кодом.",
            style = MaterialTheme.typography.bodyLarge
        )
        SheepfoldTextField(
            value = temporaryPassword,
            onValueChange = { temporaryPassword = it },
            modifier = Modifier.fillMaxWidth(),
            label = { Text("Временный пароль") },
            singleLine = true
        )
        SheepfoldTextField(
            value = administratorLogin,
            onValueChange = { administratorLogin = filterLatinLogin(it) },
            modifier = Modifier.fillMaxWidth(),
            label = { Text("Логин") },
            singleLine = true,
            supportingText = { Text("Только латиница, цифры и символы . _ - @") },
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Ascii)
        )
        SheepfoldTextField(
            value = serverAddress,
            onValueChange = { serverAddress = formatIpv4Input(it) },
            modifier = Modifier.fillMaxWidth(),
            label = { Text("IP адрес роутера") },
            singleLine = true,
            placeholder = { Text("192.168.1.1") },
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal)
        )
        SheepfoldTextField(
            value = port,
            onValueChange = { port = formatPortInput(it) },
            modifier = Modifier.fillMaxWidth(),
            label = { Text("Порт") },
            singleLine = true,
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
            supportingText = { Text("По умолчанию 80 для LuCI/API.") }
        )
        FramedButton(
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
                        routerName = host,
                        temporaryPassword = temporaryPassword.ifBlank { null },
                        administratorLogin = administratorLogin.ifBlank { null }
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
        FramedButton(
            onClick = onBack,
            modifier = Modifier.fillMaxWidth()
        ) {
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
        ScreenHeader(text = "Сканирование QR")
        Text(
            text = "Наведите камеру на QR-код сопряжения, открытый в LuCI.",
            style = MaterialTheme.typography.bodyLarge
        )
        FramedButton(
            enabled = !isTestingConnection,
            onClick = { imagePickerLauncher.launch("image/*") },
            modifier = Modifier.fillMaxWidth()
        ) {
            Text(text = "Загрузить QR из файла")
        }

        Box(
            modifier = Modifier
                .fillMaxWidth()
                .aspectRatio(1f),
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
                    FramedButton(
                        onClick = { permissionLauncher.launch(Manifest.permission.CAMERA) }
                    ) {
                        Text(text = "Разрешить камеру")
                    }
                }
            }
        }

        FramedButton(
            onClick = onBack,
            modifier = Modifier.fillMaxWidth()
        ) {
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
private fun AppProtectionScreen(onProtectionReady: () -> Unit) {
    var selectedMode by remember { mutableStateOf(AppProtectionMode.Password) }
    var password by remember { mutableStateOf("") }
    var repeatPassword by remember { mutableStateOf("") }
    var pin by remember { mutableStateOf("") }
    var repeatPin by remember { mutableStateOf("") }
    val canContinue = when (selectedMode) {
        AppProtectionMode.Password -> password.length >= 4 && password == repeatPassword
        AppProtectionMode.Pin -> pin.length == 4 && pin == repeatPin
        AppProtectionMode.Face,
        AppProtectionMode.Fingerprint,
        AppProtectionMode.None -> true
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(20.dp),
        verticalArrangement = Arrangement.spacedBy(14.dp),
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        ScreenHeader(text = "Защита приложения")
        Text(
            text = "Выберите способ защиты входа в Sheepfold на этом телефоне.",
            style = MaterialTheme.typography.bodyLarge
        )
        SetupCard(
            title = "Рекомендация",
            body = "По умолчанию используйте пароль. PIN удобнее, но слабее. Отпечаток пальца и лицо могут быть менее надёжны, если ребёнок попробует разблокировать приложение, пока родитель спит."
        )
        AppProtectionMode.entries.forEach { mode ->
            FramedButton(
                onClick = { selectedMode = mode },
                modifier = Modifier.fillMaxWidth()
            ) {
                Text(
                    text = if (selectedMode == mode) {
                        "${mode.title} [выбрано]"
                    } else {
                        mode.title
                    }
                )
            }
        }

        SetupCard(title = selectedMode.title, body = selectedMode.description)

        when (selectedMode) {
            AppProtectionMode.Password -> {
                SheepfoldTextField(
                    value = password,
                    onValueChange = { password = it },
                    modifier = Modifier.fillMaxWidth(),
                    label = { Text("Пароль") },
                    singleLine = true,
                    visualTransformation = PasswordVisualTransformation(),
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password)
                )
                SheepfoldTextField(
                    value = repeatPassword,
                    onValueChange = { repeatPassword = it },
                    modifier = Modifier.fillMaxWidth(),
                    label = { Text("Повторите пароль") },
                    singleLine = true,
                    visualTransformation = PasswordVisualTransformation(),
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password)
                )
            }

            AppProtectionMode.Pin -> {
                SheepfoldTextField(
                    value = pin,
                    onValueChange = { pin = it.filter(Char::isDigit).take(4) },
                    modifier = Modifier.fillMaxWidth(),
                    label = { Text("PIN-код") },
                    singleLine = true,
                    visualTransformation = PasswordVisualTransformation(),
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.NumberPassword)
                )
                SheepfoldTextField(
                    value = repeatPin,
                    onValueChange = { repeatPin = it.filter(Char::isDigit).take(4) },
                    modifier = Modifier.fillMaxWidth(),
                    label = { Text("Повторите PIN-код") },
                    singleLine = true,
                    visualTransformation = PasswordVisualTransformation(),
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.NumberPassword)
                )
            }

            AppProtectionMode.Face -> SetupCard(
                title = "Важно",
                body = "Распознавание по лицу будет подключено позже через системную биометрию Android. Сейчас выбор фиксирует желаемый режим."
            )

            AppProtectionMode.Fingerprint -> SetupCard(
                title = "Важно",
                body = "Отпечаток пальца будет подключён позже через системную биометрию Android. Сейчас выбор фиксирует желаемый режим."
            )

            AppProtectionMode.None -> SetupCard(
                title = "Без защиты",
                body = "Этот вариант стоит использовать только если телефон уже надёжно защищён и не попадает детям в руки."
            )
        }

        FramedButton(
            enabled = canContinue,
            onClick = onProtectionReady,
            modifier = Modifier.fillMaxWidth()
        ) {
            Text(text = "Завершить настройку")
        }
    }
}

@Composable
private fun SheepfoldTextField(
    value: String,
    onValueChange: (String) -> Unit,
    modifier: Modifier = Modifier,
    label: @Composable (() -> Unit)? = null,
    placeholder: @Composable (() -> Unit)? = null,
    supportingText: @Composable (() -> Unit)? = null,
    singleLine: Boolean = false,
    visualTransformation: VisualTransformation = VisualTransformation.None,
    keyboardOptions: KeyboardOptions = KeyboardOptions.Default
) {
    OutlinedTextField(
        value = value,
        onValueChange = onValueChange,
        modifier = modifier,
        label = label,
        placeholder = placeholder,
        supportingText = supportingText,
        singleLine = singleLine,
        visualTransformation = visualTransformation,
        keyboardOptions = keyboardOptions,
        colors = OutlinedTextFieldDefaults.colors(
            focusedBorderColor = MaterialTheme.colorScheme.primary,
            unfocusedBorderColor = MaterialTheme.colorScheme.outline,
            disabledBorderColor = MaterialTheme.colorScheme.outline,
            errorBorderColor = MaterialTheme.colorScheme.error,
            focusedLabelColor = MaterialTheme.colorScheme.primary,
            cursorColor = MaterialTheme.colorScheme.primary
        )
    )
}

private fun filterLatinLogin(value: String): String {
    return value.filter { character ->
        character in 'a'..'z' ||
            character in 'A'..'Z' ||
            character in '0'..'9' ||
            character == '.' ||
            character == '_' ||
            character == '-' ||
            character == '@'
    }.take(64)
}

private fun formatIpv4Input(value: String): String {
    val groups = value
        .filter { it.isDigit() || it == '.' }
        .split('.')
        .take(4)
        .map { group ->
            group
                .filter(Char::isDigit)
                .take(3)
                .toIntOrNull()
                ?.coerceIn(0, 255)
                ?.toString()
                ?: group.filter(Char::isDigit).take(3)
        }

    return groups.joinToString(".").take(15)
}

private fun formatPortInput(value: String): String {
    return value.filter(Char::isDigit)
        .take(5)
        .toIntOrNull()
        ?.coerceIn(1, 65535)
        ?.toString()
        ?: ""
}

private fun readNetworkTransport(context: Context): NetworkTransport {
    val connectivityManager = context.getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager
    val capabilities = connectivityManager.getNetworkCapabilities(connectivityManager.activeNetwork)
        ?: return NetworkTransport.None

    return when {
        capabilities.hasTransport(NetworkCapabilities.TRANSPORT_WIFI) -> NetworkTransport.Wifi
        capabilities.hasTransport(NetworkCapabilities.TRANSPORT_ETHERNET) -> NetworkTransport.Ethernet
        capabilities.hasTransport(NetworkCapabilities.TRANSPORT_CELLULAR) -> NetworkTransport.Cellular
        else -> NetworkTransport.Other
    }
}

private fun requiredRuntimePermissions(): List<String> {
    val permissions = mutableListOf(
        Manifest.permission.CAMERA,
        Manifest.permission.ACCESS_FINE_LOCATION
    )

    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
        permissions += Manifest.permission.NEARBY_WIFI_DEVICES
        permissions += Manifest.permission.POST_NOTIFICATIONS
    }

    return permissions
}

private data class CurrentWifiDetails(
    val ssid: String?,
    val macAddress: String?
)

private fun readCurrentWifiDetails(context: Context): CurrentWifiDetails {
    val wifiInfo = currentWifiInfo(context) ?: return CurrentWifiDetails(
        ssid = null,
        macAddress = null
    )

    return CurrentWifiDetails(
        ssid = cleanWifiSsid(wifiInfo.ssid),
        macAddress = cleanWifiMacAddress(wifiInfo.macAddress)
    )
}

private fun cleanWifiMacAddress(value: String?): String? {
    val macAddress = value
        ?.trim()
        ?.uppercase(Locale.US)
        ?: return null

    return macAddress.takeIf { mac ->
        mac.isNotBlank() &&
            mac != "02:00:00:00:00:00" &&
            Regex("^[0-9A-F]{2}(:[0-9A-F]{2}){5}$").matches(mac)
    }
}

private fun cleanWifiSsid(value: String?): String? {
    return value
        ?.trim()
        ?.removeSurrounding("\"")
        ?.takeUnless { ssid -> ssid.isBlank() || ssid == "<unknown ssid>" }
}

private fun isLocallyAdministeredMac(macAddress: String): Boolean {
    val firstOctet = macAddress.substringBefore(':').toIntOrNull(radix = 16) ?: return false
    return firstOctet and 0x02 != 0
}

private fun currentWifiInfo(context: Context): WifiInfo? {
    return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
        val connectivityManager = context.getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager
        connectivityManager
            .getNetworkCapabilities(connectivityManager.activeNetwork)
            ?.transportInfo as? WifiInfo
    } else {
        @Suppress("DEPRECATION")
        val wifiManager = context.applicationContext.getSystemService(Context.WIFI_SERVICE) as WifiManager
        @Suppress("DEPRECATION")
        wifiManager.connectionInfo
    }
}

@Composable
private fun ScreenHeader(
    text: String,
    modifier: Modifier = Modifier,
    large: Boolean = false
) {
    Box(
        modifier = modifier
            .fillMaxWidth()
            .background(MaterialTheme.colorScheme.primaryContainer)
            .padding(horizontal = 14.dp, vertical = 10.dp)
    ) {
        Text(
            text = text,
            style = if (large) {
                MaterialTheme.typography.headlineLarge
            } else {
                MaterialTheme.typography.headlineMedium
            },
            color = MaterialTheme.colorScheme.onPrimaryContainer
        )
    }
}

@Composable
private fun FramedButton(
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
    content: @Composable RowScope.() -> Unit
) {
    OutlinedButton(
        onClick = onClick,
        modifier = modifier,
        enabled = enabled,
        border = BorderStroke(1.dp, MaterialTheme.colorScheme.onSurface),
        colors = ButtonDefaults.outlinedButtonColors(
            containerColor = MaterialTheme.colorScheme.surface,
            contentColor = MaterialTheme.colorScheme.onSurface,
            disabledContainerColor = MaterialTheme.colorScheme.surface,
            disabledContentColor = MaterialTheme.colorScheme.outline
        ),
        content = content
    )
}

@Composable
private fun SetupCard(
    title: String,
    body: String,
    bodyColor: Color? = null
) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface)
    ) {
        Column(
            modifier = Modifier.padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(6.dp)
        ) {
            Text(text = title, style = MaterialTheme.typography.titleMedium)
            Text(
                text = body,
                style = MaterialTheme.typography.bodyMedium,
                color = bodyColor ?: MaterialTheme.colorScheme.onSurface
            )
        }
    }
}
