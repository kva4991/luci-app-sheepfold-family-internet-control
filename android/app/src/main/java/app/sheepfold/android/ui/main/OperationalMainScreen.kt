package app.sheepfold.android.ui.main

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.weight
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.ScrollableTabRow
import androidx.compose.material3.Tab
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import app.sheepfold.android.router.AiAssistantClient
import app.sheepfold.android.router.AiAssistantRequest
import app.sheepfold.android.router.RouterAdminClient
import app.sheepfold.android.router.RouterConnectionRequest
import app.sheepfold.android.router.RouterDevice
import app.sheepfold.android.router.RouterSnapshot
import app.sheepfold.android.ui.theme.ThemeMode
import kotlinx.coroutines.launch

/** Рабочий экран: данные и команды всегда приходят с подключённого роутера. */
@Composable
fun OperationalMainScreen(
    connection: RouterConnectionRequest,
    themeMode: ThemeMode,
    onThemeModeChange: (ThemeMode) -> Unit,
    onDisconnect: () -> Unit
) {
    val scope = rememberCoroutineScope()
    val client = remember(connection.apiUrl, connection.bearerToken) { RouterAdminClient(connection) }
    var selectedTab by remember { mutableIntStateOf(0) }
    var devices by remember { mutableStateOf<List<RouterDevice>>(emptyList()) }
    var snapshot by remember { mutableStateOf<RouterSnapshot?>(null) }
    var isLoading by remember { mutableStateOf(false) }
    var message by remember { mutableStateOf<String?>(null) }

    fun refresh() {
        isLoading = true
        message = null
        scope.launch {
            runCatching {
                devices = client.loadDevices()
                snapshot = client.loadRouterInfo()
            }.onFailure { message = it.message ?: "Не удалось обновить данные" }
            isLoading = false
        }
    }

    LaunchedEffect(connection.apiUrl) { refresh() }

    Column(modifier = Modifier.fillMaxSize()) {
        ScrollableTabRow(selectedTabIndex = selectedTab) {
            listOf("Управление", "Устройства", "ИИ", "Информация", "Настройки")
                .forEachIndexed { index, title ->
                    Tab(
                        selected = selectedTab == index,
                        onClick = { selectedTab = index },
                        text = { Text(title) }
                    )
                }
        }
        when (selectedTab) {
            0 -> ControlTab(
                routerName = snapshot?.routerName ?: connection.routerName,
                isLoading = isLoading,
                message = message,
                onRefresh = ::refresh,
                onBlock = { enabled ->
                    isLoading = true
                    scope.launch {
                        runCatching { client.setGlobalBlock(enabled) }
                            .onSuccess {
                                message = if (enabled) "Глобальная блокировка включена на роутере" else "Интернет включён на роутере"
                            }
                            .onFailure { message = it.message }
                        isLoading = false
                    }
                }
            )
            1 -> DevicesTab(devices = devices, isLoading = isLoading, onRefresh = ::refresh)
            2 -> AiTab(connection)
            3 -> RouterInfoTab(snapshot = snapshot, isLoading = isLoading, onRefresh = ::refresh)
            else -> SettingsTab(themeMode, onThemeModeChange, onDisconnect)
        }
    }
}

@Composable
private fun ControlTab(
    routerName: String,
    isLoading: Boolean,
    message: String?,
    onRefresh: () -> Unit,
    onBlock: (Boolean) -> Unit
) {
    Column(
        modifier = Modifier.padding(20.dp),
        verticalArrangement = Arrangement.spacedBy(14.dp)
    ) {
        Text("Роутер: $routerName", style = MaterialTheme.typography.headlineSmall)
        Text("Команды выполняются непосредственно на OpenWrt-роутере.")
        Button(
            onClick = { onBlock(false) },
            enabled = !isLoading,
            modifier = Modifier.fillMaxWidth()
        ) { Text("Включить интернет") }
        Button(
            onClick = { onBlock(true) },
            enabled = !isLoading,
            modifier = Modifier.fillMaxWidth()
        ) { Text("Отключить интернет для всех") }
        OutlinedButton(onClick = onRefresh, enabled = !isLoading, modifier = Modifier.fillMaxWidth()) {
            Text("Обновить данные")
        }
        if (isLoading) CircularProgressIndicator()
        message?.let { Text(it) }
    }
}

@Composable
private fun DevicesTab(devices: List<RouterDevice>, isLoading: Boolean, onRefresh: () -> Unit) {
    LazyColumn(
        modifier = Modifier
            .fillMaxSize()
            .padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp)
    ) {
        item {
            Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                Text("Устройства роутера", style = MaterialTheme.typography.headlineSmall)
                OutlinedButton(onClick = onRefresh, enabled = !isLoading) { Text("Обновить") }
            }
        }
        if (!isLoading && devices.isEmpty()) {
            item { Text("Роутер не вернул зарегистрированных устройств.") }
        }
        items(devices, key = { it.id }) { device ->
            Card(colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant)) {
                Column(
                    modifier = Modifier.padding(14.dp),
                    verticalArrangement = Arrangement.spacedBy(4.dp)
                ) {
                    Text((if (device.isAdministrator) "♛ " else "") + device.name)
                    Text("Статус: ${device.status}")
                    Text("IP: ${device.ip.ifBlank { "—" }}")
                    Text("MAC: ${device.mac.ifBlank { "—" }}")
                    Text("Группа: ${device.group.ifBlank { "—" }}")
                }
            }
        }
    }
}

@Composable
private fun AiTab(connection: RouterConnectionRequest) {
    val scope = rememberCoroutineScope()
    var question by remember { mutableStateOf("") }
    var answer by remember { mutableStateOf("") }
    var isLoading by remember { mutableStateOf(false) }

    Column(
        modifier = Modifier.padding(20.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        Text("ИИ-помощник для родителя", style = MaterialTheme.typography.headlineSmall)
        Text("По умолчанию передаётся только вопрос и проверенная роль устройства.")
        OutlinedTextField(
            value = question,
            onValueChange = { question = it },
            modifier = Modifier.fillMaxWidth(),
            label = { Text("Вопрос") },
            minLines = 3
        )
        Button(
            enabled = question.isNotBlank() && !isLoading,
            onClick = {
                isLoading = true
                scope.launch {
                    answer = runCatching {
                        AiAssistantClient.ask(
                            AiAssistantRequest(
                                connection = connection,
                                provider = "",
                                model = "",
                                message = question,
                                includeRouterInfo = false,
                                includeProgramLog = false,
                                googleAccount = ""
                            )
                        )
                    }.getOrElse { it.message ?: "Не удалось получить ответ" }
                    isLoading = false
                }
            },
            modifier = Modifier.fillMaxWidth()
        ) { Text("Спросить") }
        if (isLoading) CircularProgressIndicator()
        if (answer.isNotBlank()) {
            Card(colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant)) {
                Text(answer, modifier = Modifier.padding(14.dp))
            }
        }
    }
}

@Composable
private fun RouterInfoTab(snapshot: RouterSnapshot?, isLoading: Boolean, onRefresh: () -> Unit) {
    LazyColumn(
        modifier = Modifier
            .fillMaxSize()
            .padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp)
    ) {
        item {
            Text("Информация о роутере", style = MaterialTheme.typography.headlineSmall)
            Spacer(Modifier.height(8.dp))
            OutlinedButton(onClick = onRefresh, enabled = !isLoading) { Text("Обновить") }
        }
        snapshot?.diagnostics?.entries?.sortedBy { it.key }?.let { entries ->
            items(entries) { entry ->
                Card(colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant)) {
                    Row(modifier = Modifier.fillMaxWidth().padding(12.dp)) {
                        Text(entry.key, modifier = Modifier.weight(1f))
                        Text(entry.value.ifBlank { "—" }, modifier = Modifier.weight(1f))
                    }
                }
            }
        }
    }
}

@Composable
private fun SettingsTab(
    themeMode: ThemeMode,
    onThemeModeChange: (ThemeMode) -> Unit,
    onDisconnect: () -> Unit
) {
    Column(
        modifier = Modifier.padding(20.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        Text("Настройки", style = MaterialTheme.typography.headlineSmall)
        ThemeMode.entries.forEach { mode ->
            OutlinedButton(
                onClick = { onThemeModeChange(mode) },
                modifier = Modifier.fillMaxWidth()
            ) {
                Text((if (themeMode == mode) "✓ " else "") + mode.name)
            }
        }
        Button(onClick = onDisconnect, modifier = Modifier.fillMaxWidth()) {
            Text("Отключить приложение от роутера")
        }
    }
}
