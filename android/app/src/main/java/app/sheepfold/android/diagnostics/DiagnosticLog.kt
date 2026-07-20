package app.sheepfold.android.diagnostics

import android.Manifest
import android.content.ContentValues
import android.content.Context
import android.content.pm.ApplicationInfo
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Environment
import android.provider.MediaStore
import android.util.Log
import androidx.annotation.RequiresApi
import androidx.core.content.ContextCompat
import java.io.File
import java.io.OutputStreamWriter
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.TimeZone
import java.util.concurrent.Executors

/**
 * Диагностический журнал тестового APK.
 *
 * Он включается только для debuggable-сборки и пишет в системные «Загрузки».
 * Значения дополнительно очищаются здесь, чтобы случайный вызывающий код не мог
 * сохранить QR, пароль, Bearer-токен или MAC даже по ошибке. §dscqr01
 */
object DiagnosticLog {
    private const val tag = "SheepfoldDiag"
    private const val prefsName = "sheepfold_diagnostic_log"
    private const val uriKey = "download_uri"
    private const val fileNameKey = "download_name"
    private const val byteCountKey = "byte_count"
    private const val maxBytes = 2L * 1024L * 1024L

    private val writer = Executors.newSingleThreadExecutor { task ->
        Thread(task, "sheepfold-diagnostic-log").apply { isDaemon = true }
    }
    @Volatile private var appContext: Context? = null
    @Volatile private var enabled = false

    fun initialize(context: Context) {
        val applicationContext = context.applicationContext
        appContext = applicationContext
        enabled = applicationContext.applicationInfo.flags and ApplicationInfo.FLAG_DEBUGGABLE != 0
        if (!enabled) return

        info(
            "app.started",
            "version" to appVersion(applicationContext),
            "android" to Build.VERSION.RELEASE,
            "sdk" to Build.VERSION.SDK_INT,
            "device" to "${Build.MANUFACTURER} ${Build.MODEL}"
        )
    }

    fun info(event: String, vararg fields: Pair<String, Any?>) = enqueue("INFO", event, fields, null)

    fun warn(event: String, vararg fields: Pair<String, Any?>) = enqueue("WARN", event, fields, null)

    fun error(event: String, error: Throwable?, vararg fields: Pair<String, Any?>) =
        enqueue("ERROR", event, fields, error)

    private fun enqueue(
        level: String,
        event: String,
        fields: Array<out Pair<String, Any?>>,
        error: Throwable?
    ) {
        val context = appContext ?: return
        if (!enabled) return

        val line = buildString {
            append(timestamp()).append(' ')
            append(level).append(' ')
            append(safeKey(event))
            fields.forEach { (key, value) ->
                append(' ').append(safeKey(key)).append('=').append(quote(safeValue(value?.toString().orEmpty())))
            }
            if (error != null) {
                append(" exception=").append(quote(safeValue(exceptionSummary(error))))
            }
            append('\n')
        }

        Log.d(tag, line.trimEnd())
        writer.execute {
            runCatching { appendToDownloads(context, line) }
                .onFailure { Log.w(tag, "Не удалось записать диагностический файл", it) }
        }
    }

    private fun appendToDownloads(context: Context, line: String) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            appendWithMediaStore(context, line)
        } else {
            appendLegacy(context, line)
        }
    }

    @RequiresApi(Build.VERSION_CODES.Q)
    private fun appendWithMediaStore(context: Context, line: String) {
        val prefs = context.getSharedPreferences(prefsName, Context.MODE_PRIVATE)
        if (prefs.getLong(byteCountKey, 0L) >= maxBytes) {
            prefs.edit().remove(uriKey).remove(byteCountKey).apply()
        }

        fun createUri(): Uri {
            val values = ContentValues().apply {
                put(MediaStore.MediaColumns.DISPLAY_NAME, newFileName())
                put(MediaStore.MediaColumns.MIME_TYPE, "text/plain")
                put(MediaStore.MediaColumns.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS)
            }
            return requireNotNull(
                context.contentResolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values)
            ) { "Android не создал диагностический файл в Загрузках" }
        }

        var uri = prefs.getString(uriKey, null)?.let(Uri::parse) ?: createUri()
        var output = runCatching { context.contentResolver.openOutputStream(uri, "wa") }.getOrNull()
        if (output == null) {
            uri = createUri()
            output = context.contentResolver.openOutputStream(uri, "wa")
        }
        requireNotNull(output).use { stream ->
            OutputStreamWriter(stream, Charsets.UTF_8).use { it.write(line) }
        }
        prefs.edit()
            .putString(uriKey, uri.toString())
            .putLong(byteCountKey, prefs.getLong(byteCountKey, 0L) + line.toByteArray().size)
            .apply()
    }

    @Suppress("DEPRECATION")
    private fun appendLegacy(context: Context, line: String) {
        if (
            ContextCompat.checkSelfPermission(context, Manifest.permission.WRITE_EXTERNAL_STORAGE) !=
            PackageManager.PERMISSION_GRANTED
        ) return

        val prefs = context.getSharedPreferences(prefsName, Context.MODE_PRIVATE)
        var name = prefs.getString(fileNameKey, null) ?: newFileName()
        var file = File(Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS), name)
        if (file.length() >= maxBytes) {
            name = newFileName()
            file = File(Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS), name)
        }
        file.parentFile?.mkdirs()
        file.appendText(line, Charsets.UTF_8)
        prefs.edit().putString(fileNameKey, name).apply()
    }

    private fun safeValue(raw: String): String = raw
        .replace(Regex("SF[12]\\|[^\\s]+", RegexOption.IGNORE_CASE), "[qr-redacted]")
        .replace(Regex("(?i)(authorization|bearer|token|code|password|secret)(\\s*[=:]\\s*)[^\\s,;]+")) { match ->
            "${match.groupValues[1]}${match.groupValues[2]}[secret]"
        }
        .replace(Regex("(?i)bearer\\s+[A-Za-z0-9._~+/=-]+"), "Bearer [secret]")
        .replace(Regex("(?i)([0-9a-f]{2}:){5}[0-9a-f]{2}"), "[mac]")
        .replace('\r', ' ')
        .replace('\n', ' ')
        .take(1200)

    private fun safeKey(raw: String): String = raw.replace(Regex("[^A-Za-z0-9_.-]"), "_").take(80)

    private fun quote(value: String): String = "\"${value.replace("\\", "\\\\").replace("\"", "\\\"")}\""

    private fun exceptionSummary(error: Throwable): String = generateSequence(error) { it.cause }
        .take(4)
        .joinToString(" <- ") { current ->
            "${current.javaClass.simpleName}: ${current.message.orEmpty()}"
        }

    private fun timestamp(): String = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US).apply {
        timeZone = TimeZone.getTimeZone("UTC")
    }.format(Date())

    private fun newFileName(): String = SimpleDateFormat("yyyy-MM-dd_HH-mm-ss", Locale.US).apply {
        timeZone = TimeZone.getTimeZone("UTC")
    }.format(Date()).let { "sheepfold-parent-diagnostic-$it.log" }

    @Suppress("DEPRECATION")
    private fun appVersion(context: Context): String = runCatching {
        context.packageManager.getPackageInfo(context.packageName, 0).versionName.orEmpty()
    }.getOrDefault("unknown")
}
