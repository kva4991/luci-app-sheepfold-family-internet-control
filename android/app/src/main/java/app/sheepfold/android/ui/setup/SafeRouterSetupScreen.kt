package app.sheepfold.android.ui.setup

import android.Manifest
import android.content.pm.PackageManager
import android.os.Build
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.FilterChip
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import androidx.core.content.ContextCompat
import app.sheepfold.android.router.RouterConnectionRequest
import app.sheepfold.android.router.SecureRouterConnectionManager
import app.sheepfold.android.security.AppProtectionMode
import app.sheepfold.android.security.AppProtectionStore
import kotlinx.coroutines.launch

/**
 * Рабочий мастер настройки. Runtime-разрешения улучшают отдельные функции,
 * но отказ пользователя никогда не блокирует ручное или QR-сопряжение.
 */
@Composable
fun SafeRouterSetupScreen(onSetupComplete: (RouterConnectionRequest) -> Unit) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val manager = remember { SecureRouterConnectionManager() }
    var qrPayload by remember { mutableStateOf("") }
    var address by remember { mutableStateOf("192.168.1.1") }
    var login by remember { mutableStateOf("") }
    var pairingCode by remember { mutableStateOf("") }
    var connected by remember { mutableStateOf<RouterConnectionRequest?>(null) }
    var isConnecting by remember { mutableStateOf(false) }
    var errorMessage by remember { mutableStateOf<String?>(null) }
    var protectionMode by remember { mutableStateOf(AppProtectionMode.PASSWORD) }
    var secret by remember { mutableStateOf("") }
    var secretRepeat by remember { mutableStateOf("") }

    val permissionLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.RequestMultiplePermissions()
    ) {
        // Разрешения необязательны: пользователь продолжает работу после отказа.
    }
    val optionalPermissions = buildList {
        if (
            Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
            ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED
        ) {
            add(Manifest.permission.POST_NOTIFICATIONS)
        }
    }

    fun connect(request: RouterConnectionRequest) {
        isConnecting = true
        errorMessage = null
        scope.launch {
            runCatching { manager.connect(request) }
                .onSuccess { connected = it }
                .onFailure { errorMessage = it.message ?: "Не удалось подключиться к роутеру" }
            isConnecting = false
        }
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(20.dp),
        verticalArrangement = Arrangement.spacedBy(14.dp)
    ) {
        Text("Подключение Sheepfold", style = MaterialTheme.typography.headlineMedium)

        if (connected == null) {
            InfoCard(
                title = "Разрешения Android",
                body = if (optionalPermissions.isEmpty()) {
                    "Все доступные разрешения выданы. Для сопряжения специальных разрешений не требуется."
                } else {
                    "Уведомления необязательны. Даже после отказа сопряжение и управление роутером продолжат работать."
                }
            )
            if (optionalPermissions.isNotEmpty()) {
                OutlinedButton(
                    onClick = { permissionLauncher.launch(optionalPermissions.toTypedArray()) },
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Text("Запросить необязательные разрешения")
                }
            }

            OutlinedTextField(
                value = qrPayload,
                onValueChange = { qrPayload = it },
                modifier = Modifier.fillMaxWidth(),
                label = { Text("Данные QR-кода") },
                supportingText = { Text("Вставьте строку SF1|... или JSON из LuCI") },
                minLines = 3
            )
            Button(
                enabled = qrPayload.isNotBlank() && !isConnecting,
                onClick = {
                    runCatching { manager.parseQrPayload(qrPayload) }
                        .onSuccess(::connect)
                        .onFailure { errorMessage = it.message }
                },
                modifier = Modifier.fillMaxWidth()
            ) {
                Text("Подключиться по QR-данным")
            }

            Text("Или ручная настройка", style = MaterialTheme.typography.titleMedium)
            OutlinedTextField(
                value = address,
                onValueChange = { address = it },
                modifier = Modifier.fillMaxWidth(),
                label = { Text("Адрес роутера") },
                singleLine = true
            )
            OutlinedTextField(
                value = login,
                onValueChange = { login = it.filter { char -> char.isLetterOrDigit() || char in "._-@" }.take(64) },
                modifier = Modifier.fillMaxWidth(),
                label = { Text("Логин администратора") },
                singleLine = true
            )
            OutlinedTextField(
                value = pairingCode,
                onValueChange = { pairingCode = it.take(64) },
                modifier = Modifier.fillMaxWidth(),
                label = { Text("Временный код сопряжения") },
                visualTransformation = PasswordVisualTransformation(),
                singleLine = true
            )
            Button(
                enabled = address.isNotBlank() && login.isNotBlank() && pairingCode.isNotBlank() && !isConnecting,
                onClick = {
                    runCatching { manager.manualRequest(address, login, pairingCode) }
                        .onSuccess(::connect)
                        .onFailure { errorMessage = it.message }
                },
                modifier = Modifier.fillMaxWidth()
            ) {
                if (isConnecting) CircularProgressIndicator() else Text("Подключиться")
            }
        } else {
            Text("Защита приложения", style = MaterialTheme.typography.headlineSmall)
            Text(
                "Пароль рекомендуется. Face и Fingerprint можно выбрать, но Sheepfold полагается на системную блокировку телефона и не считает эти режимы усиленной защитой."
            )
            AppProtectionMode.entries.forEach { mode ->
                FilterChip(
                    selected = protectionMode == mode,
                    onClick = { protectionMode = mode },
                    label = { Text(modeLabel(mode)) }
                )
            }
            if (protectionMode == AppProtectionMode.PASSWORD || protectionMode == AppProtectionMode.PIN) {
                OutlinedTextField(
                    value = secret,
                    onValueChange = {
                        secret = if (protectionMode == AppProtectionMode.PIN) it.filter(Char::isDigit).take(4) else it
                    },
                    modifier = Modifier.fillMaxWidth(),
                    label = { Text(if (protectionMode == AppProtectionMode.PIN) "PIN" else "Пароль") },
                    visualTransformation = PasswordVisualTransformation(),
                    singleLine = true
                )
                OutlinedTextField(
                    value = secretRepeat,
                    onValueChange = {
                        secretRepeat = if (protectionMode == AppProtectionMode.PIN) it.filter(Char::isDigit).take(4) else it
                    },
                    modifier = Modifier.fillMaxWidth(),
                    label = { Text("Повторите значение") },
                    visualTransformation = PasswordVisualTransformation(),
                    singleLine = true
                )
            }
            val secretValid = when (protectionMode) {
                AppProtectionMode.PASSWORD -> secret.length >= 4 && secret == secretRepeat
                AppProtectionMode.PIN -> secret.length == 4 && secret == secretRepeat
                else -> true
            }
            Button(
                enabled = secretValid,
                onClick = {
                    AppProtectionStore.save(context, protectionMode, secret.takeIf { secretValid })
                    onSetupComplete(connected!!)
                },
                modifier = Modifier.fillMaxWidth()
            ) {
                Text("Завершить настройку")
            }
        }

        errorMessage?.let {
            Text(it, color = MaterialTheme.colorScheme.error)
        }
    }
}

@Composable
private fun InfoCard(title: String, body: String) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant)
    ) {
        Column(
            modifier = Modifier.padding(14.dp),
            verticalArrangement = Arrangement.spacedBy(6.dp)
        ) {
            Text(title, style = MaterialTheme.typography.titleMedium)
            Text(body, style = MaterialTheme.typography.bodyMedium)
        }
    }
}

private fun modeLabel(mode: AppProtectionMode): String = when (mode) {
    AppProtectionMode.PASSWORD -> "Пароль — рекомендуется"
    AppProtectionMode.PIN -> "PIN-код"
    AppProtectionMode.FACE -> "Face — не рекомендуется"
    AppProtectionMode.FINGERPRINT -> "Fingerprint — не рекомендуется"
    AppProtectionMode.NONE -> "Без дополнительной защиты"
}
