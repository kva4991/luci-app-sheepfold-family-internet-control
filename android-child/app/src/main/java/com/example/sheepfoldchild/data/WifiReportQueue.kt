package com.example.sheepfoldchild.data

import android.content.Context
import org.json.JSONArray

/**
 * Ограниченная очередь нужна, потому что вне дома локальный адрес роутера
 * недоступен. В ней нет открытого BSSID: только уже подготовленный безопасный
 * payload, который будет передан после возвращения в сеть Sheepfold. §childwifi1
 */
object WifiReportQueue {

    private const val PREFS = "sheepfold_child_wifi_reports"
    private const val KEY_ENABLED = "enabled"
    private const val KEY_LOCATION = "include_location"
    private const val KEY_REPORTS = "reports"
    private const val MAX_REPORTS = 100

    @Synchronized
    fun updatePolicy(context: Context, enabled: Boolean, includeLocation: Boolean) {
        val prefs = preferences(context)
        val editor = prefs.edit()
            .putBoolean(KEY_ENABLED, enabled)
            .putBoolean(KEY_LOCATION, enabled && includeLocation)

        when {
            !enabled -> editor.remove(KEY_REPORTS)
            !includeLocation -> {
                val reports = readReports(context).map(::withoutLocation)
                editor.putString(KEY_REPORTS, JSONArray(reports).toString())
            }
        }
        editor.commit()
    }

    @Synchronized
    fun captureWithSavedPolicy(context: Context) {
        val prefs = preferences(context)
        if (!prefs.getBoolean(KEY_ENABLED, false)) return
        capture(context, prefs.getBoolean(KEY_LOCATION, false))
    }

    @Synchronized
    fun capture(context: Context, includeLocation: Boolean) {
        val payload = WifiNetworkSnapshotCollector.payload(context, includeLocation) ?: return
        val fingerprint = fingerprintOf(payload) ?: return
        val reports = readReports(context).toMutableList()
        if (reports.any { fingerprintOf(it) == fingerprint }) return
        reports += payload
        writeReports(context, reports.takeLast(MAX_REPORTS))
    }

    @Synchronized
    fun pending(context: Context): List<String> = readReports(context)

    @Synchronized
    fun markDelivered(context: Context, payload: String) {
        val reports = readReports(context).toMutableList()
        val index = reports.indexOf(payload)
        if (index < 0) return
        reports.removeAt(index)
        writeReports(context, reports)
    }

    private fun readReports(context: Context): List<String> {
        val raw = preferences(context).getString(KEY_REPORTS, null) ?: return emptyList()
        return runCatching {
            val json = JSONArray(raw)
            buildList {
                for (index in 0 until json.length()) {
                    val payload = json.optString(index)
                    if (payload.isNotBlank() && fingerprintOf(payload) != null) add(payload)
                }
            }.takeLast(MAX_REPORTS)
        }.getOrDefault(emptyList())
    }

    private fun writeReports(context: Context, reports: List<String>) {
        preferences(context).edit()
            .putString(KEY_REPORTS, JSONArray(reports.takeLast(MAX_REPORTS)).toString())
            .commit()
    }

    private fun withoutLocation(payload: String): String = payload.lineSequence()
        .filterNot { it.startsWith("location=") }
        .joinToString("\n")
        .let { if (it.endsWith("\n")) it else "$it\n" }

    private fun fingerprintOf(payload: String): String? = payload.lineSequence()
        .firstOrNull { it.startsWith("fingerprint=") }
        ?.removePrefix("fingerprint=")
        ?.takeIf { it.matches(Regex("[0-9a-f]{64}")) }

    private fun preferences(context: Context) =
        context.applicationContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
}
