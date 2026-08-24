package app.sheepfold.android.support

import android.util.Base64
import app.sheepfold.android.router.RouterSnapshot
import org.json.JSONArray
import org.json.JSONObject
import java.security.SecureRandom

data class SupportReportDraft(
    val category: String,
    val title: String,
    val actualBehavior: String,
    val expectedBehavior: String,
    val reproductionSteps: String,
    val replyContact: String,
    val diagnosticsApproved: Boolean
)

data class PreparedSupportReport(
    val reportId: String,
    /** Именно эта строка показывается пользователю и затем шифруется без изменений. */
    val payloadJson: String
)

/** Формирует только документированную проекцию данных, без UCI, адресов и имён устройств. */
object SupportReportPayload {
    private val reportCategories = setOf("bug", "idea", "question", "other")
    private val safeDiagnosticKeys = linkedMapOf(
        "internetStatus" to 64,
        "internetReason" to 512,
        "pingYandexMs" to 64,
        "kernelVersion" to 128,
        "uptime" to 128,
        "loadAverage" to 128,
        "memory" to 256,
        "lanPortsCount" to 32,
        "globalBlocked" to 16,
        "podkopInstalled" to 16,
        "podkopVersion" to 128,
        "adguardInstalled" to 16,
        "adguardVersion" to 128
    )

    fun prepare(draft: SupportReportDraft, snapshot: RouterSnapshot): PreparedSupportReport {
        require(draft.category in reportCategories) { "Неизвестный тип сообщения." }
        val title = requireLength(draft.title, 1, 160, "Тема")
        val actual = requireLength(draft.actualBehavior, 1, 8000, "Описание")
        val expected = optionalLength(draft.expectedBehavior, 4000, "Ожидаемый результат")
        val steps = optionalLength(draft.reproductionSteps, 8000, "Шаги воспроизведения")
        val contact = optionalLength(draft.replyContact, 200, "Контакт")
        val reportId = randomReportId()

        val summary = JSONObject()
            .put("title", title)
            .put("actualBehavior", actual)
        expected?.let { summary.put("expectedBehavior", it) }
        steps?.let { summary.put("reproductionSteps", it) }

        val software = JSONObject()
            .put("sheepfoldVersion", diagnostic(snapshot, "sheepfoldVersion", 64))
            .put("packageVariant", packageVariant(snapshot.diagnostics["productVariant"]))
            .put("openwrtVersion", diagnostic(snapshot, "openwrtRelease", 128))
            .put("architecture", diagnostic(snapshot, "architecture", 64))
            .put("routerModel", diagnostic(snapshot, "routerModel", 160))
            .put("integrationMode", integrationMode(snapshot.diagnostics["integrationMode"]))

        val includedFields = JSONArray()
            .put("summary.title")
            .put("summary.actualBehavior")
            .put("software")
        if (expected != null) includedFields.put("summary.expectedBehavior")
        if (steps != null) includedFields.put("summary.reproductionSteps")
        if (contact != null) includedFields.put("replyContact")

        val payload = JSONObject()
            .put("schemaVersion", 1)
            .put("reportId", reportId)
            .put("source", "parentAndroid")
            .put("category", draft.category)
            .put("summary", summary)
            .put("software", software)
        contact?.let { payload.put("replyContact", it) }

        if (draft.diagnosticsApproved) {
            payload.put("diagnostics", buildDiagnostics(snapshot))
            includedFields
                .put("diagnostics.errorCodes")
                .put("diagnostics.componentStates")
                .put("diagnostics.safeRouterState")
        }
        payload.put(
            "privacy",
            JSONObject()
                .put("previewVersion", 1)
                .put("redactionVersion", 1)
                .put("diagnosticsApproved", draft.diagnosticsApproved)
                .put("includedFields", includedFields)
        )

        // Красивое форматирование тоже входит в шифруемый plaintext, поэтому
        // предпросмотр и реально отправляемые байты не расходятся.
        return PreparedSupportReport(reportId, payload.toString(2))
    }

    private fun buildDiagnostics(snapshot: RouterSnapshot): JSONObject {
        val internetStatus = snapshot.diagnostics["internetStatus"].orEmpty().ifBlank { "unknown" }
        val componentState = when (internetStatus) {
            "online" -> "ok"
            "limited" -> "warning"
            "offline" -> "error"
            else -> "unknown"
        }
        val errorCodes = JSONArray()
        if (componentState != "ok" && componentState != "unknown") {
            errorCodes.put("internet.$internetStatus")
        }
        val componentStates = JSONArray().put(
            JSONObject()
                .put("component", "internet")
                .put("state", componentState)
                .apply {
                    if (errorCodes.length() > 0) put("errorCode", "internet.$internetStatus")
                }
        )
        val safeState = JSONObject()
        safeDiagnosticKeys.forEach { (key, maximum) ->
            snapshot.diagnostics[key]
                ?.trim()
                ?.takeIf(String::isNotEmpty)
                ?.let { safeState.put(key, it.take(maximum)) }
        }
        wifiSummary(snapshot)?.let { safeState.put("wifiSummary", it) }

        return JSONObject()
            .put("errorCodes", errorCodes)
            .put("componentStates", componentStates)
            .put("safeRouterState", safeState)
    }

    private fun wifiSummary(snapshot: RouterSnapshot): String? {
        val summary = snapshot.wifiModules.mapIndexed { index, module ->
            listOf(
                "module=${index + 1}",
                "status=${module.status.safeToken()}",
                "band=${module.band.safeToken()}",
                "channel=${module.channel.safeToken()}",
                "country=${module.country.safeToken()}",
                "mode=${module.mode.safeToken()}"
            ).joinToString(",")
        }.joinToString("; ").take(2048)
        return summary.takeIf(String::isNotBlank)
    }

    private fun String.safeToken(): String = trim().replace(Regex("[^A-Za-z0-9._+-]"), "_").take(64)

    private fun diagnostic(snapshot: RouterSnapshot, key: String, maximum: Int): String =
        snapshot.diagnostics[key]?.trim()?.take(maximum)?.ifBlank { "unknown" } ?: "unknown"

    private fun packageVariant(value: String?): String = if (value == "sheepfoldAi") "aiSupport" else "standard"

    private fun integrationMode(value: String?): String = when (value) {
        "adguard", "podkop", "adguard_podkop" -> value
        else -> "none"
    }

    private fun requireLength(value: String, minimum: Int, maximum: Int, label: String): String {
        val clean = value.trim()
        require(clean.length in minimum..maximum) { "$label: проверьте длину поля." }
        return clean
    }

    private fun optionalLength(value: String, maximum: Int, label: String): String? {
        val clean = value.trim()
        require(clean.length <= maximum) { "$label: поле слишком длинное." }
        return clean.takeIf(String::isNotEmpty)
    }

    private fun randomReportId(): String {
        val bytes = ByteArray(16)
        SecureRandom().nextBytes(bytes)
        return Base64.encodeToString(bytes, Base64.URL_SAFE or Base64.NO_WRAP or Base64.NO_PADDING)
    }
}
