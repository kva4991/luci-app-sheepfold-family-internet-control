package com.example.sheepfoldchild.data

import android.Manifest
import android.annotation.SuppressLint
import android.content.Context
import android.content.pm.PackageManager
import android.location.Location
import android.location.LocationManager
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import android.net.wifi.WifiInfo
import android.net.wifi.WifiManager
import android.os.Build
import androidx.core.content.ContextCompat
import java.security.MessageDigest
import java.util.Locale
import kotlin.math.roundToInt

/**
 * Формирует сигнал о текущей Wi-Fi сети. BSSID участвует только в локальном
 * отпечатке и никогда не покидает телефон в открытом виде. §childwifi1
 */
object WifiNetworkSnapshotCollector {

    private const val MAX_LOCATION_AGE_MS = 60 * 60 * 1000L
    private const val UNKNOWN_SSID = "<unknown ssid>"

    fun payload(context: Context, includeLocation: Boolean): String? {
        if (!hasPermission(context, Manifest.permission.ACCESS_FINE_LOCATION)) return null
        if (
            Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
            !hasPermission(context, Manifest.permission.NEARBY_WIFI_DEVICES)
        ) return null

        val wifiInfo = currentWifiInfo(context) ?: return null
        val ssid = wifiInfo.ssid
            ?.removeSurrounding("\"")
            ?.replace(Regex("[\\r\\n\\t|]"), " ")
            ?.take(96)
            ?.takeUnless { it.isBlank() || it == UNKNOWN_SSID }
            ?: return null
        val bssid = wifiInfo.bssid
            ?.lowercase(Locale.US)
            ?.takeIf { it.matches(Regex("^([0-9a-f]{2}:){5}[0-9a-f]{2}$")) }
            ?.takeUnless { it == "02:00:00:00:00:00" }
            ?: return null
        val fingerprint = sha256("$ssid|$bssid")
        val now = System.currentTimeMillis()
        val location = if (includeLocation) recentLocation(context, now) else null

        return buildString {
            appendLine("version=1")
            appendLine("fingerprint=$fingerprint")
            appendLine("ssid=$ssid")
            appendLine("observed_at=${now / 1000L}")
            if (location != null) {
                append("location=")
                append(String.format(Locale.US, "%.6f", location.latitude))
                append('|')
                append(String.format(Locale.US, "%.6f", location.longitude))
                append('|')
                append(location.accuracy.coerceIn(0f, 10_000f).roundToInt())
                append('|')
                append(location.time / 1000L)
                appendLine()
            }
        }
    }

    @SuppressLint("MissingPermission")
    private fun currentWifiInfo(context: Context): WifiInfo? {
        val connectivity = context.getSystemService(Context.CONNECTIVITY_SERVICE) as? ConnectivityManager
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            val network = connectivity?.activeNetwork
            val capabilities = network?.let(connectivity::getNetworkCapabilities)
            if (
                Build.VERSION.SDK_INT >= Build.VERSION_CODES.S &&
                capabilities?.hasTransport(NetworkCapabilities.TRANSPORT_WIFI) == true
            ) {
                (capabilities.transportInfo as? WifiInfo)?.let { return it }
            }
        }

        // Wi-Fi без доступа в интернет может не быть активным транспортом:
        // Android продолжает передавать данные через мобильную сеть, хотя к
        // точке телефон подключён. Не теряем такой факт подключения.
        @Suppress("DEPRECATION")
        return (context.applicationContext.getSystemService(Context.WIFI_SERVICE) as? WifiManager)
            ?.takeIf(WifiManager::isWifiEnabled)
            ?.connectionInfo
    }

    @SuppressLint("MissingPermission")
    private fun recentLocation(context: Context, now: Long): Location? {
        val manager = context.getSystemService(Context.LOCATION_SERVICE) as? LocationManager ?: return null
        return manager.getProviders(true)
            .mapNotNull { provider -> runCatching { manager.getLastKnownLocation(provider) }.getOrNull() }
            .filter { location ->
                location.latitude in -90.0..90.0 &&
                    location.longitude in -180.0..180.0 &&
                    location.accuracy.isFinite() &&
                    location.accuracy <= 10_000f &&
                    location.time in (now - MAX_LOCATION_AGE_MS)..(now + 60_000L)
            }
            .maxWithOrNull(compareBy<Location> { it.time }.thenBy { -it.accuracy })
    }

    private fun sha256(value: String): String = MessageDigest.getInstance("SHA-256")
        .digest(value.toByteArray(Charsets.UTF_8))
        .joinToString("") { byte -> "%02x".format(byte) }

    private fun hasPermission(context: Context, permission: String): Boolean =
        ContextCompat.checkSelfPermission(context, permission) == PackageManager.PERMISSION_GRANTED
}
