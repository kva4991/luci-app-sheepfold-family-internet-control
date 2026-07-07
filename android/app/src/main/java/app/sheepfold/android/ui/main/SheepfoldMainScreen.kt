package app.sheepfold.android.ui.main

import android.Manifest
import android.accounts.AccountManager
import android.content.Context
import android.content.pm.PackageManager
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
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
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
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
import androidx.compose.material3.ScrollableTabRow
import androidx.compose.material3.Tab
import androidx.compose.material3.Text
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import app.sheepfold.android.notifications.NewDeviceNotification
import app.sheepfold.android.notifications.SheepfoldNotifications
import app.sheepfold.android.router.AiAssistantClient
import app.sheepfold.android.router.AiAssistantRequest
import app.sheepfold.android.router.InternetAccessState
import app.sheepfold.android.router.InternetControlRepository
import app.sheepfold.android.router.RouterConnectionRequest
import app.sheepfold.android.router.SheepfoldConnectionStore
import app.sheepfold.android.widget.SheepfoldWidgetRenderer
import androidx.core.content.ContextCompat
import kotlinx.coroutines.launch

private val mainTabs = listOf(
    "Главная",
    "Пользователи",
    "Белый список",
    "Чёрный список",
    "Расписание",
    "ИИ помощник",
    "Настройки"
)

private enum class AiAssistantModel(
    val title: String,
    val description: String,
    val provider: String,
    val apiModel: String
) {
    DeepSeek(
        title = "DeepSeek",
        description = "Подходит для подробных рассуждений и спокойного разбора семейной ситуации.",
        provider = "deepseek",
        apiModel = "deepseek-v4-flash"
    ),
    GeminiFree(
        title = "Gemini Free",
        description = "Бесплатный облачный вариант через Google AI Studio с лимитами бесплатного тарифа.",
        provider = "gemini",
        apiModel = "gemini-2.5-flash"
    ),
    Grok(
        title = "Grok",
        description = "Подходит для более коротких, прямых и практичных ответов.",
        provider = "grok",
        apiModel = "grok"
    )
}

private data class AiChatMessage(
    val fromParent: Boolean,
    val text: String
)

private enum class DeviceStatus(
    val title: String,
    val color: Color
) {
    Allow("Белый список", Color(0xFF2E7D32)),
    Blocked("Чёрный список", Color(0xFFC62828)),
    Scheduled("По расписанию", Color(0xFF9A6700)),
    Restricted("Ограничено", Color(0xFF9A6700)),
    New("Новое", Color(0xFF1D4ED8))
}

private data class DeviceUi(
    val id: Int,
    val name: String,
    val ip: String,
    val mac: String,
    val group: String,
    val note: String,
    val status: DeviceStatus,
    val isAdmin: Boolean = false
)

private val demoDevices = listOf(
    DeviceUi(
        id = 1,
        name = "Телефон родителя",
        ip = "192.168.1.21",
        mac = "A4:5E:60:12:34:56",
        group = "Родители",
        note = "Всегда доступен",
        status = DeviceStatus.Allow,
        isAdmin = true
    ),
    DeviceUi(
        id = 2,
        name = "Планшет ребёнка",
        ip = "192.168.1.43",
        mac = "58:2F:40:AA:18:10",
        group = "Дети",
        note = "Учебный день, отбой 21:00",
        status = DeviceStatus.Scheduled
    ),
    DeviceUi(
        id = 3,
        name = "Телевизор в гостиной",
        ip = "192.168.1.77",
        mac = "F0:99:BF:70:22:09",
        group = "ТВ / медиа",
        note = "Разрешён после уроков",
        status = DeviceStatus.Restricted
    ),
    DeviceUi(
        id = 4,
        name = "Неизвестное устройство",
        ip = "192.168.1.98",
        mac = "DC:A6:32:8C:00:19",
        group = "Не настроено",
        note = "Найдено роутером",
        status = DeviceStatus.New
    ),
    DeviceUi(
        id = 5,
        name = "Старая игровая приставка",
        ip = "192.168.1.64",
        mac = "00:1F:16:CC:90:02",
        group = "Дети",
        note = "Заблокирована",
        status = DeviceStatus.Blocked
    )
)

@Composable
fun SheepfoldMainScreen(connection: RouterConnectionRequest?) {
    val context = LocalContext.current
    var selectedTab by remember { mutableIntStateOf(0) }
    var internetState by remember {
        mutableStateOf(InternetControlRepository.readInternetState(context))
    }
    var aiModel by remember {
        mutableStateOf(readAiAssistantModel(context))
    }

    LaunchedEffect(Unit) {
        demoDevices
            .filter { device -> device.status == DeviceStatus.New }
            .forEach { device ->
                SheepfoldNotifications.notifyNewDeviceOnce(
                    context = context,
                    device = NewDeviceNotification(
                        id = device.id,
                        name = device.name,
                        ip = device.ip,
                        mac = device.mac
                    )
                )
            }
    }

    fun setInternetState(state: InternetAccessState) {
        internetState = state
        InternetControlRepository.setInternetState(context, state)
        SheepfoldWidgetRenderer.updateAllWidgets(context)
    }

    Column(modifier = Modifier.fillMaxSize()) {
        ScrollableTabRow(selectedTabIndex = selectedTab) {
            mainTabs.forEachIndexed { index, title ->
                Tab(
                    selected = selectedTab == index,
                    onClick = { selectedTab = index },
                    text = { Text(text = title) }
                )
            }
        }

        when (selectedTab) {
            0 -> HomeControlScreen(
                internetState = internetState,
                onInternetStateChange = ::setInternetState
            )
            1 -> DevicesScreen(devices = demoDevices)
            2 -> DevicesScreen(
                devices = demoDevices.filter { device -> device.status == DeviceStatus.Allow },
                intro = "Эти устройства никогда не блокируются семейными правилами."
            )
            3 -> DevicesScreen(
                devices = demoDevices.filter { device -> device.status == DeviceStatus.Blocked },
                intro = "Эти устройства заблокированы всегда, пока родитель не изменит правило."
            )
            4 -> SchedulesScreen()
            5 -> AiAssistantScreen(
                connection = connection,
                selectedModel = aiModel,
                onModelChange = { model ->
                    aiModel = model
                    saveAiAssistantModel(context, model)
                }
            )
            6 -> SettingsScreen(
                connection = connection,
                selectedModel = aiModel,
                onModelChange = { model ->
                    aiModel = model
                    saveAiAssistantModel(context, model)
                }
            )
        }
    }
}

@Composable
private fun HomeControlScreen(
    internetState: InternetAccessState,
    onInternetStateChange: (InternetAccessState) -> Unit
) {
    ScreenSurface {
        SectionHeader(
            title = "Управление интернетом",
            body = "Команды будут отправляться на подключённый OpenWRT-роутер."
        )
        StatusCard(
            title = "Текущее состояние",
            body = if (internetState == InternetAccessState.Enabled) {
                "Интернет включён"
            } else {
                "Интернет отключён для всех, кроме белого списка"
            },
            color = if (internetState == InternetAccessState.Enabled) Color(0xFF2E7D32) else Color(0xFFC62828)
        )
        Button(
            onClick = { onInternetStateChange(InternetAccessState.Enabled) },
            modifier = Modifier.fillMaxWidth(),
            enabled = internetState != InternetAccessState.Enabled,
            colors = ButtonDefaults.buttonColors(
                containerColor = Color(0xFF2E7D32),
                contentColor = Color.White,
                disabledContainerColor = Color(0xFFB7D9C2),
                disabledContentColor = Color.White
            )
        ) {
            Text(text = "Интернет включён")
        }
        Button(
            onClick = { onInternetStateChange(InternetAccessState.Disabled) },
            modifier = Modifier.fillMaxWidth(),
            enabled = internetState != InternetAccessState.Disabled,
            colors = ButtonDefaults.buttonColors(
                containerColor = Color(0xFFC62828),
                contentColor = Color.White,
                disabledContainerColor = Color(0xFFE7AAA5),
                disabledContentColor = Color.White
            )
        ) {
            Text(text = "Интернет отключён")
        }
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            MetricCard(
                title = "Устройства",
                value = demoDevices.size.toString(),
                modifier = Modifier.weight(1f)
            )
            MetricCard(
                title = "Белый",
                value = demoDevices.count { device -> device.status == DeviceStatus.Allow }.toString(),
                modifier = Modifier.weight(1f)
            )
            MetricCard(
                title = "Чёрный",
                value = demoDevices.count { device -> device.status == DeviceStatus.Blocked }.toString(),
                modifier = Modifier.weight(1f)
            )
        }
        StatusCard(
            title = "Быстрые действия",
            body = "+15, +30, +1 час и доступ до отбоя будут подключены к API роутера следующим шагом.",
            color = MaterialTheme.colorScheme.onSurface
        )
    }
}

@Composable
private fun DevicesScreen(
    devices: List<DeviceUi>,
    intro: String = "Список берётся с роутера: аренды DHCP, ARP/neighbor-данные и постоянные аренды."
) {
    var selectedFilter by remember { mutableStateOf("Все") }
    val filters = listOf("Все", "Родители", "Дети", "Не настроено")
    val visibleDevices = if (selectedFilter == "Все") {
        devices
    } else {
        devices.filter { device -> device.group == selectedFilter }
    }

    ScreenSurface {
        SectionHeader(title = "Списки пользователей", body = intro)
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            filters.forEach { filter ->
                FilterChip(
                    selected = selectedFilter == filter,
                    onClick = { selectedFilter = filter },
                    label = { Text(text = filter) }
                )
            }
        }
        OutlinedButton(
            onClick = { },
            modifier = Modifier.fillMaxWidth(),
            border = BorderStroke(1.dp, Color(0xFF2E7D32))
        ) {
            Text(text = "Добавить устройство", color = Color(0xFF14532D))
        }
        visibleDevices.forEach { device ->
            DeviceCard(device = device)
        }
    }
}

@Composable
private fun DeviceCard(device: DeviceUi) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        border = BorderStroke(1.dp, Color(0xFFD1DDD8)),
        shape = RoundedCornerShape(8.dp)
    ) {
        Column(
            modifier = Modifier.padding(14.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.Top
            ) {
                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        text = "#${device.id} ${if (device.isAdmin) "♛ " else ""}${device.name}",
                        style = MaterialTheme.typography.titleMedium,
                        fontWeight = FontWeight.Bold
                    )
                    Text(text = device.note, style = MaterialTheme.typography.bodyMedium)
                }
                StatusPill(status = device.status)
            }
            Text(text = "IP: ${device.ip}", style = MaterialTheme.typography.bodyMedium)
            Text(text = "MAC: ${device.mac}", style = MaterialTheme.typography.bodyMedium)
            Text(text = "Группа: ${device.group}", style = MaterialTheme.typography.bodyMedium)
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                OutlinedButton(onClick = { }) {
                    Text(text = "Настроить")
                }
                OutlinedButton(onClick = { }) {
                    Text(text = "+30 мин")
                }
            }
        }
    }
}

@Composable
private fun SchedulesScreen() {
    ScreenSurface {
        SectionHeader(
            title = "Расписание",
            body = "Здесь будет управление правилами блокировки и разрешения по дням недели."
        )
        StatusCard(
            title = "Учебный день",
            body = "Пн-Пт: интернет разрешён после уроков, отбой в 21:00.",
            color = Color(0xFF9A6700)
        )
        StatusCard(
            title = "Быстрые разрешения",
            body = "+15 минут, +30 минут, +1 час, +2 часа, +3 часа, +5 часов, до конца суток и до отбоя.",
            color = MaterialTheme.colorScheme.onSurface
        )
        OutlinedButton(onClick = { }, modifier = Modifier.fillMaxWidth()) {
            Text(text = "Добавить правило")
        }
    }
}

@Composable
private fun AiAssistantScreen(
    connection: RouterConnectionRequest?,
    selectedModel: AiAssistantModel,
    onModelChange: (AiAssistantModel) -> Unit
) {
    val context = LocalContext.current
    val coroutineScope = rememberCoroutineScope()
    var input by remember { mutableStateOf("") }
    // Информация роутера и журнал могут быть полезны помощнику, но это уже семейный контекст.
    // Поэтому передаём их только по явному выбору родителя, а не автоматически с каждым вопросом.
    var includeRouterInfo by remember { mutableStateOf(false) }
    var includeProgramLog by remember { mutableStateOf(false) }
    var isWaitingForAnswer by remember { mutableStateOf(false) }
    var googleAccount by remember {
        mutableStateOf(SheepfoldConnectionStore.readGoogleAccount(context))
    }
    val googleAccounts = remember { readGoogleAccounts(context) }
    var messages by remember {
        mutableStateOf(
            listOf(
                AiChatMessage(
                    fromParent = false,
                    text = "Я помогу спокойно разобрать ситуацию, подготовить разговор с ребёнком и понять, где нужен контроль, а где лучше передавать ответственность постепенно."
                )
            )
        )
    }

    fun sendMessage(text: String) {
        val trimmed = text.trim()

        if (trimmed.isBlank()) {
            return
        }

        if (isWaitingForAnswer) {
            return
        }

        messages = messages + AiChatMessage(fromParent = true, text = trimmed)
        input = ""

        if (connection == null) {
            messages = messages + AiChatMessage(
                fromParent = false,
                text = "Сначала подключите Android-приложение к роутеру через QR код или ручную настройку."
            )
            return
        }

        if (selectedModel == AiAssistantModel.Grok) {
            messages = messages + AiChatMessage(
                fromParent = false,
                text = "Grok пока добавлен только как вариант настройки. Реальный backend сейчас реализован для DeepSeek и Gemini Free."
            )
            return
        }

        SheepfoldConnectionStore.saveGoogleAccount(context, googleAccount)
        isWaitingForAnswer = true
        coroutineScope.launch {
            val answer = runCatching {
                AiAssistantClient.ask(
                    AiAssistantRequest(
                        connection = connection,
                        provider = selectedModel.provider,
                        model = selectedModel.apiModel,
                        message = trimmed,
                        includeRouterInfo = includeRouterInfo,
                        includeProgramLog = includeProgramLog,
                        googleAccount = googleAccount.trim()
                    )
                )
            }.getOrElse { error ->
                "Не удалось получить ответ ${selectedModel.title}: ${error.message ?: "неизвестная ошибка"}"
            }

            messages = messages + AiChatMessage(fromParent = false, text = answer)
            isWaitingForAnswer = false
        }
    }

    ScreenSurface {
        SectionHeader(
            title = "ИИ помощник",
            body = "Помощник не заменяет семейного психолога. Он помогает родителю сформулировать спокойный план разговора и не превращать ограничения в войну."
        )
        AiModelSelector(
            selectedModel = selectedModel,
            onModelChange = onModelChange
        )
        StatusCard(
            title = "Подключение",
            body = connection?.let {
                "Роутер: ${it.routerName}\nAPI: ${it.apiUrl}"
            } ?: "Роутер ещё не подключён. Помощник сможет отвечать после привязки приложения к роутеру.",
            color = if (connection == null) Color(0xFFC62828) else Color(0xFF2E7D32)
        )
        GoogleAccountBox(
            googleAccount = googleAccount,
            googleAccounts = googleAccounts,
            onGoogleAccountChange = { account ->
                googleAccount = account
                SheepfoldConnectionStore.saveGoogleAccount(context, account)
            }
        )
        StatusCard(
            title = "Приватность",
            body = "По умолчанию отправляется только текст, который родитель написал сам. Имена детей, MAC, IP, списки устройств и журналы должны передаваться ИИ только после отдельного подтверждения.",
            color = MaterialTheme.colorScheme.onSurface
        )
        ContextConsentBox(
            includeRouterInfo = includeRouterInfo,
            includeProgramLog = includeProgramLog,
            onIncludeRouterInfoChange = { includeRouterInfo = it },
            onIncludeProgramLogChange = { includeProgramLog = it }
        )
        Column(
            modifier = Modifier.fillMaxWidth(),
            verticalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            listOf(
                "Ребёнок бунтует против ограничений",
                "Как передавать самоконтроль постепенно",
                "Как поговорить без обвинений"
            ).forEach { prompt ->
                OutlinedButton(
                    onClick = { sendMessage(prompt) },
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Text(text = prompt)
                }
            }
        }
        messages.forEach { message ->
            AiMessageCard(message = message)
        }
        if (isWaitingForAnswer) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(12.dp)
            ) {
                CircularProgressIndicator(color = Color(0xFF2E7D32))
                Text(text = "${selectedModel.title} готовит ответ...")
            }
        }
        OutlinedTextField(
            value = input,
            onValueChange = { input = it },
            modifier = Modifier.fillMaxWidth(),
            label = { Text("Ваш вопрос") },
            minLines = 3,
            placeholder = {
                Text("Например: ребёнок много сидит в интернете и злится на новые правила. Как поговорить?")
            }
        )
        Button(
            onClick = { sendMessage(input) },
            modifier = Modifier.fillMaxWidth(),
            enabled = input.isNotBlank() && !isWaitingForAnswer,
            colors = ButtonDefaults.buttonColors(
                containerColor = Color(0xFF2E7D32),
                contentColor = Color.White
            )
        ) {
            Text(text = "Спросить помощника")
        }
    }
}

@Composable
private fun SettingsScreen(
    connection: RouterConnectionRequest?,
    selectedModel: AiAssistantModel,
    onModelChange: (AiAssistantModel) -> Unit
) {
    ScreenSurface {
        SectionHeader(
            title = "Настройки",
            body = "Основные параметры приложения и подключения к роутеру."
        )
        StatusCard(
            title = "Роутер",
            body = connection?.let { "Sheepfold API: ${it.apiUrl}" }
                ?: "Sheepfold API ещё не настроен.",
            color = MaterialTheme.colorScheme.onSurface
        )
        StatusCard(
            title = "Аварийно-полезные сайты",
            body = "Редактируемый список доменов для ограниченного доступа. Широкие порталы вроде yandex.ru не добавляются по умолчанию.",
            color = MaterialTheme.colorScheme.onSurface
        )
        StatusCard(
            title = "Мессенджер",
            body = "VK по умолчанию, Telegram и MAX как отдельные варианты настройки на роутере.",
            color = MaterialTheme.colorScheme.onSurface
        )
        StatusCard(
            title = "Защита приложения",
            body = "Пароль или PIN рекомендуются. Биометрия включается только вручную.",
            color = MaterialTheme.colorScheme.onSurface
        )
        AiModelSelector(
            selectedModel = selectedModel,
            onModelChange = onModelChange
        )
    }
}

@Composable
private fun GoogleAccountBox(
    googleAccount: String,
    googleAccounts: List<String>,
    onGoogleAccountChange: (String) -> Unit
) {
    val accountPicker = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.StartActivityForResult()
    ) { result ->
        val accountName = result.data
            ?.getStringExtra(AccountManager.KEY_ACCOUNT_NAME)
            .orEmpty()

        if (accountName.isNotBlank()) {
            onGoogleAccountChange(accountName)
        }
    }

    Card(
        modifier = Modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        border = BorderStroke(1.dp, Color(0xFFD1DDD8)),
        shape = RoundedCornerShape(8.dp)
    ) {
        Column(
            modifier = Modifier.padding(14.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp)
        ) {
            Text(text = "Google-аккаунт родителя", style = MaterialTheme.typography.titleMedium)
            Text(
                text = "Аккаунт используется как подпись родителя в запросах к помощнику. DeepSeek API-ключ хранится на роутере.",
                style = MaterialTheme.typography.bodyMedium
            )
            OutlinedButton(
                onClick = {
                    // Используем системный выбор Google-аккаунта как удобную подпись родителя.
                    // Это не авторизация в Gemini: ключи AI-провайдеров всё равно задаются на роутере.
                    val intent = AccountManager.newChooseAccountIntent(
                        null,
                        null,
                        arrayOf("com.google"),
                        false,
                        null,
                        null,
                        null,
                        null
                    )
                    accountPicker.launch(intent)
                },
                modifier = Modifier.fillMaxWidth()
            ) {
                Text(text = "Выбрать Google-аккаунт на телефоне")
            }
            if (googleAccounts.isNotEmpty()) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    googleAccounts.take(3).forEach { account ->
                        FilterChip(
                            selected = account == googleAccount,
                            onClick = { onGoogleAccountChange(account) },
                            label = { Text(text = account) }
                        )
                    }
                }
            }
            OutlinedTextField(
                value = googleAccount,
                onValueChange = onGoogleAccountChange,
                modifier = Modifier.fillMaxWidth(),
                label = { Text("Google аккаунт") },
                singleLine = true,
                placeholder = { Text("parent@gmail.com") }
            )
        }
    }
}

@Composable
private fun ContextConsentBox(
    includeRouterInfo: Boolean,
    includeProgramLog: Boolean,
    onIncludeRouterInfoChange: (Boolean) -> Unit,
    onIncludeProgramLogChange: (Boolean) -> Unit
) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(containerColor = Color(0xFFFFF8E1)),
        border = BorderStroke(1.dp, Color(0xFFE0B94D)),
        shape = RoundedCornerShape(8.dp)
    ) {
        Column(
            modifier = Modifier.padding(14.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            Text(text = "Что можно передать ИИ", style = MaterialTheme.typography.titleMedium)
            ConsentRow(
                checked = includeRouterInfo,
                onCheckedChange = onIncludeRouterInfoChange,
                text = "Добавить информацию со страницы «Информация»"
            )
            ConsentRow(
                checked = includeProgramLog,
                onCheckedChange = onIncludeProgramLogChange,
                text = "Добавить журнал программы Sheepfold"
            )
            Text(
                text = "Перед отправкой роутер скрывает чувствительные поля в журнале. Не отправляйте семейные детали, если они не нужны для вопроса.",
                style = MaterialTheme.typography.bodySmall
            )
        }
    }
}

@Composable
private fun ConsentRow(
    checked: Boolean,
    onCheckedChange: (Boolean) -> Unit,
    text: String
) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(10.dp)
    ) {
        Checkbox(checked = checked, onCheckedChange = onCheckedChange)
        Text(text = text, style = MaterialTheme.typography.bodyMedium)
    }
}

@Composable
private fun AiModelSelector(
    selectedModel: AiAssistantModel,
    onModelChange: (AiAssistantModel) -> Unit
) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        border = BorderStroke(1.dp, Color(0xFFD1DDD8)),
        shape = RoundedCornerShape(8.dp)
    ) {
        Column(
            modifier = Modifier.padding(14.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp)
        ) {
            Text(text = "Модель помощника", style = MaterialTheme.typography.titleMedium)
            AiAssistantModel.entries.forEach { model ->
                FilterChip(
                    selected = selectedModel == model,
                    onClick = { onModelChange(model) },
                    label = {
                        Column {
                            Text(text = model.title, fontWeight = FontWeight.Bold)
                            Text(text = model.description)
                        }
                    }
                )
            }
        }
    }
}

@Composable
private fun AiMessageCard(message: AiChatMessage) {
    val background = if (message.fromParent) {
        Color(0xFFEAF4EF)
    } else {
        MaterialTheme.colorScheme.surface
    }
    val borderColor = if (message.fromParent) {
        Color(0xFF7BAF9A)
    } else {
        Color(0xFFD1DDD8)
    }

    Card(
        modifier = Modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(containerColor = background),
        border = BorderStroke(1.dp, borderColor),
        shape = RoundedCornerShape(8.dp)
    ) {
        Column(
            modifier = Modifier.padding(14.dp),
            verticalArrangement = Arrangement.spacedBy(6.dp)
        ) {
            Text(
                text = if (message.fromParent) "Родитель" else "ИИ помощник",
                style = MaterialTheme.typography.labelLarge,
                fontWeight = FontWeight.Bold
            )
            Text(text = message.text, style = MaterialTheme.typography.bodyMedium)
        }
    }
}

private fun buildAssistantDraft(model: AiAssistantModel, parentText: String): String {
    val style = when (model) {
        AiAssistantModel.DeepSeek -> "подробно, мягко и с объяснением причин"
        AiAssistantModel.GeminiFree -> "практично, спокойно и без лишней драматизации"
        AiAssistantModel.Grok -> "коротко, прямо и практично"
    }

    return "Черновик ответа через ${model.title}: разберите ситуацию $style. " +
        "Сначала уточните возраст ребёнка, что именно изменилось в правилах и как ребёнок объясняет своё сопротивление. " +
        "Если видно, что родитель пока не понимает тревоги и мотивы ребёнка, начните не с наказания, а с вопросов: что ребёнок боится потерять, где ему стыдно, где он чувствует несправедливость. " +
        "Дальше предложите маленькое правило на 3-7 дней, понятный критерий успеха и заранее оговорённый способ вернуть часть контроля ребёнку. " +
        "Нельзя говорить: «ты зависимый» или «посмотри, ты такой же плохой пример». Лучше говорить о поведении, последствиях и совместном плане.\n\n" +
        "Запрос родителя: $parentText"
}

private fun readAiAssistantModel(context: Context): AiAssistantModel {
    val value = context
        .getSharedPreferences("sheepfold-app", Context.MODE_PRIVATE)
        .getString("aiAssistantModel", AiAssistantModel.DeepSeek.name)

    return AiAssistantModel.entries.firstOrNull { model -> model.name == value } ?: AiAssistantModel.DeepSeek
}

private fun saveAiAssistantModel(context: Context, model: AiAssistantModel) {
    context
        .getSharedPreferences("sheepfold-app", Context.MODE_PRIVATE)
        .edit()
        .putString("aiAssistantModel", model.name)
        .apply()
}

private fun readGoogleAccounts(context: Context): List<String> {
    if (
        ContextCompat.checkSelfPermission(context, Manifest.permission.GET_ACCOUNTS) !=
        PackageManager.PERMISSION_GRANTED
    ) {
        return emptyList()
    }

    return runCatching {
        AccountManager.get(context)
            .getAccountsByType("com.google")
            .map { account -> account.name }
            .filter { name -> name.isNotBlank() }
            .distinct()
    }.getOrDefault(emptyList())
}

@Composable
private fun ScreenSurface(content: @Composable ColumnScope.() -> Unit) {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(20.dp),
        verticalArrangement = Arrangement.spacedBy(14.dp),
        content = content
    )
}

@Composable
private fun SectionHeader(title: String, body: String) {
    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
        Text(
            text = title,
            style = MaterialTheme.typography.headlineMedium,
            color = MaterialTheme.colorScheme.onBackground
        )
        Text(
            text = body,
            style = MaterialTheme.typography.bodyLarge,
            color = MaterialTheme.colorScheme.onBackground
        )
    }
}

@Composable
private fun MetricCard(
    title: String,
    value: String,
    modifier: Modifier = Modifier
) {
    Card(
        modifier = modifier,
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        border = BorderStroke(1.dp, Color(0xFFD1DDD8)),
        shape = RoundedCornerShape(8.dp)
    ) {
        Column(modifier = Modifier.padding(12.dp)) {
            Text(text = title, style = MaterialTheme.typography.labelMedium)
            Text(text = value, style = MaterialTheme.typography.headlineSmall)
        }
    }
}

@Composable
private fun StatusCard(
    title: String,
    body: String,
    color: Color
) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        border = BorderStroke(1.dp, Color(0xFFD1DDD8)),
        shape = RoundedCornerShape(8.dp)
    ) {
        Column(
            modifier = Modifier.padding(14.dp),
            verticalArrangement = Arrangement.spacedBy(6.dp)
        ) {
            Text(text = title, style = MaterialTheme.typography.titleMedium)
            Text(text = body, style = MaterialTheme.typography.bodyMedium, color = color)
        }
    }
}

@Composable
private fun StatusPill(status: DeviceStatus) {
    Box(
        modifier = Modifier
            .background(
                color = status.color.copy(alpha = 0.12f),
                shape = RoundedCornerShape(999.dp)
            )
            .padding(horizontal = 10.dp, vertical = 6.dp)
    ) {
        Text(
            text = status.title,
            color = status.color,
            style = MaterialTheme.typography.labelMedium,
            fontWeight = FontWeight.Bold
        )
    }
}
