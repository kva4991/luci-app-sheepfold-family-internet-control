package app.sheepfold.android.ui.main

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ExposedDropdownMenuBox
import androidx.compose.material3.ExposedDropdownMenuDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.RadioButton
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import app.sheepfold.android.R
import app.sheepfold.android.security.AppProtectionStore
import app.sheepfold.android.ui.theme.AppLanguage
import app.sheepfold.android.ui.theme.LanguagePreferenceStore
import app.sheepfold.android.ui.theme.ThemeMode
import app.sheepfold.android.widget.SheepfoldWidgetRenderer

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SettingsTab(
    themeMode: ThemeMode,
    onThemeModeChange: (ThemeMode) -> Unit,
    onLanguageChange: (AppLanguage) -> Unit,
    onLockNow: () -> Unit,
    onDisconnect: () -> Unit
) {
    val context = LocalContext.current
    var relockDelaySeconds by remember {
        mutableStateOf(AppProtectionStore.relockDelaySeconds(context))
    }
    var allowInstantWidgetDisable by remember {
        mutableStateOf(AppProtectionStore.allowInstantWidgetDisable(context))
    }
    var language by remember { mutableStateOf(LanguagePreferenceStore.read(context)) }
    var delayMenuExpanded by remember { mutableStateOf(false) }
    var languageMenuExpanded by remember { mutableStateOf(false) }
    var showWidgetWarning by remember { mutableStateOf(false) }
    val effectiveThemeMode = when (themeMode) {
        ThemeMode.SYSTEM -> if (isSystemInDarkTheme()) ThemeMode.DARK else ThemeMode.LIGHT
        else -> themeMode
    }

    androidx.compose.foundation.lazy.LazyColumn(
        modifier = Modifier
            .fillMaxSize()
            .padding(20.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        item {
            Text(stringResource(R.string.settings_security_title), style = MaterialTheme.typography.titleLarge)
            Spacer(Modifier.size(8.dp))
            Text(stringResource(R.string.settings_relock_label))
            ExposedDropdownMenuBox(
                expanded = delayMenuExpanded,
                onExpandedChange = { delayMenuExpanded = !delayMenuExpanded }
            ) {
                OutlinedTextField(
                    value = relockDelayLabel(relockDelaySeconds),
                    onValueChange = {},
                    readOnly = true,
                    trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(delayMenuExpanded) },
                    modifier = Modifier
                        .menuAnchor()
                        .fillMaxWidth()
                )
                ExposedDropdownMenu(
                    expanded = delayMenuExpanded,
                    onDismissRequest = { delayMenuExpanded = false }
                ) {
                    AppProtectionStore.supportedRelockDelaysSeconds.forEach { seconds ->
                        DropdownMenuItem(
                            text = { Text(relockDelayLabel(seconds)) },
                            onClick = {
                                AppProtectionStore.setRelockDelaySeconds(context, seconds)
                                relockDelaySeconds = seconds
                                delayMenuExpanded = false
                            }
                        )
                    }
                }
            }
            Text(stringResource(R.string.settings_relock_description))
        }
        item {
            Card(colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant)) {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(14.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.SpaceBetween
                ) {
                    Column(modifier = Modifier.weight(1f)) {
                        Text(stringResource(R.string.settings_widget_disable_title))
                        Text(
                            stringResource(
                                if (allowInstantWidgetDisable) {
                                    R.string.settings_widget_disable_instant
                                } else {
                                    R.string.settings_widget_disable_safe
                                }
                            )
                        )
                    }
                    Switch(
                        checked = allowInstantWidgetDisable,
                        onCheckedChange = { enabled ->
                            if (enabled) {
                                showWidgetWarning = true
                            } else {
                                allowInstantWidgetDisable = false
                                AppProtectionStore.setAllowInstantWidgetDisable(context, false)
                                SheepfoldWidgetRenderer.updateAllWidgets(context)
                            }
                        }
                    )
                }
            }
            if (AppProtectionStore.requiresAuthentication(context)) {
                OutlinedButton(onClick = onLockNow, modifier = Modifier.fillMaxWidth()) {
                    Text(stringResource(R.string.settings_lock_now))
                }
            }
        }
        item {
            Text(stringResource(R.string.settings_appearance), style = MaterialTheme.typography.titleLarge)
            Text(stringResource(R.string.settings_theme), style = MaterialTheme.typography.titleMedium)
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(12.dp)
            ) {
                ThemeChoice(
                    selected = effectiveThemeMode == ThemeMode.LIGHT,
                    color = Color.White,
                    label = stringResource(R.string.settings_theme_light),
                    modifier = Modifier.weight(1f)
                ) { onThemeModeChange(ThemeMode.LIGHT) }
                ThemeChoice(
                    selected = effectiveThemeMode == ThemeMode.DARK,
                    color = Color.Black,
                    label = stringResource(R.string.settings_theme_dark),
                    modifier = Modifier.weight(1f)
                ) { onThemeModeChange(ThemeMode.DARK) }
            }
        }
        item {
            Text(stringResource(R.string.settings_language), style = MaterialTheme.typography.titleMedium)
            ExposedDropdownMenuBox(
                expanded = languageMenuExpanded,
                onExpandedChange = { languageMenuExpanded = !languageMenuExpanded }
            ) {
                OutlinedTextField(
                    value = languageLabel(language),
                    onValueChange = {},
                    readOnly = true,
                    trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(languageMenuExpanded) },
                    modifier = Modifier
                        .menuAnchor()
                        .fillMaxWidth()
                )
                ExposedDropdownMenu(
                    expanded = languageMenuExpanded,
                    onDismissRequest = { languageMenuExpanded = false }
                ) {
                    AppLanguage.entries.forEach { option ->
                        DropdownMenuItem(
                            text = { Text(languageLabel(option)) },
                            onClick = {
                                language = option
                                languageMenuExpanded = false
                                onLanguageChange(option)
                            }
                        )
                    }
                }
            }
        }
        item {
            Button(onClick = onDisconnect, modifier = Modifier.fillMaxWidth()) {
                Text(stringResource(R.string.settings_disconnect))
            }
        }
    }

    if (showWidgetWarning) {
        AlertDialog(
            onDismissRequest = { showWidgetWarning = false },
            title = { Text(stringResource(R.string.settings_widget_disable_warning_title)) },
            text = { Text(stringResource(R.string.settings_widget_disable_warning_body)) },
            confirmButton = {
                Button(onClick = {
                    allowInstantWidgetDisable = true
                    AppProtectionStore.setAllowInstantWidgetDisable(context, true)
                    SheepfoldWidgetRenderer.updateAllWidgets(context)
                    showWidgetWarning = false
                }) {
                    Text(stringResource(R.string.settings_widget_disable_warning_confirm))
                }
            },
            dismissButton = {
                TextButton(onClick = { showWidgetWarning = false }) {
                    Text(stringResource(R.string.action_cancel))
                }
            }
        )
    }
}

@Composable
private fun ThemeChoice(
    selected: Boolean,
    color: Color,
    label: String,
    modifier: Modifier,
    onClick: () -> Unit
) {
    Row(
        modifier = modifier
            .border(1.dp, MaterialTheme.colorScheme.outline, MaterialTheme.shapes.small)
            .clickable(onClick = onClick)
            .padding(10.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        RadioButton(selected = selected, onClick = onClick)
        Box(
            Modifier
                .size(24.dp)
                .background(color, CircleShape)
                .border(1.dp, MaterialTheme.colorScheme.outline, CircleShape)
        )
        Text(label, Modifier.padding(start = 8.dp))
    }
}

@Composable
private fun relockDelayLabel(seconds: Int): String = stringResource(
    when (seconds) {
        0 -> R.string.settings_relock_immediate
        300 -> R.string.settings_relock_five_minutes
        900 -> R.string.settings_relock_fifteen_minutes
        else -> R.string.settings_relock_one_minute
    }
)

@Composable
private fun languageLabel(language: AppLanguage): String = stringResource(
    when (language) {
        AppLanguage.SYSTEM -> R.string.settings_language_system
        AppLanguage.RUSSIAN -> R.string.settings_language_russian
        AppLanguage.ENGLISH -> R.string.settings_language_english
    }
)
