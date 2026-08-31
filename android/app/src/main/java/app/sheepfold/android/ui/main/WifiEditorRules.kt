package app.sheepfold.android.ui.main

import app.sheepfold.android.router.RouterWifiNetwork

internal fun wifiSettingsEqual(first: RouterWifiNetwork, second: RouterWifiNetwork): Boolean =
    first.copy(channels = emptyList()) == second.copy(channels = emptyList())

internal fun wifiChannelOptions(network: RouterWifiNetwork): List<String> =
    (listOf(network.channel, "auto") + network.channels.filter { (it.toIntOrNull() ?: 0) in 1..233 }).distinct()

internal fun wifiInputValid(network: RouterWifiNetwork): Boolean {
    if (network.ssid.trim().toByteArray(Charsets.UTF_8).size !in 1..32) return false
    val bytes = network.password.toByteArray(Charsets.UTF_8).size
    val hexKey = network.password.matches(Regex("[a-fA-F0-9]{64}"))
    return when (network.encryption) {
        "none", "owe" -> true
        "psk", "psk2", "psk-mixed", "sae-mixed" -> bytes in 8..63 || hexKey
        "sae" -> bytes in 1..63
        // Не меняем контракт сохранённых enterprise/WEP-сетей этим клиентским ограничением
        else -> network.password.isNotEmpty()
    }
}
