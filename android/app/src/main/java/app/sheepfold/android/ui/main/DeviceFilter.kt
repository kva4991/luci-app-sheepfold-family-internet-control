package app.sheepfold.android.ui.main

import androidx.annotation.StringRes
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import app.sheepfold.android.R
import app.sheepfold.android.router.RouterDevice

internal enum class DeviceFilter(@StringRes val label: Int) {
    ALL(R.string.device_filter_all),
    PERSONAL(R.string.device_filter_personal),
    MEDIA(R.string.device_filter_media),
    TECHNICAL(R.string.device_filter_technical),
    SMART_HOME(R.string.device_filter_smart_home),
    WEARABLE(R.string.device_filter_wearable),
    UNKNOWN(R.string.device_filter_unknown)
}

/** Категория отображения по типу, не изменение группы или прав устройства. */
internal fun deviceCategory(type: String): DeviceFilter = when (type) {
    "phone", "tablet", "computer" -> DeviceFilter.PERSONAL
    "tv", "media_player", "console", "speaker" -> DeviceFilter.MEDIA
    "printer", "server", "engineering", "network", "router", "network_switch" -> DeviceFilter.TECHNICAL
    "vacuum", "smart_home", "camera" -> DeviceFilter.SMART_HOME
    "smart_watch" -> DeviceFilter.WEARABLE
    // Старый общий smart не доказывает, что это устройство умного дома.
    else -> DeviceFilter.UNKNOWN
}

internal fun filterDevices(devices: List<RouterDevice>, filter: DeviceFilter): List<RouterDevice> =
    devices.filter {
        val category = deviceCategory(it.deviceType)
        // Носимые входят в персональные и одновременно имеют собственный узкий фильтр.
        filter == DeviceFilter.ALL || category == filter ||
            (filter == DeviceFilter.PERSONAL && category == DeviceFilter.WEARABLE)
    }

@OptIn(ExperimentalMaterial3Api::class)
@Composable
internal fun DeviceFilterField(value: DeviceFilter, onSelect: (DeviceFilter) -> Unit) {
    var expanded by remember { mutableStateOf(false) }
    ExposedDropdownMenuBox(expanded = expanded, onExpandedChange = { expanded = it }) {
        OutlinedTextField(
            value = stringResource(value.label), onValueChange = {}, readOnly = true,
            label = { Text(stringResource(R.string.device_filter_show)) },
            trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expanded) },
            modifier = Modifier.fillMaxWidth().menuAnchor(MenuAnchorType.PrimaryNotEditable)
        )
        ExposedDropdownMenu(expanded, onDismissRequest = { expanded = false }) {
            DeviceFilter.entries.forEach { choice ->
                DropdownMenuItem(text = { Text(stringResource(choice.label)) }, onClick = { onSelect(choice); expanded = false })
            }
        }
    }
}
