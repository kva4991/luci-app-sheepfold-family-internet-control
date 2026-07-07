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
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
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
import androidx.compose.material3.SegmentedButton
import androidx.compose.material3.SegmentedButtonDefaults
import androidx.compose.material3.SingleChoiceSegmentedButtonRow
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
import app.sheepfold.android.ui.theme.ThemeMode
import app.sheepfold.android.widget.SheepfoldWidgetRenderer
import androidx.core.content.ContextCompat
import kotlinx.coroutines.launch

// -------------------------------------------------------
// Табы вынесены в ресурс strings.xml (ключи tab_*).
// Здесь список нужен только для индексации при навигации.
// Порядок должен совпадать с when(selectedTab) ниже.
// -------------------------------------------------------
private val mainTabs = listOf(
    "Главная",
    "Устройства",
    "Белый список",
    "Чёрный список",
    "Расписание",
    "ИИ помощник",
    "Настройки"
)

// -------------------------------------------------------
// AI-провайдеры. Grok помечен как Coming Soon —
// лучше показать честный статус, чем скрывать кнопку.
// Добавление нового провайдера = новый enum-вход.
// -------------------------------------------------------
private enum class AiAssistantModel(
    val title: String,
    val description: String,
    val provider: String,
    val apiModel: String,
    val isAvailable: Boolean = true
) {
    DeepSeek(
        title = "DeepSeek",
        description = "Подходит для подробных рассуждений и спокойного разбора семейной ситуации.",
        provider = "deepseek",
        apiModel = "deepseek-v3"
    ),
    GeminiFree(
        title = "Gemini Free",
        description = "Бесплатный облачный вариант через Google AI Studio.",
        provider = "gemini",
        apiModel = "gemini-2.5-flash"
    ),
    GigaChat(
        title = "GigaChat (Сбер)",
        description = "Бесплатный tier для физлиц через OAuth2 Сбербанка.",
        provider = "gigachat",
        apiModel = "GigaChat"
    ),
    Grok(
        title = "Grok — скоро",
        description = "Короткие и прямые ответы. Backend в разработке.",
        provider = "grok",
        apiModel = "grok",
        isAvailable = false
    )
}

private data class AiChatMessage(
    val fromParent: Boolean,
    val text: String
)

// DeviceStatus — цвет берётся из темы через MaterialTheme,
// а не хардкодится. Поле color убрано — используем
// расширение .themeColor() ниже чтобы не передавать цвета в data-классе.
private enum class DeviceStatus(val label: String) {
    Allow("Белый список"),
    Blocked("Чёрный список"),
    Scheduled("По расписанию"),
    Restricted("Ограничено"),
    New("Новое устройство")
}

// Расширение: цвет статуса из токенов текущей темы.
// Это правильное место для маппинга статус→цвет, а не в enum,
// потому что @Composable-контекст нужен для MaterialTheme.
@Composable
private fun DeviceStatus.themeColor(): Color = when (this) {
    DeviceStatus.Allow      -> MaterialTheme.colorScheme.primary
    DeviceStatus.Blocked    -> MaterialTheme.colorScheme.error
    DeviceStatus.Scheduled  -> MaterialTheme.colorScheme.secondary
    DeviceStatus.Restricted -> MaterialTheme.colorScheme.secondary
    DeviceStatus.New        -> MaterialTheme.colorScheme.tertiary
        ?: MaterialTheme.colorScheme.primary
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

// -------------------------------------------------------
// demoDevices — ВРЕМЕННЫЕ данные для UI-разработки.
// TODO: заменить на реальный вызов RouterApiClient.getDevices()
// когда будет реализован endpoint /cgi-bin/sheepfold-api/devices
// -------------------------------------------------------
private val demoDevices = listOf(
    DeviceUi(
        id = 1, name = "Телефон родителя",
        ip = "192.168.1.21", mac = "A4:5E:60:12:34:56",
        group = "Родители", note = "Всегда доступен",
        status = DeviceStatus.Allow, isAdmin = true
    ),
    DeviceUi(
        id = 2, name = "Планшет ребёнка",
        ip = "192.168.1.43", mac = "58:2F:40:AA:18:10",
        group = "Дети", note = "Учебный день, отбой 21:00",
        status = DeviceStatus.Scheduled
    ),
    DeviceUi(
        id = 3, name = "Телевизор в гостиной",
        ip = "192.168.1.77", mac = "F0:99:BF:70:22:09",
        group = "ТВ / медиа", note = "Разрешён после уроков",
        status = DeviceStatus.Restricted
    ),
    DeviceUi(
        id = 4, name = "Неизвестное устройство",
        ip = "192.168.1.98", mac = "DC:A6:32:8C:00:19",
        group = "Не настроено", note = "Найдено роутером",
        status = DeviceStatus.New
    ),
    DeviceUi(
        id = 5, name = "Старая игровая приставка",
        ip = "192.168.1.64", mac = "00:1F:16:CC:90:02",
        group = "Дети", note = "Заблокирована",
        status = DeviceStatus.Blocked
    )
)

// -------------------------------------------------------
// SheepfoldMainScreen — корневой экран после настройки.
// themeMode + onThemeModeChange — hoisted state из MainActivity,
// передаётся вниз до SettingsScreen для переключателя темы.
// -------------------------------------------------------
@Composable
fun SheepfoldMainScreen(
    connection: RouterConnectionRequest?,
    themeMode: ThemeMode,
    onThemeModeChange: (ThemeMode) -> Unit
) {
    val context = LocalContext.current
    var selectedTab by remember { mutableIntStateOf(0) }
    var internetState by remember {
        mutableStateOf(InternetControlRepository.readInternetState(context))
    }
    var aiModel by remember { mutableStateOf(readAiAssistantModel(context)) }

    // Уведомляем о новых устройствах при первом запуске экрана.
    // LaunchedEffect(Unit) — выполняется один раз при первой компоновке.
    LaunchedEffect(Unit) {
        demoDevices
            .filter { it.status == DeviceStatus.New }
            .forEach { device ->
                SheepfoldNotifications.notifyNewDeviceOnce(
                    context = context,
                    device = NewDeviceNotification(
                        id = device.id, name = device.name,
                        ip = device.ip, mac = device.mac
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
                    onClick  = { selectedTab = index },
                    text     = { Text(title) }
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
                devices = demoDevices.filter { it.status == DeviceStatus.Allow },
                intro   = "Эти устройства никогда не блокируются семейными правилами."
            )
            3 -> DevicesScreen(
                devices = demoDevices.filter { it.status == DeviceStatus.Blocked },
                intro   = "Эти устройства заблокированы всегда, пока родитель не изменит правило."
            )
            4 -> SchedulesScreen()
            5 -> AiAssistantScreen(
                connection    = connection,
                selectedModel = aiModel,
                onModelChange = { model ->
                    aiModel = model
                    saveAiAssistantModel(context, model)
                }
            )
            6 -> SettingsScreen(
                connection       = connection,
                themeMode        = themeMode,
                onThemeModeChange = onThemeModeChange,
                selectedModel    = aiModel,
                onModelChange    = { model ->
                    aiModel = model
                    saveAiAssistantModel(context, model)
                }
            )
        }
    }
}

// -------------------------------------------------------
// HomeControlScreen — главный экран управления интернетом.
// Кнопки включения/выключения интернета для всей семьи.
// Цвета — только через MaterialTheme, без хардкода.
// -------------------------------------------------------
@Composable
private fun HomeControlScreen(
    internetState: InternetAccessState,
    onInternetStateChange: (InternetAccessState) -> Unit
) {
    val isEnabled = internetState == InternetAccessState.Enabled

    ScreenSurface {
        SectionHeader(
            title = "Управление интернетом",
            body  = "Команды отправляются на подключённый OpenWRT-роутер."
        )

        // Статусная карточка: цвет зависит от текущего состояния
        StatusCard(
            title = "Текущее состояние",
            body  = if (isEnabled) "Интернет включён" else "Интернет отключён (кроме белого списка)",
            // Используем primary (зелёный) и error (красный) из темы
            indicatorColor = if (isEnabled)
                MaterialTheme.colorScheme.primary
            else
                MaterialTheme.colorScheme.error
        )

        Button(
            onClick  = { onInternetStateChange(InternetAccessState.Enabled) },
            modifier = Modifier.fillMaxWidth(),
            enabled  = !isEnabled,
            // containerColor берём из primary темы — не хардкодим зелёный
            colors = ButtonDefaults.buttonColors(
                containerColor         = MaterialTheme.colorScheme.primary,
                contentColor           = MaterialTheme.colorScheme.onPrimary,
                disabledContainerColor = MaterialTheme.colorScheme.primaryContainer,
                disabledContentColor   = MaterialTheme.colorScheme.onPrimaryContainer
            )
        ) { Text("Включить интернет") }

        Button(
            onClick  = { onInternetStateChange(InternetAccessState.Disabled) },
            modifier = Modifier.fillMaxWidth(),
            enabled  = isEnabled,
            // error из темы — правильный токен для деструктивных действий
            colors = ButtonDefaults.buttonColors(
                containerColor         = MaterialTheme.colorScheme.error,
                contentColor           = MaterialTheme.colorScheme.onError,
                disabledContainerColor = MaterialTheme.colorScheme.errorContainer
                    ?: MaterialTheme.colorScheme.surfaceVariant,
                disabledContentColor   = MaterialTheme.colorScheme.onSurface
            )
        ) { Text("Отключить интернет для всех") }

        // Метрики — счётчики устройств по статусам
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            MetricCard("Всего",    demoDevices.size.toString(),                                   Modifier.weight(1f))
            MetricCard("Белый",   demoDevices.count { it.status == DeviceStatus.Allow }.toString(), Modifier.weight(1f))
            MetricCard("Чёрный",  demoDevices.count { it.status == DeviceStatus.Blocked }.toString(), Modifier.weight(1f))
            MetricCard("Новые",   demoDevices.count { it.status == DeviceStatus.New }.toString(),  Modifier.weight(1f))
        }

        InfoCard(
            title = "Быстрый доступ",
            body  = "Кнопки +15 мин, +30 мин, +1 час и 'до отбоя' будут подключены к API роутера на следующем шаге."
        )
    }
}

// -------------------------------------------------------
// DevicesScreen — список устройств с фильтрацией по группам.
// -------------------------------------------------------
@Composable
private fun DevicesScreen(
    devices: List<DeviceUi>,
    intro: String = "Список получен с роутера: DHCP-аренды, ARP/neighbor и постоянные аренды."
) {
    var selectedFilter by remember { mutableStateOf("Все") }
    val filters = listOf("Все") + devices.map { it.group }.distinct()
    val visible  = if (selectedFilter == "Все") devices
                   else devices.filter { it.group == selectedFilter }

    ScreenSurface {
        SectionHeader(title = "Списки пользователей", body = intro)

        // Фильтр-чипы по группам — строятся из реальных данных
        Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            filters.forEach { f ->
                FilterChip(
                    selected = selectedFilter == f,
                    onClick  = { selectedFilter = f },
                    label    = { Text(f) }
                )
            }
        }

        OutlinedButton(
            onClick   = { },   // TODO: открыть QuickAdd-окно (30 сек)
            modifier  = Modifier.fillMaxWidth(),
            // Цвет рамки = primary из темы, а не хардкод зелёного
            border    = BorderStroke(1.dp, MaterialTheme.colorScheme.primary)
        ) {
            Text("Добавить устройство", color = MaterialTheme.colorScheme.primary)
        }

        visible.forEach { DeviceCard(it) }

        if (visible.isEmpty()) {
            InfoCard(
                title = "Устройств нет",
                body  = "В этой группе пока нет устройств."
            )
        }
    }
}

@Composable
private fun DeviceCard(device: DeviceUi) {
    val statusColor = device.status.themeColor()

    Card(
        modifier = Modifier.fillMaxWidth(),
        colors   = CardDefaults.cardColors(
            containerColor = MaterialTheme.colorScheme.surface
        ),
        // Рамка карточки — outline из темы, а не хардкод
        border   = BorderStroke(1.dp, MaterialTheme.colorScheme.outline.copy(alpha = 0.5f)),
        shape    = RoundedCornerShape(8.dp)
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
                        text       = "${if (device.isAdmin) "♛ " else ""}${device.name}",
                        style      = MaterialTheme.typography.titleMedium,
                        fontWeight = FontWeight.Bold,
                        color      = MaterialTheme.colorScheme.onSurface
                    )
                    Text(
                        text  = device.note,
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
                StatusPill(status = device.status, color = statusColor)
            }
            // IP и MAC — вторичная информация, используем onSurfaceVariant
            Text("IP: ${device.ip}",   style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant)
            Text("MAC: ${device.mac}", style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant)
            Text("Группа: ${device.group}", style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurface)

            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                OutlinedButton(onClick = { }) { Text("Настроить") }   // TODO: открыть DeviceSettingsSheet
                OutlinedButton(onClick = { }) { Text("+30 мин") }     // TODO: TemporaryAccessRequest
            }
        }
    }
}

@Composable
private fun SchedulesScreen() {
    ScreenSurface {
        SectionHeader(
            title = "Расписание",
            body  = "Управление правилами блокировки и разрешения по дням недели и времени."
        )
        InfoCard(
            title = "Учебная неделя (пример)",
            body  = "Пн-Пт: интернет разрешён после уроков, отбой в 21:00."
        )
        InfoCard(
            title = "Быстрые разрешения",
            body  = "+15 мин · +30 мин · +1 час · +2 ч · +3 ч · +5 ч · до конца суток · до отбоя"
        )
        OutlinedButton(
            onClick  = { },  // TODO: открыть ScheduleRuleEditor
            modifier = Modifier.fillMaxWidth()
        ) { Text("Добавить правило") }
    }
}

// -------------------------------------------------------
// AiAssistantScreen — переработанный экран чата с ИИ.
// Ключевые улучшения:
//   1. LazyColumn для чата — скролл к последнему сообщению
//   2. Пузыри сообщений с выравниванием по стороне
//   3. Промпт v3 передаётся через AiAssistantRequest
//   4. isAvailable — скрытие недоступных провайдеров в UI
// -------------------------------------------------------
@Composable
private fun AiAssistantScreen(
    connection: RouterConnectionRequest?,
    selectedModel: AiAssistantModel,
    onModelChange: (AiAssistantModel) -> Unit
) {
    val context       = LocalContext.current
    val coroutineScope = rememberCoroutineScope()
    var input         by remember { mutableStateOf("") }
    var includeRouterInfo by remember { mutableStateOf(false) }
    var includeProgramLog by remember { mutableStateOf(false) }
    var isWaiting     by remember { mutableStateOf(false) }
    var googleAccount by remember {
        mutableStateOf(SheepfoldConnectionStore.readGoogleAccount(context))
    }
    val googleAccounts = remember { readGoogleAccounts(context) }

    // Начальное сообщение — системный привет от ИИ-помощника.
    // Текст соответствует промпту v3: помощник позиционирует себя
    // как инструмент для спокойного разговора, а не слежки.
    var messages by remember {
        mutableStateOf(
            listOf(
                AiChatMessage(
                    fromParent = false,
                    text = "Привет! Я помогу спокойно разобраться в ситуации, подготовить разговор с ребёнком " +
                           "и найти баланс между контролем и доверием.\n\n" +
                           "Расскажите что происходит — я постараюсь помочь без осуждения."
                )
            )
        )
    }

    // listState нужен для автоскролла к последнему сообщению
    val listState = rememberLazyListState()

    // Автоскролл при появлении нового сообщения.
    // Срабатывает при изменении messages.size, а не при каждой рекомпозиции.
    LaunchedEffect(messages.size) {
        if (messages.isNotEmpty()) {
            listState.animateScrollToItem(messages.size - 1)
        }
    }

    fun sendMessage(text: String) {
        val trimmed = text.trim()
        if (trimmed.isBlank() || isWaiting) return

        messages = messages + AiChatMessage(fromParent = true, text = trimmed)
        input = ""

        if (connection == null) {
            messages = messages + AiChatMessage(
                fromParent = false,
                text = "Сначала подключите приложение к роутеру через QR-код или ручную настройку."
            )
            return
        }

        // Grok помечен isAvailable=false — не отправляем запрос, даём понятный ответ
        if (!selectedModel.isAvailable) {
            messages = messages + AiChatMessage(
                fromParent = false,
                text = "${selectedModel.title}: backend ещё не готов. Пожалуйста, выберите DeepSeek, Gemini Free или GigaChat."
            )
            return
        }

        SheepfoldConnectionStore.saveGoogleAccount(context, googleAccount)
        isWaiting = true

        coroutineScope.launch {
            val answer = runCatching {
                AiAssistantClient.ask(
                    AiAssistantRequest(
                        connection        = connection,
                        provider          = selectedModel.provider,
                        model             = selectedModel.apiModel,
                        // buildPromptV3 формирует системный промпт с контекстом семьи
                        message           = buildPromptV3(trimmed, includeRouterInfo, includeProgramLog),
                        includeRouterInfo = includeRouterInfo,
                        includeProgramLog = includeProgramLog,
                        googleAccount     = googleAccount.trim()
                    )
                )
            }.getOrElse { error ->
                "Не удалось получить ответ от ${selectedModel.title}: ${error.message ?: "неизвестная ошибка"}"
            }

            messages  = messages + AiChatMessage(fromParent = false, text = answer)
            isWaiting = false
        }
    }

    // Используем Column вместо ScreenSurface, потому что LazyColumn
    // должен занять оставшееся место, а ScreenSurface добавляет scroll
    // который конфликтует с LazyColumn
    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(horizontal = 16.dp, vertical = 12.dp)
    ) {
        SectionHeader(
            title = "ИИ помощник",
            body  = "Помогает родителю сформулировать спокойный план разговора с ребёнком."
        )
        Spacer(modifier = Modifier.height(8.dp))

        AiModelSelector(
            selectedModel = selectedModel,
            onModelChange = onModelChange
        )
        Spacer(modifier = Modifier.height(8.dp))

        // Статус подключения к роутеру
        StatusCard(
            title = "Роутер",
            body  = connection?.let { "${it.routerName}  •  ${it.apiUrl}" }
                    ?: "Роутер не подключён — настройте через QR-код.",
            indicatorColor = if (connection != null)
                MaterialTheme.colorScheme.primary
            else
                MaterialTheme.colorScheme.error
        )
        Spacer(modifier = Modifier.height(4.dp))

        GoogleAccountBox(
            googleAccount = googleAccount,
            googleAccounts = googleAccounts,
            onGoogleAccountChange = { account ->
                googleAccount = account
                SheepfoldConnectionStore.saveGoogleAccount(context, account)
            }
        )
        Spacer(modifier = Modifier.height(4.dp))

        ContextConsentBox(
            includeRouterInfo = includeRouterInfo,
            includeProgramLog = includeProgramLog,
            onIncludeRouterInfoChange  = { includeRouterInfo = it },
            onIncludeProgramLogChange  = { includeProgramLog = it }
        )
        Spacer(modifier = Modifier.height(8.dp))

        // Быстрые кнопки-подсказки — отправляют готовые вопросы
        Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            listOf(
                "Ребёнок бунтует",
                "Как передать самоконтроль",
                "Разговор без обвинений"
            ).forEach { prompt ->
                FilterChip(
                    selected = false,
                    onClick  = { sendMessage(prompt) },
                    label    = { Text(prompt, style = MaterialTheme.typography.labelSmall) }
                )
            }
        }
        Spacer(modifier = Modifier.height(8.dp))

        // LazyColumn для чата — Weight(1f) занимает оставшееся место.
        // Это ключевой момент: без weight() поле ввода уйдёт за экран.
        LazyColumn(
            state   = listState,
            modifier = Modifier.weight(1f),
            verticalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            items(messages) { msg -> ChatBubble(msg) }

            // Индикатор «печатает...» как последний элемент списка
            if (isWaiting) {
                item {
                    Row(
                        modifier = Modifier.fillMaxWidth().padding(vertical = 4.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(10.dp)
                    ) {
                        CircularProgressIndicator(
                            modifier = Modifier.padding(4.dp),
                            color    = MaterialTheme.colorScheme.primary
                        )
                        Text(
                            text  = "${selectedModel.title} готовит ответ…",
                            style = MaterialTheme.typography.bodyMedium,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    }
                }
            }
        }

        Spacer(modifier = Modifier.height(8.dp))

        // Поле ввода + кнопка отправки
        OutlinedTextField(
            value         = input,
            onValueChange = { input = it },
            modifier      = Modifier.fillMaxWidth(),
            label         = { Text("Ваш вопрос") },
            minLines      = 2,
            placeholder   = { Text("Например: ребёнок злится на новые правила. Как поговорить?") }
        )
        Spacer(modifier = Modifier.height(6.dp))
        Button(
            onClick  = { sendMessage(input) },
            modifier = Modifier.fillMaxWidth(),
            enabled  = input.isNotBlank() && !isWaiting,
            colors   = ButtonDefaults.buttonColors(
                containerColor = MaterialTheme.colorScheme.primary,
                contentColor   = MaterialTheme.colorScheme.onPrimary
            )
        ) { Text("Спросить") }
    }
}

// -------------------------------------------------------
// SettingsScreen — настройки приложения.
// Добавлен блок выбора темы с SegmentedButton.
// -------------------------------------------------------
@Composable
private fun SettingsScreen(
    connection: RouterConnectionRequest?,
    themeMode: ThemeMode,
    onThemeModeChange: (ThemeMode) -> Unit,
    selectedModel: AiAssistantModel,
    onModelChange: (AiAssistantModel) -> Unit
) {
    ScreenSurface {
        SectionHeader(
            title = "Настройки",
            body  = "Основные параметры приложения и подключения."
        )

        // --- Блок выбора темы ---
        // SegmentedButton — стандартный Material3-компонент для трёх вариантов.
        // Выбор сразу применяется: перезапуск Activity не нужен.
        Card(
            modifier = Modifier.fillMaxWidth(),
            colors   = CardDefaults.cardColors(
                containerColor = MaterialTheme.colorScheme.surface
            ),
            border = BorderStroke(1.dp, MaterialTheme.colorScheme.outline.copy(alpha = 0.4f)),
            shape  = RoundedCornerShape(8.dp)
        ) {
            Column(
                modifier = Modifier.padding(14.dp),
                verticalArrangement = Arrangement.spacedBy(10.dp)
            ) {
                Text(
                    text  = "Оформление",
                    style = MaterialTheme.typography.titleMedium,
                    color = MaterialTheme.colorScheme.onSurface
                )
                Text(
                    text  = "Выберите тему приложения. \"Системная\" следует настройке вашего телефона.",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
                val themeModes = listOf(
                    ThemeMode.SYSTEM to "Системная",
                    ThemeMode.LIGHT  to "Светлая",
                    ThemeMode.DARK   to "Тёмная"
                )
                // SingleChoiceSegmentedButtonRow — Material3 компонент для выбора одного из трёх.
                // Внутри он сам управляет активным состоянием.
                SingleChoiceSegmentedButtonRow(modifier = Modifier.fillMaxWidth()) {
                    themeModes.forEachIndexed { index, (mode, label) ->
                        SegmentedButton(
                            selected = themeMode == mode,
                            onClick  = { onThemeModeChange(mode) },
                            shape    = SegmentedButtonDefaults.itemShape(index, themeModes.size),
                            label    = { Text(label) }
                        )
                    }
                }
            }
        }

        // --- Роутер ---
        StatusCard(
            title = "Роутер",
            body  = connection?.let { "Sheepfold API: ${it.apiUrl}" }
                    ?: "Sheepfold API ещё не настроен. Вернитесь на главный экран и отсканируйте QR.",
            indicatorColor = if (connection != null)
                MaterialTheme.colorScheme.primary
            else
                MaterialTheme.colorScheme.error
        )

        // --- Аварийно-полезные сайты ---
        InfoCard(
            title = "Аварийно-полезные сайты",
            body  = "Редактируемый список доменов для ограниченного доступа. " +
                    "Широкие порталы вроде yandex.ru не добавляются по умолчанию."
        )

        // --- Мессенджер ---
        InfoCard(
            title = "Мессенджер",
            body  = "VK по умолчанию, Telegram и MAX как варианты. Настраивается на роутере."
        )

        // --- Защита приложения ---
        InfoCard(
            title = "Защита приложения",
            body  = "Рекомендуется пароль или PIN. Биометрия включается только вручную — " +
                    "ребёнок может попробовать разблокировать приложение пока вы спите."
        )

        // --- Выбор AI-провайдера ---
        AiModelSelector(
            selectedModel = selectedModel,
            onModelChange = onModelChange
        )
    }
}

// -------------------------------------------------------
// ChatBubble — пузырь сообщения в стиле мессенджера.
// Сообщения родителя выровнены вправо, ИИ — влево.
// Цвета берутся из темы, не хардкодятся.
// -------------------------------------------------------
@Composable
private fun ChatBubble(message: AiChatMessage) {
    // Для родителя — primaryContainer, для ИИ — surfaceVariant
    val bgColor = if (message.fromParent)
        MaterialTheme.colorScheme.primaryContainer
    else
        MaterialTheme.colorScheme.surfaceVariant

    val textColor = if (message.fromParent)
        MaterialTheme.colorScheme.onPrimaryContainer
    else
        MaterialTheme.colorScheme.onSurfaceVariant

    // Выравнивание: родитель — конец (правый край), ИИ — начало (левый)
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = if (message.fromParent)
            Arrangement.End
        else
            Arrangement.Start
    ) {
        Column(
            // widthIn(max=0.85f) — пузырь не растягивается на весь экран,
            // как в обычных мессенджерах
            modifier = Modifier
                .widthIn(max = 280.dp)
                .background(
                    color = bgColor,
                    shape = RoundedCornerShape(
                        topStart    = if (message.fromParent) 16.dp else 4.dp,
                        topEnd      = if (message.fromParent) 4.dp  else 16.dp,
                        bottomStart = 16.dp,
                        bottomEnd   = 16.dp
                    )
                )
                .padding(horizontal = 12.dp, vertical = 8.dp)
        ) {
            Text(
                text  = if (message.fromParent) "Вы" else "ИИ",
                style = MaterialTheme.typography.labelSmall,
                color = textColor.copy(alpha = 0.6f),
                fontWeight = FontWeight.Bold
            )
            Spacer(modifier = Modifier.height(2.dp))
            Text(
                text  = message.text,
                style = MaterialTheme.typography.bodyMedium,
                color = textColor
            )
        }
    }
}

// -------------------------------------------------------
// buildPromptV3 — системный промпт третьего поколения.
// v1: просто вопрос пользователя.
// v2: добавили контекст роутера/лога.
// v3: структурированный контекст + роль + ограничения.
//
// Промпт передаётся как поле message в AiAssistantRequest.
// Роутер добавляет системный промпт-обёртку (SheepfoldSystemPrompt)
// на своей стороне перед отправкой провайдеру — разделение ролей:
// Android отвечает за пользовательский контекст,
// роутер — за системные инструкции безопасности.
// -------------------------------------------------------
private fun buildPromptV3(
    userText: String,
    includeRouterInfo: Boolean,
    includeProgramLog: Boolean
): String {
    val sb = StringBuilder()

    // Роль помощника
    sb.append("Ты семейный помощник в приложении Sheepfold для родителей.\n")
    sb.append("Твоя задача — помочь родителю спокойно справиться с семейной ситуацией, ")
    sb.append("связанной с использованием интернета детьми.\n\n")

    // Правила поведения
    sb.append("ПРАВИЛА:\n")
    sb.append("- Не осуждай ребёнка и не называй его зависимым.\n")
    sb.append("- Помогай формулировать разговор, а не приговор.\n")
    sb.append("- Предлагай маленькие шаги на 3-7 дней с понятным критерием успеха.\n")
    sb.append("- Если нужно — уточни возраст ребёнка и что конкретно изменилось.\n")
    sb.append("- Не применяй настройки роутера сам — только предлагай родителю.\n\n")

    // Контекст — добавляется только если родитель дал согласие
    if (includeRouterInfo) {
        sb.append("[Контекст: включены данные роутера — будут добавлены роутером при отправке]\n")
    }
    if (includeProgramLog) {
        sb.append("[Контекст: включён журнал Sheepfold — будет добавлен роутером при отправке]\n")
    }

    sb.append("\nВОПРОС РОДИТЕЛЯ:\n")
    sb.append(userText)

    return sb.toString()
}

// -------------------------------------------------------
// Вспомогательные composable-компоненты
// -------------------------------------------------------

@Composable
private fun GoogleAccountBox(
    googleAccount: String,
    googleAccounts: List<String>,
    onGoogleAccountChange: (String) -> Unit
) {
    val accountPicker = rememberLauncherForActivityResult(
        ActivityResultContracts.StartActivityForResult()
    ) { result ->
        val name = result.data
            ?.getStringExtra(AccountManager.KEY_ACCOUNT_NAME)
            .orEmpty()
        if (name.isNotBlank()) onGoogleAccountChange(name)
    }

    Card(
        modifier = Modifier.fillMaxWidth(),
        colors   = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        border   = BorderStroke(1.dp, MaterialTheme.colorScheme.outline.copy(alpha = 0.5f)),
        shape    = RoundedCornerShape(8.dp)
    ) {
        Column(
            modifier = Modifier.padding(14.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp)
        ) {
            Text("Google-аккаунт родителя", style = MaterialTheme.typography.titleMedium)
            Text(
                text  = "Используется как подпись в запросах к помощнику. AI-ключи хранятся на роутере.",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
            OutlinedButton(
                onClick  = {
                    // Системный выбор Google-аккаунта — удобная подпись родителя.
                    // Это НЕ авторизация в Gemini: AI-ключи задаются на роутере отдельно.
                    val intent = AccountManager.newChooseAccountIntent(
                        null, null, arrayOf("com.google"),
                        false, null, null, null, null
                    )
                    accountPicker.launch(intent)
                },
                modifier = Modifier.fillMaxWidth()
            ) { Text("Выбрать Google-аккаунт") }

            if (googleAccounts.isNotEmpty()) {
                Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    googleAccounts.take(3).forEach { acc ->
                        FilterChip(
                            selected = acc == googleAccount,
                            onClick  = { onGoogleAccountChange(acc) },
                            label    = { Text(acc, style = MaterialTheme.typography.labelSmall) }
                        )
                    }
                }
            }

            OutlinedTextField(
                value         = googleAccount,
                onValueChange = onGoogleAccountChange,
                modifier      = Modifier.fillMaxWidth(),
                label         = { Text("Google аккаунт") },
                singleLine    = true,
                placeholder   = { Text("parent@gmail.com") }
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
    // Жёлтый фон карточки — используем secondaryContainer из темы.
    // В светлой теме он будет кремово-жёлтым, в тёмной — тёмно-оранжевым.
    Card(
        modifier = Modifier.fillMaxWidth(),
        colors   = CardDefaults.cardColors(
            containerColor = MaterialTheme.colorScheme.secondaryContainer
        ),
        border = BorderStroke(1.dp, MaterialTheme.colorScheme.secondary.copy(alpha = 0.5f)),
        shape  = RoundedCornerShape(8.dp)
    ) {
        Column(
            modifier = Modifier.padding(14.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            Text(
                text  = "Что передаётся ИИ",
                style = MaterialTheme.typography.titleMedium,
                color = MaterialTheme.colorScheme.onSecondaryContainer
            )
            // Важный момент: чекбоксы выключены по умолчанию (privacy by default)
            ConsentRow(
                checked         = includeRouterInfo,
                onCheckedChange = onIncludeRouterInfoChange,
                text            = "Добавить данные со страницы «Информация» роутера"
            )
            ConsentRow(
                checked         = includeProgramLog,
                onCheckedChange = onIncludeProgramLogChange,
                text            = "Добавить журнал программы Sheepfold"
            )
            Text(
                text  = "По умолчанию передаётся только ваш текст. " +
                        "Роутер скрывает чувствительные поля перед отправкой.",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSecondaryContainer.copy(alpha = 0.8f)
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
        horizontalArrangement = Arrangement.spacedBy(8.dp)
    ) {
        Checkbox(checked = checked, onCheckedChange = onCheckedChange)
        Text(text, style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSecondaryContainer)
    }
}

@Composable
private fun AiModelSelector(
    selectedModel: AiAssistantModel,
    onModelChange: (AiAssistantModel) -> Unit
) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        colors   = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        border   = BorderStroke(1.dp, MaterialTheme.colorScheme.outline.copy(alpha = 0.4f)),
        shape    = RoundedCornerShape(8.dp)
    ) {
        Column(
            modifier = Modifier.padding(14.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            Text("Провайдер ИИ", style = MaterialTheme.typography.titleMedium)
            AiAssistantModel.entries.forEach { model ->
                FilterChip(
                    selected = selectedModel == model,
                    onClick  = { if (model.isAvailable) onModelChange(model) },
                    enabled  = model.isAvailable,
                    label    = {
                        Column {
                            Row(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                                Text(model.title, fontWeight = FontWeight.Bold)
                                // Метка «Скоро» для недоступных провайдеров
                                if (!model.isAvailable) {
                                    Text(
                                        text  = "скоро",
                                        style = MaterialTheme.typography.labelSmall,
                                        color = MaterialTheme.colorScheme.secondary
                                    )
                                }
                            }
                            Text(
                                text  = model.description,
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant
                            )
                        }
                    }
                )
            }
        }
    }
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
    Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
        Text(
            text  = title,
            style = MaterialTheme.typography.headlineMedium,
            color = MaterialTheme.colorScheme.onBackground,
            fontWeight = FontWeight.Bold
        )
        Text(
            text  = body,
            style = MaterialTheme.typography.bodyLarge,
            color = MaterialTheme.colorScheme.onSurfaceVariant
        )
    }
}

@Composable
private fun MetricCard(title: String, value: String, modifier: Modifier = Modifier) {
    Card(
        modifier = modifier,
        colors   = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        border   = BorderStroke(1.dp, MaterialTheme.colorScheme.outline.copy(alpha = 0.4f)),
        shape    = RoundedCornerShape(8.dp)
    ) {
        Column(modifier = Modifier.padding(10.dp)) {
            Text(title, style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant)
            Text(value, style = MaterialTheme.typography.headlineSmall,
                color = MaterialTheme.colorScheme.onSurface, fontWeight = FontWeight.Bold)
        }
    }
}

// StatusCard — карточка с цветным индикатором слева.
// indicatorColor передаётся явно из вызывающего кода (из темы),
// а не хардкодится здесь. Это позволяет переиспользовать карточку
// для любых статусов.
@Composable
private fun StatusCard(title: String, body: String, indicatorColor: Color) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        colors   = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        border   = BorderStroke(1.dp, MaterialTheme.colorScheme.outline.copy(alpha = 0.4f)),
        shape    = RoundedCornerShape(8.dp)
    ) {
        Row(modifier = Modifier.padding(14.dp)) {
            // Цветная полоска-индикатор слева
            Box(
                modifier = Modifier
                    .width(4.dp)
                    .height(40.dp)
                    .background(
                        color = indicatorColor,
                        shape = RoundedCornerShape(2.dp)
                    )
            )
            Spacer(modifier = Modifier.width(12.dp))
            Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                Text(title, style = MaterialTheme.typography.titleMedium,
                    color = MaterialTheme.colorScheme.onSurface)
                Text(body, style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
    }
}

// InfoCard — нейтральная информационная карточка без цветного индикатора.
// Для пунктов где статуса нет — только информация.
@Composable
private fun InfoCard(title: String, body: String) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        colors   = CardDefaults.cardColors(
            containerColor = MaterialTheme.colorScheme.surfaceVariant
        ),
        shape = RoundedCornerShape(8.dp)
    ) {
        Column(
            modifier = Modifier.padding(14.dp),
            verticalArrangement = Arrangement.spacedBy(4.dp)
        ) {
            Text(title, style = MaterialTheme.typography.titleSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                fontWeight = FontWeight.SemiBold)
            Text(body, style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
    }
}

@Composable
private fun StatusPill(status: DeviceStatus, color: Color) {
    Box(
        modifier = Modifier
            .background(
                color = color.copy(alpha = 0.15f),
                shape = RoundedCornerShape(999.dp)
            )
            .padding(horizontal = 10.dp, vertical = 4.dp)
    ) {
        Text(
            text       = status.label,
            color      = color,
            style      = MaterialTheme.typography.labelSmall,
            fontWeight = FontWeight.Bold
        )
    }
}

// -------------------------------------------------------
// Вспомогательные non-composable функции
// -------------------------------------------------------

private fun readAiAssistantModel(context: Context): AiAssistantModel {
    val raw = context
        .getSharedPreferences("sheepfold-app", Context.MODE_PRIVATE)
        .getString("aiAssistantModel", AiAssistantModel.DeepSeek.name)
    return AiAssistantModel.entries.firstOrNull { it.name == raw } ?: AiAssistantModel.DeepSeek
}

private fun saveAiAssistantModel(context: Context, model: AiAssistantModel) {
    context
        .getSharedPreferences("sheepfold-app", Context.MODE_PRIVATE)
        .edit()
        .putString("aiAssistantModel", model.name)
        .apply()
}

private fun readGoogleAccounts(context: Context): List<String> {
    if (ContextCompat.checkSelfPermission(context, Manifest.permission.GET_ACCOUNTS)
        != PackageManager.PERMISSION_GRANTED
    ) return emptyList()
    return runCatching {
        AccountManager.get(context)
            .getAccountsByType("com.google")
            .map { it.name }
            .filter { it.isNotBlank() }
            .distinct()
    }.getOrDefault(emptyList())
}
