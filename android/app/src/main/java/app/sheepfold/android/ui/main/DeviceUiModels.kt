package app.sheepfold.android.ui.main

import androidx.annotation.DrawableRes
import androidx.annotation.StringRes
import androidx.compose.runtime.Composable
import androidx.compose.ui.res.stringResource
import app.sheepfold.android.R

/** Один источник порядка, подписей и значков типов устройств для Android UI. */
internal data class DeviceTypeOption(
    val code: String,
    @StringRes val labelRes: Int,
    @DrawableRes val iconRes: Int
)

internal val deviceTypeOptions = listOf(
    DeviceTypeOption("unknown", R.string.device_type_unknown, R.drawable.ic_device_type_unknown),
    DeviceTypeOption("phone", R.string.device_type_phone, R.drawable.ic_device_type_phone),
    DeviceTypeOption("tablet", R.string.device_type_tablet, R.drawable.ic_device_type_tablet),
    DeviceTypeOption("computer", R.string.device_type_computer, R.drawable.ic_device_type_computer),
    DeviceTypeOption("tv", R.string.device_type_tv, R.drawable.ic_device_type_television),
    DeviceTypeOption("media_player", R.string.device_type_media_player, R.drawable.ic_device_type_media_player),
    DeviceTypeOption("smart_watch", R.string.device_type_smart_watch, R.drawable.ic_device_type_smart_watch),
    DeviceTypeOption("console", R.string.device_type_console, R.drawable.ic_device_type_game_console),
    DeviceTypeOption("printer", R.string.device_type_printer, R.drawable.ic_device_type_printer),
    DeviceTypeOption("server", R.string.device_type_server, R.drawable.ic_device_type_server),
    DeviceTypeOption("camera", R.string.device_type_camera, R.drawable.ic_device_type_camera),
    DeviceTypeOption("speaker", R.string.device_type_speaker, R.drawable.ic_device_type_smart_speaker),
    DeviceTypeOption("vacuum", R.string.device_type_vacuum, R.drawable.ic_device_type_robot_vacuum),
    DeviceTypeOption("smart_home", R.string.device_type_smart_home, R.drawable.ic_device_type_smart_home),
    DeviceTypeOption("engineering", R.string.device_type_engineering, R.drawable.ic_device_type_engineering),
    DeviceTypeOption("smart", R.string.device_type_smart, R.drawable.ic_device_type_smart_device),
    DeviceTypeOption("network", R.string.device_type_network, R.drawable.ic_device_type_network),
    DeviceTypeOption("router", R.string.device_type_router, R.drawable.ic_device_type_router),
    DeviceTypeOption("network_switch", R.string.device_type_network_switch, R.drawable.ic_device_type_network_switch)
)

internal val deviceStatusCodes = listOf("new", "scheduled", "restricted", "allow", "blocked")

internal fun deviceTypeOption(code: String): DeviceTypeOption =
    deviceTypeOptions.firstOrNull { it.code == code } ?: deviceTypeOptions.first()

@Composable
internal fun deviceTypeLabel(code: String): String = stringResource(deviceTypeOption(code).labelRes)

@Composable
internal fun deviceStatusLabel(code: String): String = stringResource(
    when (code) {
        "allow" -> R.string.device_access_allow
        "blocked" -> R.string.device_access_blocked
        "restricted" -> R.string.device_access_restricted
        "scheduled" -> R.string.device_access_scheduled
        else -> R.string.device_access_new
    }
)

internal fun displayDeviceId(rawId: String): String = "#${rawId.removePrefix("#")}"
